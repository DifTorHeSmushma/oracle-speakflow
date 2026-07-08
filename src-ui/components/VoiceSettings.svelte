<script lang="ts">
  import { onMount } from "svelte";
  import type { VoiceMode } from "../../src/types/voice.js";
  import { DEFAULT_VAD_CONFIG } from "../../src/types/voice.js";

  export let voiceMode: VoiceMode = "handsFree";
  export let terminalVariantEnabled = false;
  export let positiveThreshold = DEFAULT_VAD_CONFIG.positiveSpeechThreshold;
  export let negativeThreshold = DEFAULT_VAD_CONFIG.negativeSpeechThreshold;
  export let llmCorrectionEnabled = false;
  export let vadMinSpeechFrames = DEFAULT_VAD_CONFIG.minSpeechFrames;
  export let vadRedemptionFrames = DEFAULT_VAD_CONFIG.redemptionFrames;
  export let vadPreSpeechPadFrames = DEFAULT_VAD_CONFIG.preSpeechPadFrames;

  let loaded = false;

  onMount(async () => {
    if (!window.electronAPI?.getVoiceSettings) {
      loaded = true;
      return;
    }
    const settings = await window.electronAPI.getVoiceSettings();
    if (settings) {
      voiceMode = settings.voiceMode;
      terminalVariantEnabled = settings.terminalVariantEnabled;
      positiveThreshold = settings.vad.positiveSpeechThreshold;
      negativeThreshold = settings.vad.negativeSpeechThreshold;
      vadMinSpeechFrames = settings.vad.minSpeechFrames;
      vadRedemptionFrames = settings.vad.redemptionFrames;
      vadPreSpeechPadFrames = settings.vad.preSpeechPadFrames;
      llmCorrectionEnabled = settings.correction.llmEnabled;
    }
    loaded = true;
  });
</script>

<div class="voice-settings">
  <p class="section-label">Input mode</p>
  <div class="mode-row">
    <button
      type="button"
      class="mode-btn"
      class:active={voiceMode === "handsFree"}
      on:click={() => { voiceMode = "handsFree"; }}
    >
      Hands-free
      <span class="mode-hint">Speak anytime — no hotkey</span>
    </button>
    <button
      type="button"
      class="mode-btn"
      class:active={voiceMode === "ptt"}
      on:click={() => { voiceMode = "ptt"; }}
    >
      Push-to-talk
      <span class="mode-hint">Hold hotkey to record</span>
    </button>
  </div>

  <p class="explainer">
    {#if voiceMode === "handsFree"}
      Stay in your target window while speaking. If you alt-tab mid-utterance, SpeakFlow copies to the clipboard instead of pasting into the wrong app.
    {:else}
      Focus the app you want, hold your hotkey, speak, then release to transcribe and paste.
    {/if}
  </p>

  <label class="toggle-row">
    <input type="checkbox" bind:checked={terminalVariantEnabled} />
    <span>Use Shift+Insert in terminals (off = Ctrl+V everywhere)</span>
  </label>

  <details class="advanced">
    <summary>VAD sensitivity (advanced)</summary>
    <label class="field">
      <span>Speech start threshold ({positiveThreshold.toFixed(2)})</span>
      <input type="range" min="0.2" max="0.8" step="0.01" bind:value={positiveThreshold} />
    </label>
    <label class="field">
      <span>Speech end threshold ({negativeThreshold.toFixed(2)})</span>
      <input type="range" min="0.05" max="0.5" step="0.01" bind:value={negativeThreshold} />
    </label>
    <p class="hint">Lower = more sensitive. Restart listening after save if hands-free feels off.</p>
  </details>

  <p class="section-label">Kill-switch</p>
  <p class="explainer">
    Mute closes the microphone device — the Windows mic indicator goes dark. Use the mute bar in the main window or the tray menu. No audio is recorded or pasted while muted.
  </p>

  <label class="toggle-row">
    <input type="checkbox" bind:checked={llmCorrectionEnabled} />
    <span>Optional LLM polish after deterministic correction (adds latency)</span>
  </label>
</div>

<style>
  .voice-settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-label {
    font-size: var(--sf-text-caption, 11px);
    font-weight: 600;
    color: var(--sf-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .mode-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mode-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border-radius: var(--sf-radius-sm, 6px);
    border: 1px solid var(--sf-border2, #3f3f46);
    background: var(--sf-surface2, #27272a);
    color: var(--sf-text, #e4e4e7);
    font-size: var(--sf-text-body, 12px);
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .mode-btn.active {
    border-color: var(--sf-accent, #6366f1);
    background: var(--sf-accent-bg, #1e1b4b);
    color: var(--sf-accent3, #a5b4fc);
  }

  .mode-hint {
    font-size: var(--sf-text-caption, 11px);
    font-weight: 400;
    color: var(--sf-muted, #a1a1aa);
  }

  .mode-btn.active .mode-hint {
    color: var(--sf-accent3, #a5b4fc);
    opacity: 0.85;
  }

  .explainer {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted, #a1a1aa);
    line-height: 1.45;
    margin: 0;
  }

  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-text, #e4e4e7);
    cursor: pointer;
  }

  .toggle-row input {
    margin-top: 2px;
    accent-color: var(--sf-accent, #6366f1);
  }

  .advanced {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted);
  }

  .advanced summary {
    cursor: pointer;
    color: var(--sf-accent3, #a5b4fc);
    margin-bottom: 6px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
    color: var(--sf-text, #e4e4e7);
  }

  .field input[type="range"] {
    width: 100%;
    accent-color: var(--sf-accent, #6366f1);
  }

  .hint {
    font-size: 10px;
    color: var(--sf-muted2, #71717a);
    margin: 0;
  }
</style>
