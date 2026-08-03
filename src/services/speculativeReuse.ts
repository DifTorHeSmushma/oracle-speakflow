/**
 * Latency contract (#13): reuse in-flight speculative finalize when the final
 * session did not grow past hangover slack — avoid starting Groq only at speech_end.
 * @see docs/DESIGN/LATENCY_CONTRACT.md
 */

/** ~1.5 s — hangover / silence-hint growth after an early kick. */
export const SPEC_REUSE_FRAME_SLACK = 48;

/** First mid-speech kick (~2.0 s of session speech). */
export const EARLY_SPEC_MIN_FRAMES = 62;

/**
 * Refresh interval for mid-speech kicks (~3.0 s).
 * Faster refreshes were gen++ killing in-flight calls before silence-hint.
 */
export const EARLY_SPEC_INTERVAL_FRAMES = 94;

export function shouldReuseSpeculative(input: {
  hasPromise: boolean;
  speculativeSessionFrames: number;
  finalSpeechFrames: number;
  slackFrames?: number;
}): boolean {
  const slack = input.slackFrames ?? SPEC_REUSE_FRAME_SLACK;
  if (!input.hasPromise) return false;
  if (input.speculativeSessionFrames <= 0) return false;
  if (input.finalSpeechFrames <= 0) return false;
  return input.finalSpeechFrames - input.speculativeSessionFrames <= slack;
}

/** Whether session frame count warrants a new mid-speech speculative kick. */
export function shouldKickEarlySpeculative(input: {
  sessionFrames: number;
  lastKickFrames: number;
  minFrames?: number;
  intervalFrames?: number;
}): boolean {
  const min = input.minFrames ?? EARLY_SPEC_MIN_FRAMES;
  const interval = input.intervalFrames ?? EARLY_SPEC_INTERVAL_FRAMES;
  if (input.sessionFrames < min) return false;
  if (input.lastKickFrames <= 0) return true;
  return input.sessionFrames - input.lastKickFrames >= interval;
}
