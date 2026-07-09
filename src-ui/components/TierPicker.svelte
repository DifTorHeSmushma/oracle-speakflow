<script lang="ts">
  import { onMount } from "svelte";
  import { daemonStore } from "../stores/daemon.js";
  import type { ModelTier, TierStatusPayload } from "../../src/types/ipc.js";

  export let selectedTier: ModelTier = "fast";

  type TierMeta = {
    tier: ModelTier;
    label: string;
    size: string;
    minRam: string;
    source: "bundled" | "download";
    recommended?: boolean;
  };

  const TIER_META: TierMeta[] = [
    {
      tier: "fast",
      label: "Fast",
      size: "78 MB",
      minRam: "~0.5 GB RAM",
      source: "bundled",
    },
    {
      tier: "balanced",
      label: "Balanced",
      size: "190 MB",
      minRam: "~1.0 GB RAM",
      source: "download",
      recommended: true,
    },
    {
      tier: "accurate",
      label: "Accurate",
      size: "574 MB",
      minRam: "~2.0 GB RAM",
      source: "download",
    },
  ];

  let tierStatus: TierStatusPayload[] = [];
  let downloadingTier: ModelTier | null = null;
  let downloadPct = 0;
  let errorMsg = "";

  $: pipelineActive = $daemonStore.state !== "IDLE" && $daemonStore.state !== "LISTENING";

  function statusFor(tier: ModelTier): TierStatusPayload | undefined {
    return tierStatus.find((s) => s.tier === tier);
  }

  onMount(async () => {
    if (!window.electronAPI) return;
    const status = await window.electronAPI.getTierStatus?.();
    if (status) tierStatus = status;

    const unsub = window.electronAPI.onModelDownloadProgress?.((pct) => {
      downloadPct = pct;
    });
    return () => unsub?.();
  });

  async function download(tier: ModelTier): Promise<void> {
    if (!window.electronAPI || downloadingTier !== null) return;
    const disk = await window.electronAPI.checkDisk?.(tier);
    if (disk && !disk.ok) {
      const needMB = Math.round(disk.needBytes / 1024 / 1024);
      const freeMB = Math.round(disk.freeBytes / 1024 / 1024);
      errorMsg = `Need ${needMB} MB free, have ${freeMB} MB`;
      return;
    }
    errorMsg = "";
    downloadingTier = tier;
    downloadPct = 0;
    try {
      const result = await window.electronAPI.downloadTier?.(tier);
      if (result && !result.ok) {
        errorMsg = result.error ?? "Download failed";
      } else {
        const status = await window.electronAPI.getTierStatus?.();
        if (status) tierStatus = status;
      }
    } finally {
      downloadingTier = null;
    }
  }

  function cancelDownload(): void {
    window.electronAPI?.cancelTierDownload?.();
  }

  function selectTier(tier: ModelTier): void {
    selectedTier = tier;
  }
</script>

