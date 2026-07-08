import { describe, it, expect, vi, beforeEach } from "vitest";
import { injectText } from "../src/services/injector.js";

// Must match the import path in injector.ts exactly.
vi.mock("@nut-tree-fork/nut-js", () => ({
  clipboard: { setContent: vi.fn() },
  keyboard: { pressKey: vi.fn(), releaseKey: vi.fn() },
  Key: { LeftControl: "LeftControl", V: "V" },
}));

describe("injector service", () => {
  let clipboard: { setContent: ReturnType<typeof vi.fn> };
  let keyboard: { pressKey: ReturnType<typeof vi.fn>; releaseKey: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    const nut = await import("@nut-tree-fork/nut-js");
    clipboard = nut.clipboard as typeof clipboard;
    keyboard = nut.keyboard as typeof keyboard;
  });

  // ---- Happy path ----------------------------------------------------------

  it("writes text to clipboard and sends Ctrl+V, returns Ok", async () => {
    clipboard.setContent.mockResolvedValueOnce(undefined);
    keyboard.pressKey.mockResolvedValueOnce(undefined);
    keyboard.releaseKey.mockResolvedValueOnce(undefined);

    const result = await injectText("hello world");

    expect(result.ok).toBe(true);
    expect(clipboard.setContent).toHaveBeenCalledWith("hello world");
    expect(keyboard.pressKey).toHaveBeenCalledTimes(1);
    expect(keyboard.releaseKey).toHaveBeenCalledTimes(1);
  });

  // ---- Clipboard failures --------------------------------------------------

  it("returns Err(clipboardFailed) when clipboard write throws", async () => {
    clipboard.setContent.mockRejectedValueOnce(new Error("clipboard access denied"));

    const result = await injectText("hello");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("clipboardFailed");
      expect(keyboard.pressKey).not.toHaveBeenCalled();
    }
  });

  // ---- Keystroke failures --------------------------------------------------

  it("returns Err(keystrokeFailed) when keyboard pressKey throws a generic error", async () => {
    clipboard.setContent.mockResolvedValueOnce(undefined);
    keyboard.pressKey.mockRejectedValueOnce(new Error("keystroke failed"));

    const result = await injectText("hello");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("keystrokeFailed");
  });

  it("returns Err(readOnlyTarget) when keyboard error message contains 'read-only'", async () => {
    clipboard.setContent.mockResolvedValueOnce(undefined);
    keyboard.pressKey.mockRejectedValueOnce(new Error("target is read-only, cannot inject"));

    const result = await injectText("hello");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("readOnlyTarget");
  });

  it("returns Err(readOnlyTarget) when keyboard error message contains 'readonly'", async () => {
    clipboard.setContent.mockResolvedValueOnce(undefined);
    keyboard.pressKey.mockRejectedValueOnce(new Error("field is readonly"));

    const result = await injectText("hello");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("readOnlyTarget");
  });

  // ---- Edge cases ----------------------------------------------------------

  it("passes empty string to clipboard without error", async () => {
    clipboard.setContent.mockResolvedValueOnce(undefined);
    keyboard.pressKey.mockResolvedValueOnce(undefined);
    keyboard.releaseKey.mockResolvedValueOnce(undefined);

    const result = await injectText("");

    expect(result.ok).toBe(true);
    expect(clipboard.setContent).toHaveBeenCalledWith("");
  });
});
