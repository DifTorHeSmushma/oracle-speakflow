import { writable } from "svelte/store";
import type { StateChangePayload, ConfigUpdatePayload } from "../../src/types/ipc.js";

export type { StateChangePayload, ConfigUpdatePayload };
export type DaemonState = StateChangePayload["state"];

export type DaemonStore = {
  state: DaemonState;
  transcript?: string;
  error?: string;
};

export const daemonStore = writable<DaemonStore>({ state: "IDLE" });

// Wire up the IPC bridge from the preload script.
// window.electronAPI is exposed by src/preload.ts via contextBridge.
if (typeof window !== "undefined" && window.electronAPI) {
  console.log("[STORE] window.electronAPI found — registering onStateChange");
  window.electronAPI.onStateChange((payload: StateChangePayload) => {
    console.log(`[STORE] onStateChange fired: state=${payload.state} transcript="${payload.transcript?.slice(0, 40) ?? "(none)"}"`);
    daemonStore.set({
      state: payload.state,
      transcript: payload.transcript,
      error: payload.error,
    });
  });
} else {
  console.warn("[STORE] window.electronAPI NOT available — state changes will not reach UI");
}
