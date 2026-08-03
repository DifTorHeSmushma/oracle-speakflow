import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyDictionary, loadDictionary } from "../dictionary.js";
import type { Dictionary } from "../../types/voice.js";

describe("dictionary", () => {
  it("strips UTF-8 BOM so PowerShell-written dictionary.json still loads", () => {
    const dir = mkdtempSync(join(tmpdir(), "sf-dict-"));
    const body = JSON.stringify({
      version: 1,
      entries: [
        {
          id: "1",
          spoken: "Pace Ladder",
          written: "paste ladder",
          matchMode: "phrase",
          enabled: true,
        },
      ],
    });
    writeFileSync(join(dir, "dictionary.json"), `\uFEFF${body}`, "utf8");
    const loaded = loadDictionary(dir);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.entries).toHaveLength(1);
  });

  it("applies phrase and word entries without lastIndex skips", () => {
    const d: Dictionary = {
      version: 1,
      entries: [
        {
          id: "1",
          spoken: "Electron Main",
          written: "electron main",
          matchMode: "phrase",
          enabled: true,
        },
        {
          id: "2",
          spoken: "Pace Ladder",
          written: "paste ladder",
          matchMode: "phrase",
          enabled: true,
        },
        {
          id: "3",
          spoken: "Grok",
          written: "Groq",
          matchMode: "word",
          enabled: true,
        },
        {
          id: "4",
          spoken: "Flow Warning",
          written: "SpeakFlow morning",
          matchMode: "phrase",
          enabled: true,
        },
      ],
    };
    const { text } = applyDictionary(
      "Open Electron Main and jump to the Pace Ladder. Transcribe with Grok. Flow Warning check Bravo 456.",
      d
    );
    expect(text).toContain("electron main");
    expect(text).toContain("paste ladder");
    expect(text).toContain("Groq");
    expect(text).toContain("SpeakFlow morning");
    expect(text).not.toContain("Pace Ladder");
    expect(text).not.toContain("Electron Main");
  });

  it("round-trips save without BOM", () => {
    const dir = mkdtempSync(join(tmpdir(), "sf-dict-"));
    const body = {
      version: 1,
      entries: [
        {
          id: "1",
          spoken: "Grok",
          written: "Groq",
          matchMode: "word" as const,
          enabled: true,
        },
      ],
    };
    writeFileSync(join(dir, "dictionary.json"), JSON.stringify(body), "utf8");
    const loaded = loadDictionary(dir);
    expect(loaded.ok).toBe(true);
    const raw = readFileSync(join(dir, "dictionary.json"));
    expect(raw[0]).not.toBe(0xef);
  });
});
