/**
 * Issue #6 stream hygiene — reject Whisper silence hallucinations and
 * unsafe merges before live-insert paste.
 */

/** Known Whisper empty-audio / YouTube-outro hallucination phrases. */
const HALLUCINATION_EXACT = new Set([
  "thank you",
  "thanks",
  "thanks for watching",
  "thank you for watching",
  "thanks for listening",
  "thank you.",
  "thanks.",
  "you",
  "the end",
  "subscribe",
  "bye",
  "goodbye",
  "please subscribe",
  "like and subscribe",
]);

const HALLUCINATION_SUBSTRINGS = [
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "like and subscribe",
  // Dom A2 Whisper loop — flag even a single occurrence in a chunk
  "every course of the day",
  "字幕",
  "字幕by",
  // Whisper silence often echoes FINALIZE_PROMPT fragments (Dom study paste spam)
  "do not invent words",
  "do not invent filler",
  "dictate only spoken words",
  "verbatim transcript only",
  "tested it here or thanks",
  "transcribe exactly what was spoken",
  "product name is speakflow",
];

/** Normalized whitespace + lowercase for matching. */
export const normalizeForHygiene = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * True when text looks like a Whisper hallucination on silence/noise
 * (classic "thank you" / looping outro), not real dictation.
 */
export const isLikelyWhisperHallucination = (text: string): boolean => {
  const n = normalizeForHygiene(text);
  if (!n) return true;
  if (HALLUCINATION_EXACT.has(n)) return true;
  for (const sub of HALLUCINATION_SUBSTRINGS) {
    if (n.includes(sub)) return true;
  }
  // Whisper loop = phrase ×3+. A single intentional double (Dom #13:
  // "testing speakflow 123 testing speakflow 123") must paste, not discard.
  const words = n.split(" ");
  if (words.length >= 9) {
    const third = Math.floor(words.length / 3);
    if (third >= 3) {
      const a = words.slice(0, third).join(" ");
      const b = words.slice(third, third * 2).join(" ");
      const c = words.slice(third * 2, third * 3).join(" ");
      if (a.length >= 12 && a === b && b === c) return true;
    }
  }
  // Adjacent n-gram ×3+ (not ×2 — doubles are real dictation)
  for (let len = 3; len <= 8; len++) {
    for (let start = 0; start + len * 3 <= words.length; start++) {
      const a = words.slice(start, start + len).join(" ");
      const b = words.slice(start + len, start + len * 2).join(" ");
      const c = words.slice(start + len * 2, start + len * 3).join(" ");
      if (a.length >= 10 && a === b && b === c) return true;
    }
  }
  // Fuzzy thank-you (Whisper sometimes mangling)
  if (/\bt?ch?ank\s+you\b/.test(n) || /\bthank\s+you\b/.test(n)) {
    // Alone or trailing after short garbage
    if (words.length <= 8) return true;
  }
  return false;
};

/**
 * Peak |sample| of s16le PCM inside a WAV (skips 44-byte header).
 * Mean RMS over a whole 1.5s window dilutes brief speech with silence — peak is safer.
 */
export const wavPcmPeak = (wav: Buffer): number => {
  if (wav.length <= 44) return 0;
  const pcm = wav.subarray(44);
  if (pcm.length < 2) return 0;
  let peak = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let i = 0; i < samples; i++) {
    const abs = Math.abs(pcm.readInt16LE(i * 2) / 32768);
    if (abs > peak) peak = abs;
  }
  return peak;
};

/**
 * RMS of s16le PCM inside a WAV buffer (skips 44-byte header).
 * Returns 0 for empty/invalid.
 */
export const wavPcmRms = (wav: Buffer): number => {
  if (wav.length <= 44) return 0;
  const pcm = wav.subarray(44);
  if (pcm.length < 2) return 0;
  let sumSq = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let i = 0; i < samples; i++) {
    const s = pcm.readInt16LE(i * 2) / 32768;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples);
};

/**
 * Default speech gate (post-gain peak). Overnight 0.012 mean-RMS skipped real speech
 * in Notepad (Dom: "did not work at all"). Peak ≥ 0.025 ≈ quiet talk after micGain.
 */
export const DEFAULT_CHUNK_MIN_PEAK = 0.025;
/** @deprecated kept for tests — prefer peak gate */
export const DEFAULT_CHUNK_MIN_RMS = 0.004;

export const chunkHasSpeechEnergy = (
  wav: Buffer,
  minPeak: number = DEFAULT_CHUNK_MIN_PEAK
): boolean => wavPcmPeak(wav) >= minPeak;

export type MergeDecision =
  | { accept: true; merged: string }
  | { accept: false; reason: string };

/**
 * Safe merge of a new chunk transcript into assembled live text.
 * Rejects hallucinations and blind appends of unrelated phrases
 * (the path that produced Dom's "Tchank you / every course of the day" loop).
 */
export const decideChunkMerge = (previous: string, nextRaw: string): MergeDecision => {
  const next = nextRaw.trim();
  if (!next) return { accept: false, reason: "empty-chunk" };
  if (isLikelyWhisperHallucination(next)) {
    return { accept: false, reason: "hallucination" };
  }

  const prev = previous.trim();
  if (!prev) return { accept: true, merged: next };

  if (next.startsWith(prev) || prev.startsWith(next)) {
    return { accept: true, merged: next.length >= prev.length ? next : prev };
  }

  // Word-boundary overlap (suffix of prev is prefix of next)
  const prevWords = prev.split(/\s+/);
  const nextWords = next.split(/\s+/);
  for (let i = 0; i < prevWords.length; i++) {
    const suffix = prevWords.slice(i).join(" ");
    if (suffix.length >= 3 && next.startsWith(suffix)) {
      const merged = (prevWords.slice(0, i).join(" ") + " " + next).trim();
      if (isLikelyWhisperHallucination(merged) && !isLikelyWhisperHallucination(prev)) {
        return { accept: false, reason: "merge-hallucination" };
      }
      return { accept: true, merged };
    }
  }

  // Shared tail/head word (≥1) — allow cautious append
  const lastPrev = prevWords[prevWords.length - 1]?.toLowerCase() ?? "";
  const firstNext = nextWords[0]?.toLowerCase() ?? "";
  if (lastPrev && firstNext && lastPrev === firstNext && nextWords.length > 1) {
    const merged = (prev + " " + nextWords.slice(1).join(" ")).trim();
    return { accept: true, merged };
  }

  // No overlap: only accept if next clearly extends (long, not a short outro)
  if (nextWords.length <= 4 && !prev.toLowerCase().includes(next.toLowerCase())) {
    return { accept: false, reason: "divergent-short" };
  }

  // Long divergent rewrite — accept only if it shares content with prev
  // (Whisper full-window re-decode). Reject Dom-style garbage that shares almost nothing.
  const prevSet = new Set(prevWords.map((w) => w.toLowerCase()));
  const shared = nextWords.filter((w) => prevSet.has(w.toLowerCase())).length;
  const shareRatio = shared / Math.max(prevWords.length, 1);
  if (
    next.length >= prev.length * 0.6 &&
    nextWords.length >= Math.max(3, prevWords.length - 2) &&
    shareRatio >= 0.4
  ) {
    if (isLikelyWhisperHallucination(next)) {
      return { accept: false, reason: "divergent-hallucination" };
    }
    return { accept: true, merged: next };
  }

  return { accept: false, reason: "divergent" };
};
