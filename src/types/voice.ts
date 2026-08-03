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

/** Soft-finalize hangover: 79 × 32 ms ≈ 2.53 s (issue #6 hybrid pause budget). */
export const HYBRID_REDEMPTION_FRAMES = 79;

export const DEFAULT_VAD_CONFIG: VadConfig = {
  positiveSpeechThreshold: 0.42,
  negativeSpeechThreshold: 0.28,
  minSpeechFrames: 6,
  redemptionFrames: HYBRID_REDEMPTION_FRAMES,
  preSpeechPadFrames: 20,
};

/**
 * Hard floor for hybrid pause budget — stale .env / Settings UI must not
 * soft-finalize on ≤2.0 s mid-pauses (Gate A).
 */
export const clampVadForHybrid = (vad: VadConfig): VadConfig => {
  if (vad.redemptionFrames >= HYBRID_REDEMPTION_FRAMES) return vad;
  return { ...vad, redemptionFrames: HYBRID_REDEMPTION_FRAMES };
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
