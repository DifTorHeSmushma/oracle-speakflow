import { describe, it, expect, beforeEach } from "vitest";
import {
  recordExternalSample,
  getPriorExternalTarget,
  captureNow,
  _resetForTest,
} from "../foregroundTracker.js";

const NOW = 1_000_000;
const STALE_MS = 2000;

const fakeInfo = (hwnd = "12345") => ({
  hwnd,
  className: "Chrome_WidgetWin_1",
  processName: "chrome.exe",
});

describe("foregroundTracker — G20", () => {
  beforeEach(() => _resetForTest());

  // ---------------------------------------------------------------------------
  // recordExternalSample
  // ---------------------------------------------------------------------------

  it("records an external sample", () => {
    recordExternalSample(fakeInfo(), false, NOW);
    const target = getPriorExternalTarget(NOW, STALE_MS);
    expect(target).not.toBeNull();
    expect(target?.info.hwnd).toBe("12345");
  });

  it("ignores samples where isOwnWindow=true", () => {
    recordExternalSample(fakeInfo(), true, NOW);
    expect(getPriorExternalTarget(NOW, STALE_MS)).toBeNull();
  });

  it("ignores null ForegroundInfo", () => {
    recordExternalSample(null, false, NOW);
    expect(getPriorExternalTarget(NOW, STALE_MS)).toBeNull();
  });

  it("stores the most recent sample, overwriting older ones", () => {
    recordExternalSample(fakeInfo("AAA"), false, NOW);
    recordExternalSample(fakeInfo("BBB"), false, NOW + 500);
    const target = getPriorExternalTarget(NOW + 500, STALE_MS);
    expect(target?.info.hwnd).toBe("BBB");
  });

  // ---------------------------------------------------------------------------
  // getPriorExternalTarget
  // ---------------------------------------------------------------------------

  it("returns null when no sample recorded", () => {
    expect(getPriorExternalTarget(NOW, STALE_MS)).toBeNull();
  });

  it("returns null when sample is too old", () => {
    recordExternalSample(fakeInfo(), false, NOW);
    const laterNow = NOW + STALE_MS + 1;
    expect(getPriorExternalTarget(laterNow, STALE_MS)).toBeNull();
  });

  it("returns target when sample is exactly at the stale boundary", () => {
    recordExternalSample(fakeInfo(), false, NOW);
    // Age = STALE_MS → NOT stale (> staleMs is the filter)
    expect(getPriorExternalTarget(NOW + STALE_MS, STALE_MS)).not.toBeNull();
  });

  it("returns target when sample is fresh", () => {
    recordExternalSample(fakeInfo(), false, NOW);
    expect(getPriorExternalTarget(NOW + 100, STALE_MS)).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // captureNow
  // ---------------------------------------------------------------------------

  it("returns null when nothing recorded", () => {
    expect(captureNow(NOW)).toBeNull();
  });

  it("returns a copy of the latest sample", () => {
    recordExternalSample(fakeInfo("XYZ"), false, NOW);
    const snapshot = captureNow(NOW + 10);
    expect(snapshot?.info.hwnd).toBe("XYZ");
  });

  it("snapshot is a copy, not a reference (mutating snapshot does not affect tracker)", () => {
    recordExternalSample(fakeInfo("ORIG"), false, NOW);
    const snapshot = captureNow(NOW);
    if (!snapshot) throw new Error("expected snapshot");
    snapshot.info = { hwnd: "MUTATED", className: "", processName: "" };

    // Fresh capture should still return ORIG
    const second = captureNow(NOW);
    expect(second?.info.hwnd).toBe("ORIG");
  });
});
