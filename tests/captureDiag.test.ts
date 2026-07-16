import { describe, it, expect } from "vitest";
import {
  countClipSamplesS16le,
  isCaptureDiagEnabled,
  looksLikeBlankAudioMarker,
  hashTranscriptForDiag,
} from "../src/services/captureDiag.js";
import { applyGainToS16le, resolveMicGain } from "../src/services/capture.js";

describe("captureDiag Phase 0 helpers", () => {
  it("countClipSamplesS16le detects post-gain saturation without mutating buffer", () => {
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(2000, 0); // 2000 * 20 = 40000 > 32767 → clip
    pcm.writeInt16LE(100, 2);  // 100 * 20 = 2000 → ok
    const raw = countClipSamplesS16le(pcm, 1);
    const gained = countClipSamplesS16le(pcm, 20);
    expect(raw.clipSamples).toBe(0);
    expect(gained.clipSamples).toBe(1);
    expect(pcm.readInt16LE(0)).toBe(2000);
  });

  it("applyGainToS16le clamps to int16", () => {
    const pcm = Buffer.alloc(2);
    pcm.writeInt16LE(3000, 0);
    const out = applyGainToS16le(pcm, 20);
    expect(out.readInt16LE(0)).toBe(32767);
  });

  it("resolveMicGain defaults to 20 and honors env override", () => {
    const prev = process.env["SPEAKFLOW_MIC_GAIN"];
    delete process.env["SPEAKFLOW_MIC_GAIN"];
    expect(resolveMicGain()).toBe(20);
    process.env["SPEAKFLOW_MIC_GAIN"] = "1.5";
    expect(resolveMicGain()).toBe(1.5);
    if (prev === undefined) delete process.env["SPEAKFLOW_MIC_GAIN"];
    else process.env["SPEAKFLOW_MIC_GAIN"] = prev;
  });

  it("isCaptureDiagEnabled is off by default", () => {
    const prev = process.env["SPEAKFLOW_CAPTURE_DIAG"];
    delete process.env["SPEAKFLOW_CAPTURE_DIAG"];
    expect(isCaptureDiagEnabled()).toBe(false);
    process.env["SPEAKFLOW_CAPTURE_DIAG"] = "1";
    expect(isCaptureDiagEnabled()).toBe(true);
    if (prev === undefined) delete process.env["SPEAKFLOW_CAPTURE_DIAG"];
    else process.env["SPEAKFLOW_CAPTURE_DIAG"] = prev;
  });

  it("blank-audio marker and transcript hash helpers", () => {
    expect(looksLikeBlankAudioMarker("hello [BLANK_AUDIO] world")).toBe(true);
    expect(looksLikeBlankAudioMarker("hello world")).toBe(false);
    expect(hashTranscriptForDiag("abc")).toHaveLength(16);
  });
});
