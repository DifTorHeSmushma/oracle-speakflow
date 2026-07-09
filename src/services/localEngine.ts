import { spawn } from "node:child_process";
import * as http from "node:http";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getBinaryPath } from "../utils/binaryPath.js";
import type { Result } from "../utils/result.js";
import { Ok, Err } from "../utils/result.js";
import type { ModelTier } from "../types/ipc.js";
import type { TranscriptionError } from "./transcription.js";

export type EngineHandle = {
  pid: number;
  port: number;
  tier: ModelTier;
  stopped: boolean;
};

export type EngineError =
  | { kind: "engineSpawnFailed"; message: string }
  | { kind: "engineNotReady"; message: string }
  | { kind: "enginePortBind"; message: string };

// ---------------------------------------------------------------------------
// Module-level lifecycle tracking (pid-keyed)
// ---------------------------------------------------------------------------

type IdleEntry = { handle: EngineHandle; idleMs: number; onUnload: () => void };
const engineTimers = new Map<number, ReturnType<typeof setTimeout>>();
const engineIdleEntries = new Map<number, IdleEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const findFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => {
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          reject(new Error("Could not determine free port"));
        }
      });
    });
    server.on("error", reject);
  });

const pollHealth = (port: number, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() > deadline) { resolve(false); return; }
      const req = http.request(
        { host: "127.0.0.1", port, path: "/health", method: "GET" },
        (res) => {
          res.resume();
          if (res.statusCode === 200) { resolve(true); }
          else { setTimeout(check, 150); }
        }
      );
      req.on("error", () => setTimeout(check, 150));
      req.end();
    };
    setTimeout(check, 100); // initial delay to let the server start
  });

const scheduleIdleUnload = (handle: EngineHandle, idleMs: number, onUnload: () => void): void => {
  const existing = engineTimers.get(handle.pid);
  if (existing) clearTimeout(existing);

  const t = setTimeout(() => {
    engineTimers.delete(handle.pid);
    engineIdleEntries.delete(handle.pid);
    stopEngine(handle).then(onUnload).catch(onUnload);
  }, idleMs);

  engineTimers.set(handle.pid, t);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawns whisper-server.exe, waits for /health (up to 5 s), returns a handle.
 * G17.
 */
export const startEngine = async (
  tier: ModelTier,
  verifiedModelPath: string,
): Promise<Result<EngineHandle, EngineError>> => {
  const serverBin = getBinaryPath("whisper-server.exe");
  if (!existsSync(serverBin)) {
    return Err({ kind: "engineSpawnFailed", message: `whisper-server.exe not found at ${serverBin}` });
  }

  let port: number;
  try {
    port = await findFreePort();
  } catch (err) {
    return Err({ kind: "enginePortBind", message: String(err) });
  }

  const child = spawn(
    serverBin,
    ["--model", verifiedModelPath, "--port", String(port), "--host", "127.0.0.1"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  if (child.pid === undefined) {
    return Err({ kind: "engineSpawnFailed", message: "spawn returned no pid" });
  }

  // Forward engine stderr to our stderr (MCP-transport discipline)
  child.stderr?.pipe(process.stderr);

  const pid = child.pid;
  const ready = await pollHealth(port, 5000);
  if (!ready) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
    return Err({ kind: "engineNotReady", message: "whisper-server /health timeout (5000ms)" });
  }

  const handle: EngineHandle = { pid, port, tier, stopped: false };
  return Ok(handle);
};

/**
 * POSTs a WAV buffer to the resident server's /inference endpoint.
 * Resets the idle-unload timer when armed. G17.
 */
export const transcribeWarm = async (
  h: EngineHandle,
  wav: Buffer,
): Promise<Result<string, TranscriptionError>> => {
  if (h.stopped) {
    return Err({ kind: "localTranscriptionFailed", message: "Engine is stopped" });
  }

  const boundary = `speakflow-${randomUUID()}`;
  const headerPart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`
  );
  const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([headerPart, wav, footerPart]);

  try {
    const text = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: h.port,
          path: "/inference",
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          res.on("end", () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Server returned ${res.statusCode}: ${data}`));
              return;
            }
            try {
              const parsed = JSON.parse(data) as { text?: string };
              resolve(parsed.text?.trim() ?? "");
            } catch {
              resolve(data.trim());
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    // Reset idle timer if armed
    const entry = engineIdleEntries.get(h.pid);
    if (entry) scheduleIdleUnload(h, entry.idleMs, entry.onUnload);

    if (!text) return Err({ kind: "emptyTranscription" });
    return Ok(text);
  } catch (err) {
    return Err({ kind: "localTranscriptionFailed", message: err instanceof Error ? err.message : String(err) });
  }
};

/**
 * Kills the engine process. Idempotent — safe to call multiple times (Invariant #7/#8).
 */
export const stopEngine = async (h: EngineHandle): Promise<void> => {
  if (h.stopped) return; // Invariant #7
  h.stopped = true;

  const timer = engineTimers.get(h.pid);
  if (timer) { clearTimeout(timer); engineTimers.delete(h.pid); }
  engineIdleEntries.delete(h.pid);

  try { process.kill(h.pid, "SIGKILL"); } catch { /* already dead */ }
};

/**
 * Arms an idle-unload timer. Fires `onUnload` after `idleMs` ms of no inference.
 * Each `transcribeWarm` call resets the timer. Default 5 min per Spec §0 Q2. G17.
 */
export const armIdleUnload = (h: EngineHandle, idleMs: number, onUnload: () => void): void => {
  engineIdleEntries.set(h.pid, { handle: h, idleMs, onUnload });
  scheduleIdleUnload(h, idleMs, onUnload);
};
