/**
 * Transcript quality helpers — choose settle text and score fixture packs (issue #12).
 * Pure: no Electron / network.
 */

/** Dom HITL #12 exact spoken reference (required fixture). */
export const DOM_HITL_SPEAKFLOW_LINE =
  "testing speak flow testing speak flow 1 2 3 4 1 2 3 4";

export type TranscriptChoice = {
  text: string;
  source: "finalized" | "live" | "lexicon-finalized";
  reason: string;
};

const normalizeTokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/speakflow/gi, "speak flow")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Product-name tokens that mush ASR often destroys. */
const PRODUCT_ANCHORS = ["speakflow", "speak", "flow"] as const;
const MUSH_PRODUCT = ["speedflow", "speed"] as const;

const hasProductAnchor = (tokens: string[]): boolean => {
  const joined = tokens.join(" ");
  if (joined.includes("speakflow")) return true;
  // "speak" + "flow" as adjacent or near tokens
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === "speak" && tokens[i + 1] === "flow") return true;
  }
  return tokens.includes("speakflow");
};

const hasProductMush = (tokens: string[]): boolean => {
  const joined = tokens.join(" ");
  if (joined.includes("speedflow")) return true;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === "speed" && tokens[i + 1] === "flow") return true;
  }
  return false;
};

/**
 * Word error rate (insertions+deletions+substitutions) / reference length.
 * Simple token Levenshtein — good enough for fixture gates.
 */
export const wordErrorRate = (reference: string, hypothesis: string): number => {
  const ref = normalizeTokens(reference);
  const hyp = normalizeTokens(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;

  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[ref.length]![hyp.length]! / ref.length;
};

/** Meaning-changing error heuristic for fixture packs (INTENT bar). */
export const meaningError = (reference: string, hypothesis: string): boolean => {
  const ref = normalizeTokens(reference);
  const hyp = normalizeTokens(hypothesis);
  // Digits from reference must survive.
  for (const t of ref) {
    if (/^\d+$/.test(t) && !hyp.includes(t)) return true;
  }
  // Product name destroyed.
  if (hasProductAnchor(ref) && hasProductMush(hyp) && !hasProductAnchor(hyp)) return true;
  if (hasProductAnchor(ref) && !hasProductAnchor(hyp)) return true;
  // Invented multi-word prefix not in reference (e.g. "tested it here").
  if (hyp.length >= ref.length + 2) {
    const head = hyp.slice(0, 3).join(" ");
    if (head === "tested it here" || head.startsWith("thanks for") || head === "thank you for") {
      return true;
    }
  }
  return wordErrorRate(reference, hypothesis) > 0.25;
};

/**
 * Prefer a transcript that preserves product anchors when finalize mush-destroys them.
 */
export const chooseBestTranscript = (input: {
  finalized: string;
  live: string | null;
  /** Already lexicon-corrected finalize (from correct()). */
  correctedFinalized?: string;
}): TranscriptChoice => {
  const finalized = (input.correctedFinalized ?? input.finalized).trim();
  const live = (input.live ?? "").trim();
  const finTok = normalizeTokens(finalized);
  const liveTok = normalizeTokens(live);

  if (!finalized && live) {
    return { text: live, source: "live", reason: "empty finalize — use live" };
  }
  if (!live) {
    return { text: finalized, source: "finalized", reason: "no live candidate" };
  }

  // Live has SpeakFlow / speak+flow; finalize only has speed+flow mush.
  if (hasProductAnchor(liveTok) && hasProductMush(finTok) && !hasProductAnchor(finTok)) {
    return {
      text: live,
      source: "live",
      reason: "finalize destroyed product name (speed flow mush) — prefer live",
    };
  }

  // Finalize still has invented filler while live is cleaner and shorter.
  if (
    /^tested it here\b/i.test(finalized) &&
    !/^tested it here\b/i.test(live) &&
    liveTok.length >= 4
  ) {
    return {
      text: live,
      source: "live",
      reason: "finalize invented filler prefix — prefer live",
    };
  }

  if (input.correctedFinalized && input.correctedFinalized !== input.finalized) {
    return {
      text: finalized,
      source: "lexicon-finalized",
      reason: "lexicon-corrected finalize",
    };
  }

  return { text: finalized, source: "finalized", reason: "default finalize" };
};

/** Fixed fixture pack for G-W1 (issue #12). Hypotheses are pre-ASR mush samples. */
export type WerFixture = {
  id: string;
  reference: string;
  /** Raw ASR hypothesis before correction (what mush looks like). */
  rawHypothesis: string;
};

export const WER_FIXTURE_PACK: WerFixture[] = [
  {
    id: "dom-hitl-speakflow",
    reference: DOM_HITL_SPEAKFLOW_LINE,
    rawHypothesis: "tested it here speed flow, testing speed flow 1, 2, 3, 4 1, 2, 3, 4",
  },
  {
    id: "sdlc-parseconfig",
    reference: "Refactor parseConfig in src/utils/config.ts then open pull request number 84",
    rawHypothesis: "Refactor parseConfig in src/utils/config.ts then open pull request number 84",
  },
  {
    id: "sdlc-rename-helper",
    reference: "Rename the helper function please then update every call site",
    rawHypothesis: "Rename the helper function please then update every call site",
  },
  {
    id: "product-speakflow-once",
    reference: "Ship SpeakFlow to Cursor today",
    rawHypothesis: "Ship speed flow to Cursor today",
  },
  {
    id: "digits-repeat",
    reference: "run tests 1 2 3 4 1 2 3 4",
    rawHypothesis: "run tests 1 2 3 4 1 2 3 4",
  },
  {
    id: "github-pr",
    reference: "open GitHub pull request for issue 12",
    rawHypothesis: "open GitHub pull request for issue 12",
  },
  {
    id: "typescript-api",
    reference: "update the TypeScript API client timeout",
    rawHypothesis: "update the TypeScript API client timeout",
  },
  {
    id: "whisper-groq",
    reference: "use Groq Whisper for cloud transcription",
    rawHypothesis: "use Groq Whisper for cloud transcription",
  },
  {
    id: "hwnd-paste",
    reference: "paste into the captured HWND not SpeakFlow",
    rawHypothesis: "paste into the captured HWND not speed flow",
  },
  {
    id: "electron-cursor",
    reference: "restore Cursor then send Ctrl V",
    rawHypothesis: "restore Cursor then send Ctrl V",
  },
];
