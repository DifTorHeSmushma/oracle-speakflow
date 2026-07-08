import * as ort from "onnxruntime-node";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";
import { getVerifiedModelPath } from "../utils/binaryPath.js";
import type { VadConfig, VadError } from "../types/voice.js";
import type { CaptureSession } from "./capture.js";
import type { getMuteState as GetMuteState } from "./mute.js";

// ---------------------------------------------------------------------------
// Silero v5 state: Float32 [2, 1, 128] = 256 elements, threaded per frame
// ---------------------------------------------------------------------------
const STATE_SIZE = 2 * 1 * 128; // 256

function freshState(): Float32Array {
  return new Float32Array(STATE_SIZE);
}

function frameRms(frame: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < frame.length; i++) {
    const s = frame[i] ?? 0;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / frame.length);
}

function resolveRmsSpeechThreshold(): number {
  const raw = process.env["SPEAKFLOW_RMS_SPEECH_THRESHOLD"]?.trim();
  const v = raw ? Number(raw) : 0.018;
  return Number.isFinite(v) && v > 0 ? v : 0.018;
}

export type VadEvents = {
  onSpeechStart(cb: () => void): void;
  onSpeechEnd(cb: (wav: Buffer) => void): void;
  /** Subscribe to capture frames — call only after handlers are registered. */
  arm(): void;
  stop(): void;
};

type InferenceSession = Awaited<ReturnType<typeof ort.InferenceSession.create>>;

/**
 * Creates a VAD instance backed by Silero v5 (onnxruntime-node).
 * Verifies model integrity via SHA-256 manifest (Invariant #13 / A4).
 * Loads the ORT session once; re-uses per utterance within the session.
 */
