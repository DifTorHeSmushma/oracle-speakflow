import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import Groq from "groq-sdk";
import { Result, Ok, Err } from "../utils/result.js";
import { getBinaryPath } from "../utils/binaryPath.js";
import { resolveTierModel, TIER_LADDER } from "./modelRegistry.js";
import { transcribeWarm, type EngineHandle } from "./localEngine.js";
import type { TranscriptionMode, ModelTier } from "../types/ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const asarUnpacked = (p: string): string =>
  p.includes(`${sep}app.asar${sep}`)
    ? p.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
    : p;
const GROQ_WORKER_PATH = asarUnpacked(join(__dirname, "groqTranscribeWorker.cjs"));

export type { TranscriptionMode };

export type TranscriptionError =
  | { kind: "invalidApiKey"; message: string }
  | { kind: "networkTimeout"; message: string }
  | { kind: "apiError"; statusCode: number; message: string }
  | { kind: "emptyTranscription" }
  | { kind: "localModelNotFound"; message: string }
  | { kind: "localTranscriptionFailed"; message: string };

/**
 * Cloud (Groq) hard ceiling for ordinary / chunk calls.
 * Finalize short utterances use CLOUD_FINALIZE_TIMEOUT_MS (issue #12 ≤5s settle).
 */
export const CLOUD_TRANSCRIBE_TIMEOUT_MS = 25_000;
/**
 * Finalize/speculative HTTP ceiling. Dom's live mic WAVs often need ~6–15s on turbo;
 * a 4s hard kill produced networkTimeout + zero paste (#13 HITL). No retry.
 */
export const CLOUD_FINALIZE_TIMEOUT_MS = 20_000;
/**
 * Speculative/settle model — turbo RTT so last-word→paste can hit ≤5s (issue #13).
 * Keep FINALIZE_PROMPT + temperature 0 for fidelity; large-v3 blew past 4s on Dom's path.
 */
export const FINALIZE_MODEL = "whisper-large-v3-turbo";
/**
 * Vocabulary / fidelity bias for Whisper finalize. Do not feed prior transcript text
 * (that poisoned chunk prompts into loops).
 */
export const FINALIZE_PROMPT =
  "SpeakFlow dictation vocabulary: SpeakFlow (not speed flow). " +
  "Keep repeated phrases. Dictate only spoken words.";

/** Hard ceiling — Groq SDK `timeout` alone has been observed to overrun (#13). */
async function withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error(`${label} exceeded ${ms}ms`), { code: "ETIMEDOUT" }));
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** One retry on timeout/network only for non-finalize cloud calls. */
const CLOUD_RETRY_ATTEMPTS = 1;
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
  language: string,
  prompt?: string,
  timeoutMs: number = CLOUD_TRANSCRIBE_TIMEOUT_MS
): Promise<Result<string, TranscriptionError>> => {
  try {
    // Convert Buffer → Uint8Array so File constructor accepts it under strict lib settings.
    const file = new File([new Uint8Array(audioBuffer)], "recording.wav", { type: "audio/wav" });
    const lang = language.trim().toLowerCase();
    const body: {
      file: File;
      model: string;
      language?: string;
      response_format: "text";
      prompt?: string;
      temperature?: number;
    } = {
      file,
      model,
      response_format: "text",
      // Deterministic-ish decode — reduces turbo/large inventiveness (issue #12).
      temperature: 0,
    };
    // Whisper: omit language for auto-detect. Never send the literal "auto".
    if (lang && lang !== "auto") {
      body.language = lang;
    }
    if (prompt && prompt.trim()) {
      body.prompt = prompt.trim().slice(0, 800);
    }
    const response = await withHardTimeout(
      client.audio.transcriptions.create(body),
      timeoutMs,
      "Cloud transcription"
    );

    // response_format: "text" returns a plain string at runtime, but groq-sdk v0.7
    // types transcriptions.create as returning Transcription regardless of format.
    const text = (response as unknown as string).trim();
    if (!text) return Err({ kind: "emptyTranscription" });
    return Ok(text);
  } catch (err) {
    // Groq SDK often surfaces aborts as APIError status 0 "Request timed out" —
    // treat as networkTimeout so UI/retry path is correct (not opaque "API error 0").
    if (isNetworkError(err)) {
      const message = err instanceof Error ? err.message : String(err);
      return Err({ kind: "networkTimeout", message });
    }
    if (err instanceof Groq.APIError) {
      const msg = err.message ?? "";
      if ((err.status ?? 0) === 0 && /timed?\s*out/i.test(msg)) {
        return Err({ kind: "networkTimeout", message: msg });
      }
      if (err.status === 401) {
        return Err({ kind: "invalidApiKey", message: "API key rejected by Groq" });
      }
      return Err({ kind: "apiError", statusCode: err.status ?? 0, message: err.message });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/timed?\s*out/i.test(message)) {
      return Err({ kind: "networkTimeout", message });
    }
    return Err({ kind: "apiError", statusCode: 0, message });
  }
};

export type TranscribeRemoteOpts = {
  prompt?: string;
  /** Client timeout ms (default CLOUD_TRANSCRIBE_TIMEOUT_MS). */
  timeoutMs?: number;
  /** Extra retries beyond the first attempt (default CLOUD_RETRY_ATTEMPTS). */
  retryAttempts?: number;
};

