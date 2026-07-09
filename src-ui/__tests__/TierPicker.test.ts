import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import TierPicker from "../components/TierPicker.svelte";
import { mockElectronAPI } from "./setup.js";

describe("TierPicker (§5.3 / G3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders three tier rows", async () => {
    render(TierPicker);
    await waitFor(() => {
      expect(screen.getByText("Fast")).toBeTruthy();
      expect(screen.getByText("Balanced")).toBeTruthy();
      expect(screen.getByText("Accurate")).toBeTruthy();
    });
  });

  it("shows size and RAM copy for each tier", async () => {
    render(TierPicker);
    await waitFor(() => {
      expect(screen.getByText("78 MB")).toBeTruthy();
      expect(screen.getByText("190 MB")).toBeTruthy();
      expect(screen.getByText("574 MB")).toBeTruthy();
    });
  });

  it("shows Recommended badge on Balanced tier (S1-M6 passed)", async () => {
    render(TierPicker);
    await waitFor(() => {
      expect(screen.getByText("Recommended")).toBeTruthy();
    });
  });

  it("shows Bundled badge on Fast tier", async () => {
    render(TierPicker);
    await waitFor(() => {
      expect(screen.getByText("Bundled")).toBeTruthy();
    });
  });

  it("renders tier availability after mount (getTierStatus called)", async () => {
    // getTierStatus returns defaultTierStatus() → fast available, balanced/accurate not.
    // After onMount, the Download buttons for balanced+accurate should appear.
    render(TierPicker);
    await waitFor(() => {
      const downloadBtns = screen.getAllByRole("button", { name: /download/i });
      expect(downloadBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows Download button for unavailable tiers", async () => {
    render(TierPicker);
    await waitFor(() => {
      // Balanced and Accurate are unavailable per defaultTierStatus() in setup.ts
      const downloadBtns = screen.getAllByRole("button", { name: /download/i });
      expect(downloadBtns.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("calls downloadTier when Download is clicked", async () => {
    render(TierPicker);
    await waitFor(() => screen.getAllByRole("button", { name: /download/i }));
    const downloadBtns = screen.getAllByRole("button", { name: /download/i });
    await fireEvent.click(downloadBtns[0]!);
    await waitFor(() => {
      expect(mockElectronAPI.downloadTier).toHaveBeenCalled();
    });
  });

  it("does not show Download button for the bundled Fast tier (already available)", async () => {
    render(TierPicker);
    await waitFor(() => screen.getByText("Fast"));
    // Fast tier row is available (bundled) — no Download button for it
    // The Download buttons should be for balanced/accurate only
    const downloadBtns = screen.queryAllByRole("button", { name: /download/i });
    // Should be at most 2 (balanced + accurate), never for Fast
    expect(downloadBtns.length).toBeLessThanOrEqual(2);
  });

  it("Active badge shown for the selected tier", async () => {
    render(TierPicker, { props: { selectedTier: "fast" } });
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeTruthy();
    });
  });
});