export const createVad = async (
  cfg: VadConfig,
  capture: CaptureSession,
  getMuteState: () => ReturnType<typeof GetMuteState>
): Promise<Result<VadEvents, VadError>> => {
  // A4: hard-block on missing or corrupted model
  const modelResult = getVerifiedModelPath("silero_vad.onnx");
  if (!modelResult.ok) {
    const err = modelResult.error;
    return Err({ kind: err.kind, message: err.message });
  }

  let session: InferenceSession;
  try {
    session = await ort.InferenceSession.create(modelResult.value, {
      executionProviders: ["cpu"],
    });
  } catch (err) {
    return Err({
      kind: "inferenceError",
      message: `Failed to load Silero ORT session: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Per-session state — reset on stop()
  let state = freshState();

  // VAD state machine
  let inSpeech = false;
  let speechPositiveCount = 0;
  let speechNegativeCount = 0;

  // Idle false-trigger counter (A6, Spec §3.3) — stderr only, no transcript text
  let totalSpeechStartCount = 0;

  const speechStartCbs: Array<() => void> = [];
  const speechEndCbs: Array<(wav: Buffer) => void> = [];

  let frameListenerActive = true;
  let frameArmed = false;
  let frameChain: Promise<void> = Promise.resolve();
  let debugMaxProb = 0;
  let debugFrameCount = 0;
  const rmsSpeechThreshold = resolveRmsSpeechThreshold();

  const processFrame = async (frame: Float32Array): Promise<void> => {
    if (!frameListenerActive) return;

    const vadDebug = process.env["SPEAKFLOW_VAD_DEBUG"] === "1";
    if (getMuteState().muted) {
      if (vadDebug && debugFrameCount % 100 === 0) {
        process.stderr.write(`[vad] debug skipped — muted (${getMuteState().reason ?? "unknown"})\n`);
      }
      return; // Invariant #19 — hard gate
    }

    // S1 confirmed tensor schema exactly:
    // input: Float32 [1, 512]   state: Float32 [2, 1, 128]   sr: Int64 [1]
    const inputTensor = new ort.Tensor("float32", Float32Array.from(frame), [1, FRAME_SAMPLES]);
    const stateTensor = new ort.Tensor("float32", Float32Array.from(state), [2, 1, 128]);
    const srTensor = new ort.Tensor("int64", BigInt64Array.from([16000n]), [1]);

    let outputs: Awaited<ReturnType<InferenceSession["run"]>>;
    try {
      outputs = await session.run({ input: inputTensor, state: stateTensor, sr: srTensor });
    } catch (err) {
      process.stderr.write(`[vad] inference error: ${String(err)}\n`);
      return;
    }

    // Thread stateN → state for the next frame
    const newStateData = outputs["stateN"]?.data;
    if (newStateData instanceof Float32Array) {
      state = Float32Array.from(newStateData);
    }

    const prob = (outputs["output"]?.data as Float32Array | undefined)?.[0] ?? 0;
    const rms = frameRms(frame);

    // Hybrid gate: Silero OR energy (quiet laptop mics often stay below Silero threshold).
    const isSpeechFrame =
      prob >= cfg.positiveSpeechThreshold ||
      (rms >= rmsSpeechThreshold && prob >= 0.015) ||
      rms >= rmsSpeechThreshold * 2;
    const isSilenceFrame = prob < cfg.negativeSpeechThreshold && rms < rmsSpeechThreshold;

    if (vadDebug) {
      debugFrameCount++;
      if (prob > debugMaxProb) debugMaxProb = prob;
      if (debugFrameCount % 100 === 0) {
        process.stderr.write(
          `[vad] debug maxProb=${debugMaxProb.toFixed(3)} rms=${rms.toFixed(4)} thr=${rmsSpeechThreshold}\n`
        );
        debugMaxProb = 0;
      }
    }

    if (!inSpeech && rms >= rmsSpeechThreshold * 0.45) {
      capture.markSoftOnset();
    }

    if (isSpeechFrame) {
      speechPositiveCount++;
      speechNegativeCount = 0;
      if (!inSpeech) capture.markSoftOnset();
    } else if (isSilenceFrame) {
      speechNegativeCount++;
      speechPositiveCount = 0;
      if (!inSpeech) capture.clearSoftOnset();
    }

    if (!inSpeech) {
      if (speechPositiveCount >= cfg.minSpeechFrames) {
        inSpeech = true;
        // Backdate to the true onset: the whole positive run so far, not just minSpeechFrames.
        const backdate = speechPositiveCount;
        speechPositiveCount = 0;
        speechNegativeCount = 0;
        totalSpeechStartCount++;
        capture.markSpeechStart(backdate);
        for (const cb of speechStartCbs) cb();
        process.stderr.write(
          `[vad] speechStart #${totalSpeechStartCount} (prob=${prob.toFixed(3)} rms=${rms.toFixed(4)} backdate=${backdate})\n`
        );
      }
    } else {
      if (speechNegativeCount >= cfg.redemptionFrames) {
        inSpeech = false;
        speechPositiveCount = 0;
        speechNegativeCount = 0;
        const wav = capture.takeSegment(cfg.preSpeechPadFrames);
        process.stderr.write(`[vad] speechEnd — segment ${wav.length} bytes\n`);
        for (const cb of speechEndCbs) cb(wav);
      }
    }
  };

  const onCaptureFrame = (frame: Float32Array): void => {
    if (!frameArmed || !frameListenerActive) return;
    frameChain = frameChain
      .then(async () => {
        await processFrame(frame);
      })
      .catch((err: unknown) => {
        process.stderr.write(`[vad] processFrame error: ${String(err)}\n`);
      });
  };

  const events: VadEvents = {
    onSpeechStart(cb) {
      speechStartCbs.push(cb);
    },
    onSpeechEnd(cb) {
      speechEndCbs.push(cb);
    },
    arm() {
      if (frameArmed) return;
      frameArmed = true;
      capture.onFrame(onCaptureFrame);
    },
    stop() {
      frameListenerActive = false;
      frameArmed = false;
      inSpeech = false;
      speechPositiveCount = 0;
      speechNegativeCount = 0;
      state = freshState(); // reset Silero LSTM state
    },
  };

  return Ok(events);
};

// Frame constants re-exported for tests
export const FRAME_SAMPLES = 512;
