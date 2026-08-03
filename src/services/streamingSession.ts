import type { Result } from "../utils/result.js";
import type { TranscriptionError } from "./transcription.js";
import {
  chunkHasSpeechEnergy,
  decideChunkMerge,
  DEFAULT_CHUNK_MIN_PEAK,
} from "./streamHygiene.js";

/** ~1.0 s of new speech between chunk sends (31 × 32 ms) — earlier first partial vs 1.5 s. */
export const STREAM_CHUNK_FRAMES = 31;
/** ~0.4 s overlap for boundary continuity (legacy sliding window; growing path uses 0…end). */
export const STREAM_OVERLAP_FRAMES = 12;
/** Cap growing Whisper context (~20 s) so chunks stay under Groq practical limits. */
export const STREAM_MAX_CONTEXT_FRAMES = Math.ceil(20 / 0.032);

/**
 * Fixed hygiene prompt only — never feed assembled text as Whisper `prompt`
 * (that poisoned Dom A2 into "thank you" / phrase loops on pause chunks).
 */
export const STREAM_CHUNK_PROMPT = "Transcribe spoken English dictation only.";

export type TranscribeChunkFn = (
  wav: Buffer,
  prompt: string | undefined
) => Promise<Result<string, TranscriptionError>>;

export type StreamingSessionOpts = {
  transcribeChunk: TranscribeChunkFn;
  getChunkWav: (startFrame: number, endFrame: number) => Buffer | null;
  chunkFrames?: number;
  overlapFrames?: number;
  /** Skip API when chunk peak |sample| is below this (default DEFAULT_CHUNK_MIN_PEAK). */
  minChunkPeak?: number;
  onPartial: (text: string, seq: number) => void;
};

export type StreamingSession = {
  pushFrame: () => void;
  syncFrameCount: (n: number) => void;
  /** Await in-flight chunk only (no trailing send). Prefer at speech_end for latency. */
  drainInFlight: () => Promise<string>;
  requestFinalize: () => Promise<string>;
  abort: () => void;
  getAssembledText: () => string;
  isActive: () => boolean;
};

/**
 * Phase-1 Groq chunked streaming session (issue #6).
 * Emits partial text only — never finalizes the dictation session itself.
 */
export const createStreamingSession = (opts: StreamingSessionOpts): StreamingSession => {
  const chunkFrames = opts.chunkFrames ?? STREAM_CHUNK_FRAMES;
  const overlapFrames = opts.overlapFrames ?? STREAM_OVERLAP_FRAMES;
  const minChunkPeak = opts.minChunkPeak ?? DEFAULT_CHUNK_MIN_PEAK;

  let frameCount = 0;
  let lastSentEnd = 0;
  let assembled = "";
  let seq = 0;
  let active = true;
  let inFlight: Promise<void> | null = null;
  let pendingAfterFlight = false;
  let aborted = false;

  const emitPartial = (text: string): void => {
    if (aborted) return;
    assembled = text;
    seq += 1;
    if (active) opts.onPartial(assembled, seq);
  };

  const runChunk = async (start: number, end: number): Promise<void> => {
    if (aborted || end <= start) return;
    const snapshotSeq = seq;
    const wav = opts.getChunkWav(start, end);
    if (!wav || wav.length <= 44) return;

    // Mid-pause silence → skip API (Whisper invents thank-you). Peak gate so brief speech survives.
    if (!chunkHasSpeechEnergy(wav, minChunkPeak)) {
      process.stderr.write(
        `[stream] skip low-energy chunk frames=${end - start} (peak gate)\n`
      );
      return;
    }

    const result = await opts.transcribeChunk(wav, STREAM_CHUNK_PROMPT);
    if (aborted) return;
    if (!result.ok) {
      process.stderr.write(
        `[stream] chunk fail kind=${result.error.kind} frames=${end - start}\n`
      );
      return;
    }
    if (seq > snapshotSeq) return;

    const decision = decideChunkMerge(assembled, result.value);
    if (!decision.accept) {
      process.stderr.write(`[stream] reject chunk reason=${decision.reason}\n`);
      return;
    }
    if (decision.merged !== assembled) emitPartial(decision.merged);
  };

  const maybeSend = (): void => {
    if (!active || aborted) return;
    const newFrames = frameCount - lastSentEnd;
    if (newFrames < chunkFrames) return;

    if (inFlight) {
      pendingAfterFlight = true;
      return;
    }

    const end = frameCount;
    // Issue #8: growing utterance window (0…end), not last ~1s only — short windows
    // invented fluent wrong sentences ("Speed flow, speech detect.").
    const start = Math.max(0, end - STREAM_MAX_CONTEXT_FRAMES);
    lastSentEnd = end;

    inFlight = runChunk(start, end).finally(() => {
      inFlight = null;
      if (pendingAfterFlight && active && !aborted) {
        pendingAfterFlight = false;
        maybeSend();
      }
    });
  };

  return {
    pushFrame() {
      if (!active || aborted) return;
      frameCount++;
      maybeSend();
    },

    syncFrameCount(n: number) {
      if (!active || aborted) return;
      frameCount = Math.max(0, n);
      maybeSend();
    },

    async drainInFlight() {
      // Keep `active` true while awaiting so onPartial still fires (Dom A2: abort
      // discarded ~7s Groq chunks that returned after speech_end → liveChars=0).
      if (inFlight) await inFlight;
      active = false;
      return assembled;
    },

    async requestFinalize() {
      if (inFlight) await inFlight;
      active = false;
      if (aborted) return assembled;

      const end = frameCount;
      if (end > lastSentEnd) {
        const start = Math.max(0, lastSentEnd - overlapFrames);
        await runChunk(start, end);
        lastSentEnd = end;
      } else if (end > 0 && assembled === "") {
        await runChunk(0, end);
        lastSentEnd = end;
      }
      return assembled;
    },

    abort() {
      aborted = true;
      active = false;
    },

    getAssembledText() {
      return assembled;
    },

    isActive() {
      return active && !aborted;
    },
  };
};
