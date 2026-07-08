<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  export let muted = false;

  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    if (!window.electronAPI?.getMuteState) return;
    void window.electronAPI.getMuteState().then((m) => { muted = m; });
    unsubscribe = window.electronAPI.onMuteChange?.((m) => { muted = m; });
  });

  onDestroy(() => unsubscribe?.());

  async function toggleMute(): Promise<void> {
    if (!window.electronAPI?.toggleMute) return;
    muted = await window.electronAPI.toggleMute();
  }
</script>

<button
  type="button"
  class="mute-bar"
  class:is-muted={muted}
  on:click={toggleMute}
  title={muted ? "Resume hands-free listening" : "Pause listening (mute button — mic off)"}
>
  <span class="mute-icon" aria-hidden="true">{muted ? "🔇" : "🎤"}</span>
  <span class="mute-text">
    {#if muted}
      Mic muted — click to resume
    {:else}
      Listening — click to mute
    {/if}
  </span>
</button>

<style>
  .mute-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    padding: 8px 10px;
    border-radius: var(--sf-radius-sm, 6px);
    border: 1px solid var(--sf-accent, #6366f1);
    background: var(--sf-accent-bg, #1e1b4b);
    color: var(--sf-accent3, #a5b4fc);
    font-size: var(--sf-text-caption, 11px);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .mute-bar:hover {
    background: #252060;
    border-color: var(--sf-accent2, #818cf8);
  }

  .mute-bar.is-muted {
    border-color: var(--sf-error, #f87171);
    background: var(--sf-error-bg, #1c0a0a);
    color: var(--sf-error, #f87171);
  }

  .mute-bar.is-muted:hover {
    background: #2a1010;
  }

  .mute-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .mute-text {
    line-height: 1.2;
    text-align: center;
  }
</style>
