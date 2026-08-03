/**
 * Persistent PowerShell host with Add-Type loaded once.
 * Cold spawnSync+Add-Type was costing Dom ~2–5s per foreground/restore call (#13).
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Pending = {
  resolve: (line: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let child: ChildProcessWithoutNullStreams | null = null;
let ready = false;
let stdoutBuf = "";
const queue: Pending[] = [];
let bootPromise: Promise<void> | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveServerScript(): string {
  const inDist = join(__dirname, "win32-hot-server.ps1");
  if (existsSync(inDist)) return inDist;
  const inSrc = join(__dirname, "../../src/utils/win32-hot-server.ps1");
  if (existsSync(inSrc)) {
    try {
      mkdirSync(__dirname, { recursive: true });
      copyFileSync(inSrc, inDist);
    } catch {
      return inSrc;
    }
    return existsSync(inDist) ? inDist : inSrc;
  }
  throw new Error("win32-hot-server.ps1 not found");
}

function failAll(err: Error): void {
  while (queue.length) {
    const p = queue.shift();
    if (!p) break;
    clearTimeout(p.timer);
    p.reject(err);
  }
}

function onStdout(chunk: Buffer): void {
  stdoutBuf += chunk.toString("utf8");
  for (;;) {
    const nl = stdoutBuf.indexOf("\n");
    if (nl < 0) break;
    const line = stdoutBuf.slice(0, nl).replace(/\r$/, "");
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!ready) {
      if (line === "__READY__") ready = true;
      continue;
    }
    const p = queue.shift();
    if (!p) continue;
    clearTimeout(p.timer);
    p.resolve(line);
  }
}

function ensureHost(): Promise<void> {
  if (ready && child && !child.killed) return Promise.resolve();
  if (bootPromise) return bootPromise;
  bootPromise = new Promise<void>((resolve, reject) => {
    let script: string;
    try {
      script = resolveServerScript();
    } catch (err) {
      bootPromise = null;
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    try {
      child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NoLogo", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
      );
    } catch (err) {
      bootPromise = null;
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    ready = false;
    stdoutBuf = "";
    child.stdout.on("data", onStdout);
    child.stderr.on("data", (c: Buffer) => {
      process.stderr.write(`[win32-hot] ${c.toString("utf8")}`);
    });
    child.on("exit", (code) => {
      child = null;
      ready = false;
      bootPromise = null;
      failAll(new Error(`win32-hot exited code=${code}`));
    });
    const t0 = Date.now();
    const waitReady = (): void => {
      if (ready) {
        resolve();
        return;
      }
      if (Date.now() - t0 > 10000) {
        bootPromise = null;
        try {
          child?.kill();
        } catch {
          /* ignore */
        }
        child = null;
        reject(new Error("win32-hot boot timeout"));
        return;
      }
      setTimeout(waitReady, 20);
    };
    waitReady();
  });
  return bootPromise;
}

async function rpc(cmd: string, timeoutMs = 1500): Promise<string> {
  await ensureHost();
  if (!child) throw new Error("win32-hot not running");
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = queue.findIndex((q) => q.timer === timer);
      if (idx >= 0) queue.splice(idx);
      reject(new Error("win32-hot rpc timeout"));
    }, timeoutMs);
    queue.push({ resolve, reject, timer });
    child!.stdin.write(cmd + "\n");
  });
}

export async function hotGetForegroundAndAlive(
  checkHwnd: string | null
): Promise<{ foreground: { hwnd: string; className: string; processName: string } | null; isWindowAlive: boolean }> {
  let safe = "0";
  if (checkHwnd) {
    try {
      safe = BigInt(checkHwnd).toString();
    } catch {
      safe = "0";
    }
  }
  const line = await rpc(`FG|${safe}`);
  const parts = line.split("|");
  if (parts.length < 4 || !parts[0]) {
    return { foreground: null, isWindowAlive: false };
  }
  return {
    foreground: { hwnd: parts[0], className: parts[1] ?? "", processName: parts[2] ?? "" },
    isWindowAlive: (parts[3] ?? "").toLowerCase() === "true",
  };
}

export async function hotCtrlV(): Promise<{ ok: boolean; detail: string }> {
  try {
    const line = await rpc("CTRLV", 800);
    return line === "ok" ? { ok: true, detail: "ok-hot-ctrlv" } : { ok: false, detail: line || "fail" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** One-shot restore + Ctrl+V ( Dom #13 inject path). */
export async function hotPasteToHwnd(hwndDecimal: string): Promise<{ ok: boolean; detail: string; ms: number }> {
  let safe: string;
  try {
    safe = BigInt(hwndDecimal).toString();
  } catch {
    return { ok: false, detail: "bad-hwnd", ms: 0 };
  }
  const t0 = performance.now();
  try {
    const line = await rpc(`PASTE|${safe}`, 2000);
    const ms = Math.round(performance.now() - t0);
    if (line === "ok") return { ok: true, detail: "ok-hot-paste", ms };
    return { ok: false, detail: line || "fail", ms };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Math.round(performance.now() - t0),
    };
  }
}

export async function hotRestoreCapturedHwnd(hwndDecimal: string): Promise<{ ok: boolean; detail: string }> {
  let safe: string;
  try {
    safe = BigInt(hwndDecimal).toString();
  } catch {
    return { ok: false, detail: "bad-hwnd" };
  }
  try {
    const line = await Promise.race([
      rpc(`RESTORE|${safe}`),
      new Promise<string>((_, rej) =>
        setTimeout(() => rej(new Error("hot-restore-timeout")), 1200)
      ),
    ]);
    if (line === "ok") return { ok: true, detail: "ok-hot" };
    return { ok: false, detail: line || "fail" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
