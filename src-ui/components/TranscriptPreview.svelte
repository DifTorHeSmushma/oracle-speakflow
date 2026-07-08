<script lang="ts">
  import { onDestroy } from "svelte";
  import { daemonStore } from "../stores/daemon.js";

  const AUTO_CLEAR_MS = 30_000;

  let transcript: string | undefined;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleClear(): void {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      transcript = undefined;
      clearTimer = null;
    }, AUTO_CLEAR_MS);
  }

  const unsubscribe = daemonStore.subscribe((s) => {
    // Hands-free ends in LISTENING (not IDLE) — show transcript whenever main sends one.
    if (s.transcript && (s.state === "LISTENING" || s.state === "IDLE" || s.state === "INJECTING")) {
      transcript = s.transcript;
      scheduleClear();
    } else if (s.state === "RECORDING") {
      transcript = undefined;
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
    }
  });

  onDestroy(() => {
    unsubscribe();
    if (clearTimer) clearTimeout(clearTimer);
  });

  function copyToClipboard(): void {
    if (!transcript) return;
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.copyToClipboard(transcript);
    } else {
      navigator.clipboard.writeText(transcript).catch(() => {});
    }
  }
</script>

<div class="transcript-preview">
  {#if transcript}
    <div class="transcript-card">
      <p class="transcript-text">{transcript}</p>
      <button class="copy-btn" on:click={copyToClipboard}>Copy</button>
    </div>
  {:else}
    <p class="placeholder">Your last transcript appears here after you speak</p>
  {/if}
</div>

<style>
  .transcript-preview {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .placeholder {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted2, #71717a);
    font-style: italic;
    line-height: 1.4;
  }

  .transcript-card {
    background: var(--sf-surface2, #27272a);
    border: 1px solid var(--sf-border2, #3f3f46);
    border-radius: var(--sf-radius-sm, 6px);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 100%;
    overflow-y: auto;
  }

  .transcript-text {
    font-size: var(--sf-text-body, 12px);
    color: var(--sf-text, #e4e4e7);
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .copy-btn {
    align-self: flex-end;
    background: var(--sf-surface, #18181b);
    border: 1px solid var(--sf-accent, #6366f1);
    color: var(--sf-accent3, #a5b4fc);
    font-size: var(--sf-text-caption, 11px);
    padding: 3px 10px;
    border-radius: var(--sf-radius-sm, 6px);
    cursor: pointer;
    transition: background 0.15s;
  }

  .copy-btn:hover {
    background: var(--sf-accent-bg, #1e1b4b);
  }
</style>
