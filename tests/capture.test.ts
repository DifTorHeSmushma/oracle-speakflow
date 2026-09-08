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

import { startContinuousCapture, chunkWavBySec, buildWavBuffer, trimWavToMaxSec } from "../src/services/capture.js";

const FRAME_SAMPLES = 512;
const FRAME_BYTES = FRAME_SAMPLES * 2;
const SAMPLE_RATE = 16000;

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

function pcmSeconds(sec: number, fill = 1000): Buffer {
  const samples = Math.floor(sec * SAMPLE_RATE);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(fill, i * 2);
  return pcm;
}

describe("chunkWavBySec", () => {
  it("returns single wav when under chunk length", () => {
    const wav = buildWavBuffer(pcmSeconds(10));
    const chunks = chunkWavBySec(wav, 25);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.length).toBe(wav.length);
  });

  it("splits chronologically and preserves full PCM (no head drop)", () => {
    const wav = buildWavBuffer(pcmSeconds(60, 42));
    const chunks = chunkWavBySec(wav, 25);
    expect(chunks.length).toBeGreaterThan(1);

    const rejoined = Buffer.concat(chunks.map((c) => c.subarray(44)));
    expect(rejoined.equals(wav.subarray(44))).toBe(true);
  });

  it("absorbs a short final tail into the last chunk", () => {
    // 50.2s @ 25s chunks → two chunks (25 + 25.2), not three with a dropped 0.2s
    const wav = buildWavBuffer(pcmSeconds(50.2));
    const chunks = chunkWavBySec(wav, 25);
    expect(chunks).toHaveLength(2);
    const totalPcm = chunks.reduce((n, c) => n + (c.length - 44), 0);
    expect(totalPcm).toBe(wav.length - 44);
  });

  it("preserves full PCM with overlap (no head drop)", () => {
    const wav = buildWavBuffer(pcmSeconds(60, 7));
    const chunks = chunkWavBySec(wav, 25, 1);
    expect(chunks.length).toBeGreaterThan(1);
    // Chronological: first chunk starts at PCM byte 0
    expect(chunks[0]!.subarray(44).equals(wav.subarray(44, 44 + chunks[0]!.length - 44))).toBe(true);
  });

  it("trimWavToMaxSec keeps only the trailing window (regression: old F8 bug)", () => {
    const wav = buildWavBuffer(pcmSeconds(60));
    const trimmed = trimWavToMaxSec(wav, 28);
    expect(trimmed.length - 44).toBe(28 * SAMPLE_RATE * 2);
  });
});

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

  it("speech start uses atFrame clock when VAD process is lagged", () => {
    const result = startContinuousCapture();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Ring advances to 20 while VAD is still deciding on frame 10.
    for (let i = 0; i < 20; i++) pushFrame(proc, 100);
    result.value.markSoftOnset(5);
    result.value.markSpeechStart(3, 10); // soft span wins → start at frame 5
    for (let i = 0; i < 5; i++) pushFrame(proc, 200);

    // Live head=25, start=5 → 20 frames (not ~8 if stamped on live clock).
    const detailed = result.value.takeSegmentDetailed(0);
    expect(detailed.meta.speechStartFrame).toBe(5);
    expect(detailed.meta.speechFrameCount).toBe(20);
    expect(detailed.gainedWav.length).toBe(44 + 20 * FRAME_BYTES);
  });
});
