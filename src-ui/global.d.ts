import type { StateChangePayload, ConfigUpdatePayload, McpToolCallPayload, HotkeyConfig, VoiceSettingsPayload, DictionaryPayload } from "../src/types/ipc.js";

declare global {
  interface Window {
    electronAPI: {
      onStateChange: (callback: (payload: StateChangePayload) => void) => () => void;
      onMcpToolCall: (callback: (payload: McpToolCallPayload) => void) => () => void;
      sendConfigUpdate: (payload: ConfigUpdatePayload) => void;
      getHotkey: () => Promise<HotkeyConfig>;
      verifyApiKey: (candidate: string) => Promise<boolean>;
      hasApiKey: () => Promise<boolean>;
      quit: () => void;
      stopRecording: () => void;
      toggleMute: () => Promise<boolean>;
      getMuteState: () => Promise<boolean>;
      onMuteChange: (callback: (muted: boolean) => void) => () => void;
      copyToClipboard: (text: string) => void;
      hideWindow: () => void;
      // P3-T06: Model downloader
      checkModel: () => Promise<boolean>;
      downloadModel: () => Promise<void>;
      onModelDownloadProgress: (callback: (pct: number) => void) => () => void;
      // P3-T12: Open allowlisted URL in default browser
      openExternal: (url: string) => Promise<void>;
      getVoiceSettings: () => Promise<VoiceSettingsPayload | null>;
      getDictionary: () => Promise<DictionaryPayload>;
      saveDictionary: (dict: DictionaryPayload) => Promise<{ ok: boolean; error?: string }>;
      importDictionary: (json: string) => Promise<{ ok: boolean; dictionary?: DictionaryPayload; error?: string }>;
      exportDictionary: () => Promise<string>;
      // Test-only (TEST_MODE)
      testSetState: (payload: StateChangePayload) => void;
      testQuit: () => void;
    };
  }
}

export {};
