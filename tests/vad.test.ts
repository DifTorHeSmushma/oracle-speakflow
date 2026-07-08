import { describe, it, expect, vi, beforeEach } from "vitest";
import { Ok, Err } from "../src/utils/result.js";

// ---------------------------------------------------------------------------
// Mock onnxruntime-node — must be hoisted above imports of the module under test
// ---------------------------------------------------------------------------
const { mockCreateSession, mockTensor, mockGetVerifiedModelPath } = vi.hoisted(() => ({
  mockCreateSession: vi.fn(),
  mockTensor: vi.fn().mockImplementation((type: string, data: Float32Array | BigInt64Array, dims: number[]) => ({
    type,
    data,
    dims,
  })),
  mockGetVerifiedModelPath: vi.fn(),
}));

vi.mock("onnxruntime-node", () => ({
  InferenceSession: { create: mockCreateSession },
  Tensor: mockTensor,
}));

vi.mock("../src/utils/binaryPath.js", () => ({
  getBinaryPath: vi.fn().mockReturnValue("resources/bin/ffmpeg.exe"),
  getVerifiedModelPath: mockGetVerifiedModelPath,
}));

// Now import the module under test (after mocks are registered)
import { createVad, FRAME_SAMPLES } from "../src/services/vad.js";
import type { CaptureSession } from "../src/services/capture.js";
import type { VadConfig } from "../src/types/voice.js";
import type { MuteState } from "../src/services/mute.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CFG: VadConfig = {
  positiveSpeechThreshold: 0.55,
  negativeSpeechThreshold: 0.35,
  minSpeechFrames: 3,      // low for fast tests
  redemptionFrames: 2,     // low for fast tests
  preSpeechPadFrames: 1,
};

function makeCaptureMock() {
  let _frameCb: ((f: Float32Array) => void) | null = null;

  const session: CaptureSession = {
    onFrame: vi.fn((cb: (f: Float32Array) => void) => { _frameCb = cb; }),
    markSpeechStart: vi.fn(),
    markSoftOnset: vi.fn(),
    clearSoftOnset: vi.fn(),
    takeSegment: vi.fn().mockReturnValue(Buffer.from("RIFF....fake-wav")),
    stop: vi.fn().mockResolvedValue(undefined),
  };

  const pushFrame = (frame: Float32Array = new Float32Array(FRAME_SAMPLES)) => {
    _frameCb?.(frame);
  };

  const armVad = (events: Awaited<ReturnType<typeof createVad>> extends { ok: true; value: infer V } ? V : never) => {
    events.arm();
  };

  return { session, pushFrame, armVad };
}

function makeRunOutput(prob: number): Record<string, { data: Float32Array }> {
  return {
    output: { data: new Float32Array([prob]) },
    stateN: { data: new Float32Array(2 * 1 * 128) },
  };
}

