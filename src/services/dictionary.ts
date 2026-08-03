import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { Ok, Err } from "../utils/result.js";
import type { Result } from "../utils/result.js";
import type { Dictionary, DictEntry } from "../types/voice.js";

export type DictError =
  | { kind: "invalidJson"; message: string }
  | { kind: "invalidSchema"; message: string }
  | { kind: "writeFailed"; message: string };

const DICT_FILENAME = "dictionary.json";
const BACKUP_FILENAME = "dictionary.json.bak";

function validateDictionary(raw: unknown): Result<Dictionary, DictError> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return Err({ kind: "invalidSchema", message: "Root must be an object" });
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj["version"] !== "number") {
    return Err({ kind: "invalidSchema", message: "Missing or non-numeric 'version'" });
  }
  if (!Array.isArray(obj["entries"])) {
    return Err({ kind: "invalidSchema", message: "Missing or non-array 'entries'" });
  }

  for (let i = 0; i < (obj["entries"] as unknown[]).length; i++) {
    const e = (obj["entries"] as unknown[])[i];
    if (typeof e !== "object" || e === null) {
      return Err({ kind: "invalidSchema", message: `Entry[${i}] must be an object` });
    }
    const entry = e as Record<string, unknown>;
    if (typeof entry["id"] !== "string") return Err({ kind: "invalidSchema", message: `Entry[${i}].id missing` });
    if (typeof entry["spoken"] !== "string") return Err({ kind: "invalidSchema", message: `Entry[${i}].spoken missing` });
    if (typeof entry["written"] !== "string") return Err({ kind: "invalidSchema", message: `Entry[${i}].written missing` });
    if (entry["matchMode"] !== "phrase" && entry["matchMode"] !== "word") {
      return Err({ kind: "invalidSchema", message: `Entry[${i}].matchMode must be 'phrase' or 'word'` });
    }
    if (typeof entry["enabled"] !== "boolean") {
      return Err({ kind: "invalidSchema", message: `Entry[${i}].enabled must be boolean` });
    }
  }

  return Ok(raw as Dictionary);
}

function tryParseAndValidate(jsonStr: string): Result<Dictionary, DictError> {
  let parsed: unknown;
  try {
    // PowerShell Set-Content -Encoding utf8 writes a BOM; JSON.parse rejects it.
    parsed = JSON.parse(jsonStr.replace(/^\uFEFF/, ""));
  } catch (err) {
    return Err({ kind: "invalidJson", message: err instanceof Error ? err.message : String(err) });
  }
  return validateDictionary(parsed);
}

export const loadDictionary = (dir: string): Result<Dictionary, DictError> => {
  const path = join(dir, DICT_FILENAME);
  const backupPath = join(dir, BACKUP_FILENAME);

  if (!existsSync(path)) {
    return Ok({ version: 1, entries: [] });
  }

  const primary = tryParseAndValidate(readFileSync(path, "utf-8"));
  if (primary.ok) return primary;

  // Invalid primary — try backup (S15: keep last-good)
  if (existsSync(backupPath)) {
    const backup = tryParseAndValidate(readFileSync(backupPath, "utf-8"));
    if (backup.ok) return backup;
  }

  return primary;
};

export const saveDictionary = (dir: string, d: Dictionary): Result<void, DictError> => {
  const path = join(dir, DICT_FILENAME);
  const backupPath = join(dir, BACKUP_FILENAME);

  // Write backup of current file before overwriting
  if (existsSync(path)) {
    try {
      copyFileSync(path, backupPath);
    } catch (err) {
      process.stderr.write(`[dictionary] Warning: could not write backup: ${String(err)}\n`);
    }
  }

  try {
    writeFileSync(path, JSON.stringify(d, null, 2), "utf-8");
    return Ok(undefined);
  } catch (err) {
    return Err({ kind: "writeFailed", message: err instanceof Error ? err.message : String(err) });
  }
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const applyDictionary = (
  text: string,
  d: Dictionary
): { text: string; protectedTokens: string[] } => {
  const protectedTokens: string[] = [];
  let result = text;

  for (const entry of d.entries.filter((e) => e.enabled)) {
    const pattern =
      entry.matchMode === "phrase"
        ? new RegExp(escapeRegex(entry.spoken), "gi")
        : new RegExp(`\\b${escapeRegex(entry.spoken)}\\b`, "gi");

    // Always replace — never pattern.test() first with /g (lastIndex can skip matches).
    const next = result.replace(pattern, entry.written);
    if (next !== result) {
      result = next;
      protectedTokens.push(entry.written);
    }
  }

  return { text: result, protectedTokens };
};

export const importDictionary = (jsonStr: string): Result<Dictionary, DictError> =>
  tryParseAndValidate(jsonStr);

export const exportDictionary = (d: Dictionary): string => JSON.stringify(d, null, 2);

export const createEntry = (
  spoken: string,
  written: string,
  matchMode: DictEntry["matchMode"] = "phrase"
): DictEntry => ({
  id: crypto.randomUUID(),
  spoken,
  written,
  matchMode,
  enabled: true,
});
