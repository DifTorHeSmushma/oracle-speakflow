<script lang="ts">
  import StatusBar from "./components/StatusBar.svelte";
  import ListeningIndicator from "./components/ListeningIndicator.svelte";
  import MuteBar from "./components/MuteBar.svelte";
  import TranscriptPreview from "./components/TranscriptPreview.svelte";
  import SettingsModal from "./components/SettingsModal.svelte";
  import { Card, CardContent } from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { daemonStore } from "./stores/daemon.js";

  let showSettings = false;

  // FR-M3-04: MCP tool-call toast — shown when an external agent calls a tool.
  let mcpToast: string | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  if (typeof window !== "undefined" && window.electronAPI) {
    window.electronAPI.onMcpToolCall((payload) => {
      if (toastTimer !== null) clearTimeout(toastTimer);
      mcpToast = `Agent called: ${payload.tool}`;
      toastTimer = setTimeout(() => { mcpToast = null; toastTimer = null; }, 3000);
    });
  }

  function handleGlobalKey(e: KeyboardEvent): void {
    if (e.key === "Escape" && !showSettings) {
      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.hideWindow();
      }
    }
  }

  function quit(): void {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.quit();
    }
  }

  function stopRecording(): void {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.stopRecording();
    }
  }
</script>

<svelte:window on:keydown={handleGlobalKey} />

<main class="shell">

  <!-- Header card -->
  <Card class="header-card">
    <CardContent class="header-content">
      <div class="brand">
        <span class="brand-name">Oracle SpeakFlow</span>
        <span class="brand-version">v0.1</span>
      </div>
      <div class="header-actions">
        {#if $daemonStore.state === "RECORDING"}
          <Button variant="destructive" size="sm" on:click={stopRecording}>Stop</Button>
        {/if}
        <Button variant="ghost" size="sm" on:click={() => (showSettings = true)}>Settings</Button>
        <Button variant="ghost" size="sm" on:click={quit} class="quit-btn">✕</Button>
      </div>
    </CardContent>
  </Card>

  <!-- Status card -->
  <Card class="status-card" data-state={$daemonStore.state}>
    <CardContent class="status-content">
      <ListeningIndicator />
      <StatusBar />
    </CardContent>
  </Card>

  <!-- Kill-switch: full-width so it cannot be clipped in the narrow header -->
  <MuteBar />

  <!-- Transcript card -->
  <Card class="transcript-section">
    <CardContent class="transcript-content">
      <TranscriptPreview />
    </CardContent>
  </Card>

  <!-- Footer strip with support links (M5-T06) -->
  <div class="footer-strip">
    <span class="footer-hint">Click bar below status to mute</span>
    <div class="footer-links">
      <button class="link-btn" on:click={() => window.electronAPI?.openExternal("https://www.buymeacoffee.com/oraclespeakflow")} title="Buy Me a Coffee">☕</button>
      <button class="link-btn" on:click={() => window.electronAPI?.openExternal("https://github.com/sponsors/DifTorHeSmushma")} title="GitHub Sponsors">❤</button>
    </div>
  </div>

  {#if showSettings}
    <SettingsModal on:close={() => (showSettings = false)} />
  {/if}

  <!-- FR-M3-04: MCP tool-call toast -->
  {#if mcpToast !== null}
    <div class="mcp-toast">{mcpToast}</div>
  {/if}
</main>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: var(--sf-font);
    background: var(--sf-bg);
    color: var(--sf-text);
    width: 320px;
    height: 500px;
    overflow: hidden;
    user-select: none;
    font-size: var(--sf-text-body);
  }

  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 8px;
    gap: 6px;
    background: var(--sf-bg);
  }

  :global(.header-card) { flex-shrink: 0; }
  :global(.header-content) {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 8px 10px !important;
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .brand-name {
    font-size: var(--sf-text-title);
    font-weight: 600;
    color: var(--sf-text);
    letter-spacing: 0.3px;
  }

  .brand-version {
    font-size: var(--sf-text-micro);
    color: var(--sf-muted2);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  :global(.quit-btn) {
    color: var(--sf-muted2) !important;
    padding: 0 6px !important;
  }
  :global(.quit-btn:hover) {
    color: var(--sf-error) !important;
  }

  /* State-colored left border on status card */
  :global(.status-card) {
    flex-shrink: 0;
    border-left-width: 2px !important;
    transition: border-color 0.2s;
  }
  :global(.status-card[data-state="IDLE"])         { border-left-color: var(--sf-border) !important; }
  :global(.status-card[data-state="LISTENING"])    { border-left-color: var(--sf-success) !important; }
  :global(.status-card[data-state="RECORDING"])    { border-left-color: var(--sf-accent) !important; }
  :global(.status-card[data-state="TRANSCRIBING"]) { border-left-color: var(--sf-warn) !important; }
  :global(.status-card[data-state="CORRECTING"])  { border-left-color: var(--sf-warn) !important; }
  :global(.status-card[data-state="INJECTING"])    { border-left-color: var(--sf-success) !important; }
  :global(.status-card[data-state="ERROR"])        { border-left-color: var(--sf-error) !important; }

  :global(.status-content) {
    padding: 8px 10px !important;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :global(.transcript-section) { flex: 1; overflow: hidden; }
  :global(.transcript-content) {
    height: 100% !important;
    padding: 8px 10px !important;
    overflow: hidden;
  }

  .footer-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 2px;
    flex-shrink: 0;
  }

  .footer-hint {
    font-size: var(--sf-text-micro);
    color: var(--sf-muted2);
  }

  kbd {
    font-family: var(--sf-mono);
    font-size: 9px;
    background: var(--sf-surface2);
    border: 1px solid var(--sf-border2);
    border-radius: 3px;
    padding: 0 3px;
    color: var(--sf-text2);
  }

  .footer-links { display: flex; gap: 4px; }

  .link-btn {
    background: none;
    border: 1px solid var(--sf-border);
    border-radius: var(--sf-radius-sm);
    font-size: 11px;
    padding: 2px 6px;
    cursor: pointer;
    color: var(--sf-muted);
    transition: background 0.15s, border-color 0.15s;
    line-height: 1;
  }

  .link-btn:hover {
    background: var(--sf-surface2);
    border-color: var(--sf-border2);
  }

  .mcp-toast {
    position: absolute;
    bottom: 8px;
    left: 8px;
    right: 8px;
    background: var(--sf-surface);
    border: 1px solid var(--sf-accent);
    color: var(--sf-text);
    font-size: var(--sf-text-caption);
    padding: 6px 10px;
    border-radius: var(--sf-radius);
    text-align: center;
    pointer-events: none;
    animation: toast-fade 3s ease forwards;
    z-index: 200;
  }

  @keyframes toast-fade {
    0%   { opacity: 1; }
    70%  { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
