import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HotkeyEditor from "../components/HotkeyEditor.svelte";

describe("HotkeyEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays default hotkey F8", () => {
    render(HotkeyEditor);
    expect(screen.getByText("F8")).toBeTruthy();
  });

  it("shows capture button after clicking Edit", async () => {
    render(HotkeyEditor);
    await fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByText(/Click here, then press your hotkey/i)).toBeTruthy();
  });

  it("shows listening state after clicking Capture", async () => {
    render(HotkeyEditor);
    await fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await fireEvent.click(screen.getByText(/Click here, then press your hotkey/i));
    expect(screen.getByText(/Listening/i)).toBeTruthy();
  });

  it("captures single-key F8 without modifiers", async () => {
    render(HotkeyEditor);
    await fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await fireEvent.click(screen.getByText(/Click here, then press your hotkey/i));
    await fireEvent.keyDown(window, { key: "F8", code: "F8", ctrlKey: false, altKey: false, shiftKey: false });
    await Promise.resolve();
    expect(document.querySelector(".captured-display strong")?.textContent).toBe("F8");
  });

  it("sends config-update with new hotkey after capture + save", async () => {
    render(HotkeyEditor);
    await fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await fireEvent.click(screen.getByText(/Click here, then press your hotkey/i));
    // Simulate Ctrl+Alt+G
    await fireEvent.keyDown(window, { key: "G", code: "KeyG", ctrlKey: true, altKey: true, shiftKey: false });
    await Promise.resolve();
    const saveBtn = screen.getByRole("button", { name: /save/i });
    await fireEvent.click(saveBtn);
    expect(window.electronAPI.sendConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ hotkey: expect.objectContaining({ ctrl: true, alt: true, keycode: 34 }) })
    );
  });
});
