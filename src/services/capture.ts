import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Writable } from "node:stream";
import { performance } from "node:perf_hooks";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";
import { getBinaryPath } from "../utils/binaryPath.js";
import { resolveBundledBinaryName } from "../utils/binaryNames.js";
import { resolveDshowAudioInput } from "../utils/dshow-audio.js";
import { resolveAvfAudioInput } from "../utils/avfoundation-audio.js";
import { resolvePulseAudioInput } from "../utils/pulse-audio.js";
import type { RecorderError } from "./recorder.js";
import {
  FRAME_BYTES,
  FRAME_SAMPLES,
  RING_BUFFER_FRAMES,
  SAMPLE_RATE,
  countClipSamplesS16le,
  isCaptureDiagEnabled,
  type CaptureSegmentDetailed,
  type CaptureSegmentMeta,
} from "./captureDiag.js";

export { FRAME_SAMPLES, RING_BUFFER_FRAMES, SAMPLE_RATE } from "./captureDiag.js";

export function buildFfmpegContinuousArgs(audioInput: string): string[] {
  const inputFormat =
    process.platform === "darwin" ? "avfoundation" :
    process.platform === "linux" ? "pulse" : "dshow";
  return [
    "-f", inputFormat,
    "-i", audioInput,
    "-ar", String(SAMPLE_RATE),
    "-ac", "1",
    "-sample_fmt", "s16",
    "-f", "s16le",
    "pipe:1",
  ];
}

export type PcmFrame = Float32Array; // exactly 512 samples, normalised to [-1, 1]

export type CaptureHealth = {
  deviceId: string;
  micGain: number;
  ffmpegSpawnMs: number;
  firstPcmMs: number | null;
  ttfbMs: number | null;
  ffmpegRterrCount: number;
  totalFrames: number;
  /** Approx bytes/sec over last ~1s window (null until enough data). */
  bytesPerSecWindow: number | null;
};

export type CaptureSession = {
  onFrame: (cb: (f: PcmFrame) => void) => void;
  /**
   * Earliest energy onset while waiting for VAD confirmation (cleared on silence).
   * Pass `atFrame` (enqueue-time totalFrames) when VAD processes behind the ring head
   * so soft onset is not stamped on the lagged live clock.
   */
  markSoftOnset: (atFrame?: number) => void;
  clearSoftOnset: () => void;
  /**
   * Mark speech onset; uses soft onset span when longer than backdateFrames.
   * Pass `atFrame` (enqueue-time totalFrames) when VAD is lagged — takeSegment still
   * ends at the live ring head via getLast.
   */
  markSpeechStart: (backdateFrames?: number, atFrame?: number) => void;
  takeSegment: (padFrames: number) => Buffer;
  /** Same segment as takeSegment plus raw WAV + clip/truncation meta (Phase 0). */
  takeSegmentDetailed: (padFrames: number) => CaptureSegmentDetailed;
  /** Speech-session frame count since markSpeechStart (0 if idle). */
  getSessionFrameCount: () => number;
  /** Session speech duration in seconds (0 if idle). */
  getSessionPcmDurationSec: () => number;
  /**
   * Build WAV from session speech frames [start, end) without clearing the session.
   * Indices are 0-based within the session speech buffer (excludes leading pad).
   */
  peekSessionWav: (startFrame: number, endFrame: number) => Buffer | null;
  getHealth: () => CaptureHealth;
  stop: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Ring buffer of s16le frame Buffers
// ---------------------------------------------------------------------------
class FrameRingBuffer {
  private readonly _buf: Array<Buffer | undefined>;
  private _head = 0;
  private _count = 0;

  constructor(capacity: number) {
    this._buf = new Array<Buffer | undefined>(capacity).fill(undefined);
  }

  push(frame: Buffer): void {
    this._buf[this._head] = frame;
    this._head = (this._head + 1) % this._buf.length;
    if (this._count < this._buf.length) this._count++;
  }

  /** Returns the last `n` frames in chronological order (oldest first). */
  getLast(n: number): Buffer[] {
    const actual = Math.min(n, this._count);
    const capacity = this._buf.length;
    const result: Buffer[] = [];
    let idx = ((this._head - actual) % capacity + capacity) % capacity;
    for (let i = 0; i < actual; i++) {
      const frame = this._buf[idx];
      if (frame !== undefined) result.push(frame);
      idx = (idx + 1) % capacity;
    }
    return result;
  }

  get count(): number {
    return this._count;
  }

  get capacity(): number {
    return this._buf.length;
  }
}

// ---------------------------------------------------------------------------
// WAV header writer
// ---------------------------------------------------------------------------
export function buildWavBuffer(s16leData: Buffer): Buffer {
  const dataSize = s16leData.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, s16leData]);
}

