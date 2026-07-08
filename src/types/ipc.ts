// Shared IPC type definitions used by both electron-main.ts and the renderer preload.

import type { VoiceMode, VadConfig, CorrectionConfig, Dictionary } from "./voice.js";

export type AppState = "IDLE" | "LISTENING" | "RECORDING" | "TRANSCRIBING" | "CORRECTING" | "INJECTING";

export type TranscriptionMode = "local" | "remote";

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
