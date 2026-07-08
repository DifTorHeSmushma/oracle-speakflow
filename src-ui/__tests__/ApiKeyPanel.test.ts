import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import ApiKeyPanel from "../components/ApiKeyPanel.svelte";
import { mockElectronAPI } from "./setup";

describe("ApiKeyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset verifyApiKey to default: passes
    mockElectronAPI.verifyApiKey.mockResolvedValue(true);
  });

  it("displays masked key sk-*** by default", () => {
    render(ApiKeyPanel);
    expect(screen.getByText("sk-***")).toBeTruthy();
  });

  it("shows 'Change Key' button, not 'Edit', in idle state", () => {
    render(ApiKeyPanel);
    expect(screen.getByRole("button", { name: /change key/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });

  it("clicking 'Change Key' shows current key verification step", async () => {
    render(ApiKeyPanel);
    await fireEvent.click(screen.getByRole("button", { name: /change key/i }));
    expect(screen.getByText(/enter current api key/i)).toBeTruthy();
    const input = screen.getByLabelText(/current api key/i);
    expect(input.getAttribute("type")).toBe("password");
  });

  it("wrong current key shows error and does not advance to new-key step", async () => {
    mockElectronAPI.verifyApiKey.mockResolvedValue(false);
    render(ApiKeyPanel);
    await fireEvent.click(screen.getByRole("button", { name: /change key/i }));
    const input = screen.getByLabelText(/current api key/i);
    await fireEvent.input(input, { target: { value: "wrong-key" } });
    await fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(screen.getByText(/incorrect key/i)).toBeTruthy());
    expect(screen.queryByLabelText(/new api key/i)).toBeNull();
  });

  it("correct current key advances to new-key entry step", async () => {
    render(ApiKeyPanel);
    await fireEvent.click(screen.getByRole("button", { name: /change key/i }));
    const input = screen.getByLabelText(/current api key/i);
    await fireEvent.input(input, { target: { value: "sk-current" } });
    await fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(screen.getByLabelText(/new api key/i)).toBeTruthy());
  });

  it("sends config-update with new key on Confirm", async () => {
    render(ApiKeyPanel);
    await fireEvent.click(screen.getByRole("button", { name: /change key/i }));
    await fireEvent.input(screen.getByLabelText(/current api key/i), { target: { value: "sk-current" } });
    await fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => screen.getByLabelText(/new api key/i));
    await fireEvent.input(screen.getByLabelText(/new api key/i), { target: { value: "sk-newkey" } });
    await fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(mockElectronAPI.sendConfigUpdate).toHaveBeenCalledWith({ groqApiKey: "sk-newkey" });
  });

  it("Cancel from verify step resets to idle", async () => {
    render(ApiKeyPanel);
    await fireEvent.click(screen.getByRole("button", { name: /change key/i }));
    await fireEvent.click(screen.getByText("✕"));
    expect(screen.getByRole("button", { name: /change key/i })).toBeTruthy();
    expect(screen.queryByLabelText(/current api key/i)).toBeNull();
  });
});
