// Pure-ish foreground tracker — module-local state, testable via injected nowMs.
// No new native deps: consumes ForegroundInfo already produced by the existing 1s poll (A-4).
// Wired to the poll in Wave 3; pure logic + tests live here in Wave 1.1.
import type { ForegroundInfo } from "../utils/foreground-types.js";

export type TrackedTarget = { info: NonNullable<ForegroundInfo>; sampledAtMs: number } | null;

// ---------------------------------------------------------------------------
// Module-local state
// ---------------------------------------------------------------------------

let _lastExternalTarget: TrackedTarget = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called by the existing 1s foreground poll while LISTENING/armed.
 * Stores the sample only when it is an external (non-own-window) sample with non-null info.
 */
export const recordExternalSample = (
  info: ForegroundInfo | null,
  isOwnWindow: boolean,
  nowMs: number,
): void => {
  if (isOwnWindow || !info) return;
  _lastExternalTarget = { info, sampledAtMs: nowMs };
};

/**
 * Returns the freshest external target if its age is within maxAgeMs; otherwise null.
 */
export const getPriorExternalTarget = (nowMs: number, maxAgeMs: number): TrackedTarget => {
  if (!_lastExternalTarget) return null;
  if (nowMs - _lastExternalTarget.sampledAtMs > maxAgeMs) return null;
  return _lastExternalTarget;
};

/**
 * Snapshots the current external target at speechStart/keydown.
 * Returns a shallow copy so the caller owns a stable snapshot.
 */
export const captureNow = (_nowMs: number): TrackedTarget => {
  if (!_lastExternalTarget) return null;
  return { ..._lastExternalTarget };
};

/** Test helper — resets module-local state between tests. */
export const _resetForTest = (): void => {
  _lastExternalTarget = null;
};
