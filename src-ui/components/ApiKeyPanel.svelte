<script lang="ts">
  // CLAUDE.md invariant #3: raw key NEVER appears in IPC event names, DOM text
  // nodes outside the input, or console logs. The masked constant is always used.
  const MASKED_DISPLAY = "sk-***";

  // Step 1: user enters current key to prove identity
  // Step 2: user enters new key and confirms
  type FlowStep = "idle" | "verify-current" | "enter-new";

  let step: FlowStep = "idle";
  let currentInput = "";
  let newInput = "";
  let verifyError = false;
  let verifying = false;
  let saved = false;

  async function startChangeFlow(): Promise<void> {
    // On fresh install (no key configured), skip verify step — there is nothing to protect.
    const hasKey = typeof window !== "undefined" && window.electronAPI
      ? await window.electronAPI.hasApiKey()
      : true;
    step = hasKey ? "verify-current" : "enter-new";
    currentInput = "";
    verifyError = false;
    saved = false;
  }

  function cancelAll(): void {
    step = "idle";
    currentInput = "";
    newInput = "";
    verifyError = false;
    verifying = false;
  }

  async function submitCurrentKey(): Promise<void> {
    const candidate = currentInput.trim();
    if (!candidate) return;

    verifying = true;
    verifyError = false;

    let verified = false;
    if (typeof window !== "undefined" && window.electronAPI) {
      verified = await window.electronAPI.verifyApiKey(candidate);
    }

    verifying = false;
    currentInput = ""; // clear immediately — raw value must not linger

    if (!verified) {
      verifyError = true;
      return;
    }

    step = "enter-new";
    newInput = "";
  }

  function confirmNewKey(): void {
    const trimmed = newInput.trim();
    if (!trimmed) return;

    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.sendConfigUpdate({ groqApiKey: trimmed });
    }

    newInput = ""; // clear immediately
    step = "idle";
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }

  function handleCurrentKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") { submitCurrentKey(); }
    if (e.key === "Escape") cancelAll();
  }

  function handleNewKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") confirmNewKey();
    if (e.key === "Escape") cancelAll();
  }
</script>

<div class="api-key-panel">
  <div class="panel-row">
    <span class="panel-label">API Key</span>
    <span class="masked-key">{MASKED_DISPLAY}</span>
    {#if step === "idle"}
      <button class="action-btn" on:click={startChangeFlow}>Change Key</button>
    {/if}
  </div>

  {#if step === "verify-current"}
    <div class="step-label">Enter current API key to continue:</div>
    <div class="edit-row">
      <input
        type="password"
        class="key-input"
        class:input-error={verifyError}
        bind:value={currentInput}
        placeholder="Current key..."
        on:keydown={handleCurrentKeydown}
        autocomplete="off"
        spellcheck={false}
        disabled={verifying}
        aria-label="Current API key"
      />
      <button
        class="action-btn save-btn"
        on:click={submitCurrentKey}
        disabled={!currentInput.trim() || verifying}
      >{verifying ? "…" : "Verify"}</button>
      <button class="action-btn cancel-btn" on:click={cancelAll}>✕</button>
    </div>
    {#if verifyError}
      <p class="error-notice">Incorrect key. Try again.</p>
    {/if}
  {/if}

  {#if step === "enter-new"}
    <div class="step-label">Enter new API key:</div>
    <div class="edit-row">
      <input
        type="password"
        class="key-input"
        bind:value={newInput}
        placeholder="sk-..."
        on:keydown={handleNewKeydown}
        autocomplete="off"
        spellcheck={false}
        aria-label="New API key"
      />
      <button
        class="action-btn save-btn"
        on:click={confirmNewKey}
        disabled={!newInput.trim()}
      >Confirm</button>
      <button class="action-btn cancel-btn" on:click={cancelAll}>✕</button>
    </div>
  {/if}

  {#if saved}
    <p class="saved-notice">API key updated.</p>
  {/if}
</div>

<style>
  .api-key-panel {
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

  .masked-key {
    font-size: 12px;
    font-family: monospace;
    color: #7a8a9a;
    flex: 1;
  }

  .step-label {
    font-size: 11px;
    color: #888;
  }

  .edit-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .key-input {
    flex: 1;
    background: #0d1520;
    border: 1px solid #2a3a5e;
    border-radius: 4px;
    color: #c0d0e0;
    font-size: 12px;
    padding: 4px 8px;
    outline: none;
  }

  .key-input:focus {
    border-color: #3b82f6;
  }

  .key-input.input-error {
    border-color: #f87171;
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
    white-space: nowrap;
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

  .error-notice {
    font-size: 11px;
    color: #f87171;
  }
</style>
