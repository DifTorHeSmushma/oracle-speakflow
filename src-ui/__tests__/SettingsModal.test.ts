import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import SettingsModal from "../components/SettingsModal.svelte";

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
});
