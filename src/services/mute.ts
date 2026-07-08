export type MuteState = { muted: boolean; reason: "user" | "callApp" | "micBusy" | null };

// A5 production-safe defaults: exactly four apps; msedgewebview2.exe deliberately excluded.
export const DEFAULT_CALL_APP_ALLOWLIST = ["Zoom.exe", "Teams.exe", "ms-teams.exe", "Discord.exe"];

let _state: MuteState = { muted: false, reason: null };
const _listeners: Array<(s: MuteState) => void> = [];

function _notify(): void {
  for (const cb of _listeners) cb({ ..._state });
}

export const getMuteState = (): MuteState => ({ ..._state });

export const setUserMute = (on: boolean): void => {
  const wasM = _state.muted;
  if (on) {
    _state = { muted: true, reason: "user" };
  } else {
    _state = { muted: false, reason: null };
  }
  if (_state.muted !== wasM) _notify();
};

// Called by Wave 2 call-app poll. Does not override a user mute.
export const setCallAppMute = (on: boolean): void => {
  const wasM = _state.muted;
  if (on && _state.reason !== "user") {
    _state = { muted: true, reason: "callApp" };
  } else if (!on && _state.reason === "callApp") {
    _state = { muted: false, reason: null };
  }
  if (_state.muted !== wasM) _notify();
};

// Called by Wave 2 capture restart logic when DirectShow device is busy.
export const setMicBusy = (busy: boolean): void => {
  const wasM = _state.muted;
  if (busy && _state.reason !== "user") {
    _state = { muted: true, reason: "micBusy" };
  } else if (!busy && _state.reason === "micBusy") {
    _state = { muted: false, reason: null };
  }
  if (_state.muted !== wasM) _notify();
};

export const onMuteChange = (cb: (s: MuteState) => void): void => {
  _listeners.push(cb);
};

/**
 * Returns true if any process in runningProcesses matches the allowlist (case-insensitive).
 * Wave 2 wires the OS process poll; Wave 1.1 exposes the logic for unit testing.
 */
export const isCallAppActive = (runningProcesses: string[], allowlist: string[]): boolean =>
  runningProcesses.some((proc) =>
    allowlist.some((app) => proc.toLowerCase() === app.toLowerCase())
  );

// For unit tests only — resets module-level state between test cases.
export const _resetForTest = (): void => {
  _state = { muted: false, reason: null };
  _listeners.length = 0;
};
