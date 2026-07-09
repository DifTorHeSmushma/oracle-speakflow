import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Writable } from "node:stream";
import { Result, Ok, Err } from "../utils/result.js";
import { getBinaryPath } from "../utils/binaryPath.js";
import { resolveBundledBinaryName } from "../utils/binaryNames.js";
import { resolveDshowAudioInput } from "../utils/dshow-audio.js";
import { resolveAvfAudioInput } from "../utils/avfoundation-audio.js";

export type RecorderError =
  | { kind: "permissionDenied"; message: string }
  | { kind: "deviceNotFound"; message: string }
  | { kind: "recordingFailed"; message: string };

export type RecordingSession = {
  stop: () => Promise<Result<Buffer, RecorderError>>;
};

const STOP_TIMEOUT_MS = 30_000;

function buildFfmpegRecordArgs(audioInput: string): string[] {
  const inputFormat = process.platform === "darwin" ? "avfoundation" : "dshow";
  return [
    "-f", inputFormat,
    "-i", audioInput,
    "-ar", "16000",
    "-ac", "1",
    "-sample_fmt", "s16",
    "-f", "wav",
    "pipe:1",
  ];
}

/**
 * Resolves the FFmpeg executable path.
 * - Packaged / dev with binary present: uses resources/bin/ffmpeg.exe
 * - Dev without binary: falls back to 'ffmpeg' from system PATH (with a warning)
 */
function resolveFFmpeg(): string {
  const bundled = getBinaryPath(resolveBundledBinaryName("ffmpeg"));
  if (existsSync(bundled)) return bundled;
  console.warn("[recorder] bundled ffmpeg not found in resources/bin — falling back to system PATH");
  return "ffmpeg";
}

function resolveAudioInput(ffmpegPath: string): string {
  if (process.platform === "darwin") return resolveAvfAudioInput();
  return resolveDshowAudioInput(ffmpegPath);
}

const classifyError = (err: Error): RecorderError => {
  const msg = err?.message?.toLowerCase() ?? "";
  if (msg.includes("permission") || msg.includes("access")) {
    return { kind: "permissionDenied", message: err?.message ?? "permission denied" };
  }
  if (msg.includes("device") || msg.includes("not found")) {
    return { kind: "deviceNotFound", message: err?.message ?? "device not found" };
  }
  return { kind: "recordingFailed", message: err?.message ?? "recording failed" };
};

export const startRecording = (): Result<RecordingSession, RecorderError> => {
  const chunks: Buffer[] = [];
  let errorOccurred: RecorderError | null = null;
  let stopped = false;
  // Set to true just before proc.kill() is called. On Windows, FFmpeg exits with a
  // non-zero code when killed — expected noise, not a real failure.
  let intentionalStop = false;
  // Allows the close/error handler to resolve a pending stop() promise immediately
  // if finish may never fire after a stream error.
  let pendingResolve: ((r: Result<Buffer, RecorderError>) => void) | null = null;

  try {
    const ffmpegPath = resolveFFmpeg();
    const audioInput = resolveAudioInput(ffmpegPath);
    const proc = spawn(ffmpegPath, buildFfmpegRecordArgs(audioInput), {
      stdio: ["ignore", "pipe", "ignore"],
    });

    const stream = proc.stdout;
    if (!stream) {
      return Err({ kind: "recordingFailed", message: "Failed to open FFmpeg stdout stream" });
    }

    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const handleError = (err: Error | string) => {
      // On Windows, FFmpeg exits with a non-zero code when killed by proc.kill().
      // This fires the close handler which calls handleError — expected noise.
      if (intentionalStop) return;

      // ENOENT means FFmpeg is not installed / not in PATH — classify as deviceNotFound.
      const isSpawnError =
        typeof err !== "string" && (err as NodeJS.ErrnoException).code === "ENOENT";

      if (isSpawnError) {
        errorOccurred = { kind: "deviceNotFound", message: "FFmpeg not found — place ffmpeg.exe in resources/bin or install it on PATH" };
      } else {
        // Take only the first line to strip any multi-line error trailers.
        const raw = typeof err === "string" ? err : (err?.message ?? "");
        const message = (raw.split("\n")[0] ?? raw).trim() || "recording failed";
        errorOccurred = classifyError(new Error(message));
      }

      // If stop() is already waiting on the finish event, unblock it now —
      // finish may never fire after a stream error.
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(Err(errorOccurred));
      }
    };

    // Stream errors (e.g. device read failure mid-recording).
    stream.on("error", handleError as (err: Error) => void);

    // Spawn failures (ENOENT = FFmpeg not installed) emit 'error' on the process,
    // not on stdout. Attach here to prevent an unhandled-error crash.
    proc.on("error", handleError as (err: Error) => void);

    // Non-zero exit code from FFmpeg. On Windows this fires when killed;
    // intentionalStop=true suppresses it. Any other non-zero code is a real error.
    proc.on("close", (code: number | null) => {
      if (code === 0 || code === null) return;
      handleError(`ffmpeg has exited with error code ${code}.`);
    });

    stream.pipe(writable);

    const stop = (): Promise<Result<Buffer, RecorderError>> => {
      if (stopped) {
        return Promise.resolve(
          Err({ kind: "recordingFailed", message: "Recording already stopped" })
        );
      }
      stopped = true;

      return new Promise((resolve) => {
        // Error already captured before stop() was called.
        if (errorOccurred) {
          try { proc.kill(); } catch { /* ignore */ }
          return resolve(Err(errorOccurred));
        }

        const timeout = setTimeout(() => {
          pendingResolve = null;
          resolve(
            Err({ kind: "recordingFailed", message: `Recording stop timed out after ${STOP_TIMEOUT_MS}ms` })
          );
        }, STOP_TIMEOUT_MS);

        pendingResolve = resolve;

        writable.once("finish", () => {
          clearTimeout(timeout);
          pendingResolve = null;
          if (errorOccurred) return resolve(Err(errorOccurred));
          resolve(Ok(Buffer.concat(chunks)));
        });

        // Flag before kill so the close handler ignores the exit noise.
        intentionalStop = true;
        proc.kill();
        stream.unpipe(writable);
        writable.end();
      });
    };

    return Ok({ stop });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: "recordingFailed", message });
  }
};
