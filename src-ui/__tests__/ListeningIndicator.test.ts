import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import ListeningIndicator from "../components/ListeningIndicator.svelte";
import { mockElectronAPI } from "./setup.js";

const voiceSettings = {
  voiceMode: "handsFree" as const,
  vad: {
    positiveSpeechThreshold: 0.42,
    negativeSpeechThreshold: 0.28,
    minSpeechFrames: 6,
    redemptionFrames: 40,
    preSpeechPadFrames: 20,
  },
  correction: { llmEnabled: false, llmLatencyBudgetMs: 200 },
  terminalVariantEnabled: false,
  firstRunExplainerDismissed: false,
};

async function flushMount(): Promise<void> {
  await tick();
  await Promise.resolve();
  await Promise.resolve();
}

describe("ListeningIndicator", () => {
  beforeEach(() => {
    mockElectronAPI.getMuteState.mockResolvedValue(false);
    mockElectronAPI.getVoiceSettings.mockResolvedValue(voiceSettings);
    mockElectronAPI.onMuteChange.mockImplementation(() => () => {});
  });

  it("shows hands-free mic status when unmuted", async () => {
    render(ListeningIndicator);
    await flushMount();
    await waitFor(() => {
      expect(screen.getByText(/hands-free/i)).toBeTruthy();
    });
  });

  it("shows muted state when kill-switch active", async () => {
    mockElectronAPI.getMuteState.mockResolvedValue(true);
    render(ListeningIndicator);
    await flushMount();
    await waitFor(() => {
      expect(screen.getByText(/mic muted/i)).toBeTruthy();
    });
  });

  it("dismisses first-run explainer via config update", async () => {
    render(ListeningIndicator);
    await flushMount();
    const btn = await screen.findByRole("button", { name: /got it/i });
    await fireEvent.click(btn);
    expect(mockElectronAPI.sendConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ firstRunExplainerDismissed: true })
    );
  });
});
