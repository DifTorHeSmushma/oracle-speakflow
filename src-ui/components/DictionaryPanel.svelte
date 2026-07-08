<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Dictionary, DictEntry } from "../../src/types/voice.js";

  let dictionary: Dictionary = { version: 1, entries: [] };
  let spoken = "";
  let written = "";
  let matchMode: DictEntry["matchMode"] = "phrase";
  let statusMsg = "";
  let statusErr = false;
  let fileInput: HTMLInputElement;

  async function reload(): Promise<void> {
    if (!window.electronAPI?.getDictionary) return;
    dictionary = await window.electronAPI.getDictionary();
  }

  void reload();

  async function persist(): Promise<void> {
    if (!window.electronAPI?.saveDictionary) return;
    const result = await window.electronAPI.saveDictionary(dictionary);
    if (!result.ok) {
      flash(result.error ?? "Save failed", true);
      return;
    }
    flash("Dictionary saved");
  }

  function flash(msg: string, err = false): void {
    statusMsg = msg;
    statusErr = err;
    setTimeout(() => { statusMsg = ""; }, 2000);
  }

  function newId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function addEntry(): Promise<void> {
    const s = spoken.trim();
    const w = written.trim();
    if (!s || !w) {
      flash("Enter both spoken and written forms", true);
      return;
    }
    dictionary = {
      ...dictionary,
      entries: [
        ...dictionary.entries,
        { id: newId(), spoken: s, written: w, matchMode, enabled: true },
      ],
    };
    spoken = "";
    written = "";
    await persist();
  }

  async function removeEntry(id: string): Promise<void> {
    dictionary = {
      ...dictionary,
      entries: dictionary.entries.filter((e) => e.id !== id),
    };
    await persist();
  }

  async function toggleEntry(entry: DictEntry): Promise<void> {
    dictionary = {
      ...dictionary,
      entries: dictionary.entries.map((e) =>
        e.id === entry.id ? { ...e, enabled: !e.enabled } : e
      ),
    };
    await persist();
  }

  async function exportJson(): Promise<void> {
    if (!window.electronAPI?.exportDictionary) return;
    const json = await window.electronAPI.exportDictionary();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "speakflow-dictionary.json";
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported");
  }

  function triggerImport(): void {
    fileInput?.click();
  }

  async function onImportFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !window.electronAPI?.importDictionary) return;
    const text = await file.text();
    const result = await window.electronAPI.importDictionary(text);
    if (!result.ok) {
      flash(result.error ?? "Invalid dictionary file", true);
      return;
    }
    if (result.dictionary) dictionary = result.dictionary;
    else await reload();
    flash("Imported");
  }
</script>

<div class="dictionary-panel">
  <p class="intro">
    Replace spoken phrases with your preferred spelling before paste. Dictionary runs after transcription.
  </p>

  <div class="add-row">
    <input type="text" placeholder="Spoken (e.g. npm run type check)" bind:value={spoken} />
    <input type="text" placeholder="Written (e.g. npm run typecheck)" bind:value={written} />
    <select bind:value={matchMode} aria-label="Match mode">
      <option value="phrase">Phrase</option>
      <option value="word">Whole word</option>
    </select>
    <button type="button" class="btn primary" on:click={addEntry}>Add</button>
  </div>

  <div class="toolbar">
    <button type="button" class="btn" on:click={exportJson}>Export JSON</button>
    <button type="button" class="btn" on:click={triggerImport}>Import JSON</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" on:change={onImportFile} />
  </div>

  {#if statusMsg}
    <p class="status" class:error={statusErr}>{statusMsg}</p>
  {/if}

  {#if dictionary.entries.length === 0}
    <p class="empty">No entries yet — add terms you say often.</p>
  {:else}
    <ul class="entry-list">
      {#each dictionary.entries as entry (entry.id)}
        <li class="entry" class:disabled={!entry.enabled}>
          <label class="toggle">
            <input type="checkbox" checked={entry.enabled} on:change={() => toggleEntry(entry)} />
          </label>
          <span class="pair">
            <span class="spoken">{entry.spoken}</span>
            <span class="arrow">→</span>
            <span class="written">{entry.written}</span>
            <span class="mode">{entry.matchMode}</span>
          </span>
          <button type="button" class="btn danger" on:click={() => removeEntry(entry.id)} aria-label="Delete entry">✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dictionary-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .intro {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted);
    margin: 0;
    line-height: 1.4;
  }

  .add-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .add-row input,
  .add-row select {
    font-size: var(--sf-text-caption, 11px);
    padding: 5px 8px;
    border-radius: var(--sf-radius-sm, 6px);
    border: 1px solid var(--sf-border2, #3f3f46);
    background: var(--sf-surface2, #27272a);
    color: var(--sf-text, #e4e4e7);
  }

  .toolbar {
    display: flex;
    gap: 6px;
  }

  .btn {
    font-size: var(--sf-text-caption, 11px);
    padding: 4px 8px;
    border-radius: var(--sf-radius-sm, 6px);
    border: 1px solid var(--sf-border2, #3f3f46);
    background: var(--sf-surface2, #27272a);
    color: var(--sf-text, #e4e4e7);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--sf-accent, #6366f1);
    background: var(--sf-accent-bg, #1e1b4b);
    color: var(--sf-accent3, #a5b4fc);
  }

  .btn.danger {
    border: none;
    background: none;
    color: var(--sf-muted2, #71717a);
    padding: 0 4px;
  }

  .btn.danger:hover {
    color: var(--sf-error, #f87171);
  }

  .hidden {
    display: none;
  }

  .status {
    font-size: 10px;
    color: var(--sf-success, #22c55e);
    margin: 0;
  }

  .status.error {
    color: var(--sf-error, #f87171);
  }

  .empty {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted2);
    margin: 0;
  }

  .entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 160px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: var(--sf-radius-sm, 6px);
    background: var(--sf-surface2, #27272a);
    border: 1px solid var(--sf-border2, #3f3f46);
  }

  .entry.disabled {
    opacity: 0.55;
  }

  .toggle input {
    accent-color: var(--sf-accent, #6366f1);
  }

  .pair {
    flex: 1;
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .spoken {
    color: var(--sf-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrow {
    color: var(--sf-muted2);
    flex-shrink: 0;
  }

  .written {
    color: var(--sf-text);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mode {
    font-size: 9px;
    color: var(--sf-muted2);
    flex-shrink: 0;
  }
</style>