<div class="tier-picker">
  <p class="section-label">Model tier</p>

  {#each TIER_META as meta}
    {@const status = statusFor(meta.tier)}
    {@const available = status?.available ?? (meta.source === "bundled")}
    {@const isDownloading = downloadingTier === meta.tier}
    {@const isSelected = selectedTier === meta.tier}

    <button
      class="tier-row"
      class:tier-row--selected={isSelected}
      class:tier-row--disabled={pipelineActive && !available}
      on:click={() => available && !pipelineActive ? selectTier(meta.tier) : undefined}
      disabled={!available || pipelineActive}
    >
      <div class="tier-left">
        <span class="tier-name">{meta.label}</span>
        {#if meta.recommended}
          <span class="tier-badge recommended">Recommended</span>
        {/if}
        {#if meta.source === "bundled"}
          <span class="tier-badge bundled">Bundled</span>
        {/if}
        {#if isSelected}
          <span class="tier-badge active">Active</span>
        {/if}
      </div>
      <div class="tier-right">
        <span class="tier-size">{meta.size}</span>
        <span class="tier-ram">{meta.minRam}</span>
      </div>
    </button>

    {#if !available && !isDownloading}
      <button
        class="dl-btn"
        on:click|stopPropagation={() => download(meta.tier)}
        disabled={pipelineActive || downloadingTier !== null}
      >
        Download
      </button>
    {:else if isDownloading}
      <div class="dl-progress-wrap">
        <div
          class="dl-progress-bar"
          role="progressbar"
          aria-valuenow={downloadPct}
          aria-valuemin={0}
          aria-valuemax={100}
          style="width: {downloadPct}%"
        ></div>
      </div>
      <div class="dl-row">
        <span class="dl-pct">{downloadPct}%</span>
        <button class="cancel-btn" on:click={cancelDownload}>Cancel</button>
      </div>
    {/if}
  {/each}

  {#if errorMsg}
    <p class="tier-error">{errorMsg}</p>
  {/if}
</div>

<style>
  .tier-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: var(--sf-text-caption, 11px);
    font-weight: 600;
    color: var(--sf-muted, #a1a1aa);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 2px;
  }

  .tier-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--sf-surface, #18181b);
    border: 1px solid var(--sf-border, #27272a);
    border-radius: var(--sf-radius-sm, 4px);
    padding: 7px 10px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.12s, background 0.12s;
  }

  .tier-row:hover:not(:disabled) {
    border-color: var(--sf-border2, #3f3f46);
    background: var(--sf-surface2, #27272a);
  }

  .tier-row--selected {
    border-color: var(--sf-accent, #6366f1) !important;
  }

  .tier-row--disabled,
  .tier-row:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tier-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tier-name {
    font-size: var(--sf-text-caption, 11px);
    font-weight: 600;
    color: var(--sf-text, #f4f4f5);
  }

  .tier-badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    line-height: 1.6;
  }

  .recommended {
    background: color-mix(in srgb, var(--sf-accent, #6366f1) 20%, transparent);
    color: var(--sf-accent, #6366f1);
    border: 1px solid color-mix(in srgb, var(--sf-accent, #6366f1) 40%, transparent);
  }

  .bundled {
    background: color-mix(in srgb, var(--sf-success, #22c55e) 15%, transparent);
    color: var(--sf-success, #22c55e);
    border: 1px solid color-mix(in srgb, var(--sf-success, #22c55e) 30%, transparent);
  }

  .active {
    background: color-mix(in srgb, var(--sf-accent2, #8b5cf6) 20%, transparent);
    color: var(--sf-accent2, #8b5cf6);
    border: 1px solid color-mix(in srgb, var(--sf-accent2, #8b5cf6) 40%, transparent);
  }

  .tier-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    flex-shrink: 0;
  }

  .tier-size {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-text, #f4f4f5);
  }

  .tier-ram {
    font-size: 10px;
    color: var(--sf-muted, #a1a1aa);
  }

  .dl-btn {
    align-self: flex-start;
    background: none;
    border: 1px solid var(--sf-accent, #6366f1);
    color: var(--sf-accent, #6366f1);
    font-size: 10px;
    padding: 2px 10px;
    border-radius: var(--sf-radius-sm, 4px);
    cursor: pointer;
    transition: background 0.12s;
    margin-top: -2px;
  }

  .dl-btn:hover:not(:disabled) { background: var(--sf-surface2, #27272a); }
  .dl-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .dl-progress-wrap {
    height: 4px;
    background: var(--sf-surface, #18181b);
    border: 1px solid var(--sf-border, #27272a);
    border-radius: 2px;
    overflow: hidden;
    margin-top: -2px;
  }

  .dl-progress-bar {
    height: 100%;
    background: var(--sf-accent, #6366f1);
    transition: width 0.15s ease;
    border-radius: 2px;
  }

  .dl-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dl-pct {
    font-size: 10px;
    color: var(--sf-muted, #a1a1aa);
  }

  .cancel-btn {
    background: none;
    border: none;
    color: var(--sf-error, #f87171);
    font-size: 10px;
    cursor: pointer;
    padding: 0;
  }

  .tier-error {
    font-size: 10px;
    color: var(--sf-error, #f87171);
    word-break: break-word;
    line-height: 1.4;
  }
</style>
