import { describe, it, expect, afterEach } from "vitest";
import { resolveMicGain } from "../capture.js";

describe("resolveMicGain", () => {
  const prev = process.env["SPEAKFLOW_MIC_GAIN"];
  afterEach(() => {
    if (prev === undefined) delete process.env["SPEAKFLOW_MIC_GAIN"];
    else process.env["SPEAKFLOW_MIC_GAIN"] = prev;
  });

  it("defaults to 2 (not legacy 20)", () => {
    delete process.env["SPEAKFLOW_MIC_GAIN"];
    expect(resolveMicGain()).toBe(2);
  });

  it("caps at 8 to avoid clip mush", () => {
    process.env["SPEAKFLOW_MIC_GAIN"] = "20";
    expect(resolveMicGain()).toBe(8);
  });
});