/** Keep the trailing `maxSec` of PCM (issue #6 — oversized session WAVs time out on Groq). */
export function trimWavToMaxSec(wav: Buffer, maxSec: number): Buffer {
  if (wav.length <= 44 || maxSec <= 0) return wav;
  const maxPcmBytes = Math.floor(maxSec * SAMPLE_RATE) * 2;
  if (wav.length - 44 <= maxPcmBytes) return wav;
  return buildWavBuffer(wav.subarray(wav.length - maxPcmBytes));
}

/**
 * Split a full-session WAV into chronological chunks (no dropped head).
 * Used for F8/PTT brain dumps: trailing trim was keeping only the last ~28s.
 * Optional overlapSec reduces word loss at chunk boundaries (ASR stitch).
 */
export function chunkWavBySec(wav: Buffer, chunkSec: number, overlapSec = 0): Buffer[] {
  if (wav.length <= 44 || chunkSec <= 0) return [wav];
  const pcm = wav.subarray(44);
  const chunkBytes = Math.floor(chunkSec * SAMPLE_RATE) * 2;
  if (pcm.length <= chunkBytes) return [wav];

  const overlapBytes = Math.max(
    0,
    Math.min(Math.floor(overlapSec * SAMPLE_RATE) * 2, chunkBytes - SAMPLE_RATE * 2)
  );
  const minTailBytes = SAMPLE_RATE; // 0.5s of s16le mono — absorb into prior chunk
  const out: Buffer[] = [];
  for (let off = 0; off < pcm.length; ) {
    let end = Math.min(off + chunkBytes, pcm.length);
    const leftover = pcm.length - end;
    if (leftover > 0 && leftover < minTailBytes) end = pcm.length;
    out.push(buildWavBuffer(pcm.subarray(off, end)));
    if (end >= pcm.length) break;
    const next = end - overlapBytes;
    off = next > off ? next : end;
  }
  return out.length > 0 ? out : [wav];
}

function resolveFFmpeg(): string {
  const bundled = getBinaryPath(resolveBundledBinaryName("ffmpeg"));
  if (existsSync(bundled)) return bundled;
  process.stderr.write("[capture] bundled ffmpeg not in resources/bin — falling back to PATH\n");
  return "ffmpeg";
}

function resolveAudioInput(ffmpegPath: string): string {
  if (process.platform === "darwin") return resolveAvfAudioInput();
  if (process.platform === "linux") return resolvePulseAudioInput();
  return resolveDshowAudioInput(ffmpegPath);
}

/** Default 2 — legacy default 20 clipped ASR (Gate Alpha mush). Cap at 8. */
export function resolveMicGain(): number {
  const raw = process.env["SPEAKFLOW_MIC_GAIN"]?.trim();
  const gain = raw ? Number(raw) : 2;
  if (!Number.isFinite(gain) || gain <= 0) return 2;
  return Math.min(gain, 8);
}

export function applyGainToS16le(s16le: Buffer, gain: number): Buffer {
  const out = Buffer.alloc(s16le.length);
  for (let i = 0; i < s16le.length; i += 2) {
    const amplified = Math.round(s16le.readInt16LE(i) * gain);
    const clamped = Math.max(-32768, Math.min(32767, amplified));
    out.writeInt16LE(clamped, i);
  }
  return out;
}

