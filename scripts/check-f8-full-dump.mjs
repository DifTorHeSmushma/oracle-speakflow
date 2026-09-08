#!/usr/bin/env node
/**
 * Regression gate: F8/PTT long dumps must never settle via trailing trim.
 *
 * Root cause (fixed b7cf10e): trimWavToMaxSec(..., 28) kept only the latter ~28s,
 * so long brain dumps pasted the second half. That must not return on the settle path.
 *
 * Speculative kick may still trailing-peek (overlap RTT) — settle must chunk the full WAV.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(root, "src/electron-main.ts"), "utf8");
const transcription = readFileSync(join(root, "src/services/transcription.ts"), "utf8");
const capture = readFileSync(join(root, "src/services/capture.ts"), "utf8");

const fails = [];

if (!capture.includes("export function chunkWavBySec")) {
  fails.push("capture.ts must export chunkWavBySec");
}
if (!transcription.includes("export const transcribeFinalizeLong")) {
  fails.push("transcription.ts must export transcribeFinalizeLong");
}
if (!transcription.includes("chunkWavBySec(")) {
  fails.push("transcribeFinalizeLong must call chunkWavBySec");
}
if (!main.includes("transcribeFinalizeLong")) {
  fails.push("electron-main must call transcribeFinalizeLong for long dumps");
}
if (!main.includes("useChunkedFinalize")) {
  fails.push("electron-main must gate long dumps with useChunkedFinalize");
}

// Settle path: runPipelineBody must not trim the WAV sent to final ASR.
const bodyStart = main.indexOf("async function runPipelineBody");
const bodyEnd = main.indexOf("// uiohook hotkey registration", bodyStart);
const body = bodyStart >= 0 && bodyEnd > bodyStart ? main.slice(bodyStart, bodyEnd) : "";
if (!body) {
  fails.push("could not isolate runPipelineBody for trim scan");
} else if (/\btrimWavToMaxSec\s*\(/.test(body)) {
  fails.push(
    "runPipelineBody must not call trimWavToMaxSec (trailing trim = F8 second-half paste regression)"
  );
}

// Speculative peek may trim — that is allowed only inside kickSpeculativeFinalizeWithWav.
const kickStart = main.indexOf("function kickSpeculativeFinalizeWithWav");
const kickEnd = main.indexOf("\nfunction ", kickStart + 1);
const kick = kickStart >= 0 ? main.slice(kickStart, kickEnd > kickStart ? kickEnd : kickStart + 800) : "";
if (kick && !/trimWavToMaxSec/.test(kick)) {
  // OK if speculative no longer trims; not a failure.
}

if (fails.length) {
  console.error("FAIL check-f8-full-dump:");
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}

console.log("PASS check-f8-full-dump — settle path keeps full F8 dumps (chunked finalize required)");
