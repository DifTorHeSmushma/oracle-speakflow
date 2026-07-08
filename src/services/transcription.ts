import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
import { Result, Ok, Err } from "../utils/result.js";
import { getBinaryPath } from "../utils/binaryPath.js";
import type { TranscriptionMode } from "../types/ipc.js";

export type { TranscriptionMode };

export type TranscriptionError =
  | { kind: "invalidApiKey"; message: string }
  | { kind: "networkTimeout"; message: string }
  | { kind: "apiError"; statusCode: number; message: string }
  | { kind: "emptyTranscription" }
  | { kind: "localModelNotFound"; message: string }
  | { kind: "localTranscriptionFailed"; message: string };

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

/** Node.js network error codes that map to a transient timeout/network failure. */
const NETWORK_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EPIPE",
]);

const isNetworkError = (err: unknown): boolean => {
  const code = (err as NodeJS.ErrnoException).code;
  if (code !== undefined && NETWORK_ERROR_CODES.has(code)) return true;
  // Fallback: SDK may wrap fetch errors without a .code property.
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return message.includes("fetch failed") || message.includes("network");
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Remote transcription (Groq API) — existing path
// ---------------------------------------------------------------------------

const attempt = async (
  client: Groq,
  audioBuffer: Buffer,
  model: string,
  language: string
): Promise<Result<string, TranscriptionError>> => {
  try {
    // Convert Buffer → Uint8Array so File constructor accepts it under strict lib settings.
    const file = new File([new Uint8Array(audioBuffer)], "recording.wav", { type: "audio/wav" });
    const response = await client.audio.transcriptions.create({
      file,
      model,
      language,
      response_format: "text",
    });

    // response_format: "text" returns a plain string at runtime, but groq-sdk v0.7
    // types transcriptions.create as returning Transcription regardless of format.
    const text = (response as unknown as string).trim();
    if (!text) return Err({ kind: "emptyTranscription" });
    return Ok(text);
  } catch (err) {
    if (err instanceof Groq.APIError) {
      if (err.status === 401) {
        return Err({ kind: "invalidApiKey", message: "API key rejected by Groq" });
      }
      return Err({ kind: "apiError", statusCode: err.status ?? 0, message: err.message });
    }
    if (isNetworkError(err)) {
      const message = err instanceof Error ? err.message : String(err);
      return Err({ kind: "networkTimeout", message });
    }
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: "apiError", statusCode: 0, message });
  }
};

const transcribeRemote = async (
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string
): Promise<Result<string, TranscriptionError>> => {
  const client = new Groq({ apiKey });

  for (let i = 0; i <= RETRY_ATTEMPTS; i++) {
    const result = await attempt(client, audioBuffer, model, language);
    if (result.ok) return result;

    const shouldRetry = result.error.kind === "networkTimeout" && i < RETRY_ATTEMPTS;
    if (!shouldRetry) return result;

    await sleep(RETRY_DELAY_MS);
  }

  return Err({ kind: "networkTimeout", message: "Exhausted retries" });
};

// ---------------------------------------------------------------------------
// Local transcription (whisper-cli.exe sidecar)
// ---------------------------------------------------------------------------

const transcribeLocal = (
  audioBuffer: Buffer,
  model: string,
  language: string
): Result<string, TranscriptionError> => {
  const whisperPath = getBinaryPath("whisper-cli.exe");
  if (!existsSync(whisperPath)) {
    return Err({
      kind: "localModelNotFound",
      message: `whisper-cli.exe not found at ${whisperPath} — place the binary in resources/bin/`,
    });
  }

  const tmpDir = tmpdir();
  const id = randomUUID();
  const wavPath = join(tmpDir, `speakflow-${id}.wav`);

  try {
    writeFileSync(wavPath, audioBuffer);

    const result = spawnSync(whisperPath, [
      wavPath,
      "--model", model,
      "--language", language,
      "--output-txt",
      "--output-dir", tmpDir,
    ], { timeout: 60_000 });

    if (result.error) {
      try { unlinkSync(wavPath); } catch { /* ignore */ }
      return Err({
        kind: "localTranscriptionFailed",
        message: result.error.message,
      });
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.toString().split("\n")[0]?.trim() ?? "unknown error";
      try { unlinkSync(wavPath); } catch { /* ignore */ }
      return Err({
        kind: "localTranscriptionFailed",
        message: `whisper-cli exited with code ${result.status}: ${stderr}`,
      });
    }

    // whisper-cli --output-txt writes <input-basename>.txt in the output directory
    const txtPath = join(tmpDir, `speakflow-${id}.txt`);
    if (!existsSync(txtPath)) {
      try { unlinkSync(wavPath); } catch { /* ignore */ }
      return Err({
        kind: "localTranscriptionFailed",
        message: "whisper-cli did not produce a .txt output file",
      });
    }

    const text = readFileSync(txtPath, "utf-8").trim();

    // Clean up temp files
    try { unlinkSync(wavPath); } catch { /* ignore */ }
    try { unlinkSync(txtPath); } catch { /* ignore */ }

    if (!text) return Err({ kind: "emptyTranscription" });
    return Ok(text);
  } catch (err) {
    // Clean up on unexpected error
    try { unlinkSync(wavPath); } catch { /* ignore */ }

    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: "localTranscriptionFailed", message });
  }
};

// ---------------------------------------------------------------------------
// Public API — mode-aware entrypoint
// ---------------------------------------------------------------------------

export const transcribe = async (
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string,
  mode: TranscriptionMode = "remote"
): Promise<Result<string, TranscriptionError>> => {
  if (mode === "local") {
    return transcribeLocal(audioBuffer, model, language);
  }
  return transcribeRemote(apiKey, audioBuffer, model, language);
};
