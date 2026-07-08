// CJS preload — compiled to dist/preload.cjs.
// Using .cts (CommonJS TypeScript) guarantees Electron loads this with require(),
// avoiding all ESM preload edge cases where contextBridge.exposeInMainWorld
// silently fails to populate window.electronAPI in the renderer.
import type { StateChangePayload, ConfigUpdatePayload, McpToolCallPayload, VoiceSettingsPayload, DictionaryPayload } from "./types/ipc.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

// Expose a typed IPC bridge to the renderer (contextIsolation: true)
contextBridge.exposeInMainWorld("electronAPI", {
  onStateChange: (callback: (payload: StateChangePayload) => void) => {
    console.log("[PRELOAD] onStateChange listener registered");
    ipcRenderer.on("state-change", (_event, payload: StateChangePayload) => {
      console.log(`[PRELOAD] state-change received: ${JSON.stringify({ state: payload.state, hasTranscript: !!payload.transcript, hasError: !!payload.error })}`);
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
  verifyApiKey: (candidate: string): Promise<boolean> => {
    return ipcRenderer.invoke("verify-api-key", candidate);
  },
  hasApiKey: (): Promise<boolean> => {
    return ipcRenderer.invoke("has-api-key");
  },
  quit: () => {
    ipcRenderer.send("quit-app");
  },
  stopRecording: () => {
    ipcRenderer.send("stop-recording");
  },
  toggleMute: (): Promise<boolean> => {
    return ipcRenderer.invoke("toggle-mute");
  },
  getMuteState: (): Promise<boolean> => {
    return ipcRenderer.invoke("get-mute-state");
  },
  onMuteChange: (callback: (muted: boolean) => void) => {
    ipcRenderer.on("mute-change", (_event, payload: { muted: boolean }) => callback(payload.muted));
    return () => { ipcRenderer.removeAllListeners("mute-change"); };
  },
  copyToClipboard: (text: string) => {
    ipcRenderer.send("copy-to-clipboard", text);
  },
  hideWindow: () => {
    ipcRenderer.send("hide-window");
  },
  // FR-M3-04: MCP tool-call notification (fired when headless MCP process serves a tool).
  onMcpToolCall: (callback: (payload: McpToolCallPayload) => void) => {
    ipcRenderer.on("mcp-tool-call", (_event, payload: McpToolCallPayload) => callback(payload));
    return () => { ipcRenderer.removeAllListeners("mcp-tool-call"); };
  },
  // T-08: Hotkey query
  getHotkey: (): Promise<import("./types/ipc.js").HotkeyConfig> => {
    return ipcRenderer.invoke("get-hotkey");
  },
  // P3-T06: Model downloader
  checkModel: (): Promise<boolean> => {
    return ipcRenderer.invoke("check-model");
  },
  downloadModel: (): Promise<void> => {
    return ipcRenderer.invoke("download-model");
  },
  onModelDownloadProgress: (callback: (pct: number) => void) => {
    ipcRenderer.on("model-download-progress", (_event, pct: number) => callback(pct));
    return () => { ipcRenderer.removeAllListeners("model-download-progress"); };
  },
  // P3-T12: open allowlisted URL in default browser
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke("open-external", url);
  },
  getVoiceSettings: (): Promise<VoiceSettingsPayload | null> => {
    return ipcRenderer.invoke("get-voice-settings");
  },
  getDictionary: (): Promise<DictionaryPayload> => {
    return ipcRenderer.invoke("get-dictionary");
  },
  saveDictionary: (dict: DictionaryPayload): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke("save-dictionary", dict);
  },
  importDictionary: (json: string): Promise<{ ok: boolean; dictionary?: DictionaryPayload; error?: string }> => {
    return ipcRenderer.invoke("import-dictionary", json);
  },
  exportDictionary: (): Promise<string> => {
    return ipcRenderer.invoke("export-dictionary");
  },
  // Test-only: inject synthetic state events (only available in TEST_MODE)
  testSetState: (payload: StateChangePayload) => {
    ipcRenderer.send("test:set-state", payload);
  },
  testQuit: () => {
    ipcRenderer.send("test:quit");
  },
});
