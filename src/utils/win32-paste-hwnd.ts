/**
 * Background paste into a known HWND via WM_PASTE (clipboard must already hold text).
 * No SetForegroundWindow / AttachThreadInput — Invariant #18.
 *
 * Success requires a real edit-class child (Notepad Edit / RichEditD2DPT / …).
 * Falling back to the root HWND is a hard fail: Chromium/Electron (`Chrome_WidgetWin_1`)
 * accepts SendMessage(WM_PASTE) but ignores it — returning true here was the #11 false
 * delivery that showed text in SpeakFlow while Cursor stayed empty.
 */
import { spawnSync } from "node:child_process";

const WM_PASTE = 0x0302;

export type WmPasteResult = {
  ok: boolean;
  /** True only when an edit-class child was found (never when pasting to the root). */
  editFound: boolean;
  detail: string;
};

/**
 * Find an editable child and SendMessage WM_PASTE.
 * Returns ok=false when the window is dead, no edit child exists, or the send fails.
 */
export function pasteViaWmPaste(hwndDecimal: string): boolean {
  return pasteViaWmPasteDetailed(hwndDecimal).ok;
}

export function pasteViaWmPasteDetailed(hwndDecimal: string): WmPasteResult {
  if (process.platform !== "win32") {
    return { ok: false, editFound: false, detail: "not-win32" };
  }
  let safeHwnd: string;
  try {
    safeHwnd = BigInt(hwndDecimal).toString();
  } catch {
    return { ok: false, editFound: false, detail: "bad-hwnd" };
  }

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SfPaste {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
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
    return IntPtr.Zero;
  }
}
"@
$hw = [IntPtr]${safeHwnd}
if (-not [SfPaste]::IsWindow($hw)) { Write-Output 'dead'; exit 2 }
$edit = [SfPaste]::FindEdit($hw)
if ($edit -eq [IntPtr]::Zero) { Write-Output 'noedit'; exit 3 }
[void][SfPaste]::SendMessage($edit, ${WM_PASTE}, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Output ("ok|" + $edit.ToString())
`.trim();

  try {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", timeout: 4_000 },
    );
    const out = (result.stdout ?? "").trim();
    if (result.status === 0 && out.startsWith("ok|")) {
      process.stderr.write(`[INJECT] WM_PASTE ok hwnd=${safeHwnd} edit=${out.slice(3)}\n`);
      return { ok: true, editFound: true, detail: out };
    }
    const detail = out || `status=${result.status}`;
    process.stderr.write(
      `[INJECT] WM_PASTE fail hwnd=${safeHwnd} ${detail.slice(0, 80)}\n`
    );
    return {
      ok: false,
      editFound: false,
      detail,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[INJECT] WM_PASTE exception: ${message}\n`);
    return { ok: false, editFound: false, detail: message };
  }
}

/**
 * True when the captured foreground is a classic Win32 edit host (Notepad-class).
 * False for Chromium/Electron (`Chrome_WidgetWin_*`, Cursor, VS Code, …) — those need
 * restore+Ctrl+V (issue #11). Used by the pure delivery planner.
 */
export function hostAcceptsBackgroundWmPaste(info: {
  className: string;
  processName: string;
} | null): boolean {
  if (!info) return false;
  const cls = info.className.toLowerCase();
  const proc = info.processName.toLowerCase();

  // Chromium / Electron shell — WM_PASTE on the top-level HWND is a silent no-op.
  if (cls.includes("chrome_widgetwin") || cls.includes("chrome_renderwidget")) return false;
  if (
    proc === "cursor.exe" ||
    proc === "code.exe" ||
    proc === "code - insid.exe" ||
    proc.startsWith("slack") ||
    proc.includes("discord")
  ) {
    return false;
  }

  // Known Win32 edit hosts.
  if (cls === "notepad" || cls === "notepad.exe") return true;
  if (proc === "notepad.exe") return true;

  // Default on win32: attempt WM_PASTE only when we are not obviously Electron.
  // Unknown hosts still get a real edit-child check at inject time (fail closed).
  return true;
}