const transcribeRemote = async (
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string,
  opts: TranscribeRemoteOpts = {}
): Promise<Result<string, TranscriptionError>> => {
  const timeoutMs = opts.timeoutMs ?? CLOUD_TRANSCRIBE_TIMEOUT_MS;
  const retryAttempts = opts.retryAttempts ?? CLOUD_RETRY_ATTEMPTS;
  const client = new Groq({
    apiKey,
    timeout: timeoutMs,
    defaultHeaders: { "User-Agent": "OracleSpeakFlow/0.1.0" },
  });
  const t0 = performance.now();
  const maxAttempts = retryAttempts + 1;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await attempt(client, audioBuffer, model, language, opts.prompt, timeoutMs);
    const ms = Math.round(performance.now() - t0);
    if (result.ok) {
      process.stderr.write(`[LATENCY] cloud-transcribe: ${ms} ms ok model=${model} bytes=${audioBuffer.length}\n`);
      return result;
    }

    const shouldRetry = result.error.kind === "networkTimeout" && i < retryAttempts;
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
  return Err({ kind: "networkTimeout", message: `Cloud transcription exceeded ${timeoutMs}ms` });
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

type WorkerReply =
  | { ok: true; text: string; ms: number }
  | { ok: false; error: string; ms: number };

/**
 * Groq finalize on a worker thread — Electron main ORT/ffmpeg was inflating
 * the same call from ~1s (Node) to ~12–18s (live app).
 */
const transcribeRemoteWorker = (
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string,
  prompt: string,
  timeoutMs: number
): Promise<Result<string, TranscriptionError>> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (r: Result<string, TranscriptionError>) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    let worker: Worker;
    try {
      worker = new Worker(GROQ_WORKER_PATH);
    } catch (err) {
      process.stderr.write(
        `[LATENCY] groq-worker spawn failed — falling back to main thread: ${String(err)}\n`
      );
      void transcribeRemote(apiKey, audioBuffer, model, language, {
        prompt,
        timeoutMs,
        retryAttempts: 0,
      }).then(finish);
      return;
    }
    const t0 = performance.now();
    worker.once("message", (msg: WorkerReply) => {
      void worker.terminate();
      const ms = Math.round(performance.now() - t0);
      if (msg.ok) {
        process.stderr.write(
          `[LATENCY] cloud-transcribe: ${ms} ms ok model=${model} bytes=${audioBuffer.length} via=worker workerMs=${msg.ms}\n`
        );
        finish(Ok(msg.text));
      } else {
        process.stderr.write(
          `[LATENCY] cloud-transcribe: ${ms} ms fail model=${model} via=worker err=${msg.error}\n`
        );
        const network = /timed?\s*out|network|fetch failed/i.test(msg.error);
        finish(
          Err(
            network
              ? { kind: "networkTimeout", message: msg.error }
              : { kind: "apiError", statusCode: 0, message: msg.error }
          )
        );
      }
    });
    worker.once("error", (err) => {
      void worker.terminate();
      process.stderr.write(`[LATENCY] groq-worker error — main-thread fallback: ${String(err)}\n`);
      void transcribeRemote(apiKey, audioBuffer, model, language, {
        prompt,
        timeoutMs,
        retryAttempts: 0,
      }).then(finish);
    });
    worker.postMessage({
      apiKey,
      wavBase64: audioBuffer.toString("base64"),
      model,
      language,
      prompt,
      timeoutMs,
    });
  });

/**
 * Full-session finalize / speculative path (issue #12).
 * Uses whisper-large-v3-turbo + vocabulary prompt + worker HTTP + no retry.
 */
export const transcribeFinalize = async (
  apiKey: string,
  audioBuffer: Buffer,
  language: string,
  mode: TranscriptionMode = "remote",
  tier: ModelTier = "fast",
  searchDirs?: string[],
  engineHandle?: EngineHandle,
): Promise<Result<string, TranscriptionError>> => {
  if (mode === "local") {
    return transcribeLocal(audioBuffer, tier, language, searchDirs, engineHandle);
  }
  // Packaged Electron: worker must win by default. SPEAKFLOW_GROQ_WORKER=0 forces
  // main-thread HTTP (debug only). Unset / any other value → worker (Aug 8 Dom baseline).
  if (process.env["SPEAKFLOW_GROQ_WORKER"]?.trim() !== "0") {
    return transcribeRemoteWorker(
      apiKey,
      audioBuffer,
      FINALIZE_MODEL,
      language,
      FINALIZE_PROMPT,
      CLOUD_FINALIZE_TIMEOUT_MS
    );
  }
  return transcribeRemote(apiKey, audioBuffer, FINALIZE_MODEL, language, {
    prompt: FINALIZE_PROMPT,
    timeoutMs: CLOUD_FINALIZE_TIMEOUT_MS,
    retryAttempts: 0,
  });
};

/** Phase-1 live-insert chunk helper (issue #6). Always remote; keeps turbo for latency. */
export const transcribeChunk = async (
  apiKey: string,
  audioBuffer: Buffer,
  model: string,
  language: string,
  prompt?: string
): Promise<Result<string, TranscriptionError>> => {
  const opts: TranscribeRemoteOpts = {
    timeoutMs: CLOUD_TRANSCRIBE_TIMEOUT_MS,
    retryAttempts: 0,
  };
  if (prompt !== undefined) opts.prompt = prompt;
  return transcribeRemote(apiKey, audioBuffer, model, language, opts);
};
