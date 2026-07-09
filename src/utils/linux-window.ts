// Read-only Linux foreground introspection via stock xprop (Spec §3.2 / §0 Q1 / G29/G30).
// Pure parsers are unit-tested on any OS; OS-touching wrappers are Linux-only at runtime.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ForegroundInfo } from "./foreground-types.js";
import { getLinuxSession } from "./linux-session.js";

// Module-level cache: updated by each getLinuxForegroundInfo() call so the own-window
// check in electron-main.ts can call isLinuxSpeakFlowWindow without a second spawn.
let _lastPid: number | null = null;
let _lastWmClass: { instance: string; className: string } | null = null;

export function getLastLinuxReadMeta(): {
  pid: number | null;
  wmClass: { instance: string; className: string } | null;
} {
  return { pid: _lastPid, wmClass: _lastWmClass };
}

// ── Pure parsers (unit-tested on any OS — G29) ─────────────────────────────

/** "…window id # 0x3c00007" → "0x3c00007" (hex lowercased). "0x0"/no match → null. */
export function parseActiveWindowId(stdout: string): string | null {
  const m = /0x([0-9a-f]+)/i.exec(stdout);
  if (!m || !m[1]) return null;
  const id = `0x${m[1].toLowerCase()}`;
  if (id === "0x0") return null;
  return id;
}

/** 'WM_CLASS = "instance", "Class"' → { instance, className } (lowercased). Absent → null. */
export function parseWmClass(
  stdout: string,
): { instance: string; className: string } | null {
  const m = /"([^"]+)"\s*,\s*"([^"]+)"/.exec(stdout);
  if (!m || !m[1] || !m[2]) return null;
  return { instance: m[1].toLowerCase(), className: m[2].toLowerCase() };
}

/** "_NET_WM_PID = 4242" → 4242. Absent/NaN → null. */
export function parseNetWmPid(stdout: string): number | null {
  const m = /_NET_WM_PID\s*=\s*(\d+)/.exec(stdout);
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) ? null : n;
}

/** Assembles ForegroundInfo: hwnd "linux:<windowId>", className (WM_CLASS class part), processName (comm). */
export function toLinuxForegroundInfo(
  windowId: string,
  wmClass: { instance: string; className: string } | null,
  processName: string,
): ForegroundInfo {
  return {
    hwnd: `linux:${windowId}`,
    className: wmClass?.className ?? "",
    processName,
  };
}

const OWN_WINDOW_TOKENS = ["oracle speakflow", "oracle-speakflow", "electron"];

/**
 * Own-window detection: PID match (strong) takes precedence over WM_CLASS/instance
 * token fallback ("oracle speakflow" | "oracle-speakflow" | "electron").
 * False-positive-safe: false positive (external mistaken for own) yields clipboard+toast (S-L12).
 */
export function isLinuxSpeakFlowWindow(
  pid: number | null,
  wmClass: { instance: string; className: string } | null,
  ownPid: number,
): boolean {
  if (pid !== null && pid === ownPid) return true;
  if (wmClass) {
    const cls = wmClass.className;
    const inst = wmClass.instance;
    for (const token of OWN_WINDOW_TOKENS) {
      if (cls === token || cls.includes(token) || inst === token || inst.includes(token)) return true;
    }
  }
  return false;
}

/** Strict re-verify: foreground.hwnd === expectHwnd (expectHwnd must start with "linux:"). */
export function linuxForegroundMatches(
  foreground: ForegroundInfo | null,
  expectHwnd: string,
): boolean {
  if (!foreground || !expectHwnd.startsWith("linux:")) return false;
  return foreground.hwnd === expectHwnd;
}

// ── OS-touching wrappers (Linux-only at runtime; errors → null/false) ────────

/**
 * Lock A lives here: returns null unless getLinuxSession() === "x11".
 * xprop ×2 (3 s timeouts) + /proc/<pid>/comm. Any failure → null + one stderr line.
 */
export function getLinuxForegroundInfo(): ForegroundInfo | null {
  if (getLinuxSession() !== "x11") return null;
  try {
    const r1 = spawnSync("xprop", ["-root", "-notype", "_NET_ACTIVE_WINDOW"], {
      encoding: "utf8",
      timeout: 3_000,
    });
    if (r1.error || r1.status !== 0) {
      process.stderr.write(
        `[linux] getForegroundInfo failed: ${r1.stderr?.trim() || r1.error?.message || `exit ${r1.status}`}\n`,
      );
      return null;
    }
    const windowId = parseActiveWindowId(r1.stdout ?? "");
    if (!windowId) {
      process.stderr.write("[linux] getForegroundInfo failed: no active window id\n");
      return null;
    }

    const r2 = spawnSync("xprop", ["-id", windowId, "-notype", "WM_CLASS", "_NET_WM_PID"], {
      encoding: "utf8",
      timeout: 3_000,
    });
    if (r2.error || r2.status !== 0) {
      process.stderr.write(
        `[linux] getForegroundInfo failed: xprop -id: ${r2.stderr?.trim() || r2.error?.message || `exit ${r2.status}`}\n`,
      );
      return null;
    }
    const wmClass = parseWmClass(r2.stdout ?? "");
    const pid = parseNetWmPid(r2.stdout ?? "");

    let processName = "";
    if (pid !== null) {
      try {
        processName = readFileSync(`/proc/${pid}/comm`, "utf8").trim().toLowerCase();
      } catch { /* pid may have exited; leave empty */ }
    }

    // Update module cache so isLinuxSpeakFlowWindow can run without a second spawn.
    _lastPid = pid;
    _lastWmClass = wmClass;

    return toLinuxForegroundInfo(windowId, wmClass, processName);
  } catch (err) {
    process.stderr.write(`[linux] getForegroundInfo failed: ${String(err)}\n`);
    return null;
  }
}

/** xprop -id <winId> exit 0 → alive. Mirrors isDarwinPriorTargetAlive (Spec §3.2). */
export function isLinuxPriorTargetAlive(expectHwnd: string): boolean {
  if (!expectHwnd.startsWith("linux:")) return false;
  const windowId = expectHwnd.slice("linux:".length);
  try {
    const r = spawnSync("xprop", ["-id", windowId, "-notype", "WM_CLASS"], {
      encoding: "utf8",
      timeout: 3_000,
    });
    return r.status === 0 && !r.error;
  } catch {
    return false;
  }
}
