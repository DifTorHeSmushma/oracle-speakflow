import { spawnSync } from "node:child_process";
import type { ForegroundInfo } from "./foreground-types.js";

const SPEAKFLOW_NAMES = ["oracle speakflow", "electron"];

export function parseFrontmostAppName(stdout: string): string | null {
  const name = stdout.trim();
  if (!name || name === "missing value") return null;
  return name;
}

export function toDarwinForegroundInfo(appName: string): ForegroundInfo {
  const processName = appName.toLowerCase().endsWith(".app") ? appName : `${appName}.app`;
  return {
    hwnd: `darwin:${appName}`,
    className: "darwin",
    processName,
  };
}

export function isDarwinSpeakFlowApp(processName: string): boolean {
  const n = processName.toLowerCase().replace(/\.app$/i, "").trim();
  return SPEAKFLOW_NAMES.some((token) => n === token || n.includes("oracle speakflow"));
}

export function darwinForegroundMatches(
  foreground: ForegroundInfo | null,
  expectHwnd: string,
): boolean {
  if (!foreground || !expectHwnd.startsWith("darwin:")) return false;
  const expected = expectHwnd.slice("darwin:".length).toLowerCase();
  const actual = foreground.processName.toLowerCase().replace(/\.app$/i, "");
  return actual === expected;
}

export function getDarwinForegroundInfo(): ForegroundInfo | null {
  const script =
    'tell application "System Events" to get name of first application process whose frontmost is true';
  const result = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: 3_000 });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      `[darwin] getForegroundInfo failed: ${result.stderr?.trim() || result.error?.message || `exit ${result.status}`}\n`,
    );
    return null;
  }
  const appName = parseFrontmostAppName(result.stdout ?? "");
  if (!appName) return null;
  return toDarwinForegroundInfo(appName);
}

export function isDarwinPriorTargetAlive(expectHwnd: string): boolean {
  if (!expectHwnd.startsWith("darwin:")) return false;
  const name = expectHwnd.slice("darwin:".length).replace(/"/g, '\\"');
  const script = `tell application "System Events" to return (exists (first application process whose name is "${name}"))`;
  const result = spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: 3_000 });
  return (result.stdout ?? "").trim().toLowerCase() === "true";
}
