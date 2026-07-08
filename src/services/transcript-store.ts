/**
 * transcript-store.ts — Cross-process shared transcript history.
 *
 * The GUI process appends entries here after every successful transcription.
 * The headless MCP server (--mcp) reads from this file to serve tool calls.
 *
 * Concurrency strategy (P3-T09):
 *   Write path → write to a randomly-named .tmp file, then renameSync() over
 *   the target.  Node.js on Windows uses MoveFileExW(MOVEFILE_REPLACE_EXISTING)
 *   which is as close to atomic as Windows allows.  Any reader holding the file
 *   open for a readFileSync() will finish before the rename lands, so the window
 *   for a torn read is negligible.  A fallback direct-write is used if rename
 *   fails (e.g. antivirus lock).
 *
 * Security (Forensic):
 *   Only { text, timestamp, mode } is persisted — no API keys, no file-system
 *   paths, no configuration data.
 */

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TranscriptMode = "remote" | "local";

export type TranscriptEntry = {
  /** The transcribed text. */
  text: string;
  /** ISO 8601 timestamp recorded by the GUI process at finalisation. */
  timestamp: string;
  /** Whether the transcription was performed locally or via a remote API. */
  mode: TranscriptMode;
};

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

type HistoryFile = {
  entries: TranscriptEntry[];
};

const HISTORY_FILENAME = "transcript-history.json";
const MAX_ENTRIES = 10;

function historyPath(userData: string): string {
  return join(userData, HISTORY_FILENAME);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the full transcript history from the shared userData file.
 * Returns an empty array on any read / parse failure — callers must not crash.
 */
export function readHistory(userData: string): TranscriptEntry[] {
  const path = historyPath(userData);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as HistoryFile;
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/**
 * Atomically appends a transcript entry to the shared history file and trims
 * the list to MAX_ENTRIES.
 *
 * Throws only on catastrophic I/O failure; antivirus / lock fallback is handled
 * internally.
 */
export function appendTranscript(userData: string, entry: TranscriptEntry): void {
  const entries = readHistory(userData);
  entries.push(entry);
  const trimmed = entries.slice(-MAX_ENTRIES);
  const content = JSON.stringify({ entries: trimmed }, null, 2);

  const path = historyPath(userData);
  const tmpPath = `${path}.${randomBytes(4).toString("hex")}.tmp`;

  writeFileSync(tmpPath, content, "utf-8");
  try {
    renameSync(tmpPath, path);
  } catch {
    // Fallback: direct write if rename is blocked (e.g. antivirus lock on target).
    writeFileSync(path, content, "utf-8");
    try { unlinkSync(tmpPath); } catch { /* temp file already gone or locked — ignore */ }
  }
}
