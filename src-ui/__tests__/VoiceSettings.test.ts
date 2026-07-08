import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import VoiceSettings from "../components/VoiceSettings.svelte";

describe("VoiceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hands-free and push-to-talk mode buttons", () => {
    render(VoiceSettings);
    expect(screen.getByRole("button", { name: /hands-free/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /push-to-talk/i })).toBeTruthy();
  });

  it("switches to push-to-talk when selected", async () => {
    render(VoiceSettings);
    await fireEvent.click(screen.getByRole("button", { name: /push-to-talk/i }));
    expect(screen.getByRole("button", { name: /push-to-talk/i }).className).toContain("active");
  });

  it("shows kill-switch explainer", () => {
    render(VoiceSettings);
    expect(screen.getByText(/closes the microphone device/i)).toBeTruthy();
  });
});
