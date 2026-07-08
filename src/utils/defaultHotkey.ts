import type { HotkeyConfig } from "../types/ipc.js";

/** Bump when default hotkey changes; triggers one-time migration in loadConfig. */
export const HOTKEY_CONFIG_VERSION = "2";

/** Pre–v2 factory default (Ctrl+Alt+R). */
export const LEGACY_DEFAULT_HOTKEY: HotkeyConfig = {
  ctrl: true,
  shift: false,
  alt: true,
  keycode: 19,
};

/** Uiohook scan code for F8 — default push-to-talk (one key, fewer OS/IDE conflicts than Ctrl+Alt+*). */
export const UIOHOOK_KEY_F8 = 66;

export const DEFAULT_HOTKEY: HotkeyConfig = {
  ctrl: false,
  shift: false,
  alt: false,
  keycode: UIOHOOK_KEY_F8,
};

const KEY_LABELS: Record<number, string> = {
  19: "R",
  66: "F8",
  30: "A",
};

export function formatHotkeyLabel(hk: HotkeyConfig): string {
  const parts: string[] = [];
  if (hk.ctrl) parts.push("Ctrl");
  if (hk.alt) parts.push("Alt");
  if (hk.shift) parts.push("Shift");
  parts.push(KEY_LABELS[hk.keycode] ?? `key:${hk.keycode}`);
  return parts.join("+");
}
