import { describe, it, expect, beforeEach } from "vitest";
import {
  recordExternalSample,
  getPriorExternalTarget,
  captureNow,
  _resetForTest,
} from "../src/services/foregroundTracker.js";
import type { ForegroundInfo } from "../src/utils/win32-window.js";

function fg(hwnd: string): ForegroundInfo {
  return { hwnd, className: "Chrome_WidgetWin_1", processName: "Code.exe" };
}

describe("foregroundTracker (G20 / §4.1)", () => {
  beforeEach(() => _resetForTest());

  // ── recordExternalSample ──────────────────────────────────────────────────

  it("ignores own-window samples", () => {
    recordExternalSample(fg("1111"), true, 1000);
    expect(getPriorExternalTarget(1000, 5000)).toBeNull();
  });

  it("ignores null ForegroundInfo", () => {
    recordExternalSample(null, false, 1000);
    expect(getPriorExternalTarget(1000, 5000)).toBeNull();
  });

  it("records external sample", () => {
    recordExternalSample(fg("2222"), false, 1000);
    const result = getPriorExternalTarget(1000, 5000);
    expect(result).not.toBeNull();
    expect(result!.info.hwnd).toBe("2222");
    expect(result!.sampledAtMs).toBe(1000);
  });

  it("overwrites with newer external sample", () => {
    recordExternalSample(fg("1111"), false, 1000);
    recordExternalSample(fg("3333"), false, 2000);
    const result = getPriorExternalTarget(2000, 5000);
    expect(result!.info.hwnd).toBe("3333");
  });

  it("own-window sample does not overwrite prior external target", () => {
    recordExternalSample(fg("1111"), false, 1000);
    recordExternalSample(fg("own"), true, 1500);
    const result = getPriorExternalTarget(1500, 5000);
    expect(result!.info.hwnd).toBe("1111");
  });

  // ── getPriorExternalTarget — staleness gate ───────────────────────────────

  it("returns null when sample exceeds maxAgeMs", () => {
    recordExternalSample(fg("4444"), false, 1000);
    expect(getPriorExternalTarget(4001, 3000)).toBeNull();
  });

  it("returns sample when exactly at maxAgeMs boundary (inclusive edge not required)", () => {
    recordExternalSample(fg("5555"), false, 1000);
    // age = 3000, maxAgeMs = 3000 — boundary case; not-null when age === maxAgeMs
    const result = getPriorExternalTarget(4000, 3000);
    // age = nowMs - sampledAtMs = 4000 - 1000 = 3000; > 3000 is false so not filtered
    expect(result).not.toBeNull();
  });

  it("returns null when no sample recorded", () => {
    expect(getPriorExternalTarget(2000, 5000)).toBeNull();
  });

  // ── captureNow ────────────────────────────────────────────────────────────

  it("captureNow returns null when no sample exists", () => {
    expect(captureNow(1000)).toBeNull();
  });

  it("captureNow returns a shallow copy of the last external target", () => {
    recordExternalSample(fg("6666"), false, 1000);
    const snap1 = captureNow(1000);
    expect(snap1).not.toBeNull();
    expect(snap1!.info.hwnd).toBe("6666");
    // Adding a new sample does not mutate the prior snapshot
    recordExternalSample(fg("7777"), false, 2000);
    expect(snap1!.info.hwnd).toBe("6666");
  });

  it("captureNow reflects the latest sample at call time", () => {
    recordExternalSample(fg("8888"), false, 1000);
    recordExternalSample(fg("9999"), false, 2000);
    const snap = captureNow(2000);
    expect(snap!.info.hwnd).toBe("9999");
  });
});
