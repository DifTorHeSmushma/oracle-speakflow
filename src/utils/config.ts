import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Result, Ok, Err } from "./result.js";
import { DEFAULT_HOTKEY, HOTKEY_CONFIG_VERSION } from "./defaultHotkey.js";
import type { TranscriptionMode, ModelTier } from "../types/ipc.js";
import type { VoiceMode, VadConfig, CorrectionConfig } from "../types/voice.js";
import {
  DEFAULT_VAD_CONFIG,
  DEFAULT_CORRECTION_CONFIG,
  HYBRID_REDEMPTION_FRAMES,
  clampVadForHybrid,
} from "../types/voice.js";
export {
  DEFAULT_VAD_CONFIG,
  DEFAULT_CORRECTION_CONFIG,
  HYBRID_REDEMPTION_FRAMES,
  clampVadForHybrid,
} from "../types/voice.js";

export type ConfigSave = Partial<Config> & { hotkeyConfigVersion?: string; firstRunExplainerDismissed?: boolean };

export type Config = {
  groqApiKey: string;
  // keycode is a uiohook-napi hardware scan code (layout-independent).
  // UiohookKey.R = 19. See src/index.ts for usage.
  hotkey: { ctrl: boolean; shift: boolean; alt: boolean; keycode: number };
  model: string;
  language: string;
  transcriptionMode: TranscriptionMode;
  voiceMode: VoiceMode;
  vad: VadConfig;
  correction: CorrectionConfig;
  callAppAllowlist: string[];
  terminalVariantEnabled: boolean;
  modelTier: ModelTier;
};

export type ConfigError = { kind: "missingApiKey" } | { kind: "writeFailed"; message: string };

export const CONFIG_V3 = "3";
export const CONFIG_V4 = "4";
export const CONFIG_VERSION = "5";

const atLeast = (current: string | undefined, min: string): boolean =>
  current !== undefined && parseInt(current, 10) >= parseInt(min, 10);

export const DEFAULT_CALL_APP_ALLOWLIST = ["Zoom.exe", "Teams.exe", "ms-teams.exe", "Discord.exe"];

export const resolveDefaultLanguage = (
  env: NodeJS.ProcessEnv = process.env,
  intlLocale?: string
): string => {
  const locales: string[] = [];
  const push = (raw: string | undefined): void => {
    if (!raw) return;
    for (const part of raw.split(/[.:;,\s]+/)) {
      const t = part.trim();
      if (t) locales.push(t);
    }
  };
  push(env["SPEAKFLOW_OS_LOCALE"]);
  push(env["LANG"]);
  push(env["LC_ALL"]);
  push(env["LC_MESSAGES"]);
  try {
    push(intlLocale ?? Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    /* ignore */
  }
  for (const loc of locales) {
    const n = loc.toLowerCase().replace(/_/g, "-");
    if (n === "th" || n.startsWith("th-")) return "th";
  }
  return "en";
};

/**
 * Resolves the project root from the current working directory.
 * When run via npm scripts (npm run dev / start), cwd is always the project root.
 * For startup-task use, set GROQ_API_KEY as a Windows environment variable instead.
 */
export type LoadConfigOptions = {
  /** When true, values from the .env file replace existing process.env entries (userData wins). */
  envOverride?: boolean;
};

const loadEnvFile = (cwd: string, opts?: LoadConfigOptions): void => {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && (opts?.envOverride || !(key in process.env))) {
      process.env[key] = val;
    }
  }
};

/** One-time upgrade: persisted hotkeys from pre-F8 builds are replaced and version-stamped. */
const migrateHotkeyConfigV2 = (cwd: string): void => {
  if (process.env["SPEAKFLOW_HOTKEY_VERSION"] === HOTKEY_CONFIG_VERSION) return;
  saveConfig(cwd, { hotkey: DEFAULT_HOTKEY, hotkeyConfigVersion: HOTKEY_CONFIG_VERSION });
};

/**
 * One-time upgrade: adds voice/VAD/correction keys with defaults for new installs
 * and v2→v3 upgrades. Additive and non-destructive — never removes existing keys.
 * Default voiceMode is "handsFree" (A3 production rule — Spec §7, Gate G12).
 */
