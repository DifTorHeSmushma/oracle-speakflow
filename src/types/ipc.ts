// Shared IPC type definitions used by both electron-main.ts and the renderer preload.

import type { VoiceMode, VadConfig, CorrectionConfig, Dictionary } from "./voice.js";

export type AppState = "IDLE" | "LISTENING" | "RECORDING" | "TRANSCRIBING" | "CORRECTING" | "INJECTING";

export type TranscriptionMode = "local" | "remote";

// ---------------------------------------------------------------------------
// Local model tier types (M6 Wave 1.1 — G16)
// ---------------------------------------------------------------------------

export type ModelTier = "fast" | "balanced" | "accurate";

/** Main→renderer: tier availability + download state. */
export type TierStatusPayload = {
  tier: ModelTier;
  available: boolean;
  downloading: boolean;
  pct: number;
};

/** Renderer→main: disk check result for a tier. */
export type DiskCheckPayload = {
  tier: ModelTier;
  freeBytes: number;
  needBytes: number;
  ok: boolean;
};

export type StateChangePayload = {
  state: AppState;
  transcript?: string;
  error?: string;
};

export type HotkeyConfig = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keycode: number;
};

export type ConfigUpdatePayload = {
  groqApiKey?: string;
  hotkey?: HotkeyConfig;
  model?: string;
  language?: string;
  verbose?: boolean;
  transcriptionMode?: TranscriptionMode;
  voiceMode?: VoiceMode;
  vad?: VadConfig;
  correction?: CorrectionConfig;
  terminalVariantEnabled?: boolean;
  firstRunExplainerDismissed?: boolean;
};

export type VoiceSettingsPayload = {
  voiceMode: VoiceMode;
  vad: VadConfig;
  correction: CorrectionConfig;
  terminalVariantEnabled: boolean;
  firstRunExplainerDismissed: boolean;
};

export type DictionaryPayload = Dictionary;

// FR-M3-04: Payload sent from main→renderer when the MCP process calls a tool.
export type McpToolCallPayload = {
  tool: string;
  calledAt: string;
};

/** Snapshot of persisted config fields needed to hydrate Settings UI on open. */
export type ConfigSnapshotPayload = {
  transcriptionMode: TranscriptionMode;
  modelTier: ModelTier;
  model: string;
  language: string;
};

/** Dev-only: last pipeline execution summary for offline self-check (D item). */
export type LastPipelineStatusPayload = {
  transcriptionMode: TranscriptionMode;
  modelTier: ModelTier;
  lastErrorKind: string | null;
  clipboardWriteRan: boolean;
};

/** Platform capabilities — sent once after ready and on every renderer (re)load. */
export type PlatformCapsPayload = {
  platform: NodeJS.Platform;
  /** Linux session type; null on non-Linux. */
  session: "x11" | "wayland" | "unknown" | null;
  /** True iff PTT hotkey hook is operational (x11 + uIOhook.start succeeded; always true off-Linux). */
  pttAvailable: boolean;
  /** True iff auto-paste via keystrokes is supported this session (win32 ∨ darwin ∨ linux-x11). */
  autoPaste: boolean;
};
