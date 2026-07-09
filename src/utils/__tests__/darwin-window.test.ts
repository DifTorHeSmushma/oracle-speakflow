import { describe, expect, it } from "vitest";
import {
  darwinForegroundMatches,
  isDarwinSpeakFlowApp,
  parseFrontmostAppName,
  toDarwinForegroundInfo,
} from "../darwin-window.js";

describe("darwin-window helpers", () => {
  it("parseFrontmostAppName rejects empty", () => {
    expect(parseFrontmostAppName("")).toBeNull();
    expect(parseFrontmostAppName("missing value")).toBeNull();
    expect(parseFrontmostAppName("Cursor")).toBe("Cursor");
  });

  it("toDarwinForegroundInfo builds pseudo-hwnd", () => {
    const info = toDarwinForegroundInfo("Cursor");
    expect(info.hwnd).toBe("darwin:Cursor");
    expect(info.processName).toBe("Cursor.app");
    expect(info.className).toBe("darwin");
  });

  it("isDarwinSpeakFlowApp detects SpeakFlow", () => {
    expect(isDarwinSpeakFlowApp("Oracle SpeakFlow.app")).toBe(true);
    expect(isDarwinSpeakFlowApp("Cursor.app")).toBe(false);
  });

  it("darwinForegroundMatches compares app names", () => {
    const fg = toDarwinForegroundInfo("Cursor");
    expect(darwinForegroundMatches(fg, "darwin:Cursor")).toBe(true);
    expect(darwinForegroundMatches(fg, "darwin:Notes")).toBe(false);
  });
});