export const migrateConfigV3 = (cwd: string): void => {
  if (atLeast(process.env["SPEAKFLOW_CONFIG_VERSION"], CONFIG_V3)) return;

  const updates: ConfigSave & { configVersion?: string } = {};

  if (!process.env["SPEAKFLOW_VOICE_MODE"]) {
    updates.voiceMode = "handsFree";
  }
  if (!process.env["SPEAKFLOW_VAD"]) {
    updates.vad = DEFAULT_VAD_CONFIG;
  }
  if (!process.env["SPEAKFLOW_CORRECTION"]) {
    updates.correction = DEFAULT_CORRECTION_CONFIG;
  }
  if (!process.env["SPEAKFLOW_CALL_APP_ALLOWLIST"]) {
    updates.callAppAllowlist = DEFAULT_CALL_APP_ALLOWLIST;
  }
  if (!process.env["SPEAKFLOW_TERMINAL_VARIANT"]) {
    updates.terminalVariantEnabled = false;
  }

  updates.configVersion = CONFIG_V3;
  saveConfig(cwd, updates);
};

/**
 * One-time upgrade: adds modelTier="fast" default for new installs and v3→v4 upgrades.
 * Additive and non-destructive — never removes existing keys. G26.
 */
export const migrateConfigV4 = (cwd: string): void => {
  if (atLeast(process.env["SPEAKFLOW_CONFIG_VERSION"], CONFIG_V4)) return;

  const updates: ConfigSave & { configVersion?: string } = {};

  if (!process.env["SPEAKFLOW_MODEL_TIER"]) {
    updates.modelTier = "fast";
  }

  updates.configVersion = CONFIG_V4;
  saveConfig(cwd, updates);
};

/**
 * Issue #6: bump redemptionFrames to hybrid floor (≥79 / ~2.53 s).
 * Stale SPEAKFLOW_VAD with redemptionFrames=40 caused Gate A false finalize on ~1.3 s pauses.
 */
export const migrateConfigV5 = (cwd: string): void => {
  if (atLeast(process.env["SPEAKFLOW_CONFIG_VERSION"], CONFIG_VERSION)) return;

  const updates: ConfigSave & { configVersion?: string } = {};
  const vadRaw = process.env["SPEAKFLOW_VAD"]?.trim();
  if (vadRaw) {
    try {
      const parsed = JSON.parse(vadRaw) as VadConfig;
      const clamped = clampVadForHybrid(parsed);
      if (clamped.redemptionFrames !== parsed.redemptionFrames) {
        updates.vad = clamped;
        process.stderr.write(
          `[config] migrate v5: redemptionFrames ${parsed.redemptionFrames} → ${clamped.redemptionFrames}\n`
        );
      }
    } catch {
      updates.vad = DEFAULT_VAD_CONFIG;
    }
  } else {
    updates.vad = DEFAULT_VAD_CONFIG;
  }

  updates.configVersion = CONFIG_VERSION;
  saveConfig(cwd, updates);
};

export const saveConfig = (cwd: string, partial: ConfigSave & { configVersion?: string }): Result<void, ConfigError> => {
  const envPath = join(cwd, ".env");

  // Read current .env content (or start fresh)
  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, "utf-8").split("\n");
  }

  const updates: Record<string, string> = {};

  if (partial.groqApiKey !== undefined) {
    updates["GROQ_API_KEY"] = partial.groqApiKey;
  }
  if (partial.model !== undefined) {
    updates["SPEAKFLOW_MODEL"] = partial.model;
  }
  if (partial.language !== undefined) {
    updates["SPEAKFLOW_LANGUAGE"] = partial.language;
  }
  if (partial.hotkey !== undefined) {
    updates["SPEAKFLOW_HOTKEY"] = JSON.stringify(partial.hotkey);
  }
  if (partial.hotkeyConfigVersion !== undefined) {
    updates["SPEAKFLOW_HOTKEY_VERSION"] = partial.hotkeyConfigVersion;
  }
  if (partial.transcriptionMode !== undefined) {
    updates["SPEAKFLOW_TRANSCRIPTION_MODE"] = partial.transcriptionMode;
  }
  if (partial.voiceMode !== undefined) {
    updates["SPEAKFLOW_VOICE_MODE"] = partial.voiceMode;
  }
  if (partial.vad !== undefined) {
    updates["SPEAKFLOW_VAD"] = JSON.stringify(clampVadForHybrid(partial.vad));
  }
  if (partial.correction !== undefined) {
    updates["SPEAKFLOW_CORRECTION"] = JSON.stringify(partial.correction);
  }
  if (partial.callAppAllowlist !== undefined) {
    updates["SPEAKFLOW_CALL_APP_ALLOWLIST"] = JSON.stringify(partial.callAppAllowlist);
  }
  if (partial.terminalVariantEnabled !== undefined) {
    updates["SPEAKFLOW_TERMINAL_VARIANT"] = String(partial.terminalVariantEnabled);
  }
  if (partial.firstRunExplainerDismissed !== undefined) {
    updates["SPEAKFLOW_FIRST_RUN_DISMISSED"] = String(partial.firstRunExplainerDismissed);
  }
  if (partial.modelTier !== undefined) {
    updates["SPEAKFLOW_MODEL_TIER"] = partial.modelTier;
  }
  if ("configVersion" in partial && partial.configVersion !== undefined) {
    updates["SPEAKFLOW_CONFIG_VERSION"] = partial.configVersion;
  }

  // Merge updates into existing lines
  const updated = new Set<string>();
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const key = trimmed.slice(0, eq).trim();
    if (key in updates) {
      updated.add(key);
      // Update process.env immediately
      process.env[key] = updates[key];
      return `${key}=${updates[key] as string}`;
    }
    return line;
  });

  // Append any keys not already present
  for (const [key, value] of Object.entries(updates)) {
    if (!updated.has(key)) {
      process.env[key] = value;
      newLines.push(`${key}=${value}`);
    }
  }

  try {
    writeFileSync(envPath, newLines.join("\n"), "utf-8");
    return Ok(undefined);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ kind: "writeFailed", message });
  }
};

