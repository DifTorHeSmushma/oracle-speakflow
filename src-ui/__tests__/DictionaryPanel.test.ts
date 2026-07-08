import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import DictionaryPanel from "../components/DictionaryPanel.svelte";
import { mockElectronAPI } from "./setup.js";

const sampleDict = {
  version: 1,
  entries: [{ id: "1", spoken: "type check", written: "typecheck", matchMode: "phrase" as const, enabled: true }],
};

async function flushMount(): Promise<void> {
  await tick();
  await Promise.resolve();
  await Promise.resolve();
}

describe("DictionaryPanel", () => {
  beforeEach(() => {
    mockElectronAPI.getDictionary.mockResolvedValue(sampleDict);
    mockElectronAPI.saveDictionary.mockResolvedValue({ ok: true });
  });

  it("loads and lists dictionary entries", async () => {
    render(DictionaryPanel);
    await flushMount();
    await waitFor(() => {
      expect(mockElectronAPI.getDictionary).toHaveBeenCalled();
      expect(screen.getByText("typecheck")).toBeTruthy();
    });
    expect(screen.getByText("type check")).toBeTruthy();
  });

  it("adds a new entry and persists", async () => {
    render(DictionaryPanel);
    await flushMount();
    await waitFor(() => expect(mockElectronAPI.getDictionary).toHaveBeenCalled());
    await fireEvent.input(screen.getByPlaceholderText(/^spoken/i), { target: { value: "npm" } });
    await fireEvent.input(screen.getByPlaceholderText(/^written/i), { target: { value: "npm" } });
    await fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(mockElectronAPI.saveDictionary).toHaveBeenCalled();
  });

  it("renders import and export controls", async () => {
    render(DictionaryPanel);
    await flushMount();
    expect(screen.getByRole("button", { name: /export json/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /import json/i })).toBeTruthy();
  });
});
