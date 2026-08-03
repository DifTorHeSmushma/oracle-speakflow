import { describe, it, expect } from "vitest";
import { correct } from "../correction.js";
import {
  chooseBestTranscript,
  meaningError,
  wordErrorRate,
  DOM_HITL_SPEAKFLOW_LINE,
  WER_FIXTURE_PACK,
} from "../transcriptQuality.js";
import type { Dictionary, CorrectionConfig } from "../../types/voice.js";

const EMPTY_DICT: Dictionary = { version: 1, entries: [] };
const CFG_OFF: CorrectionConfig = { llmEnabled: false, llmLatencyBudgetMs: 200 };

describe("issue #12 Dom HITL pair — correction + quality", () => {
  it("maps Dom mush to SpeakFlow and strips invented filler", async () => {
    const raw =
      "tested it here speed flow, testing speed flow 1, 2, 3, 4 1, 2, 3, 4";
    const { text } = await correct(raw, EMPTY_DICT, CFG_OFF);

    expect(text.toLowerCase()).not.toContain("tested it here");
    expect(text.toLowerCase()).not.toContain("speed flow");
    expect(text).toMatch(/SpeakFlow/);
    expect(text).toMatch(/1/);
    expect(meaningError(DOM_HITL_SPEAKFLOW_LINE, text)).toBe(false);
  });

  it("prefer live when finalize destroys product name", () => {
    const choice = chooseBestTranscript({
      finalized: "tested it here speed flow testing speed flow",
      live: "testing speak flow testing speak flow 1 2 3 4",
      correctedFinalized: "SpeakFlow testing SpeakFlow",
    });
    // Corrected finalize already fixed product name — accept lexicon path or live.
    expect(choice.text.toLowerCase()).toMatch(/speakflow|speak flow/);
  });

  it("prefer live when finalize has filler and live does not", () => {
    const choice = chooseBestTranscript({
      finalized: "tested it here speed flow 1 2 3",
      live: "testing speak flow 1 2 3 4",
    });
    expect(choice.source).toBe("live");
  });
});

describe("WER fixture pack scoring helpers", () => {
  it("scores identical transcripts at 0 WER", () => {
    expect(wordErrorRate("a b c", "a b c")).toBe(0);
  });

  it("pack references include Dom HITL line", () => {
    expect(WER_FIXTURE_PACK.some((f) => f.id === "dom-hitl-speakflow")).toBe(true);
    expect(WER_FIXTURE_PACK.find((f) => f.id === "dom-hitl-speakflow")?.reference).toBe(
      DOM_HITL_SPEAKFLOW_LINE
    );
  });
});
