import { describe, it, expect } from "vitest";
import { planLiveInsert } from "../liveInsert.js";

describe("planLiveInsert", () => {
  it("noop when texts are identical", () => {
    const r = planLiveInsert("hello", "hello");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mode).toBe("noop");
  });

  it("appendDelta for first insert", () => {
    const r = planLiveInsert("", "hello world");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      mode: "appendDelta",
      selectBackChars: 0,
      clipboardText: "hello world",
    });
  });

  it("appendDelta when next extends previous", () => {
    const r = planLiveInsert("hello", "hello world");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      mode: "appendDelta",
      selectBackChars: 0,
      clipboardText: " world",
    });
  });

  it("replaceSpan when next revises earlier words", () => {
    const r = planLiveInsert("hello word", "hello world");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      mode: "replaceSpan",
      selectBackChars: 10,
      clipboardText: "hello world",
    });
  });

  it("returns greppable error liveInsert:empty-next-with-live", () => {
    const r = planLiveInsert("already there", "");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("empty-next-with-live");
    expect(r.error.message).toContain("liveInsert:empty-next-with-live");
  });
});
