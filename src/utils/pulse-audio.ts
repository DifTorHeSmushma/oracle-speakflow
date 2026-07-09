/**
 * Linux FFmpeg pulse audio input (`-f pulse -i <source>`).
 * Covers PulseAudio (Ubuntu 22.04) and PipeWire via pipewire-pulse (Ubuntu 24.04).
 * Override with SPEAKFLOW_PULSE_AUDIO (a pactl source name, e.g. from `pactl list sources short`).
 */
export function resolvePulseAudioInput(): string {
  const override = process.env["SPEAKFLOW_PULSE_AUDIO"]?.trim();
  return override || "default";
}
