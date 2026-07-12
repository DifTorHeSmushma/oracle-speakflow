import type { StateChangePayload, ConfigUpdatePayload, McpToolCallPayload, HotkeyConfig, VoiceSettingsPayload, DictionaryPayload, ConfigSnapshotPayload, TierStatusPayload, DiskCheckPayload, ModelTier, LastPipelineStatusPayload, PlatformCapsPayload } from "../src/types/ipc.js";

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
      // Hotfix-A: config snapshot for Settings UI hydration
      getConfigSnapshot: () => Promise<ConfigSnapshotPayload | null>;
      // Wave 2 tier IPC (replaces removed check-model / download-model)
      getTierStatus: () => Promise<TierStatusPayload[]>;
      checkDisk: (tier: ModelTier) => Promise<DiskCheckPayload>;
      downloadTier: (tier: ModelTier) => Promise<{ ok: boolean; error?: string }>;
      cancelTierDownload: () => void;
      selectTier: (tier: ModelTier) => void;
      onModelDownloadProgress: (callback: (pct: number) => void) => () => void;
      // Hotfix-D: dev-only pipeline self-check
      debugLastPipelineStatus: () => Promise<LastPipelineStatusPayload>;
      // P3-T12: Open allowlisted URL in default browser
      openExternal: (url: string) => Promise<void>;
      getVoiceSettings: () => Promise<VoiceSettingsPayload | null>;
      getDictionary: () => Promise<DictionaryPayload>;
      saveDictionary: (dict: DictionaryPayload) => Promise<{ ok: boolean; error?: string }>;
      importDictionary: (json: string) => Promise<{ ok: boolean; dictionary?: DictionaryPayload; error?: string }>;
      exportDictionary: () => Promise<string>;
      // Wave 7e: platform capabilities (session type, pttAvailable, autoPaste)
      onPlatformCaps: (callback: (payload: PlatformCapsPayload) => void) => () => void;
      // Test-only (TEST_MODE)
      testSetState: (payload: StateChangePayload) => void;
      testQuit: () => void;
    };
  }
}

export {};
