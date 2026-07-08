import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Writable } from "node:stream";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";
import { getBinaryPath } from "../utils/binaryPath.js";
import { resolveDshowAudioInput } from "../utils/dshow-audio.js";
import type { RecorderError } from "./recorder.js";

// 512 samples × 2 bytes/sample (s16le) = 1024 bytes per frame
const FRAME_SAMPLES = 512;
const FRAME_BYTES = FRAME_SAMPLES * 2;
const SAMPLE_RATE = 16_000;
const RING_BUFFER_FRAMES = 300; // ~9.6 s at 32 ms/frame

function buildFfmpegContinuousArgs(audioInput: string): string[] {
  return [
    "-f", "dshow",
    "-i", audioInput,
    "-ar", String(SAMPLE_RATE),
    "-ac", "1",
    "-sample_fmt", "s16",
    "-f", "s16le",
    "pipe:1",
  ];
}

export type PcmFrame = Float32Array; // exactly 512 samples, normalised to [-1, 1]

export type CaptureSession = {
  onFrame: (cb: (f: PcmFrame) => void) => void;
  /** Earliest energy onset while waiting for VAD confirmation (cleared on silence). */
  markSoftOnset: () => void;
  clearSoftOnset: () => void;
  /** Mark speech onset; uses soft onset span when longer than backdateFrames. */
  markSpeechStart: (backdateFrames?: number) => void;
  takeSegment: (padFrames: number) => Buffer;
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
}

// ---------------------------------------------------------------------------
// WAV header writer
// ---------------------------------------------------------------------------
function buildWavBuffer(s16leData: Buffer): Buffer {
  const dataSize = s16leData.length;
  const header = Buffer.alloc(44);
  // RIFF chunk
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  // fmt sub-chunk
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);             // sub-chunk size
  header.writeUInt16LE(1, 20);              // PCM
  header.writeUInt16LE(1, 22);              // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);              // block align
  header.writeUInt16LE(16, 34);             // bits per sample
  // data sub-chunk
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, s16leData]);
}

function resolveFFmpeg(): string {
  const bundled = getBinaryPath("ffmpeg.exe");
  if (existsSync(bundled)) return bundled;
  process.stderr.write("[capture] ffmpeg.exe not in resources/bin — falling back to PATH\n");
  return "ffmpeg";
}

function resolveMicGain(): number {
  const raw = process.env["SPEAKFLOW_MIC_GAIN"]?.trim();
  const gain = raw ? Number(raw) : 20;
  return Number.isFinite(gain) && gain > 0 ? gain : 20;
}

function applyGainToS16le(s16le: Buffer, gain: number): Buffer {
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

// ---------------------------------------------------------------------------
// startContinuousCapture
// ---------------------------------------------------------------------------
export const startContinuousCapture = (): Result<CaptureSession, RecorderError> => {
  const ring = new FrameRingBuffer(RING_BUFFER_FRAMES);
  let partial = Buffer.alloc(0);           // byte accumulator for partial frames
  let stopped = false;
  let intentionalStop = false;
  let totalFrames = 0;
  let speechStartFrame: number | null = null;
  let softOnsetFrame: number | null = null;
  const frameListeners: Array<(f: PcmFrame) => void> = [];
  const micGain = resolveMicGain();
  const captureDebug = process.env["SPEAKFLOW_VAD_DEBUG"] === "1";
  let debugFrameCount = 0;
  let debugPeak = 0;
  let debugRmsMax = 0;

  try {
    const ffmpegPath = resolveFFmpeg();
    const audioInput = resolveDshowAudioInput(ffmpegPath);
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
        // Accumulate bytes; slice into exact 1024-byte (512-sample) frames
        let buf = Buffer.concat([partial, chunk]);

        while (buf.length >= FRAME_BYTES) {
          const frameBytes = buf.slice(0, FRAME_BYTES);
          buf = buf.slice(FRAME_BYTES);

          // Store raw s16le in ring buffer
          ring.push(Buffer.from(frameBytes));
          totalFrames++;

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
          for (const cb of frameListeners) cb(float32);
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
            ? "[capture] FFmpeg not found — place ffmpeg.exe in resources/bin\n"
            : `[capture] spawn error: ${err.message}\n`
        );
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (intentionalStop) return;
      const line = chunk.toString("utf8").trim();
      if (line && !line.includes("size=")) {
        process.stderr.write(`[capture] ffmpeg: ${line}\n`);
      }
    });
    proc.on("close", (code: number | null) => {
      if (intentionalStop || code === 0 || code === null) return;
      process.stderr.write(`[capture] FFmpeg exited with code ${code}\n`);
    });

    stream.pipe(writable);

    const session: CaptureSession = {
      onFrame(cb) {
        frameListeners.push(cb);
      },

      markSoftOnset() {
        if (softOnsetFrame === null) softOnsetFrame = totalFrames;
      },

      clearSoftOnset() {
        softOnsetFrame = null;
      },

      markSpeechStart(backdateFrames = 0) {
        let back = backdateFrames;
        if (softOnsetFrame !== null) {
          back = Math.max(back, totalFrames - softOnsetFrame);
        }
        back = Math.max(0, Math.min(back, totalFrames));
        speechStartFrame = totalFrames - back;
        softOnsetFrame = null;
      },

      takeSegment(padFrames) {
        if (speechStartFrame === null) return buildWavBuffer(Buffer.alloc(0));
        const speechFrameCount = totalFrames - speechStartFrame;
        const totalToTake = padFrames + speechFrameCount;
        const frames = ring.getLast(totalToTake);
        const s16le = applyGainToS16le(Buffer.concat(frames), micGain);
        speechStartFrame = null;
        return buildWavBuffer(s16le);
      },

      stop() {
        if (stopped) return Promise.resolve();
        stopped = true;
        intentionalStop = true;
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
