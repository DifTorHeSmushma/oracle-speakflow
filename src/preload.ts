// Use createRequire to load Electron's contextBridge/ipcRenderer.
// ESM preloads with bare `import from "electron"` fail silently in some Electron
// builds when contextIsolation: true — the contextBridge call never executes and
// window.electronAPI remains undefined in the renderer. createRequire is the
// reliable cross-version pattern for Electron preload scripts in ESM projects.
import { createRequire } from "node:module";
const { contextBridge, ipcRenderer } = createRequire(import.meta.url)("electron") as typeof import("electron");
import type { StateChangePayload, ConfigUpdatePayload, HotkeyConfig } from "./types/ipc.js";

// Expose a typed IPC bridge to the renderer (contextIsolation: true)
contextBridge.exposeInMainWorld("electronAPI", {
  onStateChange: (callback: (payload: StateChangePayload) => void) => {
    ipcRenderer.on("state-change", (_event, payload: StateChangePayload) => {
      callback(payload);
    });
    // Return an unsubscribe function
    return () => {
      ipcRenderer.removeAllListeners("state-change");
    };
  },
  sendConfigUpdate: (payload: ConfigUpdatePayload) => {
    ipcRenderer.send("config-update", payload);
  },
  getHotkey: (): Promise<HotkeyConfig> => ipcRenderer.invoke("get-hotkey"),
  copyToClipboard: (text: string) => {
    ipcRenderer.send("copy-to-clipboard", text);
  },
  hideWindow: () => {
    ipcRenderer.send("hide-window");
  },
  // Test-only: inject synthetic state events (only available in TEST_MODE)
  testSetState: (payload: StateChangePayload) => {
    ipcRenderer.send("test:set-state", payload);
  },
  testQuit: () => {
    ipcRenderer.send("test:quit");
  },
});
