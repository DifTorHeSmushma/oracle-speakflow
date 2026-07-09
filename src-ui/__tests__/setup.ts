import "@testing-library/jest-dom";
import { vi, afterEach } from "vitest";

function defaultVoiceSettings() {
  return {
    voiceMode: "handsFree" as const,
    vad: {
      positiveSpeechThreshold: 0.42,
      negativeSpeechThreshold: 0.28,
      minSpeechFrames: 6,
      redemptionFrames: 40,
      preSpeechPadFrames: 20,
    },
    correction: { llmEnabled: false, llmLatencyBudgetMs: 200 },
    terminalVariantEnabled: false,
    firstRunExplainerDismissed: true,
  };
}

function defaultConfigSnapshot() {
  return {
    transcriptionMode: "remote" as const,
    modelTier: "fast" as const,
    model: "whisper-large-v3-turbo",
    language: "en",
  };
}

function defaultTierStatus() {
  return [
    { tier: "fast" as const,     available: true,  downloading: false, pct: 0 },
    { tier: "balanced" as const, available: false, downloading: false, pct: 0 },
    { tier: "accurate" as const, available: false, downloading: false, pct: 0 },
  ];
}

// Mock window.electronAPI globally for all component tests
const mockElectronAPI = {
  onStateChange: vi.fn(() => vi.fn()), // returns unsubscribe fn
  sendConfigUpdate: vi.fn(),
  getHotkey: vi.fn().mockResolvedValue({ ctrl: false, shift: false, alt: false, keycode: 66 }),
  hasApiKey: vi.fn().mockResolvedValue(true),
  verifyApiKey: vi.fn().mockResolvedValue(true), // default: verification passes
  copyToClipboard: vi.fn(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  getVoiceSettings: vi.fn().mockResolvedValue(defaultVoiceSettings()),
  getDictionary: vi.fn().mockResolvedValue({ version: 1, entries: [] }),
  saveDictionary: vi.fn().mockResolvedValue({ ok: true }),
  importDictionary: vi.fn().mockResolvedValue({ ok: true, dictionary: { version: 1, entries: [] } }),
  exportDictionary: vi.fn().mockResolvedValue('{"version":1,"entries":[]}'),
  getMuteState: vi.fn().mockResolvedValue(false),
  onMuteChange: vi.fn(() => vi.fn()),
  toggleMute: vi.fn().mockResolvedValue(false),
  hideWindow: vi.fn(),
  // Hotfix-A/B: tier IPC and config snapshot (replace removed checkModel/downloadModel)
  getConfigSnapshot: vi.fn().mockResolvedValue(defaultConfigSnapshot()),
  getTierStatus: vi.fn().mockResolvedValue(defaultTierStatus()),
  downloadTier: vi.fn().mockResolvedValue({ ok: true }),
  cancelTierDownload: vi.fn(),
  selectTier: vi.fn(),
  onModelDownloadProgress: vi.fn(() => vi.fn()),
  debugLastPipelineStatus: vi.fn().mockResolvedValue({
    transcriptionMode: "remote",
    modelTier: "fast",
    lastErrorKind: null,
    clipboardWriteRan: false,
  }),
};

function restoreElectronMocks(): void {
  mockElectronAPI.onStateChange.mockImplementation(() => vi.fn());
  mockElectronAPI.sendConfigUpdate.mockImplementation(() => undefined);
  mockElectronAPI.getHotkey.mockResolvedValue({ ctrl: false, shift: false, alt: false, keycode: 66 });
  mockElectronAPI.hasApiKey.mockResolvedValue(true);
  mockElectronAPI.verifyApiKey.mockResolvedValue(true);
  mockElectronAPI.copyToClipboard.mockImplementation(() => undefined);
  mockElectronAPI.openExternal.mockResolvedValue(undefined);
  mockElectronAPI.getVoiceSettings.mockResolvedValue(defaultVoiceSettings());
  mockElectronAPI.getDictionary.mockResolvedValue({ version: 1, entries: [] });
  mockElectronAPI.saveDictionary.mockResolvedValue({ ok: true });
  mockElectronAPI.importDictionary.mockResolvedValue({ ok: true, dictionary: { version: 1, entries: [] } });
  mockElectronAPI.exportDictionary.mockResolvedValue('{"version":1,"entries":[]}');
  mockElectronAPI.getMuteState.mockResolvedValue(false);
  mockElectronAPI.onMuteChange.mockImplementation(() => vi.fn());
  mockElectronAPI.toggleMute.mockResolvedValue(false);
  mockElectronAPI.hideWindow.mockImplementation(() => undefined);
  mockElectronAPI.getConfigSnapshot.mockResolvedValue(defaultConfigSnapshot());
  mockElectronAPI.getTierStatus.mockResolvedValue(defaultTierStatus());
  mockElectronAPI.downloadTier.mockResolvedValue({ ok: true });
  mockElectronAPI.cancelTierDownload.mockImplementation(() => undefined);
  mockElectronAPI.selectTier.mockImplementation(() => undefined);
  mockElectronAPI.onModelDownloadProgress.mockImplementation(() => vi.fn());
  mockElectronAPI.debugLastPipelineStatus.mockResolvedValue({
    transcriptionMode: "remote",
    modelTier: "fast",
    lastErrorKind: null,
    clipboardWriteRan: false,
  });
}

afterEach(() => {
  restoreElectronMocks();
});

Object.defineProperty(window, "electronAPI", {
  value: mockElectronAPI,
  writable: true,
});

export { mockElectronAPI };
