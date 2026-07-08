import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { startRecording } from "../src/services/recorder.js";

// Shared mock — vi.hoisted ensures availability inside vi.mock factory.
const { mockSpawnFn, mockExistsSync } = vi.hoisted(() => ({
  mockSpawnFn: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(false), // default: no bundled ffmpeg → PATH fallback
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawnFn,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

// Mock binaryPath to return a fixed path — existsSync controls the fallback
vi.mock("../src/utils/binaryPath.js", () => ({
  getBinaryPath: vi.fn().mockReturnValue("resources/bin/ffmpeg.exe"),
}));

vi.mock("../src/utils/dshow-audio.js", () => ({
  resolveDshowAudioInput: vi.fn().mockReturnValue("audio=test-mic"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ProcMock = EventEmitter & {
  stdout: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

/**
 * Creates a mock ChildProcess. proc.stdout is a PassThrough we can push data
 * into or emit errors on. proc.on('close', ...) / proc.on('error', ...) work
 * because ProcMock extends EventEmitter.
 */
const makeProcMock = (): ProcMock => {
  const emitter = new EventEmitter() as ProcMock;
  emitter.stdout = new PassThrough();
  emitter.kill = vi.fn();
  return emitter;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recorder service", () => {
  let proc: ProcMock;

  beforeEach(() => {
    vi.clearAllMocks();
    proc = makeProcMock();
    mockSpawnFn.mockReturnValue(proc);
  });

  afterEach(() => {
    proc.stdout.destroy();
  });

  // ---- resolveFFmpeg() binary path resolution ----------------------------

  it("spawns with bundled ffmpeg.exe path when bundled binary exists", () => {
    // Simulate bundled binary present
    mockExistsSync.mockReturnValue(true);

    startRecording();

    // Should spawn with the bundled path returned by getBinaryPath, not bare "ffmpeg"
    expect(mockSpawnFn).toHaveBeenCalledWith(
      "resources/bin/ffmpeg.exe",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("falls back to system PATH 'ffmpeg' when bundled binary is absent", () => {
    // Default: mockExistsSync returns false → PATH fallback
    mockExistsSync.mockReturnValue(false);

    startRecording();

    expect(mockSpawnFn).toHaveBeenCalledWith(
      "ffmpeg",
      expect.any(Array),
      expect.any(Object),
    );
  });

  // ---- startRecording() success -------------------------------------------

  it("returns Ok(RecordingSession) when spawn succeeds", () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value.stop).toBe("function");
  });

  it("returns Err(recordingFailed) when spawn throws synchronously", () => {
    mockSpawnFn.mockImplementationOnce(() => {
      throw new Error("ffmpeg not found");
    });

    const result = startRecording();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("recordingFailed");
  });

  // ---- Happy path stop() --------------------------------------------------

  it("stop() resolves Ok with concatenated audio chunks", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    proc.stdout.push(Buffer.from("chunk-A"));
    proc.stdout.push(Buffer.from("chunk-B"));

    const stopResult = await result.value.stop();

    expect(stopResult.ok).toBe(true);
    if (stopResult.ok) {
      expect(stopResult.value.toString()).toBe("chunk-A" + "chunk-B");
    }
  });

  it("stop() resolves Ok with empty buffer when no audio was recorded", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stopResult = await result.value.stop();

    expect(stopResult.ok).toBe(true);
    if (stopResult.ok) expect(stopResult.value.length).toBe(0);
  });

  // ---- Stream errors before stop() ----------------------------------------

  it("stop() returns Err(permissionDenied) when stream emits permission error", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    proc.stdout.emit("error", new Error("permission denied: microphone access blocked"));

    const stopResult = await result.value.stop();

    expect(stopResult.ok).toBe(false);
    if (!stopResult.ok) expect(stopResult.error.kind).toBe("permissionDenied");
  });

  it("stop() returns Err(deviceNotFound) when stream emits device-not-found error", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    proc.stdout.emit("error", new Error("audio device not found"));

    const stopResult = await result.value.stop();

    expect(stopResult.ok).toBe(false);
    if (!stopResult.ok) expect(stopResult.error.kind).toBe("deviceNotFound");
  });

  it("stop() returns Err(deviceNotFound) when spawn emits ENOENT (FFmpeg not installed)", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const spawnErr = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    proc.emit("error", spawnErr);

    const stopResult = await result.value.stop();

    expect(stopResult.ok).toBe(false);
    if (!stopResult.ok) {
      expect(stopResult.error.kind).toBe("deviceNotFound");
      expect(stopResult.error.message).toMatch(/FFmpeg not found/);
    }
  });

  it("stop() returns Err(recordingFailed) on unclassified stream error", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    proc.stdout.emit("error", new Error("unexpected ffmpeg crash"));

    const stopResult = await result.value.stop();

    expect(stopResult.ok).toBe(false);
    if (!stopResult.ok) expect(stopResult.error.kind).toBe("recordingFailed");
  });

  // ---- Idempotency --------------------------------------------------------

  it("second stop() call returns Err(recordingFailed) immediately", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const second = result.value.stop(); // note: no await
    const secondResult = await result.value.stop();

    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) {
      expect(secondResult.error.kind).toBe("recordingFailed");
      expect(secondResult.error.message).toMatch(/already stopped/i);
    }

    await second;
  });

  // ---- Windows exit-code noise after intentional stop --------------------
  // On Windows, FFmpeg exits with a non-zero code when killed by proc.kill().
  // This fires proc's 'close' event. With intentionalStop=true the error is
  // suppressed; finish resolves Ok with the captured audio.

  it("close event with non-zero code after stop() is silently ignored (Windows exit noise)", async () => {
    const result = startRecording();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    proc.stdout.push(Buffer.from("audio-data"));

    // Begin stop() — intentionalStop is set to true before proc.kill().
    const stopPromise = result.value.stop();

    // Simulate Windows close-event noise (-4058) that fires after kill.
    // The handler sees intentionalStop=true and returns immediately.
    proc.emit("close", -4058);

    const stopResult = await stopPromise;

    expect(stopResult.ok).toBe(true);
    if (stopResult.ok) expect(stopResult.value.toString()).toBe("audio-data");
  });
});
