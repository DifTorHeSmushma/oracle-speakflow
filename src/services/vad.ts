import * as ort from "onnxruntime-node";
import { performance } from "node:perf_hooks";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";
import { getVerifiedModelPath } from "../utils/binaryPath.js";
import type { VadConfig, VadError } from "../types/voice.js";
import type { CaptureSession } from "./capture.js";
import type { getMuteState as GetMuteState } from "./mute.js";
import { isCaptureDiagEnabled, type CaptureSegmentDetailed } from "./captureDiag.js";

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

export type SpeechEndPayload = {
  wav: Buffer;
  detailed: CaptureSegmentDetailed;
  vadQueueDepthMax: number;
  vadProcessLagFrames: number;
  ortRunMsLast: number | null;
  speechStartCount: number;
};

export type VadEvents = {
  onSpeechStart(cb: () => void): void;
  onSpeechEnd(cb: (payload: SpeechEndPayload) => void): void;
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

  let state = freshState();

  let inSpeech = false;
  let speechPositiveCount = 0;
  let speechNegativeCount = 0;

  let totalSpeechStartCount = 0;

  const speechStartCbs: Array<() => void> = [];
  const speechEndCbs: Array<(payload: SpeechEndPayload) => void> = [];

  let frameListenerActive = true;
  let frameArmed = false;
  let frameChain: Promise<void> = Promise.resolve();
  let pendingFrames = 0;
  let vadQueueDepthMax = 0;
  let ortRunMsLast: number | null = null;
  let debugMaxProb = 0;
  let debugFrameCount = 0;
  const rmsSpeechThreshold = resolveRmsSpeechThreshold();
  const diag = isCaptureDiagEnabled();

  const processFrame = async (frame: Float32Array, enqueueTotalFrames: number): Promise<void> => {
    if (!frameListenerActive) return;

    const vadDebug = process.env["SPEAKFLOW_VAD_DEBUG"] === "1" || diag;
    if (getMuteState().muted) {
      if (vadDebug && debugFrameCount % 100 === 0) {
        process.stderr.write(`[vad] debug skipped — muted (${getMuteState().reason ?? "unknown"})\n`);
      }
      return;
    }

    const inputTensor = new ort.Tensor("float32", Float32Array.from(frame), [1, FRAME_SAMPLES]);
    const stateTensor = new ort.Tensor("float32", Float32Array.from(state), [2, 1, 128]);
    const srTensor = new ort.Tensor("int64", BigInt64Array.from([16000n]), [1]);

    let outputs: Awaited<ReturnType<InferenceSession["run"]>>;
    try {
      const t0 = performance.now();
      outputs = await session.run({ input: inputTensor, state: stateTensor, sr: srTensor });
      ortRunMsLast = performance.now() - t0;
    } catch (err) {
      process.stderr.write(`[vad] inference error: ${String(err)}\n`);
      return;
    }

    const newStateData = outputs["stateN"]?.data;
    if (newStateData instanceof Float32Array) {
      state = Float32Array.from(newStateData);
    }

    const prob = (outputs["output"]?.data as Float32Array | undefined)?.[0] ?? 0;
    const rms = frameRms(frame);

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
          `[vad] debug maxProb=${debugMaxProb.toFixed(3)} rms=${rms.toFixed(4)} thr=${rmsSpeechThreshold} qMax=${vadQueueDepthMax}\n`
        );
        debugMaxProb = 0;
      }
    }

    // Use enqueue-time frame index (not live totalFrames) so lagged ORT still
    // stamps onset where the audio actually landed in the ring (Phase 1 / VAD lag).
    if (!inSpeech && rms >= rmsSpeechThreshold * 0.45) {
      capture.markSoftOnset(enqueueTotalFrames);
    }

    if (isSpeechFrame) {
      speechPositiveCount++;
      speechNegativeCount = 0;
      if (!inSpeech) capture.markSoftOnset(enqueueTotalFrames);
    } else if (isSilenceFrame) {
      speechNegativeCount++;
      speechPositiveCount = 0;
      if (!inSpeech) capture.clearSoftOnset();
    }

    const health = capture.getHealth();
    const lagFrames = Math.max(0, health.totalFrames - enqueueTotalFrames);

    if (!inSpeech) {
      if (speechPositiveCount >= cfg.minSpeechFrames) {
        inSpeech = true;
        const backdate = speechPositiveCount;
        speechPositiveCount = 0;
        speechNegativeCount = 0;
        totalSpeechStartCount++;
        capture.markSpeechStart(backdate, enqueueTotalFrames);
        for (const cb of speechStartCbs) cb();
        process.stderr.write(
          `[vad] speechStart #${totalSpeechStartCount} (prob=${prob.toFixed(3)} rms=${rms.toFixed(4)} backdate=${backdate} lag=${lagFrames} qMax=${vadQueueDepthMax})\n`
        );
      }
    } else {
      if (speechNegativeCount >= cfg.redemptionFrames) {
        inSpeech = false;
        speechPositiveCount = 0;
        speechNegativeCount = 0;
        const detailed = capture.takeSegmentDetailed(cfg.preSpeechPadFrames);
        const wav = detailed.gainedWav;
        const payload: SpeechEndPayload = {
          wav,
          detailed,
          vadQueueDepthMax,
          vadProcessLagFrames: lagFrames,
          ortRunMsLast,
          speechStartCount: totalSpeechStartCount,
        };
        process.stderr.write(
          `[vad] speechEnd — segment ${wav.length} bytes lag=${lagFrames} truncated=${detailed.meta.truncated}\n`
        );
        for (const cb of speechEndCbs) cb(payload);
        vadQueueDepthMax = 0;
      }
    }
  };

  const onCaptureFrame = (frame: Float32Array): void => {
    if (!frameArmed || !frameListenerActive) return;
    const enqueueTotalFrames = capture.getHealth().totalFrames;
    pendingFrames++;
    if (pendingFrames > vadQueueDepthMax) vadQueueDepthMax = pendingFrames;
    frameChain = frameChain
      .then(async () => {
        await processFrame(frame, enqueueTotalFrames);
      })
      .catch((err: unknown) => {
        process.stderr.write(`[vad] processFrame error: ${String(err)}\n`);
      })
      .finally(() => {
        pendingFrames = Math.max(0, pendingFrames - 1);
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
      pendingFrames = 0;
      state = freshState();
    },
  };

  return Ok(events);
};

export const FRAME_SAMPLES = 512;
