import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { getBinaryPath, getBundledBinDir, getVerifiedModelPath } from "../utils/binaryPath.js";
import type { Result } from "../utils/result.js";
import { Ok, Err } from "../utils/result.js";
import type { ModelTier } from "../types/ipc.js";

export type { ModelTier };

export type TierSpec = {
  tier: ModelTier;
  filename: string;
  sizeBytes: number;
  source: "bundled" | "download";
  url?: string;
  minRamMB: number;
  batchAcceptable: boolean;
};

// Frozen per Spec §0 Q1 / Wave 1.1 commission §3.1. Sizes from STORM F2.
export const TIER_LADDER: Record<ModelTier, TierSpec> = {
  fast: {
    tier: "fast",
    filename: "ggml-tiny.en.bin",
    sizeBytes: 77_704_715,
    source: "bundled",
    minRamMB: 512,
    batchAcceptable: true,
  },
  balanced: {
    tier: "balanced",
    filename: "ggml-small.en-q5_1.bin",
    sizeBytes: 190_098_681,
    source: "download",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin",
    minRamMB: 1024,
    batchAcceptable: false,
  },
  accurate: {
    tier: "accurate",
    filename: "ggml-large-v3-turbo-q5_0.bin",
    sizeBytes: 574_041_195,
    source: "download",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    minRamMB: 2048,
    batchAcceptable: false,
  },
};

export type ModelResolveError =
  | { kind: "modelNotFound"; message: string }
  | { kind: "modelIntegrity"; message: string };

/**
 * Resolves the verified path for a tier's model file.
 * Searches bundled dir first, then userDataModelsDir (when provided).
 * Hard-blocks on SHA mismatch — Invariant #13, G16.
 *
 * @param tier - Model tier to resolve.
 * @param searchDirs - Ordered search directories. Defaults to [bundledBinDir].
 *   In Wave 2, pass [bundledBinDir, path.join(userData, "models")].
 */
export const resolveTierModel = (
  tier: ModelTier,
  searchDirs?: string[],
): Result<string, ModelResolveError> => {
  const spec = TIER_LADDER[tier];
  const dirs = searchDirs ?? [getBundledBinDir()];

  const result = getVerifiedModelPath(spec.filename, dirs);
  if (!result.ok) {
    const err = result.error;
    if (err.kind === "modelNotFound") return Err({ kind: "modelNotFound", message: err.message });
    return Err({ kind: "modelIntegrity", message: err.message });
  }
  return Ok(result.value);
};

/** True if the tier's model file exists AND passes SHA verification. */
export const isTierAvailable = (tier: ModelTier, searchDirs?: string[]): boolean =>
  resolveTierModel(tier, searchDirs).ok;
