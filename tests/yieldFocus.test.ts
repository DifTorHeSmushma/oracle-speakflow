import { describe, it, expect } from "vitest";
import { decideYield } from "../src/services/yieldFocus.js";
import type { TrackedTarget } from "../src/services/foregroundTracker.js";

const NOW = 10_000;
const STALE_MS = 2_000;
const SETTLE_MS = 120;
const MAX_WAIT_MS = 500;

function makeTarget(hwnd: string, sampledAtMs = NOW - 500): TrackedTarget {
  return {
    info: { hwnd, className: "Chrome_WidgetWin_1", processName: "Code.exe" },
    sampledAtMs,
  };
}

function base(overrides: Partial<Parameters<typeof decideYield>[0]> = {}) {
  return decideYield({
    ownHwndEquals: true,
    captured: makeTarget("9999"),
    nowMs: NOW,
    priorHwndAlive: true,
    staleMs: STALE_MS,
    settleMs: SETTLE_MS,
    maxWaitMs: MAX_WAIT_MS,
    ...overrides,
  });
}

describe("decideYield (G20 / §4.2)", () => {
  // ── noYield path ──────────────────────────────────────────────────────────

  it("returns noYield when ownHwndEquals is false", () => {
    const plan = base({ ownHwndEquals: false });
    expect(plan.action).toBe("noYield");
  });

  // ── clipboardToast — no captured target ───────────────────────────────────

  it("clipboardToast when captured is null (no prior external target)", () => {
    const plan = base({ captured: null });
    expect(plan.action).toBe("clipboardToast");
    if (plan.action === "clipboardToast") {
      expect(plan.reason).toMatch(/no prior external target/i);
    }
  });

  it("clipboardToast when captured.info is null-ish (corrupted snapshot)", () => {
    const plan = base({ captured: { info: null as unknown as NonNullable<TrackedTarget>["info"], sampledAtMs: NOW - 100 } });
    expect(plan.action).toBe("clipboardToast");
  });

  // ── clipboardToast — staleness gate ───────────────────────────────────────

  it("clipboardToast when captured sample is stale (> staleMs)", () => {
    const plan = base({ captured: makeTarget("1111", NOW - STALE_MS - 1) });
    expect(plan.action).toBe("clipboardToast");
    if (plan.action === "clipboardToast") {
      expect(plan.reason).toMatch(/stale/i);
    }
  });

  it("yieldThenVerify when captured sample is exactly at staleMs boundary (not yet stale)", () => {
    // age = STALE_MS exactly — > STALE_MS is false, so not filtered
    const plan = base({ captured: makeTarget("2222", NOW - STALE_MS) });
    expect(plan.action).toBe("yieldThenVerify");
  });

  // ── clipboardToast — dead window ──────────────────────────────────────────

  it("clipboardToast when prior HWND is no longer alive", () => {
    const plan = base({ priorHwndAlive: false });
    expect(plan.action).toBe("clipboardToast");
    if (plan.action === "clipboardToast") {
      expect(plan.reason).toMatch(/no longer exists/i);
    }
  });

  // ── yieldThenVerify — happy path ──────────────────────────────────────────

  it("yieldThenVerify with correct expectHwnd, settleMs, maxWaitMs", () => {
    const plan = base({ captured: makeTarget("3333") });
    expect(plan.action).toBe("yieldThenVerify");
    if (plan.action === "yieldThenVerify") {
      expect(plan.expectHwnd).toBe("3333");
      expect(plan.settleMs).toBe(SETTLE_MS);
      expect(plan.maxWaitMs).toBe(MAX_WAIT_MS);
    }
  });

  it("yieldThenVerify passes through custom timing constants", () => {
    const plan = decideYield({
      ownHwndEquals: true,
      captured: makeTarget("4444"),
      nowMs: NOW,
      priorHwndAlive: true,
      staleMs: 5_000,
      settleMs: 200,
      maxWaitMs: 1_000,
    });
    expect(plan.action).toBe("yieldThenVerify");
    if (plan.action === "yieldThenVerify") {
      expect(plan.settleMs).toBe(200);
      expect(plan.maxWaitMs).toBe(1_000);
    }
  });

  // ── Safety: no wrong-window keystroke guarantee (S5/S9) ───────────────────

  it("never returns yieldThenVerify when captured is null", () => {
    expect(base({ captured: null }).action).not.toBe("yieldThenVerify");
  });

  it("never returns yieldThenVerify when prior HWND is dead", () => {
    expect(base({ priorHwndAlive: false }).action).not.toBe("yieldThenVerify");
  });

  it("never returns yieldThenVerify when sample is stale", () => {
    expect(base({ captured: makeTarget("5555", NOW - STALE_MS - 100) }).action).not.toBe("yieldThenVerify");
  });

  it("never returns yieldThenVerify when ownHwndEquals is false", () => {
    expect(base({ ownHwndEquals: false }).action).not.toBe("yieldThenVerify");
  });
});
