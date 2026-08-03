/**
 * Narrow restore of a *previously captured* dictation target HWND, then the caller
 * issues Ctrl+V. Required for Electron/Chromium hosts (Cursor) where WM_PASTE is a no-op.
 *
 * ALLOW_CAPTURED_TARGET_RESTORE — check:focus allowlists this file only.
 * Invariant #18 reinterpreted per PRD LD3 / issue #11: do not steal focus to arbitrary
 * windows; restoring the already-captured dictation target is required product behavior.
 *
 * Never call this with SpeakFlow's own HWND. Never call with a handle that was not
 * captured at speech end / PTT keydown.
 */
import { spawnSync } from "node:child_process";

export type RestoreResult = { ok: boolean; detail: string };

/**
 * Bring the captured external HWND to the foreground so a subsequent Ctrl+V lands there.
 * Returns ok=false if the window is dead or activation fails.
 */
export function restoreCapturedHwnd(hwndDecimal: string): RestoreResult {
  if (process.platform !== "win32") {
    return { ok: false, detail: "not-win32" };
  }
  let safeHwnd: string;
  try {
    safeHwnd = BigInt(hwndDecimal).toString();
  } catch {
    return { ok: false, detail: "bad-hwnd" };
  }

  // ALLOW_CAPTURED_TARGET_RESTORE: SetForegroundWindow is intentional and scoped to the
  // speech-end captured HWND only (issue #11 / PRD LD3). AttachThreadInput is used solely
  // to make that restore reliable on modern Windows — not to hijack unrelated threads.
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SfRestore {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  public static bool Restore(IntPtr target) {
    if (!IsWindow(target)) return false;
    ShowWindow(target, 9 /* SW_RESTORE */);
    IntPtr fg = GetForegroundWindow();
    uint fgPid;
    uint fgTid = GetWindowThreadProcessId(fg, out fgPid);
    uint self = GetCurrentThreadId();
    bool attached = false;
    if (fgTid != 0 && fgTid != self) {
      attached = AttachThreadInput(self, fgTid, true);
    }
    try {
      BringWindowToTop(target);
      return SetForegroundWindow(target);
    } finally {
      if (attached) AttachThreadInput(self, fgTid, false);
    }
  }
}
"@
$hw = [IntPtr]${safeHwnd}
if (-not [SfRestore]::IsWindow($hw)) { Write-Output 'dead'; exit 2 }
$ok = [SfRestore]::Restore($hw)
if ($ok) { Write-Output 'ok'; exit 0 } else { Write-Output 'fail'; exit 3 }
`.trim();

  try {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", timeout: 4_000 },
    );
    const out = (result.stdout ?? "").trim();
    if (result.status === 0 && out === "ok") {
      process.stderr.write(`[INJECT] restoreCaptured hwnd=${safeHwnd} ok\n`);
      return { ok: true, detail: "ok" };
    }
    process.stderr.write(
      `[INJECT] restoreCaptured hwnd=${safeHwnd} fail out=${out.slice(0, 80)} status=${result.status}\n`
    );
    return { ok: false, detail: out || `status=${result.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[INJECT] restoreCaptured exception: ${message}\n`);
    return { ok: false, detail: message };
  }
}
