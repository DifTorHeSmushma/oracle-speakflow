import type { Dictionary, CorrectionConfig } from "../types/voice.js";
import { applyDictionary } from "./dictionary.js";

// Spec §6.2 — deterministic dev-term casing map (step 2)
const DEV_TERMS: ReadonlyMap<string, string> = new Map([
  ["npm", "npm"],
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["async", "async"],
  ["await", "await"],
  ["api", "API"],
  ["apis", "APIs"],
  ["json", "JSON"],
  ["cli", "CLI"],
  ["hwnd", "HWND"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["sql", "SQL"],
  ["url", "URL"],
  ["urls", "URLs"],
  ["uuid", "UUID"],
  ["ui", "UI"],
  ["ios", "iOS"],
  ["macos", "macOS"],
  ["github", "GitHub"],
  ["gitlab", "GitLab"],
  ["nodejs", "Node.js"],
  ["vscode", "VS Code"],
  ["graphql", "GraphQL"],
  ["docker", "Docker"],
  ["kubernetes", "Kubernetes"],
  ["linux", "Linux"],
  ["devops", "DevOps"],
  ["oauth", "OAuth"],
  ["jwt", "JWT"],
  ["http", "HTTP"],
  ["https", "HTTPS"],
  ["rest", "REST"],
  ["sdk", "SDK"],
  ["ide", "IDE"],
  ["ides", "IDEs"],
  ["ffmpeg", "FFmpeg"],
  ["groq", "Groq"],
  ["openai", "OpenAI"],
  ["llm", "LLM"],
  ["llms", "LLMs"],
  ["ai", "AI"],
  ["ml", "ML"],
  ["pnpm", "pnpm"],
  ["bun", "Bun"],
  ["deno", "Deno"],
  ["eslint", "ESLint"],
  ["webpack", "Webpack"],
  ["vite", "Vite"],
  ["vitest", "Vitest"],
  ["svelte", "Svelte"],
  ["react", "React"],
  ["vue", "Vue"],
  ["tailwind", "Tailwind"],
  ["prettier", "Prettier"],
  ["cursor", "Cursor"],
  ["speakflow", "SpeakFlow"],
]);

// Issue #12 — product-name phrase remaps (ASR mush). Longer phrases first.
const PRODUCT_PHRASES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bspeed\s*flows?\b/gi, replacement: "SpeakFlow" },
  { pattern: /\bspeak\s*flows?\b/gi, replacement: "SpeakFlow" },
  { pattern: /\bspeech\s*flows?\b/gi, replacement: "SpeakFlow" },
  // Dom #13: Whisper often hears "SpeakFlow" as "speak through".
  { pattern: /\bspeak\s*through\b/gi, replacement: "SpeakFlow" },
  { pattern: /\bspeakflow\b/gi, replacement: "SpeakFlow" },
];

/** Whisper often invents a short filler before the real dictation (Dom #12). */
const FILLER_PREFIXES: ReadonlyArray<RegExp> = [
  /^tested it here[,.]?\s+/i,
  /^thanks for watching[.!]?\s+/i,
  /^thank you for watching[.!]?\s+/i,
  /^thanks for listening[.!]?\s+/i,
];

const DEV_TERM_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = Array.from(
  DEV_TERMS.entries()
).map(([term, replacement]) => ({
  pattern: new RegExp(`\\b${term}\\b`, "gi"),
  replacement,
}));

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function applyDevTerms(text: string): string {
  let result = text;
  for (const { pattern, replacement } of DEV_TERM_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function applyProductLexicon(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PRODUCT_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function stripFillerPrefixes(text: string): string {
  let result = text;
  for (const re of FILLER_PREFIXES) {
    result = result.replace(re, "");
  }
  return result.trim();
}

/**
 * Deterministic correction pipeline (steps 1–2 + product lexicon + step 4/dictionary).
 * Step 3 (LLM) is off by default and deferred.
 * Dictionary runs LAST and is authoritative — Spec §6.2 / Invariant.
 */
export const correct = async (
  raw: string,
  dict: Dictionary,
  cfg: CorrectionConfig
): Promise<{ text: string; ms: number }> => {
  const start = performance.now();

  let text = normalizeWhitespace(raw);
  text = stripFillerPrefixes(text);
  text = applyDevTerms(text);
  text = applyProductLexicon(text);

  if (cfg.llmEnabled) {
    process.stderr.write("[correction] LLM pass requested but not yet implemented\n");
  }

  const { text: dictText } = applyDictionary(text, dict);
  text = dictText;

  const ms = performance.now() - start;
  return { text, ms };
};
