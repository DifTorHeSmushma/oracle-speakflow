import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Ok, Err } from "./result.js";
import type { Result } from "./result.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Resolves the path to a bundled binary (ffmpeg.exe, whisper-cli.exe, etc.).
 *
 * - Packaged Electron: binaries live in process.resourcesPath/bin (unpacked via extraResources)
 * - Dev / CLI: binaries live in <project-root>/resources/bin
 *
 * Callers should check existsSync on the returned path and fall back to PATH if absent.
 */
export function getBinaryPath(name: string): string {
  try {
    // Conditional require — avoids top-level import that would crash in CLI (non-Electron) mode
    const { app } = require("electron") as typeof import("electron");
    if (app.isPackaged) {
      // Electron sets process.resourcesPath in packaged builds
      const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
      if (!resourcesPath) {
        process.stderr.write("[binaryPath] WARNING: process.resourcesPath is undefined in packaged mode\n");
      } else {
        return join(resourcesPath, "bin", name);
      }
    }
  } catch (err) {
    // Expected: MODULE_NOT_FOUND when not running in Electron — fall through to dev path.
    // Unexpected errors (e.g. TypeError from join()) are logged so they leave a trace.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "MODULE_NOT_FOUND") {
      process.stderr.write(`[binaryPath] Unexpected error requiring electron: ${String(err)}\n`);
    }
  }

  // Dev mode: <project-root>/resources/bin  (binaryPath.ts compiles to dist/utils/)
  return join(__dirname, "..", "..", "resources", "bin", name);
}

export type ModelVerifyError =
  | { kind: "modelNotFound"; message: string }
  | { kind: "modelIntegrity"; message: string };

/**
 * Resolves model path and verifies its SHA-256 against models.sha256 manifest.
 * Hard-blocks on mismatch — Invariant #13 parity (no silent fallback).
 */
export function getVerifiedModelPath(name: string): Result<string, ModelVerifyError> {
  const modelPath = getBinaryPath(name);
  if (!existsSync(modelPath)) {
    return Err({ kind: "modelNotFound", message: `Model not found at path: ${modelPath}` });
  }

  const manifestPath = getBinaryPath("models.sha256");
  if (!existsSync(manifestPath)) {
    return Err({ kind: "modelIntegrity", message: `SHA-256 manifest not found at: ${manifestPath}` });
  }

  const manifest = readFileSync(manifestPath, "utf-8");
  const expectedHash = parseManifestEntry(manifest, name);
  if (!expectedHash) {
    return Err({ kind: "modelIntegrity", message: `No SHA-256 entry for '${name}' in manifest` });
  }

  const actualHash = createHash("sha256").update(readFileSync(modelPath)).digest("hex").toUpperCase();
  if (actualHash !== expectedHash.toUpperCase()) {
    return Err({
      kind: "modelIntegrity",
      message: `SHA-256 mismatch for '${name}': expected ${expectedHash.toUpperCase()}, got ${actualHash}`,
    });
  }

  return Ok(modelPath);
}

function parseManifestEntry(manifest: string, name: string): string | null {
  for (const line of manifest.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Format: "<hash>  <filename>" (standard shasum format)
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[1] === name) {
      return parts[0] ?? null;
    }
  }
  return null;
}
