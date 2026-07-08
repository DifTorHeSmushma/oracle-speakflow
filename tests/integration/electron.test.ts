/**
 * T-13: Integration tests — Playwright + Electron
 *
 * These tests launch the Electron app in TEST_MODE=true which:
 * - Skips uiohook-napi (no real hotkey registration)
 * - Shows the BrowserWindow immediately
 * - Exposes test:set-state IPC for synthetic state injection
 *
 * Run after: npm run build && npm run build:ui
 * Run with: npx playwright test tests/integration/electron.test.ts
 */

import { test, expect, _electron as electron } from "@playwright/test";
import { join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const APP_ROOT = join(__dirname, "..", "..");
const MAIN_JS = join(APP_ROOT, "dist", "electron-main.js");
// Use the electron package to get the actual executable path (works on Windows)
const ELECTRON_EXE: string = require("electron") as string;

test.describe("Electron app integration", () => {
  let electronApp: Awaited<ReturnType<typeof electron.launch>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      executablePath: ELECTRON_EXE,
      args: [MAIN_JS],
      env: {
        ...process.env,
        TEST_MODE: "true",
        GROQ_API_KEY: "sk-test-integration",
        ELECTRON_ENABLE_LOGGING: "1",
      },
    });
    page = await electronApp.firstWindow();
    // Wait for the UI to hydrate
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".status-bar", { timeout: 15_000 });
  });

  test.afterEach(async () => {
    try {
      await electronApp.evaluate(({ app }) => app.quit());
    } catch {
      // App may already be closed
    }
    await electronApp.close().catch(() => {});
  });

  test("app launches and shows IDLE state", async () => {
    const statusBar = page.locator(".status-bar");
    await expect(statusBar).toHaveAttribute("data-state", "IDLE");
  });

  test("state transitions to RECORDING on synthetic IPC event", async () => {
    // Inject state from the main process side — more reliable than page.evaluate
    // because contextBridge-exposed APIs are not accessible via CDP evaluate calls.
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("state-change", { state: "RECORDING" });
    });
    await expect(page.locator(".status-bar")).toHaveAttribute("data-state", "RECORDING", { timeout: 3000 });
    // P3-T03: CSS animated bars replaced with canvas; selector updated
    await expect(page.locator(".waveform-canvas")).toBeVisible();
  });

  test("state transitions to TRANSCRIBING on synthetic IPC event", async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("state-change", { state: "TRANSCRIBING" });
    });
    await expect(page.locator(".status-bar")).toHaveAttribute("data-state", "TRANSCRIBING", { timeout: 3000 });
    await expect(page.locator(".spinner")).toBeVisible();
  });

  test("state transitions to INJECTING on synthetic IPC event", async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("state-change", { state: "INJECTING" });
    });
    await expect(page.locator(".status-bar")).toHaveAttribute("data-state", "INJECTING", { timeout: 3000 });
    await expect(page.locator(".spinner")).toBeVisible();
  });

  test("transcript preview appears after IDLE with transcript", async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("state-change", { state: "IDLE", transcript: "Integration test transcript" });
    });
    await expect(page.locator(".transcript-card")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".transcript-text")).toContainText("Integration test transcript");
  });

  test("tray window is visible on launch in TEST_MODE", async () => {
    // Use electronApp.evaluate to check BrowserWindow visibility from the main process
    const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      return wins.length > 0 && wins[0].isVisible();
    });
    expect(isVisible).toBe(true);
  });
});
