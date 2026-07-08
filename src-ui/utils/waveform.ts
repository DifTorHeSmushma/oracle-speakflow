/**
 * P3-T03: Waveform renderer for RECORDING state.
 *
 * FFmpeg (main process, dshow) is the sole mic owner — Invariant #17.
 * The renderer must never call getUserMedia. Use startProceduralWaveform() only.
 *
 * INVARIANT #6: Read-only — never modifies app state or daemonStore.
 */

export interface WaveformSession {
  /** Call once per animation frame from the component's rAF loop. */
  draw(canvas: HTMLCanvasElement): void;
  /** Release resources. */
  stop(): void;
}

/**
 * Animated waveform without microphone access (PIV Gate B — FFmpeg owns the mic).
 * @param mode `recording` = active indigo wave; `listening` = softer green idle-armed wave
 */
export function startProceduralWaveform(mode: "recording" | "listening" = "recording"): WaveformSession {
  let t = 0;
  const listening = mode === "listening";

  return {
    draw(canvas: HTMLCanvasElement): void {
      const w = canvas.width;
      const h = canvas.height;
      const c = canvas.getContext("2d");
      if (!c) return;

      t += listening ? 0.06 : 0.12;

      c.clearRect(0, 0, w, h);
      c.fillStyle = listening ? "#14532d22" : "#27272a";
      c.fillRect(0, 0, w, h);

      c.beginPath();
      c.strokeStyle = listening ? "#22c55e" : "#6366f1";
      c.lineWidth = listening ? 1.25 : 1.5;
      c.lineJoin = "round";

      const mid = h / 2;
      const points = 64;
      const sliceWidth = w / points;
      const amp = listening ? 0.1 : 0.22;
      let x = 0;
      for (let i = 0; i < points; i++) {
        const v =
          Math.sin(t * (listening ? 1.8 : 2.4) + i * 0.35) * amp +
          Math.sin(t * (listening ? 3.2 : 5.1) + i * 0.12) * (listening ? 0.05 : 0.1) +
          (listening ? 0.04 : 0.08);
        const y = mid + v * h;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
        x += sliceWidth;
      }
      c.stroke();
    },

    stop(): void {
      t = 0;
    },
  };
}

/**
 * Draw a static flat line on the canvas (fallback when not RECORDING).
 */
export function drawFlatLine(canvas: HTMLCanvasElement): void {
  const w = canvas.width;
  const h = canvas.height;
  const c = canvas.getContext("2d");
  if (!c) return;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#27272a";
  c.fillRect(0, 0, w, h);
  c.beginPath();
  c.strokeStyle = "#3f3f46"; // zinc-700 — subtle flat line
  c.lineWidth   = 1;
  c.moveTo(0, h / 2);
  c.lineTo(w, h / 2);
  c.stroke();
}
