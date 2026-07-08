/**
 * FR-07: Floating HUD window — shows near cursor during RECORDING, TRANSCRIBING, INJECTING.
 *
 * Security invariant: HUD displays only non-sensitive status strings (state label only).
 * API keys, transcript text, and file paths are never sent to this window.
 *
 * INVARIANT #6: This module never triggers recording or modifies app state.
 * It is purely a passive display surface driven by electron-main.ts transitions.
 */
import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

const HUD_WIDTH  = 160;
const HUD_HEIGHT = 36;

// Throttle interval for cursor-position updates (ms) — avoids main-thread stall
const MOVE_THROTTLE_MS = 80;

let hudWin: BrowserWindow | null = null;
let moveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Create (or return cached) the HUD BrowserWindow.
 * Must be called after app.whenReady().
 */
export function getHudWindow(distUiPath: string): BrowserWindow {
  if (hudWin && !hudWin.isDestroyed()) return hudWin;

  hudWin = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // No preload — HUD uses postMessage only; no IPC to expose.
    },
  });

  hudWin.loadFile(join(distUiPath, "hud.html"));

  hudWin.on("closed", () => {
    hudWin = null;
    stopTracking();
  });

  return hudWin;
}

/**
 * Show HUD with given state label near the current cursor position.
 * Call on transition into RECORDING / TRANSCRIBING / INJECTING.
 */
export function showHud(distUiPath: string, state: "RECORDING" | "TRANSCRIBING" | "INJECTING"): void {
  const win = getHudWindow(distUiPath);
  positionNearCursor(win);
  win.show();
  // Send state to the HUD renderer via postMessage (no IPC channel needed)
  win.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify({ state })}, '*')`
  ).catch(() => { /* HUD display is best-effort; never crash the main process */ });
  startTracking(win);
}

/**
 * Hide HUD and stop cursor tracking.
 * Call on transition to IDLE.
 */
export function hideHud(): void {
  stopTracking();
  if (hudWin && !hudWin.isDestroyed()) {
    hudWin.hide();
  }
}

/**
 * Destroy the HUD window entirely (called on app before-quit).
 */
export function destroyHud(): void {
  stopTracking();
  if (hudWin && !hudWin.isDestroyed()) {
    hudWin.destroy();
    hudWin = null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function positionNearCursor(win: BrowserWindow): void {
  const cursor  = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa      = display.workArea;

  // Offset HUD 20px below and to the right of cursor; clamp to workArea
  let x = cursor.x + 20;
  let y = cursor.y + 20;
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width  - HUD_WIDTH));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - HUD_HEIGHT));

  win.setPosition(Math.round(x), Math.round(y), false);
}

function startTracking(win: BrowserWindow): void {
  if (moveTimer !== null) return; // already tracking
  moveTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) {
      stopTracking();
      return;
    }
    positionNearCursor(win);
  }, MOVE_THROTTLE_MS);
}

function stopTracking(): void {
  if (moveTimer !== null) {
    clearInterval(moveTimer);
    moveTimer = null;
  }
}
