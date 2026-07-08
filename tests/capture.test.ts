import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";

const { mockSpawnFn, mockExistsSync } = vi.hoisted(() => ({
  mockSpawnFn: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(false),
}));

vi.mock("node:child_process", () => ({ spawn: mockSpawnFn }));
vi.mock("node:fs", () => ({ existsSync: mockExistsSync }));
vi.mock("../src/utils/binaryPath.js", () => ({
  getBinaryPath: vi.fn().mockReturnValue("resources/bin/ffmpeg.exe"),
}));
vi.mock("../src/utils/dshow-audio.js", () => ({
  resolveDshowAudioInput: vi.fn().mockReturnValue("audio=test-mic"),
}));

import { startContinuousCapture } from "../src/services/capture.js";

const FRAME_SAMPLES = 512;
const FRAME_BYTES = FRAME_SAMPLES * 2;

type ProcMock = EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn> };

function makeProc(): ProcMock {
  const emitter = new EventEmitter() as ProcMock;
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  emitter.kill = vi.fn();
  return emitter;
}

function pushFrame(proc: ProcMock, fill = 1000): void {
  const buf = Buffer.alloc(FRAME_BYTES);
  for (let i = 0; i < FRAME_SAMPLES; i++) buf.writeInt16LE(fill, i * 2);
  proc.stdout.write(buf);
}

describe("capture service", () => {
  let proc: ProcMock;

  beforeEach(() => {
    vi.clearAllMocks();
    proc = makeProc();
    mockSpawnFn.mockReturnValue(proc);
  });

  afterEach(() => {
    proc.stdout.destroy();
    proc.stderr.destroy();
  });

  it("soft onset extends segment further back than backdate alone", () => {
    const result = startContinuousCapture();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (let i = 0; i < 5; i++) pushFrame(proc, 50);
    result.value.markSoftOnset(); // frame 5
    for (let i = 0; i < 3; i++) pushFrame(proc, 100);
    result.value.markSpeechStart(2); // frame 8, soft span=3 beats backdate=2
    for (let i = 0; i < 2; i++) pushFrame(proc, 200);

    const wav = result.value.takeSegment(0);
    expect(wav.length).toBe(44 + 5 * FRAME_BYTES);
  });
});
