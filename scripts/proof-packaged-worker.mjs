/**
 * Prove the installed Oracle SpeakFlow Groq worker can load (bundled, no missing groq-sdk)
 * and finish ~20s / ~45s WAV finalize without the Network-timeout death spiral.
 *
 * Aug 8 "wall≈1s" was speech_end wait with speculative overlap. This script measures cold
 * worker RTT (no overlap). Pass = ok transcript + under finalize ceiling (20s), proving the
 * packaged worker path that was broken (Cannot find package 'groq-sdk').
 *
 * Usage: node scripts/proof-packaged-worker.mjs
 */
import { Worker } from "node:worker_threads";
import { readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const WORKER = join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "Oracle SpeakFlow",
  "resources",
  "app.asar.unpacked",
  "dist",
  "services",
  "groqTranscribeWorker.cjs"
);

const ENV_PATH = join(process.env.APPDATA || "", "oracle-speakflow", ".env");

/** Must beat CLOUD_FINALIZE_TIMEOUT_MS (20000) so live app never double-timeouts. */
const MAX_MS_20S = 15_000;
const MAX_MS_45S = 20_000;

function loadApiKey() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("GROQ_API_KEY="));
  if (!line) throw new Error(`GROQ_API_KEY missing in ${ENV_PATH}`);
  return line.slice("GROQ_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

function whichFfmpeg() {
  const r = spawnSync("where.exe", ["ffmpeg"], { encoding: "utf8" });
  const line = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return line || "ffmpeg";
}

function makeSpokenWav(sec, outPath) {
  const tmpDir = join(homedir(), "AppData", "Local", "Temp", "osf-worker-proof");
  mkdirSync(tmpDir, { recursive: true });
  const seed = join(tmpDir, "seed-sapi.wav");
  const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 1
$s.SetOutputToWaveFile(${JSON.stringify(seed)})
$s.Speak("SpeakFlow dictation proof. Product name is SpeakFlow. This is a brain dump sentence for the latency gate.")
$s.Dispose()
`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
  });
  if (r.status !== 0 || !existsSync(seed)) {
    throw new Error(`SAPI seed failed: ${r.stderr || r.stdout}`);
  }
  const ff = whichFfmpeg();
  const fr = spawnSync(
    ff,
    ["-y", "-stream_loop", "-1", "-i", seed, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-t", String(sec), outPath],
    { encoding: "utf8" }
  );
  if (fr.status !== 0 || !existsSync(outPath)) {
    throw new Error(`ffmpeg loop failed: ${fr.stderr || fr.stdout}`);
  }
  try {
    unlinkSync(seed);
  } catch {
    /* ignore */
  }
}

function runWorker(apiKey, wavPath, timeoutMs) {
  const wav = readFileSync(wavPath);
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER);
    const t0 = performance.now();
    worker.on("error", (err) => reject(new Error(`worker error: ${err.message}`)));
    worker.on("message", (msg) => {
      const wall = Math.round(performance.now() - t0);
      void worker.terminate();
      resolve({ ...msg, wallMs: wall, bytes: wav.length });
    });
    worker.postMessage({
      apiKey,
      wavBase64: wav.toString("base64"),
      model: "whisper-large-v3-turbo",
      language: "en",
      prompt:
        "SpeakFlow dictation. Transcribe exactly what was spoken. Product name is SpeakFlow.",
      timeoutMs,
    });
  });
}

function audioSec(bytes) {
  return Math.round(((bytes - 44) / 32000) * 100) / 100;
}

async function main() {
  if (!existsSync(WORKER)) {
    console.error("FAIL missing installed worker:", WORKER);
    process.exit(1);
  }
  console.log("worker:", WORKER);
  console.log("worker bytes:", readFileSync(WORKER).length);

  const apiKey = loadApiKey();
  const tmp = join(homedir(), "AppData", "Local", "Temp", "osf-worker-proof");
  mkdirSync(tmp, { recursive: true });

  const cases = [
    { label: "20s", sec: 20, maxMs: MAX_MS_20S, file: join(tmp, "proof-20s.wav") },
    { label: "45s", sec: 45, maxMs: MAX_MS_45S, file: join(tmp, "proof-45s.wav") },
  ];

  let failed = false;
  for (const c of cases) {
    console.log(`\n--- generating ~${c.sec}s 16kHz mono WAV ---`);
    makeSpokenWav(c.sec, c.file);
    const bytes = readFileSync(c.file).length;
    const sec = audioSec(bytes);
    console.log(`wav bytes=${bytes} ~${sec}s`);
    if (sec < c.sec * 0.8 || sec > c.sec * 1.25) {
      console.error(`FAIL ${c.label}: unexpected duration ${sec}s`);
      failed = true;
      continue;
    }

    const result = await runWorker(apiKey, c.file, 20_000);
    const preview = (result.text || result.error || "").toString().slice(0, 100);
    console.log(
      JSON.stringify({
        label: c.label,
        ok: result.ok,
        wallMs: result.wallMs,
        workerMs: result.ms,
        maxMs: c.maxMs,
        preview,
      })
    );

    if (/Cannot find package 'groq-sdk'/.test(result.error || "")) {
      console.error("FAIL groq-sdk still unresolved in worker");
      failed = true;
      continue;
    }
    if (!result.ok) {
      console.error(`FAIL ${c.label}: transcription not ok — ${result.error}`);
      failed = true;
      continue;
    }
    if (result.wallMs > c.maxMs) {
      console.error(`FAIL ${c.label}: wall ${result.wallMs}ms > ${c.maxMs}ms`);
      failed = true;
      continue;
    }
    console.log(`PASS ${c.label}: wall=${result.wallMs}ms (limit ${c.maxMs}ms)`);
  }

  if (failed) process.exit(1);
  console.log("\nALL PROOFS PASSED — packaged worker loads + finishes under finalize ceiling");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
