import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { daemonStore } from "../stores/daemon.js";
import TranscriptPreview from "../components/TranscriptPreview.svelte";

describe("TranscriptPreview", () => {
  beforeEach(() => {
    daemonStore.set({ state: "IDLE" });
    vi.clearAllMocks();
  });

  it("shows placeholder when there is no transcript", () => {
    render(TranscriptPreview);
    expect(screen.getByText(/Your last transcript appears here/i)).toBeTruthy();
  });

  it("shows transcript text when IDLE with transcript", async () => {
    daemonStore.set({ state: "IDLE", transcript: "Hello world" });
    render(TranscriptPreview);
    await Promise.resolve();
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("shows Copy button when transcript is present", async () => {
    daemonStore.set({ state: "IDLE", transcript: "Test transcript" });
    render(TranscriptPreview);
    await Promise.resolve();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("calls copyToClipboard via electronAPI on Copy click", async () => {
    daemonStore.set({ state: "IDLE", transcript: "Copy me" });
    render(TranscriptPreview);
    await Promise.resolve();
    const copyBtn = screen.getByRole("button", { name: /copy/i });
    await fireEvent.click(copyBtn);
    expect(window.electronAPI.copyToClipboard).toHaveBeenCalledWith("Copy me");
  });

  it("clears transcript when RECORDING state begins", async () => {
    daemonStore.set({ state: "IDLE", transcript: "Old transcript" });
    const { container } = render(TranscriptPreview);
    await Promise.resolve();
    expect(container.querySelector(".transcript-card")).toBeTruthy();

    daemonStore.set({ state: "RECORDING" });
    await Promise.resolve();
    expect(screen.getByText(/Your last transcript appears here/i)).toBeTruthy();
  });
});
