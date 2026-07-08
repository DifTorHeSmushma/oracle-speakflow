<script lang="ts">
  import { onMount } from "svelte";
  import type { HotkeyConfig } from "../../src/types/ipc.js";
  import { DEFAULT_HOTKEY } from "../../src/utils/defaultHotkey.js";

  // Modifier key codes (should not be accepted as the primary key alone)
  const MODIFIER_KEYCODES = new Set([
    "ControlLeft", "ControlRight",
    "ShiftLeft", "ShiftRight",
    "AltLeft", "AltRight",
    "MetaLeft", "MetaRight",
  ]);

  // uiohook-napi scan codes for common keys (layout-independent)
  // Reference: https://github.com/nicolo-ribaudo/tc39-proposal-uiohook
  const KEY_LABELS: Record<number, string> = {
    19: "R", 30: "A", 48: "B", 46: "C", 32: "D", 18: "E", 33: "F",
    34: "G", 35: "H", 23: "I", 36: "J", 37: "K", 38: "L", 50: "M",
    49: "N", 24: "O", 25: "P", 16: "Q", 19: "R", 31: "S", 20: "T",
    22: "U", 47: "V", 17: "W", 45: "X", 21: "Y", 44: "Z",
    // Digits
    2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
    66: "F8",
  };

  // uiohook scan codes via browser event.code → keycode mapping (approximate)
  const CODE_TO_KEYCODE: Record<string, number> = {
    KeyA: 30, KeyB: 48, KeyC: 46, KeyD: 32, KeyE: 18, KeyF: 33, KeyG: 34,
    KeyH: 35, KeyI: 23, KeyJ: 36, KeyK: 37, KeyL: 38, KeyM: 50, KeyN: 49,
    KeyO: 24, KeyP: 25, KeyQ: 16, KeyR: 19, KeyS: 31, KeyT: 20, KeyU: 22,
    KeyV: 47, KeyW: 17, KeyX: 45, KeyY: 21, KeyZ: 44,
    Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6,
    Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
    F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
    F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
  };

  let hotkey: HotkeyConfig = { ...DEFAULT_HOTKEY };
  let editing = false;

  onMount(async () => {
    if (typeof window !== "undefined" && window.electronAPI?.getHotkey) {
      hotkey = await window.electronAPI.getHotkey();
    }
  });
  let capturing = false;
  let capturedKey: { code: string; keycode: number; label: string } | null = null;
  let error = "";
  let saved = false;

  function hotkeyLabel(hk: HotkeyConfig): string {
    const parts: string[] = [];
    if (hk.ctrl) parts.push("Ctrl");
    if (hk.alt) parts.push("Alt");
    if (hk.shift) parts.push("Shift");
    parts.push(KEY_LABELS[hk.keycode] ?? `key:${hk.keycode}`);
    return parts.join("+");
  }

  function startEdit(): void {
    editing = true;
    capturing = false;
    capturedKey = null;
    error = "";
    saved = false;
  }

  function startCapture(): void {
    capturing = true;
    capturedKey = null;
    error = "";
  }

  function handleCapture(e: KeyboardEvent): void {
    if (!capturing) return;
    e.preventDefault();

    if (MODIFIER_KEYCODES.has(e.code)) return; // ignore bare modifier press

    const keycode = CODE_TO_KEYCODE[e.code];
    if (!keycode) {
      error = `Unsupported key: ${e.code}`;
      return;
    }

    capturedKey = { code: e.code, keycode, label: e.key.toUpperCase() };
    hotkey = {
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      keycode,
    };
    capturing = false;
    error = "";
  }

  function save(): void {
    if (!capturedKey) {
      error = "Press 'Capture' and press your desired hotkey first.";
      return;
    }
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.sendConfigUpdate({ hotkey });
    }
    editing = false;
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }

  function cancel(): void {
    editing = false;
    capturing = false;
    capturedKey = null;
    error = "";
  }
</script>

<svelte:window on:keydown={handleCapture} />

<div class="hotkey-editor">
  <div class="panel-row">
    <span class="panel-label">Hotkey</span>
    <span class="hotkey-badge">{hotkeyLabel(hotkey)}</span>
    {#if !editing}
      <button class="action-btn" on:click={startEdit}>Edit</button>
    {/if}
  </div>

  {#if editing}
    <div class="edit-section">
      {#if !capturing && !capturedKey}
        <button class="capture-btn" on:click={startCapture}>Click here, then press your hotkey</button>
      {:else if capturing}
        <div class="capture-active">Listening… press your hotkey now</div>
      {:else if capturedKey}
        <div class="captured-display">Captured: <strong>{hotkeyLabel(hotkey)}</strong></div>
        <button class="capture-btn secondary" on:click={startCapture}>Recapture</button>
      {/if}

      {#if error}
        <p class="error-msg">{error}</p>
      {/if}

      <div class="edit-actions">
        <button class="action-btn save-btn" on:click={save} disabled={!capturedKey}>Save</button>
        <button class="action-btn cancel-btn" on:click={cancel}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if saved}
    <p class="saved-notice">Hotkey updated — active immediately.</p>
  {/if}
</div>

<style>
  .hotkey-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .panel-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-label {
    font-size: 11px;
    color: #666;
    min-width: 52px;
  }

  .hotkey-badge {
    font-size: 11px;
    font-family: monospace;
    background: #1a2a3a;
    border: 1px solid #2a3a5a;
    border-radius: 4px;
    padding: 2px 8px;
    color: #80a8d0;
    flex: 1;
  }

  .edit-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .capture-btn {
    background: #0d1a2a;
    border: 1px dashed #2a4a6a;
    color: #60a0c8;
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .capture-btn.secondary {
    font-size: 10px;
    padding: 3px 8px;
  }

  .capture-btn:hover {
    background: #122030;
  }

  .capture-active {
    font-size: 11px;
    color: #eab308;
    background: #1a1500;
    border: 1px solid #4a3a00;
    border-radius: 4px;
    padding: 6px 10px;
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .captured-display {
    font-size: 11px;
    color: #22c55e;
  }

  .error-msg {
    font-size: 11px;
    color: #f87171;
  }

  .edit-actions {
    display: flex;
    gap: 6px;
  }

  .action-btn {
    background: none;
    border: 1px solid #333;
    color: #888;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: #1e2d40;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .save-btn { color: #3b82f6; border-color: #2a4a80; }
  .cancel-btn { color: #f87171; border-color: #7f1d1d; }

  .saved-notice {
    font-size: 11px;
    color: #22c55e;
  }
</style>