export const loadConfig = (
  cwd = process.cwd(),
  opts?: LoadConfigOptions
): Result<Config, ConfigError> => {
  loadEnvFile(cwd, opts);
  migrateHotkeyConfigV2(cwd);
  migrateConfigV3(cwd);
  migrateConfigV4(cwd);
  migrateConfigV5(cwd);

  const groqApiKey = process.env["GROQ_API_KEY"]?.trim();
  if (!groqApiKey) return Err({ kind: "missingApiKey" });

  // Persist user-overridden values via saveConfig; defaults apply on first run.
  const model = process.env["SPEAKFLOW_MODEL"]?.trim() ?? "whisper-large-v3-turbo";
  const language =
    process.env["SPEAKFLOW_LANGUAGE"]?.trim() || resolveDefaultLanguage(process.env);
  const hotkeyRaw = process.env["SPEAKFLOW_HOTKEY"]?.trim();
  const hotkey: Config["hotkey"] = hotkeyRaw
    ? (JSON.parse(hotkeyRaw) as Config["hotkey"])
    : DEFAULT_HOTKEY;

  const modeRaw = process.env["SPEAKFLOW_TRANSCRIPTION_MODE"]?.trim();
  const transcriptionMode: TranscriptionMode =
    modeRaw === "local" || modeRaw === "remote" ? modeRaw : "remote";

  const voiceModeRaw = process.env["SPEAKFLOW_VOICE_MODE"]?.trim();
  const voiceMode: VoiceMode =
    voiceModeRaw === "ptt" ? "ptt" : "handsFree";

  const vadRaw = process.env["SPEAKFLOW_VAD"]?.trim();
  const vad: VadConfig = clampVadForHybrid(
    vadRaw ? (JSON.parse(vadRaw) as VadConfig) : DEFAULT_VAD_CONFIG
  );

  const correctionRaw = process.env["SPEAKFLOW_CORRECTION"]?.trim();
  const correction: CorrectionConfig = correctionRaw
    ? (JSON.parse(correctionRaw) as CorrectionConfig)
    : DEFAULT_CORRECTION_CONFIG;

  const allowlistRaw = process.env["SPEAKFLOW_CALL_APP_ALLOWLIST"]?.trim();
  const callAppAllowlist: string[] = allowlistRaw
    ? (JSON.parse(allowlistRaw) as string[])
    : DEFAULT_CALL_APP_ALLOWLIST;

  const terminalVariantEnabled =
    process.env["SPEAKFLOW_TERMINAL_VARIANT"]?.trim() === "true";

  const modelTierRaw = process.env["SPEAKFLOW_MODEL_TIER"]?.trim();
  const modelTier: ModelTier =
    modelTierRaw === "fast" || modelTierRaw === "balanced" || modelTierRaw === "accurate"
      ? modelTierRaw
      : "fast";

  return Ok({
    groqApiKey,
    hotkey,
    model,
    language,
    transcriptionMode,
    voiceMode,
    vad,
    correction,
    callAppAllowlist,
    terminalVariantEnabled,
    modelTier,
  });
};