function unmutedState(): MuteState {
  return { muted: false, reason: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("vad service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVerifiedModelPath.mockReturnValue(Ok("fake/silero_vad.onnx"));
    mockCreateSession.mockResolvedValue({ run: vi.fn().mockResolvedValue(makeRunOutput(0.1)) });
  });

  // ---------------------------------------------------------------------------
  // Model loading / error paths
  // ---------------------------------------------------------------------------

  it("returns Ok(VadEvents) when model loads successfully", async () => {
    const { session } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    expect(result.ok).toBe(true);
  });

  it("returns Err(modelNotFound) when model path does not exist", async () => {
    mockGetVerifiedModelPath.mockReturnValue(
      Err({ kind: "modelNotFound", message: "Model not found" })
    );
    const { session } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("modelNotFound");
  });

  it("returns Err(modelIntegrity) on SHA-256 mismatch", async () => {
    mockGetVerifiedModelPath.mockReturnValue(
      Err({ kind: "modelIntegrity", message: "SHA mismatch" })
    );
    const { session } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("modelIntegrity");
  });

  it("returns Err(inferenceError) when ORT session.create throws", async () => {
    mockCreateSession.mockRejectedValue(new Error("ORT init failed"));
    const { session } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("inferenceError");
  });

  // ---------------------------------------------------------------------------
  // Frame registration
  // ---------------------------------------------------------------------------

  it("registers a frame listener when armed", async () => {
    const { session, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;
    armVad(result.value);
    expect(session.onFrame).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // VAD state machine — speechStart fires after minSpeechFrames
  // ---------------------------------------------------------------------------

  it("speechStart fires after minSpeechFrames consecutive high-prob frames", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.9)); // always speech
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const onSpeechStart = vi.fn();
    result.value.onSpeechStart(onSpeechStart);
    armVad(result.value);

    // Push minSpeechFrames - 1 frames → not yet
    for (let i = 0; i < DEFAULT_CFG.minSpeechFrames - 1; i++) pushFrame();
    await Promise.resolve(); // flush microtask queue
    await new Promise((r) => setTimeout(r, 10));
    expect(onSpeechStart).not.toHaveBeenCalled();

    // Push one more → triggers
    pushFrame();
    await new Promise((r) => setTimeout(r, 10));
    expect(onSpeechStart).toHaveBeenCalledOnce();
  });

  it("speechStart NOT fired for fewer than minSpeechFrames", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.9));
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;

    const onSpeechStart = vi.fn();
    result.value.onSpeechStart(onSpeechStart);
    armVad(result.value);

    for (let i = 0; i < DEFAULT_CFG.minSpeechFrames - 1; i++) pushFrame();
    await new Promise((r) => setTimeout(r, 20));
    expect(onSpeechStart).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // VAD state machine — speechEnd fires after redemptionFrames of silence
  // ---------------------------------------------------------------------------

  it("speechEnd fires after redemptionFrames consecutive silence frames", async () => {
    let callCount = 0;
    const mockRun = vi.fn().mockImplementation(() => {
      callCount++;
      // First minSpeechFrames calls: high prob → trigger speech
      // Subsequent calls: low prob → trigger end after redemptionFrames
      const prob = callCount <= DEFAULT_CFG.minSpeechFrames ? 0.9 : 0.1;
      return Promise.resolve(makeRunOutput(prob));
    });
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;

    const onSpeechEnd = vi.fn();
    result.value.onSpeechEnd(onSpeechEnd);
    armVad(result.value);

    // Push speech frames to trigger start
    for (let i = 0; i < DEFAULT_CFG.minSpeechFrames; i++) pushFrame();
    await new Promise((r) => setTimeout(r, 10));

    // Push silence frames to trigger end
    for (let i = 0; i < DEFAULT_CFG.redemptionFrames; i++) pushFrame();
    await new Promise((r) => setTimeout(r, 30));

    expect(onSpeechEnd).toHaveBeenCalledOnce();
  });

  it("speechEnd callback receives a Buffer (WAV data)", async () => {
    let callCount = 0;
    const mockRun = vi.fn().mockImplementation(() => {
      callCount++;
      const prob = callCount <= DEFAULT_CFG.minSpeechFrames ? 0.9 : 0.1;
      return Promise.resolve(makeRunOutput(prob));
    });
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;

    const wavBuffers: Buffer[] = [];
    result.value.onSpeechEnd((wav) => wavBuffers.push(wav));
    armVad(result.value);

    for (let i = 0; i < DEFAULT_CFG.minSpeechFrames + DEFAULT_CFG.redemptionFrames; i++) pushFrame();
    await new Promise((r) => setTimeout(r, 30));

    expect(wavBuffers.length).toBeGreaterThan(0);
    expect(wavBuffers[0]).toBeInstanceOf(Buffer);
  });

  // ---------------------------------------------------------------------------
  // State threading: stateN must be fed back as state
  // ---------------------------------------------------------------------------

  it("threads stateN output back as state input on next frame", async () => {
    const sentinelState = new Float32Array(2 * 1 * 128).fill(0.42);
    let firstCall = true;
    const mockRun = vi.fn().mockImplementation((_inputs: Record<string, unknown>) => {
      const stateN = firstCall
        ? new Float32Array(sentinelState) // first frame returns sentinel state
        : new Float32Array(2 * 1 * 128);  // subsequent frames return zeros
      firstCall = false;
      return Promise.resolve({
        output: { data: new Float32Array([0.1]) },
        stateN: { data: stateN },
      });
    });
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;
    armVad(result.value);

    pushFrame(); // frame 1 — returns sentinel stateN
    await new Promise((r) => setTimeout(r, 10));
    pushFrame(); // frame 2 — state input should now be the sentinel
    await new Promise((r) => setTimeout(r, 10));

    // The second run call's 'state' input should equal the sentinel from frame 1
    const secondCall = mockRun.mock.calls[1];
    expect(secondCall).toBeDefined();
    const stateInput = (secondCall as unknown[][])[0] as Record<string, { data: Float32Array }>;
    const stateData = stateInput["state"]?.data;
    expect(stateData).toBeDefined();
    // All elements should be 0.42 (the sentinel value we set)
    if (stateData instanceof Float32Array) {
      expect(stateData.every((v) => Math.abs(v - 0.42) < 0.001)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // stop() resets state
  // ---------------------------------------------------------------------------

  it("stop() prevents further frames from being processed", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.9));
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;
    armVad(result.value);

    pushFrame();
    await new Promise((r) => setTimeout(r, 10));
    const callsBeforeStop = mockRun.mock.calls.length;

    result.value.stop();

    pushFrame();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRun.mock.calls.length).toBe(callsBeforeStop); // no new calls
  });

  // ---------------------------------------------------------------------------
  // Mute hard gate: no frames processed when muted (Invariant #19)
  // ---------------------------------------------------------------------------

  it("frames are not processed when getMuteState returns muted=true", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.9));
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const mutedState = (): MuteState => ({ muted: true, reason: "user" });
    const result = await createVad(DEFAULT_CFG, session, mutedState);
    if (!result.ok) return;
    armVad(result.value);

    for (let i = 0; i < 10; i++) pushFrame();
    await new Promise((r) => setTimeout(r, 30));

    expect(mockRun).not.toHaveBeenCalled(); // hard gate — ORT never called when muted
  });

  // ---------------------------------------------------------------------------
  // Tensor shapes match S1 report exactly
  // ---------------------------------------------------------------------------

  it("input tensor shape is [1, 512]", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.1));
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;
    armVad(result.value);

    pushFrame();
    await new Promise((r) => setTimeout(r, 10));

    // mockTensor was called for the input tensor
    const inputTensorCall = mockTensor.mock.calls.find(
      (c: unknown[]) => (c[0] as string) === "float32" && (c[2] as number[])[1] === 512
    );
    expect(inputTensorCall).toBeDefined();
    const dims = inputTensorCall?.[2] as number[];
    expect(dims).toEqual([1, 512]);
  });

  it("state tensor shape is [2, 1, 128]", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.1));
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;
    armVad(result.value);

    pushFrame();
    await new Promise((r) => setTimeout(r, 10));

    const stateTensorCall = mockTensor.mock.calls.find(
      (c: unknown[]) =>
        (c[0] as string) === "float32" &&
        Array.isArray(c[2]) &&
        (c[2] as number[]).length === 3 &&
        (c[2] as number[])[0] === 2
    );
    expect(stateTensorCall).toBeDefined();
    expect(stateTensorCall?.[2]).toEqual([2, 1, 128]);
  });

  it("sr tensor is Int64 with value 16000n", async () => {
    const mockRun = vi.fn().mockResolvedValue(makeRunOutput(0.1));
    mockCreateSession.mockResolvedValue({ run: mockRun });

    const { session, pushFrame, armVad } = makeCaptureMock();
    const result = await createVad(DEFAULT_CFG, session, unmutedState);
    if (!result.ok) return;
    armVad(result.value);

    pushFrame();
    await new Promise((r) => setTimeout(r, 10));

    const srTensorCall = mockTensor.mock.calls.find(
      (c: unknown[]) => (c[0] as string) === "int64"
    );
    expect(srTensorCall).toBeDefined();
    const srData = srTensorCall?.[1] as BigInt64Array;
    expect(srData[0]).toBe(16000n);
  });
});
