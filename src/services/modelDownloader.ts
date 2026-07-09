import * as https from "node:https";
import * as http from "node:http";
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  renameSync,
  createWriteStream,
  createReadStream,
  readFileSync,
  statfsSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { getBinaryPath } from "../utils/binaryPath.js";
import { TIER_LADDER } from "./modelRegistry.js";
import type { Result } from "../utils/result.js";
import { Ok, Err } from "../utils/result.js";
import type { ModelTier } from "../types/ipc.js";

export type DownloadError =
  | { kind: "insufficientDisk"; needBytes: number; freeBytes: number }
  | { kind: "httpError"; statusCode: number }
  | { kind: "integrity"; message: string }
  | { kind: "cancelled" }
  | { kind: "networkTimeout"; message: string };

export type DownloadProgress = (pct: number) => void;

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS_MS = [500, 1000] as const;

// statfsSync was added in Node 18.15 / 19.6 and is available in Node 20.
// The @types/node declaration may not include it in all minor versions;
// the type assertion is intentional and guarded by our Node >=20 engine requirement.
type StatFsResult = { bsize: number; bavail: number };
const safeStatFs = (path: string): StatFsResult | null => {
  try {
    return (statfsSync as unknown as (p: string) => StatFsResult)(path);
  } catch {
    return null;
  }
};

/**
 * Checks that the destination volume has at least 2× the tier's model size free.
 * G15 / Spec §0 Q6.
 */
export const checkDiskForTier = (tier: ModelTier, destDir: string): Result<void, DownloadError> => {
  const spec = TIER_LADDER[tier];
  const needBytes = spec.sizeBytes * 2;

  const stat = safeStatFs(destDir);
  if (!stat) return Ok(undefined); // statfs unavailable — let the OS error naturally

  const freeBytes = stat.bavail * stat.bsize;
  if (freeBytes < needBytes) {
    return Err({ kind: "insufficientDisk", needBytes, freeBytes });
  }
  return Ok(undefined);
};

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("cancelled"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(t); reject(new Error("cancelled")); };
    signal.addEventListener("abort", onAbort, { once: true });
  });

const hashFile = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
    stream.on("error", reject);
  });

const attemptDownload = (
  url: string,
  partPath: string,
  onProgress: DownloadProgress,
  signal: AbortSignal,
): Promise<Result<void, DownloadError>> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(Err({ kind: "cancelled" }));
      return;
    }

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const transport: typeof https = isHttps ? https : (http as unknown as typeof https);

    const req = transport.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        signal,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(Err({ kind: "httpError", statusCode: res.statusCode ?? 0 }));
          return;
        }

        const totalBytes = parseInt(res.headers["content-length"] ?? "0", 10);
        let received = 0;
        let lastPct = -1;

        const file = createWriteStream(partPath);
        res.pipe(file);

        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.floor((received / totalBytes) * 100);
            if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
          }
        });

        file.on("finish", () => file.close(() => resolve(Ok(undefined))));
        file.on("error", (err) => resolve(Err({ kind: "networkTimeout", message: err.message })));
        res.on("error", (err) => resolve(Err({ kind: "networkTimeout", message: err.message })));
      }
    );

    req.on("error", (err: Error & { name?: string }) => {
      if (err.name === "AbortError") {
        resolve(Err({ kind: "cancelled" }));
      } else {
        resolve(Err({ kind: "networkTimeout", message: err.message }));
      }
    });

    req.end();
  });

/**
 * Downloads a tier's model file to destDir.
 * Streams to <filename>.part → SHA-verifies via manifest → atomic rename.
 * Cancellable via AbortSignal. Retries up to 3 attempts with backoff.
 * Deletes .part on cancel or failure. G15.
 */
export const downloadTier = async (
  tier: ModelTier,
  destDir: string,
  onProgress: DownloadProgress,
  signal: AbortSignal,
): Promise<Result<string, DownloadError>> => {
  const spec = TIER_LADDER[tier];
  const url = spec.url;
  if (!url) {
    return Err({ kind: "networkTimeout", message: `Tier '${tier}' has no download URL` });
  }

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const finalPath = join(destDir, spec.filename);
  const partPath = `${finalPath}.part`;
  let lastError: DownloadError = { kind: "networkTimeout", message: "No attempts made" };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      try { unlinkSync(partPath); } catch { /* absent */ }
      return Err({ kind: "cancelled" });
    }

    if (attempt > 0) {
      const delay = BACKOFF_DELAYS_MS[attempt - 1] ?? 2000;
      try {
        await sleep(delay, signal);
      } catch {
        try { unlinkSync(partPath); } catch { /* absent */ }
        return Err({ kind: "cancelled" });
      }
    }

    const dlResult = await attemptDownload(url, partPath, onProgress, signal);

    if (!dlResult.ok) {
      try { unlinkSync(partPath); } catch { /* absent */ }
      if (dlResult.error.kind === "cancelled") return dlResult;
      lastError = dlResult.error;
      continue;
    }

    // SHA verify via manifest — hard-block on mismatch (Invariant #13, G15)
    const manifestPath = getBinaryPath("models.sha256");
    if (!existsSync(manifestPath)) {
      try { unlinkSync(partPath); } catch { /* absent */ }
      return Err({ kind: "integrity", message: "SHA manifest not found" });
    }

    const actualHash = await hashFile(partPath);
    const manifest = readFileSync(manifestPath, "utf-8");
    const expected = manifest
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/\s+/))
      .find((parts) => parts.length >= 2 && parts[1] === spec.filename)?.[0];

    if (!expected) {
      try { unlinkSync(partPath); } catch { /* absent */ }
      return Err({ kind: "integrity", message: `No manifest entry for '${spec.filename}'` });
    }

    if (actualHash !== expected.toUpperCase()) {
      try { unlinkSync(partPath); } catch { /* absent */ }
      return Err({
        kind: "integrity",
        message: `SHA mismatch: expected ${expected.toUpperCase()}, got ${actualHash}`,
      });
    }

    renameSync(partPath, finalPath);
    onProgress(100);
    return Ok(finalPath);
  }

  return Err(lastError);
};
