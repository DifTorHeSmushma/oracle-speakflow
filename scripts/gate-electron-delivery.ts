#!/usr/bin/env tsx
/**
 * Gate G-D1b — Electron / Cursor-class delivery (issue #11).
 *
 * Proves restore+Ctrl+V into a Chrome_WidgetWin host receives finalize text.
 * Notepad-only G-D1 is insufficient for Dom's workflow (Cursor).
 *
 * Skips cleanly (exit 0) off Windows.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { restoreCapturedHwnd } from "../src/utils/win32-restore-captured.js";
import { hostAcceptsBackgroundWmPaste } from "../src/utils/win32-paste-hwnd.js";

const ROUNDS = 5;
const READY_TIMEOUT_MS = 30_000;
const READBACK_TIMEOUT_MS = 5_000;
const POLL_MS = 200;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function resolveElectronBin(): string {
  // electron package exports the path string when required.
  try {
    return require("electron") as string;
  } catch {
    return join(root, "node_modules", "electron", "dist", "electron.exe");
  }
}

function setClipboard(text: string): boolean {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}')))`,
    ],
    { encoding: "utf8", timeout: 5_000 }
  );
  return (result.status ?? 1) === 0;
}

/** Send Ctrl+V via keybd_event after restore (no nut-js dependency in the harness). */
function sendCtrlV(): boolean {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SfKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public const byte VK_CONTROL = 0x11;
  public const byte VK_V = 0x56;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public static void CtrlV() {
    keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
    keybd_event(VK_V, 0, 0, UIntPtr.Zero);
    keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
}
"@
[SfKeys]::CtrlV()
Write-Output 'ok'
`.trim();
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", timeout: 5_000 }
  );
  return (result.status ?? 1) === 0 && (result.stdout ?? "").includes("ok");
}

function readTextFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function waitForReady(readyPath: string, hwndPath: string): Promise<string | null> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(readyPath)) {
      const hwnd = readTextFile(hwndPath)?.trim();
      if (hwnd && /^\d+$/.test(hwnd)) return hwnd;
    }
    await sleep(POLL_MS);
  }
  return null;
}

async function waitForMarker(textPath: string, marker: string): Promise<boolean> {
  const deadline = Date.now() + READBACK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const content = readTextFile(textPath) ?? "";
    if (content.includes(marker)) return true;
    await sleep(POLL_MS);
  }
  return false;
}

async function runHarnessOnce(): Promise<{ passed: number; results: { round: number; ok: boolean; detail: string }[] }> {
  const workDir = mkdtempSync(join(tmpdir(), "speakflow-gd1b-"));
  const fixture = join(root, "scripts", "fixtures", "electron-paste-target.mjs");
  const electronBin = resolveElectronBin();
  let child: ChildProcess | null = null;
  const results: { round: number; ok: boolean; detail: string }[] = [];

  try {
    child = spawn(electronBin, [fixture, workDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
        // Isolate userData so cache locks from a prior gate run cannot flake G-D1b.
        ELECTRON_USER_DATA: join(workDir, "userdata"),
      },
    });
    child.stdout?.on("data", (d: Buffer) => process.stderr.write(`[fixture] ${d}`));
    child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[fixture] ${d}`));

    const hwnd = await waitForReady(join(workDir, "ready.txt"), join(workDir, "hwnd.txt"));
    if (!hwnd) {
      return { passed: 0, results: [{ round: 0, ok: false, detail: "fixture never published HWND" }] };
    }
    console.log(`G-D1b target Electron hwnd=${hwnd}`);

    const warmup = `sf-gd1b-warmup-${Date.now().toString(36)}`;
    writeFileSync(join(workDir, "text.txt"), "", "utf8");
    if (!setClipboard(warmup)) {
      return { passed: 0, results: [{ round: 0, ok: false, detail: "clipboard write failed (warmup)" }] };
    }
    const restored = restoreCapturedHwnd(hwnd);
    if (!restored.ok) {
      return { passed: 0, results: [{ round: 0, ok: false, detail: `restore failed: ${restored.detail}` }] };
    }
    await sleep(150);
    if (!sendCtrlV()) {
      return { passed: 0, results: [{ round: 0, ok: false, detail: "Ctrl+V send failed (warmup)" }] };
    }
    if (!(await waitForMarker(join(workDir, "text.txt"), warmup))) {
      return { passed: 0, results: [{ round: 0, ok: false, detail: "warmup marker missing" }] };
    }

    for (let round = 1; round <= ROUNDS; round++) {
      const marker = `sf-gd1b-${round}-${Date.now().toString(36)}`;
      if (!setClipboard(marker)) {
        results.push({ round, ok: false, detail: "clipboard write failed" });
        continue;
      }
      const r = restoreCapturedHwnd(hwnd);
      if (!r.ok) {
        results.push({ round, ok: false, detail: `restore failed: ${r.detail}` });
        continue;
      }
      await sleep(120);
      if (!sendCtrlV()) {
        results.push({ round, ok: false, detail: "Ctrl+V failed" });
        continue;
      }
      const ok = await waitForMarker(join(workDir, "text.txt"), marker);
      results.push({
        round,
        ok,
        detail: ok ? `delivered ${marker.length} chars` : "marker missing from Electron textarea",
      });
    }
  } finally {
    if (child?.pid) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    }
    await sleep(800);
    rmSync(workDir, { recursive: true, force: true });
  }

  return { passed: results.filter((r) => r.ok).length, results };
}

async function main(): Promise<number> {
  if (process.platform !== "win32") {
    console.log("G-D1b SKIP (not win32) — Electron-host delivery harness runs on Windows only");
    return 0;
  }

  if (
    hostAcceptsBackgroundWmPaste({
      className: "Chrome_WidgetWin_1",
      processName: "Cursor.exe",
    })
  ) {
    console.error("G-D1b FAIL — hostAcceptsBackgroundWmPaste still true for Cursor.exe");
    return 1;
  }

  // One automatic retry: running after the Notepad gate can briefly starve focus.
  let last = await runHarnessOnce();
  if (last.passed !== ROUNDS) {
    console.log("G-D1b retry after partial/failed attempt…");
    await sleep(1_500);
    last = await runHarnessOnce();
  }

  for (const r of last.results.filter((x) => !x.ok)) {
    console.error(`  round ${r.round}: FAIL — ${r.detail}`);
  }
  if (last.passed === ROUNDS) {
    console.log(
      `G-D1b PASS ${last.passed}/${ROUNDS} — Electron host received text via restore+Ctrl+V (Cursor-class path)`
    );
    return 0;
  }
  console.error(`G-D1b FAIL ${last.passed}/${ROUNDS} — issue #11 floor A requires ${ROUNDS}/${ROUNDS}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`G-D1b FAIL — harness error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
