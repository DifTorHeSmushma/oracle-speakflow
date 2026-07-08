<script lang="ts">
  import { onDestroy } from "svelte";
  import { daemonStore } from "../stores/daemon.js";
  import type { VoiceMode } from "../../src/types/voice.js";

  let muted = false;
  let voiceMode: VoiceMode = "handsFree";
  let showExplainer = false;

  let unsubMute: (() => void) | null = null;
  let unsubDaemon: (() => void) | null = null;
  let currentState = "IDLE";

  async function loadIndicatorState(): Promise<void> {
    if (window.electronAPI?.getMuteState) {
      muted = await window.electronAPI.getMuteState();
      unsubMute = window.electronAPI.onMuteChange((m) => { muted = m; });
    }
    if (window.electronAPI?.getVoiceSettings) {
      const settings = await window.electronAPI.getVoiceSettings();
      if (settings) {
        voiceMode = settings.voiceMode;
        showExplainer = !settings.firstRunExplainerDismissed;
      }
    }
  }

  void loadIndicatorState();

  unsubDaemon = daemonStore.subscribe((s) => { currentState = s.state; });

  onDestroy(() => {
    unsubMute?.();
    unsubDaemon?.();
  });

  async function dismissExplainer(): Promise<void> {
    showExplainer = false;
    window.electronAPI?.sendConfigUpdate({ firstRunExplainerDismissed: true });
  }

  $: micActive = !muted && (currentState === "LISTENING" || currentState === "RECORDING" || voiceMode === "handsFree");
  $: modeLabel = voiceMode === "handsFree" ? "Hands-free" : "Push-to-talk";
</script>

<div class="listening-indicator" data-muted={muted} data-mic-active={micActive}>
  <div class="indicator-row">
    <span
      class="mic-dot"
      class:muted={muted}
      class:active={micActive && !muted}
      class:armed={!muted && voiceMode === "handsFree" && currentState === "LISTENING"}
      title={muted ? "Microphone muted (kill-switch)" : "Microphone armed"}
      aria-hidden="true"
    ></span>
    <span class="indicator-text">
      {#if muted}
        Mic muted — click bar below or tray to unmute
      {:else if voiceMode === "handsFree"}
        {modeLabel} · mic {currentState === "LISTENING" ? "listening" : "ready"}
      {:else}
        {modeLabel} · hold hotkey to record
      {/if}
    </span>
  </div>

  {#if showExplainer}
    <div class="explainer" role="note">
      <p><strong>Privacy first.</strong> Audio stays local until Groq transcription. Nothing is logged to disk.</p>
      <p>Mute anytime via the bar below or the tray menu — the OS mic dot goes dark when muted.</p>
      <button type="button" class="dismiss" on:click={dismissExplainer}>Got it</button>
    </div>
  {/if}
</div>

<style>
  .listening-indicator {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .indicator-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 18px;
  }

  .mic-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--sf-muted2, #71717a);
    transition: background 0.2s, box-shadow 0.2s;
  }

  .mic-dot.muted {
    background: var(--sf-error, #f87171);
    box-shadow: none;
  }

  .mic-dot.active {
    background: var(--sf-success, #22c55e);
  }

  .mic-dot.armed {
    animation: mic-armed 1.6s ease-in-out infinite;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  }

  @keyframes mic-armed {
    0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45); }
    70%  { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  }

  .indicator-text {
    font-size: var(--sf-text-micro, 10px);
    color: var(--sf-muted, #a1a1aa);
    line-height: 1.3;
  }

  [data-muted="true"] .indicator-text {
    color: var(--sf-error, #f87171);
  }

  .explainer {
    background: var(--sf-surface2, #27272a);
    border: 1px solid var(--sf-accent, #6366f1);
    border-radius: var(--sf-radius-sm, 6px);
    padding: 8px 10px;
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-text2, #d4d4d8);
    line-height: 1.45;
  }

  .explainer p {
    margin: 0 0 6px;
  }

  .explainer strong {
    color: var(--sf-accent3, #a5b4fc);
  }

  .dismiss {
    margin-top: 2px;
    font-size: var(--sf-text-caption, 11px);
    padding: 4px 10px;
    border-radius: var(--sf-radius-sm, 6px);
    border: 1px solid var(--sf-accent, #6366f1);
    background: var(--sf-accent-bg, #1e1b4b);
    color: var(--sf-accent3, #a5b4fc);
    cursor: pointer;
  }
</style>
