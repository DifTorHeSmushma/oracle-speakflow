import { describe, it, expect } from "vitest";
import {
  isLikelyWhisperHallucination,
  decideChunkMerge,
  chunkHasSpeechEnergy,
  wavPcmRms,
  wavPcmPeak,
} from "../streamHygiene.js";
import { buildWavBuffer } from "../capture.js";

describe("streamHygiene", () => {
  it("flags classic thank-you hallucinations", () => {
    expect(isLikelyWhisperHallucination("Thank you.")).toBe(true);
    expect(isLikelyWhisperHallucination("Thanks for watching!")).toBe(true);
    expect(isLikelyWhisperHallucination("Tchank you.")).toBe(true);
    expect(isLikelyWhisperHallucination("Do not invent words or")).toBe(true);
    expect(
      isLikelyWhisperHallucination("Do not invent words or filler such as tested it here")
    ).toBe(true);
  });

  it("flags repeated phrase loops (Dom A2 pattern)", () => {
    expect(
      isLikelyWhisperHallucination(
        "every course of the day every course of the day every course of the day"
      )
    ).toBe(true);
  });

  it("allows Dom intentional double test phrase (#13)", () => {
    expect(
      isLikelyWhisperHallucination("testing speakflow 123 testing speakflow 123")
    ).toBe(false);
    expect(
      isLikelyWhisperHallucination("Testing SpeakFlow 123 Testing SpeakFlow 123")
    ).toBe(false);
  });

  it("allows normal dictation", () => {
    expect(
      isLikelyWhisperHallucination("Rename the helper function please then update every call site")
    ).toBe(false);
  });

  it("rejects divergent short thank-you append", () => {
    const d = decideChunkMerge(
      "Rename the helper function please",
      "Thank you."
    );
    expect(d.accept).toBe(false);
    if (!d.accept) expect(d.reason).toMatch(/hallucination|divergent/);
  });

  it("accepts extending overlap", () => {
    const d = decideChunkMerge(
      "Rename the helper function please",
      "Rename the helper function please then update every call site"
    );
    expect(d.accept).toBe(true);
    if (d.accept) {
      expect(d.merged).toContain("call site");
    }
  });

  it("flags punctuation-only as hallucination (silence → '.')", () => {
    expect(isLikelyWhisperHallucination(".")).toBe(true);
    expect(isLikelyWhisperHallucination("...")).toBe(true);
  });

  it("rejects Dom A2 garbage merge onto good prefix", () => {
    const d = decideChunkMerge(
      "Rename the helper function please",
      "Then after every course of the day. every course of the day. Tchank you."
    );
    expect(d.accept).toBe(false);
  });

  it("silence wav fails peak energy gate; voiced wav passes", () => {
    const silent = buildWavBuffer(Buffer.alloc(512 * 2));
    expect(chunkHasSpeechEnergy(silent)).toBe(false);
    expect(wavPcmPeak(silent)).toBe(0);
    expect(wavPcmRms(silent)).toBe(0);

    // Brief speech diluted by silence: mean RMS low, peak high enough
    const mixed = Buffer.alloc(512 * 2);
    for (let i = 0; i < 32; i++) mixed.writeInt16LE(12000, i * 2);
    const wav = buildWavBuffer(mixed);
    expect(wavPcmPeak(wav)).toBeGreaterThan(0.3);
    expect(chunkHasSpeechEnergy(wav)).toBe(true);
  });
});
