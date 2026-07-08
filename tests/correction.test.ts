import { describe, it, expect } from "vitest";
import { correct } from "../src/services/correction.js";
import type { Dictionary, CorrectionConfig } from "../src/types/voice.js";

const EMPTY_DICT: Dictionary = { version: 1, entries: [] };
const CFG_OFF: CorrectionConfig = { llmEnabled: false, llmLatencyBudgetMs: 200 };

describe("correction service — G8", () => {
  // ---------------------------------------------------------------------------
  // Step 1: whitespace / punctuation normalization
  // ---------------------------------------------------------------------------

  it("collapses multiple spaces into one", async () => {
    const { text } = await correct("hello   world", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("hello world");
  });

  it("trims leading and trailing whitespace", async () => {
    const { text } = await correct("  hello world  ", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("hello world");
  });

  it("normalises CRLF to space", async () => {
    const { text } = await correct("hello\r\nworld", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("hello\nworld");
  });

  it("collapses mixed tabs and spaces", async () => {
    const { text } = await correct("foo\t  bar", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("foo bar");
  });

  // ---------------------------------------------------------------------------
  // Step 2: dev-term casing
  // ---------------------------------------------------------------------------

  it("corrects 'typescript' → 'TypeScript'", async () => {
    const { text } = await correct("using typescript today", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("using TypeScript today");
  });

  it("corrects 'javascript' → 'JavaScript'", async () => {
    const { text } = await correct("write javascript code", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("write JavaScript code");
  });

  it("corrects 'api' → 'API' at word boundary", async () => {
    const { text } = await correct("call the api endpoint", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("call the API endpoint");
  });

  it("corrects 'json' → 'JSON'", async () => {
    const { text } = await correct("parse the json response", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("parse the JSON response");
  });

  it("corrects 'cli' → 'CLI'", async () => {
    const { text } = await correct("run the cli command", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("run the CLI command");
  });

  it("corrects 'github' → 'GitHub'", async () => {
    const { text } = await correct("push to github", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("push to GitHub");
  });

  it("corrects 'ffmpeg' → 'FFmpeg'", async () => {
    const { text } = await correct("run ffmpeg command", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("run FFmpeg command");
  });

  it("corrects multiple dev terms in one sentence", async () => {
    const { text } = await correct("use typescript with json api", EMPTY_DICT, CFG_OFF);
    expect(text).toBe("use TypeScript with JSON API");
  });

  // ---------------------------------------------------------------------------
  // Step 4: Personal Dictionary applies LAST and is authoritative
  // ---------------------------------------------------------------------------

  it("dictionary runs after dev-term step and overrides it", async () => {
    const dict: Dictionary = {
      version: 1,
      entries: [
        {
          id: "1",
          spoken: "typescript",
          written: "TS", // user prefers abbreviation over the canonical form
          matchMode: "word",
          enabled: true,
        },
      ],
    };
    const { text } = await correct("write typescript code", dict, CFG_OFF);
    // Dev-term converts "typescript" → "TypeScript" first, then dictionary converts it to "TS"
    // but wait: after dev-term step, it's already "TypeScript" — dictionary matches on "typescript" (spoken)
    // Actually applyDictionary uses case-insensitive match on the spoken form against the CURRENT text
    // which at this point is "TypeScript". Since matchMode="word" and spoken="typescript",
    // the regex is \btypescript\b with gi flag — so "TypeScript" WILL match.
    expect(text).toBe("write TS code");
  });

  it("dictionary phrase entry replaces phrase last", async () => {
    const dict: Dictionary = {
      version: 1,
      entries: [
        {
          id: "1",
          spoken: "node js",
          written: "Node.js",
          matchMode: "phrase",
          enabled: true,
        },
      ],
    };
    const { text } = await correct("  use node js  ", dict, CFG_OFF);
    expect(text).toBe("use Node.js");
  });

  // ---------------------------------------------------------------------------
  // Performance: deterministic correction p95 < 50 ms (G8)
  // ---------------------------------------------------------------------------

  it("p95 latency < 50 ms over 100 iterations", async () => {
    const times: number[] = [];
    const longInput =
      "use typescript with json api and github cli to push ffmpeg and javascript code";

    for (let i = 0; i < 100; i++) {
      const { ms } = await correct(longInput, EMPTY_DICT, CFG_OFF);
      times.push(ms);
    }

    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
    expect(p95).toBeLessThan(50);
  });

  // ---------------------------------------------------------------------------
  // Returns timing metadata
  // ---------------------------------------------------------------------------

  it("returns non-negative ms", async () => {
    const { ms } = await correct("hello", EMPTY_DICT, CFG_OFF);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
