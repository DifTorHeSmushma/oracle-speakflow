#!/usr/bin/env tsx
/**
 * Gate G-D1 — automated proof of PRD metric M1: the captured external HWND receives the
 * finalize text, 10/10, with no human in the loop (PRD LD5 / P4 — Dom smoke is never a gate).
 *
 * The harness owns a real Notepad window, drives the *production* `pasteViaWmPaste()` against
 * its HWND, and reads the edit control back with WM_GETTEXT to prove the text actually landed.
 * SpeakFlow is not running and Notepad is not focused by us, which is precisely the LD2 case:
 * delivery must work without owning the foreground.
 *
 * Exits 0 with a SKIP line on non-Windows so `/validate` stays green cross-platform.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pasteViaWmPaste } from "../src/utils/win32-paste-hwnd.js";

const ROUNDS = 10;
/**
 * Windows 11's packaged Notepad silently drops a launch request for a few seconds after the
 * app has been force-closed, so the harness re-issues the launch instead of waiting longer.
 */
const LAUNCH_ATTEMPTS = 3;
const HWND_RESOLVE_TIMEOUT_MS = 12_000;
const HWND_POLL_INTERVAL_MS = 400;
/** Readback is polled — a cold Notepad can take a moment to render a freshly pasted line. */
const READBACK_TIMEOUT_MS = 4_000;
const READBACK_POLL_INTERVAL_MS = 200;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function powershell(script: string, timeoutMs = 10_000): { status: number; out: string } {
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", timeout: timeoutMs }
  );
  return { status: result.status ?? -1, out: (result.stdout ?? "").trim() };
}

type NotepadWindow = { pid: number; hwnd: string; title: string };

/** Every Notepad process that currently owns a top-level window. */
function listNotepadWindows(): NotepadWindow[] {
  const { status, out } = powershell(
    `Get-Process -Name notepad -ErrorAction SilentlyContinue | ` +
      `Where-Object { $_.MainWindowHandle -ne 0 } | ` +
      `ForEach-Object { Write-Output ($_.Id.ToString() + '|' + $_.MainWindowHandle.ToString() + '|' + $_.MainWindowTitle) }`
  );
  if (status !== 0 || !out) return [];
  return out
    .split(/\r?\n/)
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 2 && /^\d+$/.test(parts[0] ?? "") && /^\d+$/.test(parts[1] ?? ""))
    .map((parts) => ({
      pid: Number(parts[0]),
      hwnd: parts[1] as string,
      title: parts.slice(2).join("|"),
    }));
}

/**
 * Picks the window this harness caused to appear.
 *
 * Preferring a *new* host process over a title match matters: Windows 11 Notepad restores the
 * tabs that were open when it last exited, and the restored tab stays active — so the window
 * title is the restored document, not the file we just asked it to open. Delivering into that
 * window still proves exactly what G-D1 measures (an external HWND we never focused), and a
 * new pid identifies it unambiguously.
 */
function pickTargetWindow(beforePids: Set<number>, titleFragment: string): NotepadWindow | null {
  const windows = listNotepadWindows();
  return (
    windows.find((w) => !beforePids.has(w.pid)) ??
    windows.find((w) => w.title.includes(titleFragment)) ??
    null
  );
}

