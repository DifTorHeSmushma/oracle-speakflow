/**
 * macOS FFmpeg avfoundation audio input (`-f avfoundation -i :N`).
 * Override with SPEAKFLOW_AVF_AUDIO (device index only, e.g. `0`).
 */
export function resolveAvfAudioInput(): string {
  const override = process.env["SPEAKFLOW_AVF_AUDIO"]?.trim();
  if (override) {
    const idx = override.startsWith(":") ? override.slice(1) : override;
    return `:${idx}`;
  }
  return ":0";
}
