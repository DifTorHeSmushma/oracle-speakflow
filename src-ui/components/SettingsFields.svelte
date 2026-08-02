<script lang="ts">
  /**
   * Q4: Extracted from SettingsModal to stay under INVARIANT #16 (≤250 lines).
   * Exports model/language/verbose/transcriptionMode as two-way bindable props.
   */

  const MODELS = [
    { value: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo (fast)" },
    { value: "whisper-large-v3",       label: "Whisper Large v3 (accurate)" },
    { value: "distil-whisper-large-v3-en", label: "Distil Whisper Large v3 en (en-only)" },
  ];

  const LANGUAGES = [
    { value: "auto", label: "Auto-detect" },
    { value: "en",   label: "English" },
    { value: "th",   label: "Thai (ไทย)" },
    { value: "es",   label: "Spanish" },
    { value: "fr",   label: "French" },
    { value: "de",   label: "German" },
    { value: "ja",   label: "Japanese" },
    { value: "zh",   label: "Chinese" },
  ];

  export let model             = "whisper-large-v3-turbo";
  export let language          = "en";
  export let verbose           = false;
  export let transcriptionMode: "local" | "remote" = "remote";
</script>

<!-- Transcription mode toggle -->
<fieldset class="field field-fieldset">
  <legend class="field-label">Transcription Mode</legend>
  <div class="mode-group">
    <label class="mode-option">
      <input type="radio" bind:group={transcriptionMode} value="remote" />
      <span>Cloud (Groq)</span>
    </label>
    <label class="mode-option">
      <input type="radio" bind:group={transcriptionMode} value="local" />
      <span>Local (Whisper)</span>
    </label>
  </div>
</fieldset>

<!-- Groq model selector — only relevant in cloud mode -->
{#if transcriptionMode === "remote"}
  <div class="field">
    <label for="model-select">Groq Model</label>
    <select id="model-select" bind:value={model}>
      {#each MODELS as m}
        <option value={m.value}>{m.label}</option>
      {/each}
    </select>
  </div>
{/if}

<div class="field">
  <label for="lang-select">Language</label>
  <select id="lang-select" bind:value={language}>
    {#each LANGUAGES as l}
      <option value={l.value}>{l.label}</option>
    {/each}
  </select>
</div>

<div class="field field-toggle">
  <label for="verbose-toggle">Verbose mode</label>
  <input id="verbose-toggle" type="checkbox" bind:checked={verbose} />
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-toggle {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .field-fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }

  .field-label,
  label,
  legend {
    font-size: 11px;
    color: var(--sf-muted, #a1a1aa);
  }

  .mode-group {
    display: flex;
    gap: 12px;
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--sf-text, #f4f4f5);
    cursor: pointer;
  }

  .mode-option input[type="radio"] {
    accent-color: var(--sf-accent, #6366f1);
    cursor: pointer;
  }

  select {
    background: var(--sf-surface, #18181b);
    border: 1px solid var(--sf-border, #27272a);
    border-radius: 4px;
    color: var(--sf-text, #f4f4f5);
    font-size: 12px;
    padding: 5px 8px;
    outline: none;
    cursor: pointer;
  }

  select:focus { border-color: var(--sf-accent, #6366f1); }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--sf-accent, #6366f1);
  }
</style>
