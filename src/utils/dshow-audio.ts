import { spawnSync } from "node:child_process";

let cachedInput: string | null = null;

/**
 * Parse `ffmpeg -list_devices` stderr for the first DirectShow audio input.
 * Prefers the stable @device_cm_… alternative name; falls back to friendly name.
 */
export function parseFirstDshowAudioInput(listDevicesStderr: string): string | null {
  const lines = listDevicesStderr.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.includes("(audio)")) continue;

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const alt = /Alternative name\s+"(@device_[^"]+)"/.exec(lines[j] ?? "");
      if (alt?.[1]) return `audio=${alt[1]}`;
    }

    const friendly = /"([^"]+)"\s*\(audio\)/.exec(line);
    if (friendly?.[1]) return `audio=${friendly[1]}`;
  }
  return null;
}

/**
 * Resolve the FFmpeg `-i` argument for the default Windows microphone.
 * Override with SPEAKFLOW_DSHOW_AUDIO (with or without the `audio=` prefix).
 */
export function resolveDshowAudioInput(ffmpegPath: string): string {
  const envOverride = process.env["SPEAKFLOW_DSHOW_AUDIO"]?.trim();
  if (envOverride) {
    return envOverride.startsWith("audio=") ? envOverride : `audio=${envOverride}`;
  }
  if (cachedInput) return cachedInput;

  const probe = spawnSync(ffmpegPath, ["-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const stderr = `${probe.stderr ?? ""}${probe.stdout ?? ""}`;
  const parsed = parseFirstDshowAudioInput(stderr);
  if (parsed) {
    cachedInput = parsed;
    return parsed;
  }

  // Legacy fallback — may fail on newer FFmpeg builds (wave:{guid} is malformed).
  return "audio=@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave:{00000000-0000-0000-0000-000000000000}";
}

/** Unit tests only — clears the probe cache between cases. */
export const _resetDshowCacheForTest = (): void => {
  cachedInput = null;
};
