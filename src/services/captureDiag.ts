/**
 * Phase 0 capture diagnostics — evidence only (SPEAKFLOW_CAPTURE_DIAG=1).
 * No default behavior changes. Never logs transcript text.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RING_BUFFER_FRAMES = 300;
export const FRAME_SAMPLES = 512;
export const FRAME_BYTES = FRAME_SAMPLES * 2;
export const SAMPLE_RATE = 16_000;

export function isCaptureDiagEnabled(): boolean {
  return process.env["SPEAKFLOW_CAPTURE_DIAG"]?.trim() === "1";
}

/** Count samples that would exceed int16 after unclamped multiply by gain. */
export function countClipSamplesS16le(s16le: Buffer, gain: number): { peak: number; clipSamples: number } {
  let peak = 0;
  let clipSamples = 0;
  for (let i = 0; i < s16le.length; i += 2) {
    const raw = s16le.readInt16LE(i);
    const abs = Math.abs(raw);
    if (abs > peak) peak = abs;
    if (Math.abs(raw * gain) > 32767) clipSamples++;
  }
  return { peak, clipSamples };
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type CaptureSegmentMeta = {
  speechStartFrame: number;
  speechEndFrame: number;
  speechFrameCount: number;
  padFrames: number;
  takeCount: number;
  ringCount: number;
  ringCapacity: number;
  truncated: boolean;
  softOnsetFrame: number | null;
  backdateFramesUsed: number;
  micGain: number;
  totalFrames: number;
  rawPeak: number;
  rawClipSamples: number;
  gainedPeak: number;
  gainedClipSamples: number;
  gainedClipFrac: number;
  sampleRate: number;
};

export type CaptureSegmentDetailed = {
  gainedWav: Buffer;
  rawWav: Buffer;
  rawPcm: Buffer;
  gainedPcm: Buffer;
  meta: CaptureSegmentMeta;
};

export type UtteranceDiagEvent = {
  utteranceId: string;
  ts: string;
  voiceMode: "handsFree" | "ptt";
  platform: NodeJS.Platform;
  deviceId: string | null;
  micGain: number;
  sampleRate: number;
  ttfbMs: number | null;
  ffmpegSpawnMs: number | null;
  firstPcmMs: number | null;
  ffmpegRterrCount: number;
  bytesPerSecWindow: number | null;
  vadQueueDepthMax: number | null;
  vadProcessLagFrames: number | null;
  ortRunMs: number | null;
  speechStartFrame: number | null;
  softOnsetFrame: number | null;
  speechEndFrame: number | null;
  padFrames: number | null;
  takeCount: number | null;
  ringCountAtTake: number | null;
  truncated: boolean | null;
  rawPeak: number | null;
  rawClipSamples: number | null;
  gainedPeak: number | null;
  gainedClipSamples: number | null;
  gainedClipFrac: number | null;
  segmentSha256Raw: string | null;
  segmentSha256Gained: string | null;
  rawWavPath: string | null;
  gainedWavPath: string | null;
  accepted: boolean;
  discardReason: string | null;
  appStateAtSpeechEnd: string | null;
  blankAudioFlag: boolean;
  transcriptionMode: string | null;
  modelTier: string | null;
  asrTextHash: string | null;
};

export function resolveDiagDir(userData: string): string {
  return join(userData, "capture-diag");
}

export function ensureDiagDir(userData: string): string {
  const dir = resolveDiagDir(userData);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeUtteranceArtifacts(
  userData: string,
  utteranceId: string,
  rawWav: Buffer,
  gainedWav: Buffer,
  event: UtteranceDiagEvent
): { rawWavPath: string; gainedWavPath: string } {
  const dir = ensureDiagDir(userData);
  const rawWavPath = join(dir, `${utteranceId}.raw.wav`);
  const gainedWavPath = join(dir, `${utteranceId}.gained.wav`);
  writeFileSync(rawWavPath, rawWav);
  writeFileSync(gainedWavPath, gainedWav);
  const line = JSON.stringify({ ...event, rawWavPath, gainedWavPath }) + "\n";
  appendFileSync(join(dir, "utterances.jsonl"), line, "utf8");
  return { rawWavPath, gainedWavPath };
}

export function newUtteranceId(): string {
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function hashTranscriptForDiag(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8")).slice(0, 16);
}

export function looksLikeBlankAudioMarker(text: string): boolean {
  return /\[BLANK_AUDIO\]/i.test(text);
}
