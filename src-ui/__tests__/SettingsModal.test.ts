import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import SettingsModal from "../components/SettingsModal.svelte";
import { mockElectronAPI } from "./setup.js";

async function openEngineTab(): Promise<void> {
  await fireEvent.click(screen.getByRole("tab", { name: /engine/i }));
}

describe("SettingsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders model and language selects on Engine tab", async () => {
    render(SettingsModal);
    await openEngineTab();
    expect(screen.getByLabelText(/model/i)).toBeTruthy();
    expect(screen.getByLabelText(/language/i)).toBeTruthy();
  });

  it("renders verbose toggle checkbox on Engine tab", async () => {
    render(SettingsModal);
    await openEngineTab();
    expect(screen.getByLabelText(/verbose/i)).toBeTruthy();
  });

  it("renders Save and Cancel buttons", () => {
    render(SettingsModal);
    expect(screen.getByRole("button", { name: /save/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("calls sendConfigUpdate with model and language on Save", async () => {
    render(SettingsModal);
    await openEngineTab();
    const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement;
    await fireEvent.change(modelSelect, { target: { value: "whisper-large-v3" } });
    await fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(window.electronAPI.sendConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-large-v3",
        language: "en",
        voiceMode: "handsFree",
      })
    );
  });

  it("renders Dictionary tab", () => {
    render(SettingsModal);
    expect(screen.getByRole("tab", { name: /dictionary/i })).toBeTruthy();
  });

  it("shows all three model options on Engine tab", async () => {
    render(SettingsModal);
    await openEngineTab();
    const modelSelect = screen.getByLabelText(/model/i);
    const options = modelSelect.querySelectorAll("option");
    expect(options.length).toBe(3);
  });

  it("exposes getConfigSnapshot but not the removed checkModel on the API mock", () => {
    // Verifies the dead-IPC removal (Hotfix-A/B): checkModel and downloadModel
    // must not exist on electronAPI; their replacements must be present and callable.
    const api = window.electronAPI as unknown as Record<string, unknown>;
    expect(typeof api["getConfigSnapshot"]).toBe("function");
    expect(typeof api["getTierStatus"]).toBe("function");
    expect(typeof api["downloadTier"]).toBe("function");
    expect(api["checkModel"]).toBeUndefined();
    expect(api["downloadModel"]).toBeUndefined();
  });

  it("defaults to remote mode before config is loaded, then save persists the UI value", async () => {
    // The component starts with transcriptionMode="remote" (default).
    // Changing the radio to "local" and clicking Save must call sendConfigUpdate
    // with transcriptionMode: "local" — confirms the binding works.
    render(SettingsModal);
    await openEngineTab();
    const localRadio = screen.getByDisplayValue("local") as HTMLInputElement;
    await fireEvent.click(localRadio);
    await fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(mockElectronAPI.sendConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ transcriptionMode: "local" }),
    );
  });

  it("calls selectTier when saving tier selection", async () => {
    render(SettingsModal);
    await fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(mockElectronAPI.selectTier).toHaveBeenCalledWith("fast");
  });
});
