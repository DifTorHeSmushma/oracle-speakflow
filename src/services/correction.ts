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
]);

// Precompiled regex for each term — built once at module load time
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

/**
 * Deterministic correction pipeline (steps 1–2 + step 4/dictionary).
 * Step 3 (LLM) is off by default and deferred.
 * Dictionary runs LAST and is authoritative — Spec §6.2 / Invariant.
 */
export const correct = async (
  raw: string,
  dict: Dictionary,
  cfg: CorrectionConfig
): Promise<{ text: string; ms: number }> => {
  const start = performance.now();

  // Step 1: whitespace/punctuation normalization
  let text = normalizeWhitespace(raw);

  // Step 2: dev-term casing
  text = applyDevTerms(text);

  // Step 3: LLM opt-in (off by default — skipped in Wave 1.1)
  if (cfg.llmEnabled) {
    // Placeholder: LLM pass deferred to post-Wave 3 opt-in path
    process.stderr.write("[correction] LLM pass requested but not yet implemented\n");
  }

  // Step 4: Personal Dictionary — authoritative, runs LAST
  const { text: dictText } = applyDictionary(text, dict);
  text = dictText;

  const ms = performance.now() - start;
  return { text, ms };
};
