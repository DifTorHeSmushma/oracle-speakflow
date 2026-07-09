import { describe, it, expect } from "vitest";
import { decideYield } from "../yieldFocus.js";
import type { TrackedTarget } from "../foregroundTracker.js";

const NOW = 1_000_000;
const STALE_MS = 2000;
const SETTLE_MS = 120;
const MAX_WAIT_MS = 500;

const makeTarget = (hwnd = "12345", ageMs = 500): TrackedTarget => ({
  info: { hwnd, className: "Chrome_WidgetWin_1", processName: "chrome.exe" },
  sampledAtMs: NOW - ageMs,
});

const baseInput = {
  nowMs: NOW,
  staleMs: STALE_MS,
  settleMs: SETTLE_MS,
  maxWaitMs: MAX_WAIT_MS,
};

describe("decideYield — G20", () => {
  // ---------------------------------------------------------------------------
  // Own window not focused → no yield needed
  // ---------------------------------------------------------------------------

  it("returns noYield when ownHwndEquals=false", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: false,
      captured: makeTarget(),
      priorHwndAlive: true,
    });
    expect(plan.action).toBe("noYield");
  });

  it("returns noYield when ownHwndEquals=false even without a captured target", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: false,
      captured: null,
      priorHwndAlive: false,
    });
    expect(plan.action).toBe("noYield");
  });

  // ---------------------------------------------------------------------------
  // Own window focused + no prior target
  // ---------------------------------------------------------------------------

  it("returns clipboardToast when captured=null", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: true,
      captured: null,
      priorHwndAlive: false,
    });
    expect(plan.action).toBe("clipboardToast");
  });

  // ---------------------------------------------------------------------------
  // Staleness gate
  // ---------------------------------------------------------------------------

  it("returns clipboardToast when target is stale (age > staleMs)", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: true,
      captured: makeTarget("hw", STALE_MS + 1), // age = STALE_MS + 1 → stale
      priorHwndAlive: true,
    });
    expect(plan.action).toBe("clipboardToast");
    if (plan.action !== "clipboardToast") return;
    expect(plan.reason).toMatch(/stale/);
  });

  it("does NOT treat target as stale when age === staleMs", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: true,
      captured: makeTarget("hw", STALE_MS), // age = exactly staleMs → not stale (> filter)
      priorHwndAlive: true,
    });
    expect(plan.action).toBe("yieldThenVerify");
  });

  // ---------------------------------------------------------------------------
  // Liveness gate
  // ---------------------------------------------------------------------------

  it("returns clipboardToast when prior HWND is dead", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: true,
      captured: makeTarget("deadHwnd", 100),
      priorHwndAlive: false,
    });
    expect(plan.action).toBe("clipboardToast");
    if (plan.action !== "clipboardToast") return;
    expect(plan.reason).toMatch(/no longer exists/);
  });

  // ---------------------------------------------------------------------------
  // Happy path → yieldThenVerify
  // ---------------------------------------------------------------------------

  it("returns yieldThenVerify with correct HWND, settleMs, maxWaitMs", () => {
    const plan = decideYield({
      ...baseInput,
      ownHwndEquals: true,
      captured: makeTarget("targetHwnd", 100),
      priorHwndAlive: true,
    });
    expect(plan.action).toBe("yieldThenVerify");
    if (plan.action !== "yieldThenVerify") return;
    expect(plan.expectHwnd).toBe("targetHwnd");
    expect(plan.settleMs).toBe(SETTLE_MS);
    expect(plan.maxWaitMs).toBe(MAX_WAIT_MS);
  });
});
