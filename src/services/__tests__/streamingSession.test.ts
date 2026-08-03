import { describe, it, expect, vi } from "vitest";
import { Ok, Err } from "../../utils/result.js";
import {
  createStreamingSession,
  STREAM_CHUNK_FRAMES,
} from "../streamingSession.js";
import { buildWavBuffer } from "../capture.js";

/** Non-silent PCM so energy gate does not skip test chunks. */
function fakeWav(): Buffer {
  const pcm = Buffer.alloc(512 * 2);
  for (let i = 0; i < 512; i++) pcm.writeInt16LE(5000, i * 2);
  return buildWavBuffer(pcm);
}

function silentWav(): Buffer {
  return buildWavBuffer(Buffer.alloc(512 * 2));
}

describe("streamingSession", () => {
  it("does not emit partial before chunkFrames of new audio", async () => {
    const onPartial = vi.fn();
    const transcribeChunk = vi.fn().mockResolvedValue(Ok("hello"));
    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 5,
      overlapFrames: 1,
    });

    for (let i = 0; i < 4; i++) session.pushFrame();
    await new Promise((r) => setTimeout(r, 20));
    expect(transcribeChunk).not.toHaveBeenCalled();
    expect(onPartial).not.toHaveBeenCalled();
  });

  it("emits partial after chunkFrames and merges subsequent chunks", async () => {
    const onPartial = vi.fn();
    const transcribeChunk = vi
      .fn()
      .mockResolvedValueOnce(Ok("hello"))
      .mockResolvedValueOnce(Ok("hello world"));

    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 3,
      overlapFrames: 1,
    });

    for (let i = 0; i < 3; i++) session.pushFrame();
    await new Promise((r) => setTimeout(r, 30));
    expect(onPartial).toHaveBeenCalled();
    expect(onPartial.mock.calls[0]?.[0]).toBe("hello");

    for (let i = 0; i < 3; i++) session.pushFrame();
    await new Promise((r) => setTimeout(r, 40));
    expect(session.getAssembledText()).toContain("hello");
  });

  it("skips API for low-energy (silence) chunks", async () => {
    const onPartial = vi.fn();
    const transcribeChunk = vi.fn().mockResolvedValue(Ok("Thank you."));
    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => silentWav(),
      onPartial,
      chunkFrames: 2,
      overlapFrames: 0,
    });
    session.pushFrame();
    session.pushFrame();
    await new Promise((r) => setTimeout(r, 40));
    expect(transcribeChunk).not.toHaveBeenCalled();
    expect(onPartial).not.toHaveBeenCalled();
  });

  it("rejects thank-you hallucination chunks without pasting", async () => {
    const onPartial = vi.fn();
    const transcribeChunk = vi.fn().mockResolvedValue(Ok("Thank you."));
    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 2,
      overlapFrames: 0,
    });
    session.pushFrame();
    session.pushFrame();
    await new Promise((r) => setTimeout(r, 40));
    expect(transcribeChunk).toHaveBeenCalled();
    expect(onPartial).not.toHaveBeenCalled();
    expect(session.getAssembledText()).toBe("");
  });

  it("requestFinalize flushes remaining frames", async () => {
    const onPartial = vi.fn();
    const transcribeChunk = vi.fn().mockResolvedValue(Ok("final bits of dictation here"));
    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: STREAM_CHUNK_FRAMES,
      overlapFrames: 2,
    });

    for (let i = 0; i < 10; i++) session.pushFrame();
    const text = await session.requestFinalize();
    expect(transcribeChunk).toHaveBeenCalled();
    expect(text).toBe("final bits of dictation here");
    expect(session.isActive()).toBe(false);
  });

  it("abort stops further partials", async () => {
    const onPartial = vi.fn();
    let resolveChunk!: (v: ReturnType<typeof Ok<string>>) => void;
    const transcribeChunk = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChunk = resolve as (v: ReturnType<typeof Ok<string>>) => void;
        })
    );

    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 2,
      overlapFrames: 0,
    });

    session.pushFrame();
    session.pushFrame();
    await new Promise((r) => setTimeout(r, 10));
    session.abort();
    resolveChunk(Ok("should not land"));
    await new Promise((r) => setTimeout(r, 20));
    expect(onPartial).not.toHaveBeenCalled();
  });

  it("coalesces in-flight chunks (does not stack concurrent pastes)", async () => {
    const onPartial = vi.fn();
    let inflight = 0;
    let maxInflight = 0;
    const transcribeChunk = vi.fn().mockImplementation(async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight--;
      return Ok("hello there friend");
    });

    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 2,
      overlapFrames: 0,
    });

    for (let i = 0; i < 10; i++) session.pushFrame();
    await new Promise((r) => setTimeout(r, 200));
    expect(maxInflight).toBe(1);
  });

  it("does not treat chunk failure as partial text", async () => {
    const onPartial = vi.fn();
    const transcribeChunk = vi
      .fn()
      .mockResolvedValue(Err({ kind: "emptyTranscription" as const }));
    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 2,
      overlapFrames: 0,
    });
    session.pushFrame();
    session.pushFrame();
    await new Promise((r) => setTimeout(r, 30));
    expect(onPartial).not.toHaveBeenCalled();
  });

  it("drainInFlight keeps in-flight chunk result (no abort discard)", async () => {
    const onPartial = vi.fn();
    let resolveChunk!: (v: ReturnType<typeof Ok<string>>) => void;
    const transcribeChunk = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChunk = resolve as (v: ReturnType<typeof Ok<string>>) => void;
        })
    );

    const session = createStreamingSession({
      transcribeChunk,
      getChunkWav: () => fakeWav(),
      onPartial,
      chunkFrames: 2,
      overlapFrames: 0,
    });

    session.pushFrame();
    session.pushFrame();
    await new Promise((r) => setTimeout(r, 10));

    const drainPromise = session.drainInFlight();
    resolveChunk(Ok("Rename the helper function please"));
    const text = await drainPromise;
    expect(text).toContain("Rename");
    expect(onPartial).toHaveBeenCalled();
  });
});
