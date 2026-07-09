// Pure yield-focus decision function — no side effects, 100% unit-testable. G20.
// The caller (electron-main, Wave 3) executes win.hide(), settle delay, and re-verify.
// Spec §4.2 / Invariant #18: never calls SetForegroundWindow.
import type { TrackedTarget } from "./foregroundTracker.js";

export type YieldPlan =
  | { action: "noYield" }
  | { action: "yieldThenVerify"; expectHwnd: string; settleMs: number; maxWaitMs: number }
  | { action: "clipboardToast"; reason: string };

/**
 * Decides whether to yield focus before pasting, and if so, how.
 *
 * Yield ladder (only when ownHwndEquals === true):
 *   1. No captured target → clipboardToast
 *   2. Captured target age > staleMs → clipboardToast
 *   3. Prior HWND no longer alive → clipboardToast
 *   4. All checks pass → yieldThenVerify
 *
 * When ownHwndEquals === false the normal paste path applies; return noYield.
 */
export const decideYield = (input: {
  ownHwndEquals: boolean;
  captured: TrackedTarget;
  nowMs: number;
  priorHwndAlive: boolean;
  staleMs: number;
  settleMs: number;
  maxWaitMs: number;
}): YieldPlan => {
  const { ownHwndEquals, captured, nowMs, priorHwndAlive, staleMs, settleMs, maxWaitMs } = input;

  if (!ownHwndEquals) {
    return { action: "noYield" };
  }

  if (!captured || !captured.info) {
    return { action: "clipboardToast", reason: "no prior external target recorded" };
  }

  const ageMs = nowMs - captured.sampledAtMs;
  if (ageMs > staleMs) {
    return { action: "clipboardToast", reason: `prior target stale (${ageMs}ms > ${staleMs}ms)` };
  }

  if (!priorHwndAlive) {
    return { action: "clipboardToast", reason: "prior target window no longer exists" };
  }

  return {
    action: "yieldThenVerify",
    expectHwnd: captured.info.hwnd,
    settleMs,
    maxWaitMs,
  };
};
