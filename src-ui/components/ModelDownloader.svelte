<script lang="ts">
  /**
   * P3-T06: Model Downloader — shown when ggml-tiny.en.bin is absent from userData.
   * INVARIANT #13: hard-BLOCK on SHA256 mismatch (handled in main process; displayed here).
   */

  type DownloadState = "idle" | "downloading" | "verifying" | "done" | "error";

  export let onDone: (() => void) | undefined = undefined;

  let dlState: DownloadState = "idle";
  let progress = 0;
  let errorMsg = "";
  let unsubProgress: (() => void) | null = null;

  async function startDownload(): Promise<void> {
    if (!window.electronAPI) return;
    dlState   = "downloading";
    progress  = 0;
    errorMsg  = "";

    unsubProgress = window.electronAPI.onModelDownloadProgress((pct) => {
      progress = pct;
      if (pct === 100) dlState = "verifying";
    });

    try {
      await window.electronAPI.downloadModel();
      dlState = "done";
      onDone?.();
    } catch (err) {
      dlState  = "error";
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      unsubProgress?.();
      unsubProgress = null;
    }
  }
</script>

<div class="downloader">
  <div class="dl-header">
    <span class="dl-title">Local Whisper Model</span>
    <span class="dl-badge">{dlState === "done" ? "✓ Ready" : "Not downloaded"}</span>
  </div>

  {#if dlState === "idle"}
    <p class="dl-desc">
      Download <strong>ggml-tiny.en.bin</strong> (~75 MB) for local transcription.
      SHA-256 verified automatically.
    </p>
    <button class="dl-btn" on:click={startDownload}>Download Model</button>
  {:else if dlState === "downloading"}
    <div class="progress-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      <div class="progress-bar" style="width: {progress}%"></div>
    </div>
    <p class="dl-status">{progress}% — downloading…</p>
  {:else if dlState === "verifying"}
    <p class="dl-status">Verifying SHA-256…</p>
  {:else if dlState === "done"}
    <p class="dl-ok">Model ready — local transcription enabled.</p>
  {:else if dlState === "error"}
    <!-- INVARIANT #13: surface BLOCK reason clearly; never silent -->
    <p class="dl-error">{errorMsg}</p>
    <button class="dl-btn dl-retry" on:click={startDownload}>Retry</button>
  {/if}
</div>

<style>
  .downloader {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid var(--sf-border, #27272a);
  }

  .dl-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dl-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sf-text, #f4f4f5);
  }

  .dl-badge {
    font-size: 10px;
    color: var(--sf-muted, #a1a1aa);
    background: var(--sf-surface, #18181b);
    border: 1px solid var(--sf-border, #27272a);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .dl-desc {
    font-size: 11px;
    color: var(--sf-muted, #a1a1aa);
    line-height: 1.4;
  }

  .dl-btn {
    align-self: flex-start;
    background: none;
    border: 1px solid var(--sf-accent, #6366f1);
    color: var(--sf-accent, #6366f1);
    font-size: 11px;
    padding: 4px 12px;
    border-radius: var(--sf-radius, 0.5rem);
    cursor: pointer;
    transition: background 0.15s;
  }

  .dl-btn:hover { background: var(--sf-surface, #18181b); }
  .dl-retry { border-color: var(--sf-error, #f87171); color: var(--sf-error, #f87171); }

  .progress-wrap {
    height: 6px;
    background: var(--sf-surface, #18181b);
    border: 1px solid var(--sf-border, #27272a);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--sf-accent, #6366f1);
    transition: width 0.2s ease;
    border-radius: 3px;
  }

  .dl-status { font-size: 11px; color: var(--sf-muted, #a1a1aa); }
  .dl-ok     { font-size: 11px; color: var(--sf-success, #22c55e); }

  .dl-error {
    font-size: 11px;
    color: var(--sf-error, #f87171);
    word-break: break-word;
    line-height: 1.4;
  }
</style>
