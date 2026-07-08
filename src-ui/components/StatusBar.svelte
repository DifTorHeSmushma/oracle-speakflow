<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { daemonStore } from "../stores/daemon.js";
  import type { DaemonStore } from "../stores/daemon.js";
  import { startProceduralWaveform, drawFlatLine, type WaveformSession } from "../utils/waveform.js";

  let current: DaemonStore = { state: "IDLE" };
  let elapsed = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  let canvas: HTMLCanvasElement | null = null;
  let waveSession: WaveformSession | null = null;
  let rafId: number | null = null;
  let waveMode: "listening" | "recording" | null = null;

  function startRaf(): void {
    if (rafId !== null) return;
    const tickFrame = () => {
      if (canvas) {
        if (waveSession) waveSession.draw(canvas);
        else             drawFlatLine(canvas);
      }
      rafId = requestAnimationFrame(tickFrame);
    };
    rafId = requestAnimationFrame(tickFrame);
  }

  function stopRaf(): void {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function startWaveform(mode: "listening" | "recording"): void {
    if (!canvas) return;
    if (waveMode !== mode) {
      waveSession?.stop();
      waveSession = startProceduralWaveform(mode);
      waveMode = mode;
    }
    startRaf();
  }

  function stopAudio(): void {
    stopRaf();
    waveSession?.stop();
    waveSession = null;
    waveMode = null;
    if (canvas) drawFlatLine(canvas);
  }

  function waveformModeFor(state: DaemonStore["state"]): "listening" | "recording" | null {
    if (state === "LISTENING") return "listening";
    if (state === "RECORDING") return "recording";
    return null;
  }

  async function syncWaveform(state: DaemonStore["state"]): Promise<void> {
    const mode = waveformModeFor(state);
    if (!mode) {
      stopAudio();
      return;
    }
    // {#if showWaveform} mounts canvas after state updates — wait for bind.
    await tick();
    if (waveformModeFor(current.state) !== mode) return;
    startWaveform(mode);
  }

  const unsub = daemonStore.subscribe((s) => {
    current = s;
    if (s.state === "RECORDING") {
      elapsed = 0;
      if (!intervalId) {
        intervalId = setInterval(() => { elapsed += 1; }, 1000);
      }
    } else if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    void syncWaveform(s.state);
  });

  function canvasMount(node: HTMLCanvasElement): { destroy: () => void } {
    canvas = node;
    const mode = waveformModeFor(current.state);
    if (mode) startWaveform(mode);
    return {
      destroy() {
        if (canvas === node) canvas = null;
      },
    };
  }

  onDestroy(() => {
    unsub();
    if (intervalId) clearInterval(intervalId);
    stopAudio();
  });

  $: label = {
    IDLE:         "Idle — hold F8 to record",
    LISTENING:    "Listening — speak anytime",
    RECORDING:    `Recording… ${elapsed}s`,
    TRANSCRIBING: "Transcribing…",
    CORRECTING:   "Correcting…",
    INJECTING:    "Pasting…",
  }[current.state] ?? "Idle";

  $: dotColor = {
    IDLE:         "var(--sf-muted2)",
    LISTENING:    "var(--sf-success)",
    RECORDING:    "var(--sf-accent)",
    TRANSCRIBING: "var(--sf-warn)",
    CORRECTING:   "var(--sf-warn)",
    INJECTING:    "var(--sf-success)",
    ERROR:        "var(--sf-error)",
  }[current.state as string] ?? "var(--sf-muted2)";

  $: showWaveform = current.state === "LISTENING" || current.state === "RECORDING";
  $: waveformClass = current.state === "LISTENING" ? "listening" : "recording";
</script>

<div class="status-bar" data-state={current.state}>

  <div class="state-row">
    <span
      class="dot"
      style="background:{dotColor}"
      class:pulse={current.state === "RECORDING"}
      class:pulse-listen={current.state === "LISTENING"}
    ></span>
    <span class="label">{label}</span>

    {#if current.state === "TRANSCRIBING" || current.state === "CORRECTING" || current.state === "INJECTING"}
      <span class="spinner" aria-hidden="true"></span>
    {/if}
  </div>

  {#if showWaveform}
    <div class="waveform-region" class:listening={waveformClass === "listening"}>
      <canvas
        use:canvasMount
        width="276"
        height="36"
        class="waveform-canvas"
        aria-hidden="true"
      ></canvas>
    </div>
  {/if}

  {#if current.error}
    <div class="error-banner">{current.error}</div>
  {/if}
</div>

<style>
  .status-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .state-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.2s;
  }

  .dot.pulse {
    animation: dot-pulse 1s ease-in-out infinite;
    box-shadow: 0 0 0 0 var(--sf-accent);
  }

  .dot.pulse-listen {
    animation: dot-pulse-listen 1.6s ease-in-out infinite;
    box-shadow: 0 0 0 0 var(--sf-success);
  }

  @keyframes dot-pulse {
    0%   { transform: scale(1);   box-shadow: 0 0 0 0 rgba(99,102,241,0.7); }
    70%  { transform: scale(1.1); box-shadow: 0 0 0 5px rgba(99,102,241,0); }
    100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(99,102,241,0); }
  }

  @keyframes dot-pulse-listen {
    0%   { transform: scale(1);   box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
    70%  { transform: scale(1.08); box-shadow: 0 0 0 4px rgba(34,197,94,0); }
    100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }

  .label {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted, #a1a1aa);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    font-weight: 500;
  }

  [data-state="LISTENING"]    .label { color: var(--sf-success, #22c55e); }
  [data-state="RECORDING"]    .label { color: var(--sf-accent3, #818cf8); }
  [data-state="TRANSCRIBING"] .label { color: var(--sf-warn, #eab308); }
  [data-state="CORRECTING"]   .label { color: var(--sf-warn, #eab308); }
  [data-state="INJECTING"]    .label { color: var(--sf-success, #22c55e); }
  [data-state="ERROR"]        .label { color: var(--sf-error, #f87171); }

  .spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  [data-state="TRANSCRIBING"] .spinner,
  [data-state="CORRECTING"] .spinner {
    border-top-color: var(--sf-warn, #eab308);
    border-right-color: #eab30860;
  }

  [data-state="INJECTING"] .spinner {
    border-top-color: var(--sf-success, #22c55e);
    border-right-color: #22c55e60;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .waveform-region {
    background: var(--sf-accent-bg, #1e1b4b);
    border: 1px solid var(--sf-accent, #6366f1);
    border-radius: var(--sf-radius-sm, 6px);
    padding: 4px;
    overflow: hidden;
  }

  .waveform-region.listening {
    background: #14532d33;
    border-color: var(--sf-success, #22c55e);
  }

  .waveform-canvas {
    display: block;
    width: 100%;
    height: 36px;
    border-radius: 3px;
  }

  .error-banner {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-error, #f87171);
    background: var(--sf-error-bg, #1c0a0a);
    border: 1px solid var(--sf-error, #f87171);
    border-radius: var(--sf-radius-sm, 6px);
    padding: 4px 8px;
  }
</style>