/** All Notepad pids, including the windowless helper processes of the packaged app. */
function existingNotepadPids(): Set<number> {
  const { status, out } = powershell(
    `Get-Process -Name notepad -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_.Id }`
  );
  if (status !== 0 || !out) return new Set();
  return new Set(
    out
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
}

/**
 * Reads the text of the target's edit control using the same child-discovery order as
 * `pasteViaWmPaste`, so a readback failure means the paste target itself was wrong.
 */
function readTargetText(hwndDecimal: string): string | null {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SfRead {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int SendMessage(IntPtr h, uint msg, int w, StringBuilder l);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static IntPtr FindEdit(IntPtr root) {
    string[] classes = { "RichEditD2DPT", "RichEdit20W", "RichEdit20A", "Edit", "TextBox" };
    foreach (var cls in classes) {
      var h = FindWindowEx(root, IntPtr.Zero, cls, null);
      if (h != IntPtr.Zero) return h;
    }
    IntPtr child = IntPtr.Zero;
    while (true) {
      child = FindWindowEx(root, child, null, null);
      if (child == IntPtr.Zero) break;
      foreach (var cls in classes) {
        var h = FindWindowEx(child, IntPtr.Zero, cls, null);
        if (h != IntPtr.Zero) return h;
      }
      var sb = new StringBuilder(64);
      GetClassName(child, sb, 64);
      var name = sb.ToString();
      foreach (var cls in classes) {
        if (string.Equals(name, cls, StringComparison.OrdinalIgnoreCase)) return child;
      }
    }
    return root;
  }
  // Fixed buffer: GetWindowTextLength reports 0 for a RichEdit owned by another process,
  // which would silently truncate the readback to a single character.
  public static string ReadText(IntPtr root) {
    var edit = FindEdit(root);
    var sb = new StringBuilder(65536);
    SendMessage(edit, 0x000D /* WM_GETTEXT */, sb.Capacity, sb);
    return sb.ToString();
  }
}
"@
$hw = [IntPtr]${hwndDecimal}
if (-not [SfRead]::IsWindow($hw)) { exit 2 }
Write-Output ("text|" + [SfRead]::ReadText($hw).Replace("\`r", "").Replace("\`n", "\\n"))
`.trim();

  const { status, out } = powershell(script);
  if (status !== 0 || !out.startsWith("text|")) return null;
  return out.slice("text|".length);
}

function setClipboard(text: string): boolean {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const { status } = powershell(
    `Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString(` +
      `[System.Convert]::FromBase64String('${encoded}')))`
  );
  return status === 0;
}

type RoundResult = { round: number; ok: boolean; detail: string };

/**
 * Delivers one marker through the production paste path and waits for it to show up in the
 * target. Polling rather than a fixed sleep keeps the gate deterministic on a cold Notepad.
 */
async function deliverAndVerify(hwnd: string, marker: string): Promise<string | null> {
  if (!setClipboard(marker)) return "clipboard write failed";

  // Production delivery path — the exact call runPipeline makes for backgroundPaste.
  if (!pasteViaWmPaste(hwnd)) return "pasteViaWmPaste returned false";

  const deadline = Date.now() + READBACK_TIMEOUT_MS;
  let last: string | null = null;
  while (Date.now() < deadline) {
    await sleep(READBACK_POLL_INTERVAL_MS);
    last = readTargetText(hwnd);
    if (last !== null && last.includes(marker)) return null;
  }

  if (last === null) return "readback failed";
  return `marker missing from target (last 60 chars: ${JSON.stringify(last.slice(-60))})`;
}

async function main(): Promise<number> {
  if (process.platform !== "win32") {
    console.log("G-D1 SKIP (not win32) — HWND delivery harness runs on Windows only");
    return 0;
  }

  const results: RoundResult[] = [];
  const workDir = mkdtempSync(join(tmpdir(), "speakflow-gd1-"));
  const docName = `gd1-${Date.now().toString(36)}.txt`;
  const docPath = join(workDir, docName);
  writeFileSync(docPath, "", "utf8");

  const preExistingPids = existingNotepadPids();
  let target: NotepadWindow | null = null;

  try {
    const titleFragment = docName.replace(/\.txt$/, "");
    for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS && !target; attempt++) {
      spawn("notepad.exe", [docPath], { detached: true, stdio: "ignore" }).unref();

      const deadline = Date.now() + HWND_RESOLVE_TIMEOUT_MS;
      while (Date.now() < deadline && !target) {
        await sleep(HWND_POLL_INTERVAL_MS);
        target = pickTargetWindow(preExistingPids, titleFragment);
      }
      if (!target) {
        const observed = listNotepadWindows()
          .map((w) => `${w.pid}:${w.title}`)
          .join(", ");
        console.log(
          `G-D1 launch attempt ${attempt}/${LAUNCH_ATTEMPTS} produced no usable window — ` +
            `observed: ${observed || "(none)"}`
        );
      }
    }
    if (!target) {
      console.error(
        `G-D1 FAIL — no Notepad window appeared after ${LAUNCH_ATTEMPTS} launch attempts`
      );
      return 1;
    }
    const { hwnd } = target;
    console.log(
      `G-D1 target Notepad pid=${target.pid} hwnd=${hwnd} title="${target.title}" requested=${docName}`
    );

    if (readTargetText(hwnd) === null) {
      console.error(`G-D1 FAIL — no readable edit control under hwnd=${hwnd}`);
      return 1;
    }

    // Warm-up (not scored): proves the target is responsive before the counted rounds, so a
    // cold-start delay can never be mistaken for a delivery failure.
    const warmup = await deliverAndVerify(hwnd, `speakflow-gd1-warmup-${Date.now().toString(36)}`);
    if (warmup !== null) {
      console.error(`G-D1 FAIL — target never accepted a warm-up paste: ${warmup}`);
      return 1;
    }

    for (let round = 1; round <= ROUNDS; round++) {
      const marker = `speakflow-gd1-${round}-${Date.now().toString(36)}`;
      const failure = await deliverAndVerify(hwnd, marker);
      results.push({
        round,
        ok: failure === null,
        detail: failure ?? `delivered ${marker.length} chars`,
      });
    }
  } finally {
    // Close every Notepad host that appeared after we started, whether or not the window was
    // ever resolved. Skipping this on failure used to orphan a Notepad, which the next run
    // then reused as a tab host and scored against the wrong document.
    const spawnedPids = [...existingNotepadPids()].filter((pid) => !preExistingPids.has(pid));
    for (const pid of spawnedPids) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }
    // Give the app model a moment to release, so a back-to-back run can launch Notepad again.
    if (spawnedPids.length > 0) await sleep(1_500);
    if (target && preExistingPids.has(target.pid)) {
      console.log(`G-D1 note: reused pre-existing Notepad pid=${target.pid} — left open`);
    }
    rmSync(workDir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  for (const r of results.filter((x) => !x.ok)) {
    console.error(`  round ${r.round}: FAIL — ${r.detail}`);
  }

  if (passed === ROUNDS) {
    console.log(`G-D1 PASS ${passed}/${ROUNDS} — captured external HWND received the text every round`);
    return 0;
  }
  console.error(`G-D1 FAIL ${passed}/${ROUNDS} — M1 requires ${ROUNDS}/${ROUNDS}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`G-D1 FAIL — harness error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
