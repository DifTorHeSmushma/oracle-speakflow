export type VoiceMode = "handsFree" | "ptt";

export type VadConfig = {
  positiveSpeechThreshold: number;
  negativeSpeechThreshold: number;
  minSpeechFrames: number;
  redemptionFrames: number;
  preSpeechPadFrames: number;
};

export type CorrectionConfig = {
  llmEnabled: boolean;
  llmLatencyBudgetMs: number;
};

export const DEFAULT_VAD_CONFIG: VadConfig = {
  positiveSpeechThreshold: 0.42,
  negativeSpeechThreshold: 0.28,
  minSpeechFrames: 6,
  redemptionFrames: 40,
  preSpeechPadFrames: 20,
};

export const DEFAULT_CORRECTION_CONFIG: CorrectionConfig = {
  llmEnabled: false,
  llmLatencyBudgetMs: 200,
};

export type DictEntry = {
  id: string;
  spoken: string;
  written: string;
  matchMode: "phrase" | "word";
  enabled: boolean;
};

export type Dictionary = {
  version: number;
  entries: DictEntry[];
};

export type VadError =
  | { kind: "modelNotFound"; message: string }
  | { kind: "modelIntegrity"; message: string }
  | { kind: "inferenceError"; message: string };
