// Read-only foreground introspection (Spec §4.2 / Invariant #18).
// Windows: PowerShell + user32. macOS: AppleScript. Linux: M7.
import { spawnSync } from "node:child_process";
import type { ForegroundInfo } from "./foreground-types.js";
import { getDarwinForegroundInfo, isDarwinPriorTargetAlive } from "./darwin-window.js";

export type { ForegroundInfo } from "./foreground-types.js";
export { isDarwinSpeakFlowApp, darwinForegroundMatches } from "./darwin-window.js";

// One-shot PS script: compiles Add-Type once per invocation, returns "|"-delimited result.
const FOREGROUND_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SfWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int n);
}
"@
try {
  $hw = [SfWin32]::GetForegroundWindow()
  $targetPid = [uint32]0
  [void][SfWin32]::GetWindowThreadProcessId($hw, [ref]$targetPid)
  $cn = New-Object System.Text.StringBuilder 256
  [void][SfWin32]::GetClassName($hw, $cn, 256)
  $pn = try { $p = Get-Process -Id $targetPid -EA Stop; try { $p.MainModule.ModuleName } catch { $p.Name + '.exe' } } catch { '' }
  Write-Output "$($hw.ToString())|$($cn.ToString())|$pn"
} catch {
  Write-Output 'null'
}
`.trim();

function getWin32ForegroundInfo(): ForegroundInfo | null {
  try {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", FOREGROUND_SCRIPT],
      { encoding: "utf8", timeout: 3_000 },
    );
    if (result.error || result.status !== 0) {
      const errMsg = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
      process.stderr.write(`[win32] getForegroundInfo failed: ${errMsg}\n`);
      return null;
    }
    const line = (result.stdout ?? "").trim();
    if (!line || line === "null" || line.startsWith("ERR:")) {
      if (line.startsWith("ERR:")) {
        process.stderr.write(`[win32] getForegroundInfo script error: ${line}\n`);
      }
      return null;
    }
    const idx1 = line.indexOf("|");
    const idx2 = line.indexOf("|", idx1 + 1);
    if (idx1 === -1 || idx2 === -1) return null;
    return {
      hwnd: line.slice(0, idx1),
      className: line.slice(idx1 + 1, idx2),
      processName: line.slice(idx2 + 1),
    };
  } catch {
    return null;
  }
}

export function getForegroundInfo(): ForegroundInfo | null {
  if (process.platform === "win32") return getWin32ForegroundInfo();
  if (process.platform === "darwin") return getDarwinForegroundInfo();
  return null;
}

export function nativeHandleEquals(hwndDecimal: string, nativeBuffer: Buffer): boolean {
  try {
    const hwnd = BigInt(hwndDecimal);
    const fromBuf =
      nativeBuffer.length >= 8
        ? nativeBuffer.readBigInt64LE(0)
        : BigInt(nativeBuffer.readUInt32LE(0));
    return hwnd === fromBuf;
  } catch {
    return false;
  }
}

export function getForegroundAndCheckWindow(checkHwnd: string | null): {
  foreground: ForegroundInfo | null;
  isWindowAlive: boolean;
} {
  if (process.platform === "darwin") {
    const foreground = getDarwinForegroundInfo();
    const isWindowAlive = checkHwnd ? isDarwinPriorTargetAlive(checkHwnd) : false;
    return { foreground, isWindowAlive };
  }

  if (process.platform !== "win32") return { foreground: null, isWindowAlive: false };

  let safeCheckHwnd: string = "0";
  if (checkHwnd) {
    try {
      safeCheckHwnd = BigInt(checkHwnd).toString();
    } catch {
      /* invalid — keep "0" */
    }
  }
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SfWin32b {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int n);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
}
"@
try {
  $hw = [SfWin32b]::GetForegroundWindow()
  $targetPid = [uint32]0
  [void][SfWin32b]::GetWindowThreadProcessId($hw, [ref]$targetPid)
  $cn = New-Object System.Text.StringBuilder 256
  [void][SfWin32b]::GetClassName($hw, $cn, 256)
  $pn = try { $p = Get-Process -Id $targetPid -EA Stop; try { $p.MainModule.ModuleName } catch { $p.Name + '.exe' } } catch { '' }
  $alive = [SfWin32b]::IsWindow([IntPtr]::new(${safeCheckHwnd}))
  Write-Output "$($hw.ToString())|$($cn.ToString())|$pn|$alive"
} catch {
  Write-Output 'null|null|null|false'
}
`.trim();
  try {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", timeout: 3_000 },
    );
    if (result.error || result.status !== 0) return { foreground: null, isWindowAlive: false };
    const line = (result.stdout ?? "").trim();
    if (!line || line.startsWith("null|")) return { foreground: null, isWindowAlive: false };
    const parts = line.split("|");
    if (parts.length < 4) return { foreground: null, isWindowAlive: false };
    const [hwnd, className, processName, alive] = parts;
    const fg: ForegroundInfo | null =
      hwnd && className !== undefined && processName !== undefined
        ? { hwnd, className, processName }
        : null;
    return { foreground: fg, isWindowAlive: alive?.toLowerCase() === "true" };
  } catch {
    return { foreground: null, isWindowAlive: false };
  }
}
