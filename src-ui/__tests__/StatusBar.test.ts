import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { daemonStore } from "../stores/daemon.js";
import StatusBar from "../components/StatusBar.svelte";

describe("StatusBar", () => {
  beforeEach(() => {
    daemonStore.set({ state: "IDLE" });
    vi.clearAllMocks();
  });

  it("renders with idle state and grey dot", () => {
    const { container } = render(StatusBar);
    const statusBar = container.querySelector(".status-bar");
    expect(statusBar).toBeTruthy();
    expect(statusBar?.getAttribute("data-state")).toBe("IDLE");
    expect(container.querySelector(".dot")).toBeTruthy();
  });

  it("shows idle label text when IDLE", () => {
    render(StatusBar);
    expect(screen.getByText(/Idle/i)).toBeTruthy();
  });

  it("shows waveform animation element when RECORDING", async () => {
    daemonStore.set({ state: "RECORDING" });
    const { container } = render(StatusBar);
    await Promise.resolve();
    // P3-T03: CSS animated bars replaced with canvas waveform
    expect(container.querySelector(".waveform-canvas")).toBeTruthy();
    expect(container.querySelector(".dot.pulse")).toBeTruthy();
  });

  it("shows spinner element when TRANSCRIBING", async () => {
    daemonStore.set({ state: "TRANSCRIBING" });
    const { container } = render(StatusBar);
    await Promise.resolve();
    expect(container.querySelector(".spinner")).toBeTruthy();
    expect(container.querySelector("[data-state='TRANSCRIBING']")).toBeTruthy();
  });

  it("shows spinner element when INJECTING", async () => {
    daemonStore.set({ state: "INJECTING" });
    const { container } = render(StatusBar);
    await Promise.resolve();
    expect(container.querySelector(".spinner")).toBeTruthy();
    expect(container.querySelector("[data-state='INJECTING']")).toBeTruthy();
  });

  it("shows error banner when store has error field", async () => {
    daemonStore.set({ state: "IDLE", error: "Test error message" });
    render(StatusBar);
    await Promise.resolve();
    expect(screen.getByText("Test error message")).toBeTruthy();
  });
});
