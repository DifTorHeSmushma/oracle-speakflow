import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
import { Result, Ok, Err } from "../utils/result.js";
import { getBinaryPath } from "../utils/binaryPath.js";
import { resolveTierModel, TIER_LADDER } from "./modelRegistry.js";
import { transcribeWarm, type EngineHandle } from "./localEngine.js";
import type { TranscriptionMode, ModelTier } from "../types/ipc.js";

export type { TranscriptionMode };

export type TranscriptionError =
  | { kind: "invalidApiKey"; message: string }
  | { kind: "networkTimeout"; message: string }
  | { kind: "apiError"; statusCode: number; message: string }
  | { kind: "emptyTranscription" }
  | { kind: "localModelNotFound"; message: string }
  | { kind: "localTranscriptionFailed"; message: string };

/** Cloud (Groq) hard ceiling — SDK default is 60s; that produced 50–90s "transcribing" hangs. */
export const CLOUD_TRANSCRIBE_TIMEOUT_MS = 10_000;
/** No cloud retries under the hard ceiling — one attempt, fail fast. */
const CLOUD_RETRY_ATTEMPTS = 0;
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
  const name = err instanceof Error ? err.name : "";
  if (name === "APIConnectionTimeoutError" || name === "AbortError") return true;
  // Fallback: SDK may wrap fetch errors without a .code property.
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
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
  // Hard timeout on the client (default was 60s → multi-minute hangs with retries).
  const client = new Groq({ apiKey, timeout: CLOUD_TRANSCRIBE_TIMEOUT_MS });
  const t0 = performance.now();
  const maxAttempts = CLOUD_RETRY_ATTEMPTS + 1;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await attempt(client, audioBuffer, model, language);
    const ms = Math.round(performance.now() - t0);
    if (result.ok) {
      process.stderr.write(`[LATENCY] cloud-transcribe: ${ms} ms ok model=${model} bytes=${audioBuffer.length}\n`);
      return result;
    }

    const shouldRetry = result.error.kind === "networkTimeout" && i < CLOUD_RETRY_ATTEMPTS;
    if (!shouldRetry) {
      process.stderr.write(
        `[LATENCY] cloud-transcribe: ${ms} ms fail kind=${result.error.kind} model=${model} bytes=${audioBuffer.length}\n`
      );
      return result;
    }

    await sleep(RETRY_DELAY_MS);
  }

  const ms = Math.round(performance.now() - t0);
  process.stderr.write(`[LATENCY] cloud-transcribe: ${ms} ms fail kind=networkTimeout model=${model}\n`);
  return Err({ kind: "networkTimeout", message: `Cloud transcription exceeded ${CLOUD_TRANSCRIBE_TIMEOUT_MS}ms` });
};

// ---------------------------------------------------------------------------
// Local transcription
//   Fast tier  → whisper-cli.exe spawnSync (batch, model held in verified path)
//   Balanced/Accurate → transcribeWarm via resident whisper-server handle
// Invariant #13 / C-2 / L5: pre-flight SHA-verifies before every run.
//   NEVER falls through to cloud on local failure (no silent cloud).
// ---------------------------------------------------------------------------

const transcribeLocal = async (
  audioBuffer: Buffer,
  tier: ModelTier,
  language: string,
  searchDirs?: string[],
  engineHandle?: EngineHandle,
): Promise<Result<string, TranscriptionError>> => {
  const spec = TIER_LADDER[tier];

  // Pre-flight: resolve and SHA-verify the model — Invariant #13 / C-2 / G16.
  const modelResult = resolveTierModel(tier, searchDirs);
  if (!modelResult.ok) {
    const { error } = modelResult;
    if (error.kind === "modelIntegrity") {
      return Err({ kind: "localTranscriptionFailed", message: error.message });
    }
    return Err({ kind: "localModelNotFound", message: error.message });
  }
  const modelPath = modelResult.value;

  // Resident path (Balanced/Accurate) — delegates to whisper-server via handle.
  if (!spec.batchAcceptable) {
    if (!engineHandle) {
      return Err({
        kind: "localTranscriptionFailed",
        message: `No engine handle for tier '${tier}' — select the tier to start the engine`,
      });
    }
    return transcribeWarm(engineHandle, audioBuffer);
  }

  // Fast batch path — whisper-cli spawnSync with the SHA-verified model path.
  const whisperPath = getBinaryPath("whisper-cli.exe");
  if (!existsSync(whisperPath)) {
    return Err({
      kind: "localModelNotFound",
      message: `whisper-cli.exe not found at ${whisperPath}`,
    });
  }

  const tmpDir = tmpdir();
  const id = randomUUID();
  const wavPath = join(tmpDir, `speakflow-${id}.wav`);

  try {
    writeFileSync(wavPath, audioBuffer);

    const outputBase = join(tmpDir, `speakflow-${id}`);
    const result = spawnSync(whisperPath, [
      wavPath,
      "--model", modelPath,
      "--language", language,
      "--output-txt",
      "--output-file", outputBase,
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

    // whisper-cli v1.9+ writes <output-file>.txt (not <wav-basename>.wav.txt)
    const txtPath = `${outputBase}.txt`;
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
// Tier and searchDirs are ignored in remote mode.
// ---------------------------------------------------------------------------

export const transcribe = async (
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string,
  mode: TranscriptionMode = "remote",
  tier: ModelTier = "fast",
  searchDirs?: string[],
  engineHandle?: EngineHandle,
): Promise<Result<string, TranscriptionError>> => {
  if (mode === "local") {
    return transcribeLocal(audioBuffer, tier, language, searchDirs, engineHandle);
  }
  return transcribeRemote(apiKey, audioBuffer, model, language);
};
