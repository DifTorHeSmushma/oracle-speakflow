import * as ort from "onnxruntime-node";
import { performance } from "node:perf_hooks";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";
import { getVerifiedModelPath } from "../utils/binaryPath.js";
import type { VadConfig, VadError } from "../types/voice.js";
import { HYBRID_REDEMPTION_FRAMES } from "../types/voice.js";
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
  /**
   * Fires once per silence streak when hangover is ~halfway (or 40 frames).
   * Used to start speculative cloud finalize so last-word→paste is not Groq RTT.
   */
  onSilenceHint(cb: () => void): void;
  /**
   * Pause Silero ORT (RMS-only endpointing). Call while a speculative Groq HTTP
   * call is in flight — ORT on the Electron main thread was starving fetch
   * (~12–18s cloud RTT vs ~1s outside the app).
   */
  setOrtPaused(paused: boolean): void;
  /**
   * Drop capture frames entirely (no RMS/ORT). Use during TRANSCRIBING→INJECTING
   * so finalize HTTP and Ctrl+V are not starved by the VAD promise chain.
   */
  setCapturePaused(paused: boolean): void;
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
  const redemptionFrames = cfg.redemptionFrames;
  if (redemptionFrames < HYBRID_REDEMPTION_FRAMES) {
    process.stderr.write(
      `[vad] WARNING redemptionFrames=${redemptionFrames} < hybrid floor ${HYBRID_REDEMPTION_FRAMES} (~2.53s) — mid-pause false finalize risk (issue #6)\n`
    );
  }
  process.stderr.write(
    `[vad] armed redemptionFrames=${redemptionFrames} (~${((redemptionFrames * 32) / 1000).toFixed(2)}s silence)\n`
  );

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
  const silenceHintCbs: Array<() => void> = [];
  let silenceHintFired = false;
  /** Fire mid-hangover so speculative Groq has ~1.3s head start before soft-end (issue #13). */
  // Kick speculative earlier in hangover (~0.8s of silence) so Groq overlaps the rest.
  const silenceHintAt = Math.max(24, Math.floor(redemptionFrames * 0.32));

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

  /** ~45 s hard cap — Dom A2 logs showed 100–300 s WAVs → Groq apiError. */
  const MAX_UTTERANCE_FRAMES = Math.ceil(45 / 0.032);
  /** Skip Silero when backlog > ~1.3 s; isolated ORT is ~1 ms, Electron main often starves. */
  const ORT_BACKLOG_SKIP = 40;
  let fastPathFrames = 0;
  /** Latency: skip Silero while speculative Groq HTTP needs the event loop. */
  let ortPaused = false;
  /** Latency: drop all frames while pipeline finalizes/pastes. */
  let capturePaused = false;

  const applyVadDecision = (
    frame: Float32Array,
    enqueueTotalFrames: number,
    prob: number,
    rms: number
  ): void => {
    const vadDebug = process.env["SPEAKFLOW_VAD_DEBUG"] === "1" || diag;

    const isSpeechFrame =
      prob >= cfg.positiveSpeechThreshold ||
      (rms >= rmsSpeechThreshold && prob >= 0.015) ||
      rms >= rmsSpeechThreshold * 2;
    // Issue #6 RMS re-audit: redemption only advances on Silero-negative AND
    // RMS-below-limit. In-speech, loosen RMS limit (×3) so fan/room noise can
    // still end after ≥redemptionFrames (~2.5 s), but mid-pause breath/energy
    // above the limit must NOT count as silence (prevents false finalize on
    // ≤2.0 s pauses via an alternate RMS path). Neutral frames (neither speech
    // nor silence) hold speechNegativeCount — they neither accelerate nor reset.
    const silenceRmsLimit = inSpeech ? rmsSpeechThreshold * 3 : rmsSpeechThreshold;
    const isSilenceFrame = prob < cfg.negativeSpeechThreshold && rms < silenceRmsLimit;

    if (vadDebug) {
      debugFrameCount++;
      if (prob > debugMaxProb) debugMaxProb = prob;
      if (debugFrameCount % 100 === 0) {
        process.stderr.write(
          `[vad] debug maxProb=${debugMaxProb.toFixed(3)} rms=${rms.toFixed(4)} thr=${rmsSpeechThreshold} silenceLim=${silenceRmsLimit.toFixed(4)} qMax=${vadQueueDepthMax}\n`
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
      silenceHintFired = false;
      if (!inSpeech) capture.markSoftOnset(enqueueTotalFrames);
    } else if (isSilenceFrame) {
      speechNegativeCount++;
      speechPositiveCount = 0;
      if (!inSpeech) capture.clearSoftOnset();
      if (inSpeech && !silenceHintFired && speechNegativeCount >= silenceHintAt) {
        silenceHintFired = true;
        for (const cb of silenceHintCbs) cb();
      }
    }
    // else: neutral — hold counters (mid-pause ambiguity must not early-end)

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
      const sessionFrames = capture.getSessionFrameCount();
      const forceCap = sessionFrames >= MAX_UTTERANCE_FRAMES;
      if (speechNegativeCount >= redemptionFrames || forceCap) {
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
          `[vad] speechEnd — segment ${wav.length} bytes lag=${lagFrames} truncated=${detailed.meta.truncated} redemption=${redemptionFrames}${forceCap ? " forceCap=45s" : ""}\n`
        );
        for (const cb of speechEndCbs) cb(payload);
        vadQueueDepthMax = 0;
      }
    }
  };

  const processFrame = async (frame: Float32Array, enqueueTotalFrames: number): Promise<void> => {
    if (!frameListenerActive) return;

    const vadDebug = process.env["SPEAKFLOW_VAD_DEBUG"] === "1" || diag;
    if (getMuteState().muted) {
      if (vadDebug && debugFrameCount % 100 === 0) {
        process.stderr.write(`[vad] debug skipped — muted (${getMuteState().reason ?? "unknown"})\n`);
      }
      return;
    }

    const rms = frameRms(frame);

    // Issue #6 / #13: ORT on Electron main starves Groq fetch (~12–18s vs ~1s).
    // Skip Silero when backlog is high OR when speculative finalize needs the loop.
    if (ortPaused || pendingFrames > ORT_BACKLOG_SKIP) {
      fastPathFrames++;
      if (fastPathFrames === 1 || fastPathFrames % 100 === 0) {
        process.stderr.write(
          ortPaused
            ? `[vad] RMS fast-path (ort paused for speculative HTTP) pending=${pendingFrames}\n`
            : `[vad] RMS fast-path catch-up pending=${pendingFrames} (skip Silero)\n`
        );
      }
      // Soft-positive when RMS clears the speech floor. Forced prob=0 disabled the
      // mid-tier gate (rms>=thr && prob>=0.015), so only rms>=2×thr could start speech —
      // quiet/normal talk produced zero speechStart under main-thread starvation (#13).
      const rmsOnlyProb = rms >= rmsSpeechThreshold ? 0.02 : 0;
      applyVadDecision(frame, enqueueTotalFrames, rmsOnlyProb, rms);
      return;
    }

    if (fastPathFrames > 0) {
      state = freshState();
      process.stderr.write(
        `[vad] resume Silero after ${fastPathFrames} fast-path frames (state reset)\n`
      );
      fastPathFrames = 0;
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
    applyVadDecision(frame, enqueueTotalFrames, prob, rms);
  };

  const onCaptureFrame = (frame: Float32Array): void => {
    if (!frameArmed || !frameListenerActive || capturePaused) return;
    // Hard safety: if somehow still unbounded, drop (fast-path should prevent this).
    const MAX_PENDING = 200;
    if (pendingFrames >= MAX_PENDING) {
      if (pendingFrames === MAX_PENDING || pendingFrames % 100 === 0) {
        process.stderr.write(`[vad] drop frame — queue depth ${pendingFrames} (safety)\n`);
      }
      return;
    }
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
    onSilenceHint(cb) {
      silenceHintCbs.push(cb);
    },
    setOrtPaused(paused: boolean) {
      ortPaused = paused;
      if (!paused) return;
      process.stderr.write("[vad] ORT paused for speculative HTTP (RMS endpointing)\n");
    },
    setCapturePaused(paused: boolean) {
      capturePaused = paused;
      if (paused) {
        process.stderr.write("[vad] capture paused for finalize/paste (drop frames)\n");
      }
    },
    arm() {
      if (frameArmed) return;
      frameArmed = true;
      capture.onFrame(onCaptureFrame);
    },
    stop() {
      frameListenerActive = false;
      frameArmed = false;
      ortPaused = false;
      capturePaused = false;
      inSpeech = false;
      speechPositiveCount = 0;
      speechNegativeCount = 0;
      silenceHintFired = false;
      pendingFrames = 0;
      state = freshState();
    },
  };

  return Ok(events);
};

export const FRAME_SAMPLES = 512;
