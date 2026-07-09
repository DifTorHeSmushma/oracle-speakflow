import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mocks — all shared state must be in vi.hoisted() to be usable in vi.mock factories
// ---------------------------------------------------------------------------

const { mockStatfsSync, mockHttpsRequest } = vi.hoisted(() => ({
  mockStatfsSync: vi.fn(),
  mockHttpsRequest: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statfsSync: mockStatfsSync,
  };
});

vi.mock("node:https", () => ({
  request: mockHttpsRequest,
}));

vi.mock("../../utils/binaryPath.js", () => ({
  getBinaryPath: vi.fn().mockReturnValue("/fake/bin/models.sha256"),
}));

vi.mock("../modelRegistry.js", () => ({
  TIER_LADDER: {
    fast: {
      tier: "fast",
      filename: "ggml-tiny.en.bin",
      sizeBytes: 1000,
      source: "bundled",
      minRamMB: 512,
      batchAcceptable: true,
      url: "https://example.com/ggml-tiny.en.bin",
    },
    balanced: {
      tier: "balanced",
      filename: "ggml-small.en-q5_1.bin",
      sizeBytes: 2000,
      source: "download",
      minRamMB: 1024,
      batchAcceptable: false,
      url: "https://example.com/ggml-small.en-q5_1.bin",
    },
    accurate: {
      tier: "accurate",
      filename: "ggml-large-v3-turbo-q5_0.bin",
      sizeBytes: 5000,
      source: "download",
      minRamMB: 2048,
      batchAcceptable: false,
      url: "https://example.com/ggml-large.bin",
    },
  },
}));

import { checkDiskForTier, downloadTier } from "../modelDownloader.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a fake HTTPS response emitter with statusCode and data. */
const makeFakeResponse = (statusCode: number, data = "") => {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    resume: () => void;
    pipe: (dest: NodeJS.WritableStream) => void;
  };
  res.statusCode = statusCode;
  res.headers = { "content-length": String(Buffer.byteLength(data)) };
  res.resume = vi.fn();
  res.pipe = vi.fn((dest) => {
    // Simulate pipe by writing data to dest then emitting 'data' on res
    process.nextTick(() => {
      if (data) {
        res.emit("data", Buffer.from(data));
        (dest as NodeJS.WriteStream).write?.(data);
      }
      res.emit("end");
      dest.emit("finish");
      dest.emit("close");
    });
  });
  return res;
};

/** Builds a fake https.request that resolves with a given response. */
const makeHttpsMock = (statusCode: number, data = "") => {
  const res = makeFakeResponse(statusCode, data);
  const req = new EventEmitter() as EventEmitter & {
    end: () => typeof req;
    write: () => typeof req;
    destroy: () => void;
  };
  req.end = vi.fn(() => {
    process.nextTick(() => req.emit("response", res));
    return req;
  });
  req.write = vi.fn(() => req);
  req.destroy = vi.fn();
  return { req, res };
};

// ---------------------------------------------------------------------------
// checkDiskForTier tests
// ---------------------------------------------------------------------------

describe("checkDiskForTier — G15", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sf-dl-disk-"));
    vi.clearAllMocks();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns Ok when free space >= 2× model size", () => {
    // fast sizeBytes=1000, need=2000; free=5000 > 2000 → Ok
    mockStatfsSync.mockReturnValue({ bsize: 512, bavail: 10 }); // 10*512=5120 free
    const result = checkDiskForTier("fast", dir);
    expect(result.ok).toBe(true);
  });

  it("returns Err(insufficientDisk) when free space < 2× model size", () => {
    // fast sizeBytes=1000, need=2000; free=512 < 2000 → Err
    mockStatfsSync.mockReturnValue({ bsize: 512, bavail: 1 }); // 1*512=512 free
    const result = checkDiskForTier("fast", dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("insufficientDisk");
    if (result.error.kind !== "insufficientDisk") return;
    expect(result.error.needBytes).toBe(2000);
    expect(result.error.freeBytes).toBe(512);
  });

  it("returns Ok when statfsSync throws (graceful fallback)", () => {
    mockStatfsSync.mockImplementation(() => { throw new Error("ENOSYS"); });
    const result = checkDiskForTier("fast", dir);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// downloadTier tests
// ---------------------------------------------------------------------------

describe("downloadTier — G15", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sf-dl-"));
    vi.clearAllMocks();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns Err(cancelled) immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await downloadTier("fast", dir, vi.fn(), controller.signal);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("cancelled");
  });

  it("deletes .part file on cancel", async () => {
    const partPath = join(dir, "ggml-tiny.en.bin.part");
    writeFileSync(partPath, "partial"); // simulate leftover .part

    const controller = new AbortController();
    controller.abort();

    await downloadTier("fast", dir, vi.fn(), controller.signal);

    expect(existsSync(partPath)).toBe(false);
  });

  it("returns Err(httpError) on non-200 status", async () => {
    const { req } = makeHttpsMock(404);
    mockHttpsRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      process.nextTick(() => cb(makeFakeResponse(404)));
      return req;
    });

    const controller = new AbortController();
    const result = await downloadTier("fast", dir, vi.fn(), controller.signal);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("httpError");
  });

  it("retries on network error (up to MAX_ATTEMPTS)", async () => {
    let callCount = 0;
    mockHttpsRequest.mockImplementation(() => {
      callCount++;
      const req = new EventEmitter() as EventEmitter & { end: () => void; write: () => void };
      req.end = vi.fn(() => {
        process.nextTick(() => req.emit("error", Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" })));
      });
      req.write = vi.fn();
      return req;
    });

    const controller = new AbortController();
    const result = await downloadTier("fast", dir, vi.fn(), controller.signal);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("networkTimeout");
    expect(callCount).toBe(3); // MAX_ATTEMPTS
  }, 10_000);
});
