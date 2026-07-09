import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mocks — set up before importing the module under test
// ---------------------------------------------------------------------------

const { mockSpawn, mockExistsSync, mockHttpRequest } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockHttpRequest: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: mockExistsSync };
});
vi.mock("node:http", () => ({ request: mockHttpRequest }));
// net.createServer for findFreePort — use fixed port 9876
vi.mock("node:net", () => ({
  createServer: vi.fn(() => {
    const srv = new EventEmitter() as EventEmitter & {
      listen: (port: number, host: string, cb: () => void) => void;
      address: () => { port: number };
      close: (cb: () => void) => void;
    };
    srv.listen = vi.fn((_p, _h, cb) => { process.nextTick(cb); });
    srv.address = vi.fn(() => ({ port: 9876 }));
    srv.close = vi.fn((cb) => { process.nextTick(cb); });
    return srv;
  }),
}));
vi.mock("../../utils/binaryPath.js", () => ({
  getBinaryPath: vi.fn().mockReturnValue("/fake/bin/whisper-server.exe"),
}));

import { startEngine, stopEngine, armIdleUnload, transcribeWarm } from "../localEngine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeChildProcess = (pid = 1234) => {
  const child = new EventEmitter() as EventEmitter & {
    pid: number | undefined;
    kill: (sig?: string) => boolean;
    stderr: EventEmitter & { pipe: () => void };
  };
  child.pid = pid;
  child.kill = vi.fn(() => true);
  child.stderr = Object.assign(new EventEmitter(), { pipe: vi.fn() }) as EventEmitter & { pipe: () => void };
  return child;
};

const makeHealthResponse = (statusCode = 200) => {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; resume: () => void };
  res.statusCode = statusCode;
  res.resume = vi.fn();
  return res;
};

// ---------------------------------------------------------------------------
// startEngine
// ---------------------------------------------------------------------------

describe("startEngine — G17", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("returns Err(engineSpawnFailed) when binary not found", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await startEngine("fast", "/models/tiny.bin");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("engineSpawnFailed");
  });

  it("returns Err(engineSpawnFailed) when spawn returns no pid", async () => {
    const child = makeChildProcess();
    child.pid = undefined;
    mockSpawn.mockReturnValue(child);
    mockHttpRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = vi.fn();
      process.nextTick(() => cb(makeHealthResponse(200)));
      return req;
    });

    const result = await startEngine("fast", "/models/tiny.bin");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("engineSpawnFailed");
  });

  it("returns Err(engineNotReady) on health poll timeout", async () => {
    const child = makeChildProcess(5555);
    mockSpawn.mockReturnValue(child);
    // Health always returns 503
    mockHttpRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = vi.fn(() => {
        process.nextTick(() => cb(makeHealthResponse(503)));
      });
      return req;
    });

    const result = await startEngine("fast", "/models/tiny.bin");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("engineNotReady");
  }, 10_000);
});

// ---------------------------------------------------------------------------
// stopEngine — idempotent (Invariant #7)
// ---------------------------------------------------------------------------

describe("stopEngine — G17", () => {
  it("is idempotent: second call returns immediately without re-killing", async () => {
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);

    const handle = { pid: 9999, port: 9876, tier: "fast" as const, stopped: false };

    await stopEngine(handle);
    await stopEngine(handle);

    expect(killSpy).toHaveBeenCalledTimes(1);
    killSpy.mockRestore();
  });

  it("sets stopped=true after first call", async () => {
    vi.spyOn(process, "kill").mockReturnValue(true);
    const handle = { pid: 8888, port: 9876, tier: "fast" as const, stopped: false };

    await stopEngine(handle);

    expect(handle.stopped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// armIdleUnload — G17
// ---------------------------------------------------------------------------

describe("armIdleUnload — G17", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fires onUnload callback after idle timeout", async () => {
    vi.spyOn(process, "kill").mockReturnValue(true);
    const onUnload = vi.fn();
    const handle = { pid: 7777, port: 9876, tier: "fast" as const, stopped: false };

    armIdleUnload(handle, 300_000, onUnload);

    await vi.advanceTimersByTimeAsync(300_000);
    // Give the promise chain a tick to resolve
    await Promise.resolve();

    expect(onUnload).toHaveBeenCalledTimes(1);
    expect(handle.stopped).toBe(true);
  });

  it("does not fire before idle timeout", async () => {
    vi.spyOn(process, "kill").mockReturnValue(true);
    const onUnload = vi.fn();
    const handle = { pid: 6666, port: 9876, tier: "fast" as const, stopped: false };

    armIdleUnload(handle, 300_000, onUnload);
    await vi.advanceTimersByTimeAsync(100_000);

    expect(onUnload).not.toHaveBeenCalled();
  });
});