function frameStats(frameBytes: Buffer, gain: number): { float32: Float32Array; rms: number; peak: number } {
  const float32 = new Float32Array(FRAME_SAMPLES);
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < FRAME_SAMPLES; i++) {
    const sample = Math.max(-1, Math.min(1, (frameBytes.readInt16LE(i * 2) / 32768) * gain));
    float32[i] = sample;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSq += sample * sample;
  }
  return { float32, rms: Math.sqrt(sumSq / FRAME_SAMPLES), peak };
}

function isFfmpegRealtimeDropLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("real-time buffer") ||
    lower.includes("frame dropped") ||
    lower.includes("thread message queue blocking") ||
    lower.includes("queue input") && lower.includes("full")
  );
}

// ---------------------------------------------------------------------------
// startContinuousCapture
// ---------------------------------------------------------------------------
/** Max leading-pad frames snapshotted at speech start (covers DEFAULT pad 20 + headroom). */
const SESSION_PAD_SNAPSHOT_MAX = 64;

export const startContinuousCapture = (): Result<CaptureSession, RecorderError> => {
  const ring = new FrameRingBuffer(RING_BUFFER_FRAMES);
  let partial = Buffer.alloc(0);
  let stopped = false;
  let intentionalStop = false;
  let totalFrames = 0;
  let speechStartFrame: number | null = null;
  let softOnsetFrame: number | null = null;
  let lastSoftOnsetAtStart: number | null = null;
  let lastBackdateUsed = 0;
  /** Growable speech PCM (s16le frames) for the active utterance — not limited by ring. */
  let sessionSpeech: Buffer[] | null = null;
  /** Leading pad frames captured at markSpeechStart (before speech onset). */
  let sessionLeadingPad: Buffer[] = [];
  const frameListeners: Array<(f: PcmFrame) => void> = [];
  const micGain = resolveMicGain();
  const captureDebug = process.env["SPEAKFLOW_VAD_DEBUG"] === "1" || isCaptureDiagEnabled();
  let debugFrameCount = 0;
  let debugPeak = 0;
  let debugRmsMax = 0;

  const ffmpegSpawnMs = performance.now();
  let firstPcmMs: number | null = null;
  let ffmpegRterrCount = 0;
  let windowBytes = 0;
  let windowStartMs = ffmpegSpawnMs;
  let bytesPerSecWindow: number | null = null;

  const clearSession = (): void => {
    sessionSpeech = null;
    sessionLeadingPad = [];
    speechStartFrame = null;
  };

  try {
    const ffmpegPath = resolveFFmpeg();
    const audioInput = resolveAudioInput(ffmpegPath);
    if (captureDebug) {
      process.stderr.write(`[capture] device=${audioInput} micGain=${micGain}\n`);
    }
    const proc = spawn(ffmpegPath, buildFfmpegContinuousArgs(audioInput), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stream = proc.stdout;
    if (!stream) {
      return Err({ kind: "recordingFailed", message: "Failed to open FFmpeg stdout stream" });
    }

    const writable = new Writable({
      write(chunk: Buffer, _enc, cb) {
        if (firstPcmMs === null && chunk.length > 0) {
          firstPcmMs = performance.now();
        }
        windowBytes += chunk.length;
        const now = performance.now();
        if (now - windowStartMs >= 1000) {
          bytesPerSecWindow = (windowBytes * 1000) / (now - windowStartMs);
          windowBytes = 0;
          windowStartMs = now;
        }

        let buf = Buffer.concat([partial, chunk]);

        while (buf.length >= FRAME_BYTES) {
          const frameBytes = buf.slice(0, FRAME_BYTES);
          buf = buf.slice(FRAME_BYTES);

          const frameCopy = Buffer.from(frameBytes);
          ring.push(frameCopy);
          totalFrames++;
          if (sessionSpeech !== null) {
            sessionSpeech.push(frameCopy);
          }

          const { float32, rms, peak } = frameStats(frameBytes, micGain);
          if (captureDebug) {
            debugFrameCount++;
            if (peak > debugPeak) debugPeak = peak;
            if (rms > debugRmsMax) debugRmsMax = rms;
            if (debugFrameCount % 100 === 0) {
              process.stderr.write(
                `[capture] debug frames=${totalFrames} rmsMax=${debugRmsMax.toFixed(4)} peak=${debugPeak.toFixed(4)}\n`
              );
              debugPeak = 0;
              debugRmsMax = 0;
            }
          }
          for (const listener of frameListeners) listener(float32);
        }
        partial = buf;
        cb();
      },
    });

    const handleError = (err: Error | string): void => {
      if (intentionalStop) return;
      const msg = typeof err === "string" ? err : (err?.message ?? "capture error");
      process.stderr.write(`[capture] FFmpeg error: ${msg}\n`);
    };

    stream.on("error", handleError as (err: Error) => void);
    proc.on("error", (err: Error) => {
      const isEnoent = (err as NodeJS.ErrnoException).code === "ENOENT";
      if (!intentionalStop) {
        process.stderr.write(
          isEnoent
            ? "[capture] FFmpeg not found — install ffmpeg or place bundled binary in resources/bin\n"
            : `[capture] spawn error: ${err.message}\n`
        );
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (intentionalStop) return;
      const line = chunk.toString("utf8").trim();
      if (!line) return;
      if (isFfmpegRealtimeDropLine(line)) {
        ffmpegRterrCount++;
      }
      if (!line.includes("size=")) {
        process.stderr.write(`[capture] ffmpeg: ${line}\n`);
      }
    });
    proc.on("close", (code: number | null) => {
      if (intentionalStop || code === 0 || code === null) return;
      process.stderr.write(`[capture] FFmpeg exited with code ${code}\n`);
    });

    stream.pipe(writable);

    const takeDetailed = (padFrames: number): CaptureSegmentDetailed => {
      if (speechStartFrame === null || sessionSpeech === null) {
        const empty = Buffer.alloc(0);
        const emptyMeta: CaptureSegmentMeta = {
          speechStartFrame: -1,
          speechEndFrame: totalFrames,
          speechFrameCount: 0,
          padFrames,
          takeCount: 0,
          ringCount: ring.count,
          ringCapacity: ring.capacity,
          truncated: false,
          softOnsetFrame: lastSoftOnsetAtStart,
          backdateFramesUsed: lastBackdateUsed,
          micGain,
          totalFrames,
          rawPeak: 0,
          rawClipSamples: 0,
          gainedPeak: 0,
          gainedClipSamples: 0,
          gainedClipFrac: 0,
          sampleRate: SAMPLE_RATE,
        };
        return {
          gainedWav: buildWavBuffer(empty),
          rawWav: buildWavBuffer(empty),
          rawPcm: empty,
          gainedPcm: empty,
          meta: emptyMeta,
        };
      }

      const start = speechStartFrame;
      const speechFrameCount = sessionSpeech.length;
      const pad = sessionLeadingPad.slice(Math.max(0, sessionLeadingPad.length - padFrames));
      const frames = [...pad, ...sessionSpeech];
      // Session buffer holds the full utterance — never ring-truncated for ≤60s+ speech.
      const truncated = false;
      const rawPcm = Buffer.concat(frames);
      const gainedPcm = applyGainToS16le(rawPcm, micGain);
      const rawClip = countClipSamplesS16le(rawPcm, 1);
      const gainedClip = countClipSamplesS16le(rawPcm, micGain);
      const sampleCount = rawPcm.length / 2;
      const meta: CaptureSegmentMeta = {
        speechStartFrame: start,
        speechEndFrame: totalFrames,
        speechFrameCount,
        padFrames: pad.length,
        takeCount: frames.length,
        ringCount: ring.count,
        ringCapacity: ring.capacity,
        truncated,
        softOnsetFrame: lastSoftOnsetAtStart,
        backdateFramesUsed: lastBackdateUsed,
        micGain,
        totalFrames,
        rawPeak: rawClip.peak,
        rawClipSamples: rawClip.clipSamples,
        gainedPeak: Math.min(32767, Math.round(gainedClip.peak * micGain)),
        gainedClipSamples: gainedClip.clipSamples,
        gainedClipFrac: sampleCount > 0 ? gainedClip.clipSamples / sampleCount : 0,
        sampleRate: SAMPLE_RATE,
      };
      clearSession();
      return {
        gainedWav: buildWavBuffer(gainedPcm),
        rawWav: buildWavBuffer(rawPcm),
        rawPcm,
        gainedPcm,
        meta,
      };
    };

    const session: CaptureSession = {
      onFrame(cb) {
        frameListeners.push(cb);
      },

      markSoftOnset(atFrame?: number) {
        const idx = atFrame ?? totalFrames;
        if (softOnsetFrame === null) softOnsetFrame = idx;
      },

      clearSoftOnset() {
        softOnsetFrame = null;
      },

      markSpeechStart(backdateFrames = 0, atFrame?: number) {
        const now = atFrame ?? totalFrames;
        let back = backdateFrames;
        lastSoftOnsetAtStart = softOnsetFrame;
        if (softOnsetFrame !== null) {
          back = Math.max(back, now - softOnsetFrame);
        }
        back = Math.max(0, Math.min(back, now));
        lastBackdateUsed = back;
        speechStartFrame = now - back;
        softOnsetFrame = null;

        // Seed session from ring: leading pad + speech-so-far through live head
        // (issue #6 ≥60 s ceiling). Use totalFrames - start, not `back` alone —
        // lagged VAD may stamp start in the past while the ring has advanced.
        const speechSoFar = Math.min(
          Math.max(0, totalFrames - (speechStartFrame ?? totalFrames)),
          ring.count
        );
        const padWant = Math.min(SESSION_PAD_SNAPSHOT_MAX, Math.max(0, ring.count - speechSoFar));
        const chunk = ring.getLast(speechSoFar + padWant);
        sessionLeadingPad = chunk.slice(0, Math.max(0, chunk.length - speechSoFar));
        sessionSpeech = chunk.slice(Math.max(0, chunk.length - speechSoFar));
      },

      takeSegment(padFrames) {
        return takeDetailed(padFrames).gainedWav;
      },

      takeSegmentDetailed(padFrames) {
        return takeDetailed(padFrames);
      },

      getSessionFrameCount() {
        return sessionSpeech?.length ?? 0;
      },

      getSessionPcmDurationSec() {
        const n = sessionSpeech?.length ?? 0;
        return (n * FRAME_SAMPLES) / SAMPLE_RATE;
      },

      peekSessionWav(startFrame, endFrame) {
        if (sessionSpeech === null) return null;
        const start = Math.max(0, Math.min(startFrame, sessionSpeech.length));
        const end = Math.max(start, Math.min(endFrame, sessionSpeech.length));
        if (end <= start) return null;
        const rawPcm = Buffer.concat(sessionSpeech.slice(start, end));
        const gainedPcm = applyGainToS16le(rawPcm, micGain);
        return buildWavBuffer(gainedPcm);
      },

      getHealth() {
        return {
          deviceId: audioInput,
          micGain,
          ffmpegSpawnMs,
          firstPcmMs,
          ttfbMs: firstPcmMs !== null ? firstPcmMs - ffmpegSpawnMs : null,
          ffmpegRterrCount,
          totalFrames,
          bytesPerSecWindow,
        };
      },

      stop() {
        if (stopped) return Promise.resolve();
        stopped = true;
        intentionalStop = true;
        clearSession();
        try { proc.kill(); } catch { /* best-effort */ }
        stream.unpipe(writable);
        writable.end();
        return Promise.resolve();
      },
    };

    return Ok(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: "recordingFailed", message });
  }
};
