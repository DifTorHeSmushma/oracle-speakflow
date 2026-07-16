import { app, BrowserWindow, Tray, nativeImage, ipcMain, screen, clipboard, Menu, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createReadStream, watch, writeFileSync, readFileSync, existsSync, unlinkSync, statSync } from "node:fs";
import { exec } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { FSWatcher } from "node:fs";
import { uIOhook } from "uiohook-napi";
import { loadConfig, saveConfig } from "./utils/config.js";
import { transcribe } from "./services/transcription.js";
import { appendTranscript, readHistory } from "./services/transcript-store.js";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { isErr, isOk } from "./utils/result.js";
import { DEFAULT_HOTKEY, formatHotkeyLabel, HOTKEY_CONFIG_VERSION } from "./utils/defaultHotkey.js";
import { getForegroundInfo, nativeHandleEquals, getForegroundAndCheckWindow, isDarwinSpeakFlowApp, darwinForegroundMatches, isLinuxSpeakFlowWindow, linuxForegroundMatches, type ForegroundInfo } from "./utils/win32-window.js";
import { getLinuxSession } from "./utils/linux-session.js";
import { getLastLinuxReadMeta } from "./utils/linux-window.js";
import { recordExternalSample, captureNow, type TrackedTarget } from "./services/foregroundTracker.js";
import { decideYield } from "./services/yieldFocus.js";
import { startContinuousCapture, type CaptureSession } from "./services/capture.js";
import { createVad, type VadEvents, type SpeechEndPayload } from "./services/vad.js";
import { decidePaste, classifyTarget } from "./services/paste.js";
import { getMuteState, setUserMute, setCallAppMute, setMicBusy, isCallAppActive, onMuteChange } from "./services/mute.js";
import { correct } from "./services/correction.js";
import { loadDictionary, saveDictionary as persistDictionary, importDictionary, exportDictionary } from "./services/dictionary.js";
import type { StateChangePayload, ConfigUpdatePayload, AppState, HotkeyConfig, McpToolCallPayload, VoiceSettingsPayload, DictionaryPayload, ModelTier, TierStatusPayload, DiskCheckPayload, ConfigSnapshotPayload, LastPipelineStatusPayload, PlatformCapsPayload } from "./types/ipc.js";
import { getBinaryPath, getBundledBinDir } from "./utils/binaryPath.js";
import { downloadTier, checkDiskForTier } from "./services/modelDownloader.js";
import { isTierAvailable, resolveTierModel, TIER_LADDER } from "./services/modelRegistry.js";
import { startEngine, stopEngine, armIdleUnload, type EngineHandle } from "./services/localEngine.js";
import {
  isCaptureDiagEnabled,
  writeUtteranceArtifacts,
  newUtteranceId,
  hashTranscriptForDiag,
  looksLikeBlankAudioMarker,
  sha256Hex,
  type CaptureSegmentDetailed,
  type UtteranceDiagEvent,
} from "./services/captureDiag.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Constants — CLAUDE.md invariant #3: API key never logged
// ---------------------------------------------------------------------------
const MASKED_KEY = "sk-***";
const WINDOW_WIDTH = 320;
const WINDOW_HEIGHT = 500;

// URL allowlist for open-external IPC (P3-T12)
const EXTERNAL_URL_ALLOWLIST = [
  "https://www.buymeacoffee.com/oraclespeakflow",
  "https://github.com/sponsors/DifTorHeSmushma",
  "https://github.com/DifTorHeSmushma/oracle-speakflow",
];

// Tray icon: minimal 16×16 PNG (solid reddish-orange square) as data URL
const TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAI0lEQVQ4T2NkYGD4z8BAAoxqoIEGRjUw5DUw8BsYBiEHABiIAAF/o/6NAAAAAElFTkSuQmCC";

// ---------------------------------------------------------------------------
// Global UI handles
// ---------------------------------------------------------------------------
let tray: Tray | null = null;
let win: BrowserWindow | null = null;
// FR-M3-04: watcher for MCP tool-call notifications; closed on before-quit.
let mcpWatcher: FSWatcher | null = null;

// Suppress the blur→hide handler while we're programmatically showing the window.
// On Windows, win.show() from a background process gives the window a brief
// focus-then-blur cycle before focus settles, which would otherwise cause the
// window to immediately hide again before the user ever sees it.
let suppressBlur = false;

// ---------------------------------------------------------------------------
// State machine — IDLE/LISTENING/RECORDING/TRANSCRIBING/CORRECTING/INJECTING
// CLAUDE.md invariant #6: re-entry is forbidden.
// ---------------------------------------------------------------------------
type State = AppState;
let state: State = "IDLE";
let captureSession: CaptureSession | null = null;  // continuous FFmpeg stream (Invariant #17)
let vadEvents: VadEvents | null = null;
let callAppPollTimer: ReturnType<typeof setInterval> | null = null;

// Config directory — set to app.getPath('userData') once the app is ready so the
// .env file survives reinstalls.  Falls back to process.cwd() in dev mode where
// cwd is the project root containing the .env file.
let configDir = process.cwd();

// Live config — loaded from userData in app.whenReady() (Invariant: userData overrides dev .env)
let liveConfig = loadConfig(configDir);

// Active hotkey (may be updated live via config-update)
let activeHotkey: HotkeyConfig = DEFAULT_HOTKEY;

// Windows: paste target captured at utterance end / inject (Spec §4.5 — read-only, no SetForegroundWindow).
let pasteTargetHwnd: string | null = null;
let pasteTargetInfo: ForegroundInfo | null = null;

// ---------------------------------------------------------------------------
// Local engine state (Wave 2 — §3.6)
// ---------------------------------------------------------------------------
let activeEngineHandle: EngineHandle | null = null;

// ---------------------------------------------------------------------------
// Yield-focus state (Wave 3 — §4.1 / §4.4)
// Snapshot of the prior external foreground, taken at speechStart/keydown.
// Used by the yield-focus ladder at inject time when SpeakFlow has focus.
// ---------------------------------------------------------------------------
let utteranceCapture: TrackedTarget = null;

// Yield-focus timing constants (Spec §0 Q3 / §4.4 — tunable for G18 smoke).
const YIELD_STALE_MS = 2_000;
const YIELD_SETTLE_MS = 120;
const YIELD_MAX_WAIT_MS = 500;

// ---------------------------------------------------------------------------
// Pipeline status tracker — populated by runPipeline, queried via
// debug:last-pipeline-status IPC (dev-only offline self-check, Hotfix-D).
// ---------------------------------------------------------------------------
let lastPipelineStatus: LastPipelineStatusPayload = {
  transcriptionMode: "remote",
  modelTier: "fast",
  lastErrorKind: null,
  clipboardWriteRan: false,
};
let activeDownloadAbort: AbortController | null = null;
let activeDownloadTier: ModelTier | null = null;
let downloadPct = 0;

// Guards uIOhook.stop() on shutdown — stop() on a never-started hook is undefined behavior.
// Set to true only when uIOhook.start() succeeds inside startHotkeyHook().
let hookStarted = false;

// Phase 0 capture diagnostics (SPEAKFLOW_CAPTURE_DIAG=1) — evidence only, no transcript text.
type PendingCaptureDiag = {
  utteranceId: string;
  voiceMode: "handsFree" | "ptt";
  detailed: CaptureSegmentDetailed;
  vadQueueDepthMax: number | null;
  vadProcessLagFrames: number | null;
  ortRunMs: number | null;
  appStateAtSpeechEnd: string;
  health: ReturnType<CaptureSession["getHealth"]>;
};
let pendingCaptureDiag: PendingCaptureDiag | null = null;

function flushCaptureDiag(opts: {
  accepted: boolean;
  discardReason: string | null;
  text?: string;
}): void {
  if (!isCaptureDiagEnabled() || !pendingCaptureDiag) return;
  const p = pendingCaptureDiag;
  pendingCaptureDiag = null;
  const text = opts.text ?? "";
  const event: UtteranceDiagEvent = {
    utteranceId: p.utteranceId,
    ts: new Date().toISOString(),
    voiceMode: p.voiceMode,
    platform: process.platform,
    deviceId: p.health.deviceId,
    micGain: p.detailed.meta.micGain,
    sampleRate: p.detailed.meta.sampleRate,
    ttfbMs: p.health.ttfbMs,
    ffmpegSpawnMs: p.health.ffmpegSpawnMs,
    firstPcmMs: p.health.firstPcmMs,
    ffmpegRterrCount: p.health.ffmpegRterrCount,
    bytesPerSecWindow: p.health.bytesPerSecWindow,
    vadQueueDepthMax: p.vadQueueDepthMax,
    vadProcessLagFrames: p.vadProcessLagFrames,
    ortRunMs: p.ortRunMs,
    speechStartFrame: p.detailed.meta.speechStartFrame,
    softOnsetFrame: p.detailed.meta.softOnsetFrame,
    speechEndFrame: p.detailed.meta.speechEndFrame,
    padFrames: p.detailed.meta.padFrames,
    takeCount: p.detailed.meta.takeCount,
    ringCountAtTake: p.detailed.meta.ringCount,
    truncated: p.detailed.meta.truncated,
    rawPeak: p.detailed.meta.rawPeak,
    rawClipSamples: p.detailed.meta.rawClipSamples,
    gainedPeak: p.detailed.meta.gainedPeak,
    gainedClipSamples: p.detailed.meta.gainedClipSamples,
    gainedClipFrac: p.detailed.meta.gainedClipFrac,
    segmentSha256Raw: sha256Hex(p.detailed.rawPcm),
    segmentSha256Gained: sha256Hex(p.detailed.gainedPcm),
    rawWavPath: null,
    gainedWavPath: null,
    accepted: opts.accepted,
    discardReason: opts.discardReason,
    appStateAtSpeechEnd: p.appStateAtSpeechEnd,
    blankAudioFlag: text ? looksLikeBlankAudioMarker(text) : false,
    transcriptionMode: isOk(liveConfig) ? liveConfig.value.transcriptionMode : null,
    modelTier: isOk(liveConfig) ? liveConfig.value.modelTier : null,
    asrTextHash: text ? hashTranscriptForDiag(text) : null,
  };
  try {
    const paths = writeUtteranceArtifacts(
      configDir,
      p.utteranceId,
      p.detailed.rawWav,
      p.detailed.gainedWav,
      event
    );
    console.log(
      `[CAPTURE_DIAG] wrote ${paths.rawWavPath} clipFrac=${p.detailed.meta.gainedClipFrac.toFixed(4)} ` +
        `truncated=${p.detailed.meta.truncated} accepted=${opts.accepted}`
    );
  } catch (err) {
    console.error(`[CAPTURE_DIAG] write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function transition(next: State, extra?: { transcript?: string; error?: string }): void {
  console.log(`State transition: ${state} → ${next}${extra?.transcript ? ` (transcript: ${extra.transcript.slice(0,40)}...)` : ""}${extra?.error ? ` (error: ${extra.error})` : ""}`);
  state = next;
  const payload: StateChangePayload = { state: next, ...extra };
  // Broadcast to renderer
  if (win) {
    win.webContents.send("state-change", payload);
    console.log(`[IPC] sent state-change to renderer: ${JSON.stringify({ state: next, hasTranscript: !!extra?.transcript, hasError: !!extra?.error })}`);
  } else {
    console.warn("[IPC] win is null — state-change NOT sent to renderer");
  }
}

function resetToIdle(error?: string): void {
  pasteTargetHwnd = null;
  pasteTargetInfo = null;
  transition("IDLE", error ? { error } : undefined);
}

// In hands-free mode, re-arm LISTENING immediately after IDLE so the next
// utterance is processed without user intervention. Respects mute state.
function maybeRelisten(): void {
  if (
    captureSession &&
    isOk(liveConfig) &&
    liveConfig.value.voiceMode === "handsFree" &&
    !getMuteState().muted
  ) {
    transition("LISTENING");
  }
}

// True when this platform has a verified foreground path (xprop/PS/osascript + keystroke).
// Wayland/unknown Linux falls through to the clipboard floor by construction (Lock A already
// returns null foreground, so decidePaste → clipboardToast before this is ever called).
function hasVerifiedForegroundPath(): boolean {
  if (process.platform === "win32" || process.platform === "darwin") return true;
  if (process.platform === "linux") return getLinuxSession() === "x11";
  return false;
}

function isOwnWindowForeground(fg: ForegroundInfo | null, ownHwndBuf: Buffer): boolean {
  if (!fg) return false;
  if (process.platform === "win32") return nativeHandleEquals(fg.hwnd, ownHwndBuf);
  if (process.platform === "darwin") return isDarwinSpeakFlowApp(fg.processName);
  if (process.platform === "linux") {
    // pid/wmClass were cached by the getLinuxForegroundInfo() call that produced fg.
    const { pid, wmClass } = getLastLinuxReadMeta();
    return isLinuxSpeakFlowWindow(pid, wmClass, process.pid);
  }
  return false;
}

// Capture the foreground HWND at record start (speechStart or PTT keydown).
// Also feeds the foreground tracker for the Wave 3 yield-focus ladder (§4.1).
// Spec §4.5 / Invariant #18: read-only, never SetForegroundWindow.
function captureTargetHwnd(): void {
  pasteTargetHwnd = null;
  pasteTargetInfo = null;
  if (!hasVerifiedForegroundPath() || !win) return;
  const fg = getForegroundInfo();
  const ours = win.getNativeWindowHandle();
  const isOwn = isOwnWindowForeground(fg, ours);
  // Wave 3: update tracker so decideYield has an external sample at keydown/speechStart.
  recordExternalSample(fg, isOwn, Date.now());
  if (!fg) return;
  if (isOwn) {
    console.log("[REC] SpeakFlow had focus at capture — paste will fall back to clipboard");
    return;
  }
  pasteTargetHwnd = fg.hwnd;
  pasteTargetInfo = fg;
  console.log(`[REC] paste target HWND=${fg.hwnd} class=${fg.className} proc=${fg.processName}`);
}

// ---------------------------------------------------------------------------
// Call-app auto-mute poll (L14 / A5) — 1 s while hands-free is armed
// ---------------------------------------------------------------------------
function startCallAppPoll(allowlist: string[]): void {
  stopCallAppPoll();
  callAppPollTimer = setInterval(() => {
    // Wave 3 §4.1: piggyback foreground tracker on this 1s poll.
    // Records external (non-SpeakFlow) foreground samples for decideYield at inject time.
    if (win && hasVerifiedForegroundPath()) {
      const fg = getForegroundInfo();
      const ownHwnd = win.getNativeWindowHandle();
      const isOwn = isOwnWindowForeground(fg, ownHwnd);
      recordExternalSample(fg, isOwn, Date.now());
    }

    if (process.platform !== "win32") return;

    exec("tasklist /FO CSV /NH", { timeout: 2_000 }, (_err, stdout) => {
      if (!stdout) return;
      const procs: string[] = stdout.split("\n").flatMap((line) => {
        const m = /^"([^"]+)"/.exec(line.trim());
        return m && m[1] ? [m[1]] : [];
      });
      setCallAppMute(isCallAppActive(procs, allowlist));
    });
  }, 1_000);
}

function stopCallAppPoll(): void {
  if (callAppPollTimer) { clearInterval(callAppPollTimer); callAppPollTimer = null; }
}

// ---------------------------------------------------------------------------
// Continuous capture + VAD lifecycle (hands-free mode)
// ---------------------------------------------------------------------------
async function startContinuousMode(): Promise<void> {
  if (captureSession) return; // already running
  if (!isOk(liveConfig)) { console.warn("[HF] no config — cannot start capture"); return; }
  const cfg = liveConfig.value;

  const capResult = startContinuousCapture();
  if (isErr(capResult)) {
    console.error(`[HF] capture start failed: ${capResult.error.message}`);
    setMicBusy(true);
    return;
  }
  captureSession = capResult.value;
  setMicBusy(false);

  if (cfg.voiceMode === "handsFree") {
    // Arm LISTENING before VAD init so early utterances are not dropped (startup race fix).
    transition("LISTENING");

    const vadResult = await createVad(cfg.vad, captureSession, getMuteState);
    if (isErr(vadResult)) {
      console.error(`[HF] VAD init failed: ${vadResult.error.message} — falling back to PTT-only`);
      transition("IDLE", { error: `VAD unavailable: ${vadResult.error.message}` });
      return;
    }
    vadEvents = vadResult.value;

    const beginHandsFreeUtterance = (): void => {
      if (state !== "LISTENING") return; // Invariant #6
      // Wave 3 §4.1: snapshot the prior external target at speechStart.
      utteranceCapture = captureNow(Date.now());
      transition("RECORDING");
    };

    const finishHandsFreeUtterance = (payload: SpeechEndPayload): void => {
      const { wav, detailed } = payload;
      if (wav.length <= 44) return; // empty WAV header only

      if (isCaptureDiagEnabled() && captureSession) {
        pendingCaptureDiag = {
          utteranceId: newUtteranceId(),
          voiceMode: "handsFree",
          detailed,
          vadQueueDepthMax: payload.vadQueueDepthMax,
          vadProcessLagFrames: payload.vadProcessLagFrames,
          ortRunMs: payload.ortRunMsLast,
          appStateAtSpeechEnd: state,
          health: captureSession.getHealth(),
        };
      }

      if (state === "LISTENING") {
        beginHandsFreeUtterance();
      }
      if (state !== "RECORDING") {
        // E2: segment taken while pipeline still busy — count as discard (Phase 0).
        flushCaptureDiag({
          accepted: false,
          discardReason: `speechEnd_discarded_wrong_state:${state}`,
        });
        return;
      }
      // Capture target at utterance end (closer to inject than speechStart — hands-free latency fix).
      captureTargetHwnd();
      const t0 = performance.now();
      runPipeline(wav, "handsFree", t0).catch((err: unknown) => {
        console.error("[HF] unhandled pipeline error:", err);
        flushCaptureDiag({ accepted: false, discardReason: "pipeline_error" });
        resetToIdle("Unexpected error");
        maybeRelisten();
      });
    };

    vadEvents.onSpeechStart(beginHandsFreeUtterance);
    vadEvents.onSpeechEnd(finishHandsFreeUtterance);
    vadEvents.arm();

    startCallAppPoll(cfg.callAppAllowlist ?? []);
    console.log("[HF] hands-free armed — LISTENING");
  }
  // PTT mode: capture is running but no VAD; keydown/keyup drive the cycle
}

async function stopContinuousMode(): Promise<void> {
  stopCallAppPoll();
  vadEvents?.stop();
  vadEvents = null;
  await captureSession?.stop();
  captureSession = null;
  resetToIdle();
}

/** Re-arm capture/VAD after voice settings change from the UI. */
async function reloadVoicePipeline(): Promise<void> {
  await stopContinuousMode();
  if (isOk(liveConfig) && process.env["TEST_MODE"] !== "true") {
    await startContinuousMode();
  }
}

// Show the tray window safely from any context (including background pipeline).
// Suppresses the blur→hide handler for 400ms so the window has time to render
// and receive focus before the blur guard is re-enabled.
function showWindow(): void {
  if (!win) return;
  suppressBlur = true;
  if (tray) positionWindowAboveTray(win, tray);
  win.show();
  win.focus();
  console.log("[UI] showWindow() called — blur suppressed for 400ms");
  setTimeout(() => {
    suppressBlur = false;
    console.log("[UI] blur suppression lifted");
  }, 400);
}

// ---------------------------------------------------------------------------
// Pipeline (Wave 2) — takes a pre-captured WAV buffer.
// voiceMode drives the terminal state: "handsFree" → LISTENING, "ptt" → IDLE.
// Invariant #12: every exit path calls resetToIdle() or transitions explicitly.
// ---------------------------------------------------------------------------
async function runPipeline(wavBuffer: Buffer, voiceMode: "handsFree" | "ptt", captureEndT0?: number): Promise<void> {
  if (!isOk(liveConfig)) {
    console.error("[PIPELINE] no config — API key missing");
    resetToIdle("API key not configured — tap the tray icon to set it");
    maybeRelisten();
    return;
  }
  const { groqApiKey, model, language, transcriptionMode, modelTier, correction } = liveConfig.value;
  const searchDirs = [getBundledBinDir(), join(configDir, "models")];

  // Reset pipeline status for this run (Hotfix-D self-check).
  lastPipelineStatus = { transcriptionMode, modelTier, lastErrorKind: null, clipboardWriteRan: false };

  // ── TRANSCRIBING ──────────────────────────────────────────────────────────
  transition("TRANSCRIBING");
  if (captureEndT0 !== undefined) {
    console.log(`[LATENCY] capture-end→transcribe-start: ${(performance.now() - captureEndT0).toFixed(0)} ms`);
  }
  console.log("transcribing...");

  const textResult = await transcribe(
    groqApiKey, wavBuffer, model, language, transcriptionMode,
    modelTier, searchDirs, activeEngineHandle ?? undefined,
  );

  if (isErr(textResult)) {
    const { error } = textResult;
    lastPipelineStatus.lastErrorKind = error.kind;
    let errMsg: string;
    switch (error.kind) {
      case "invalidApiKey":
        console.error(`ERROR: Invalid API key (${MASKED_KEY}) — check your .env file`);
        errMsg = "Invalid API key";
        break;
      case "networkTimeout":
        console.error("ERROR: Network timeout after retries");
        errMsg = "Network timeout";
        break;
      case "emptyTranscription":
        console.log("(silence — nothing to paste)");
        errMsg = "";
        break;
      case "apiError":
        console.error(`ERROR: Groq API ${error.statusCode} — ${error.message}`);
        errMsg = `API error ${error.statusCode}`;
        break;
      case "localModelNotFound":
        console.error(`ERROR: Local model not found — ${error.message}`);
        errMsg = "Local model not found";
        break;
      case "localTranscriptionFailed":
        console.error(`ERROR: Local transcription failed — ${error.message}`);
        errMsg = "Local transcription failed";
        break;
      default: {
        const _exhaustive: never = error;
        console.error("ERROR: Unknown transcription error", _exhaustive);
        errMsg = "Transcription failed";
      }
    }
    flushCaptureDiag({
      accepted: true,
      discardReason: null,
      text: errMsg || "(empty)",
    });
    // Hotfix-C: hands-free mode must NOT call resetToIdle() followed by maybeRelisten().
    // resetToIdle() emits IDLE+error; maybeRelisten() immediately emits bare LISTENING,
    // overwriting the error payload before the renderer can display it. Instead, emit a
    // single transition carrying the error so the renderer always sees it.
    pasteTargetHwnd = null;
    pasteTargetInfo = null;
    if (voiceMode === "handsFree") {
      transition("LISTENING", errMsg ? { error: errMsg } : undefined);
    } else {
      transition("IDLE", errMsg ? { error: errMsg } : undefined);
    }
    return;
  }

  // ── CORRECTING ────────────────────────────────────────────────────────────
  transition("CORRECTING");
  const dictResult = loadDictionary(configDir);
  const dict = isOk(dictResult) ? dictResult.value : { version: 1, entries: [] };
  const { text, ms: corrMs } = await correct(textResult.value, dict, correction);
  console.log(`[CORRECTING] done in ${corrMs.toFixed(1)} ms → "${text.slice(0, 60)}"`);

  // ── INJECTING ─────────────────────────────────────────────────────────────
  transition("INJECTING");
  console.log("pasting...");

  // Write to Electron clipboard (native, no asar path hazard — CLAUDE.md Architecture note).
  try {
    clipboard.writeText(text);
    lastPipelineStatus.clipboardWriteRan = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: Clipboard write failed — ${message}`);
    flushCaptureDiag({ accepted: true, discardReason: "clipboard_write_failed", text });
    // Clipboard failure: surface transcript for manual copy.
    if (voiceMode === "handsFree") {
      transition("LISTENING", { transcript: text, error: "Clipboard write failed — copy manually" });
    } else {
      transition("IDLE", { transcript: text, error: "Clipboard write failed — copy manually" });
      pasteTargetHwnd = null;
    }
    appendTranscript(configDir, { text, timestamp: new Date().toISOString(), mode: transcriptionMode });
    return;
  }

  // Brief pause so clipboard write is committed before the keystroke.
  await new Promise((r) => setTimeout(r, 80));

  // Hands-free: refresh paste target immediately before inject (transcription adds 0.5–2s latency).
  if (voiceMode === "handsFree") {
    captureTargetHwnd();
  }

  const ownHwndBuf = win?.getNativeWindowHandle() ?? Buffer.alloc(0);
  const muteState = getMuteState();
  const termVariant = isOk(liveConfig) ? (liveConfig.value.terminalVariantEnabled ?? false) : false;

  // ---------------------------------------------------------------------------
  // Wave 3 — yield-focus ladder (Spec §4.4 / Invariant #18 / G19).
  // When SpeakFlow is focused at inject time, yield to the prior external target
  // then re-verify before keystroke. Text already in clipboard — fallback is
  // clipboard+toast (no keystroke). No SetForegroundWindow anywhere.
  // ---------------------------------------------------------------------------
  let finalDecision: ReturnType<typeof decidePaste>;
  let pasteTargetForeground: ForegroundInfo | null = null;

  if (hasVerifiedForegroundPath()) {
    const capturedHwnd = utteranceCapture?.info?.hwnd ?? null;
    const { foreground: fg, isWindowAlive: priorAlive } = getForegroundAndCheckWindow(capturedHwnd);
    const ownHwndEquals = isOwnWindowForeground(fg, ownHwndBuf);

    if (ownHwndEquals) {
      const plan = decideYield({
        ownHwndEquals,
        captured: utteranceCapture,
        nowMs: Date.now(),
        priorHwndAlive: priorAlive,
        staleMs: YIELD_STALE_MS,
        settleMs: YIELD_SETTLE_MS,
        maxWaitMs: YIELD_MAX_WAIT_MS,
      });
      console.log(`[INJECT/YIELD] plan=${plan.action}${plan.action === "clipboardToast" ? ` (${plan.reason})` : ""}${plan.action === "yieldThenVerify" ? ` expectHwnd=${plan.expectHwnd}` : ""}`);

      if (plan.action === "clipboardToast") {
        finalDecision = { action: "clipboardToast", reason: plan.reason };
      } else if (plan.action === "yieldThenVerify") {
        win?.hide();
        await new Promise((r) => setTimeout(r, plan.settleMs));
        const fg1 = getForegroundInfo();
        const verified =
          process.platform === "win32"
            ? Boolean(fg1 && fg1.hwnd === plan.expectHwnd)
            : process.platform === "darwin"
            ? darwinForegroundMatches(fg1, plan.expectHwnd)
            : linuxForegroundMatches(fg1, plan.expectHwnd);
        if (!verified) {
          console.log(`[INJECT/YIELD] re-verify FAIL fg1=${fg1?.hwnd ?? "null"} expected=${plan.expectHwnd} → clipboard+toast`);
          finalDecision = { action: "clipboardToast", reason: "post-yield foreground mismatch" };
        } else {
          finalDecision = decidePaste({
            capturedHwnd: plan.expectHwnd,
            capturedForeground: utteranceCapture?.info ?? null,
            foreground: fg1,
            ownHwndEquals: false,
            muted: muteState.muted,
            terminalVariantEnabled: termVariant,
            classifier: classifyTarget,
          });
          pasteTargetForeground = fg1;
          console.log(`[INJECT/YIELD] re-verify OK → decidePaste=${finalDecision.action}`);
        }
      } else {
        finalDecision = { action: "clipboardToast", reason: "unexpected noYield when focused" };
      }
    } else {
      const decision = decidePaste({
        capturedHwnd: pasteTargetHwnd,
        capturedForeground: pasteTargetInfo,
        foreground: fg,
        ownHwndEquals,
        muted: muteState.muted,
        terminalVariantEnabled: termVariant,
        classifier: classifyTarget,
      });
      if (decision.action === "clipboardToast" && fg && !ownHwndEquals && classifyTarget(fg) === "chat") {
        finalDecision = { action: "ctrlV" };
        console.log(`[INJECT] chat-foreground fallback → paste (${fg.processName})`);
      } else {
        finalDecision = decision;
      }
      pasteTargetForeground = fg;
    }
  } else {
    const fg = getForegroundInfo();
    const ownHwndEquals = isOwnWindowForeground(fg, ownHwndBuf);
    finalDecision = decidePaste({
      capturedHwnd: pasteTargetHwnd,
      capturedForeground: pasteTargetInfo,
      foreground: fg,
      ownHwndEquals,
      muted: muteState.muted,
      terminalVariantEnabled: termVariant,
      classifier: classifyTarget,
    });
    pasteTargetForeground = fg;
  }

  // Lock B (Spec §0 Q2): session-gate keystroke on Linux. Wayland/unknown never reaches
  // a keystroke — both locks (A: null foreground; B: here) must fail open to break this.
  if (process.platform === "linux" && getLinuxSession() !== "x11") {
    finalDecision = { action: "clipboardToast", reason: "non-X11 session — keystroke path locked" };
  }

  console.log(`[INJECT] finalDecision=${finalDecision.action}${finalDecision.action === "clipboardToast" || finalDecision.action === "block" ? ` (${(finalDecision as { reason: string }).reason})` : ""}`);

  // Execute keystroke based on decision (Invariant #18: never SetForegroundWindow).
  let keystrokeOk = false;
  if (finalDecision.action === "ctrlV") {
    try {
      if (process.platform === "darwin") {
        await keyboard.pressKey(Key.LeftSuper, Key.V);
        await keyboard.releaseKey(Key.LeftSuper, Key.V);
        console.log("[INJECT] Cmd+V OK");
      } else if (process.platform === "linux") {
        // VTE terminals (GNOME Terminal, Tilix, Xfce, Terminator) use Ctrl+Shift+V;
        // also accepted by Konsole, Alacritty, Kitty, WezTerm. Plain Ctrl+V for everything else.
        if (classifyTarget(pasteTargetForeground) === "terminal") {
          await keyboard.pressKey(Key.LeftControl, Key.LeftShift, Key.V);
          await keyboard.releaseKey(Key.LeftControl, Key.LeftShift, Key.V);
          console.log("[INJECT] Ctrl+Shift+V OK (Linux terminal)");
        } else {
          await keyboard.pressKey(Key.LeftControl, Key.V);
          await keyboard.releaseKey(Key.LeftControl, Key.V);
          console.log("[INJECT] Ctrl+V OK");
        }
      } else {
        await keyboard.pressKey(Key.LeftControl, Key.V);
        await keyboard.releaseKey(Key.LeftControl, Key.V);
        console.log("[INJECT] Ctrl+V OK");
      }
      keystrokeOk = true;
    } catch (err) {
      console.error(`ERROR: paste keystroke failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (finalDecision.action === "shiftInsert") {
    try {
      await keyboard.pressKey(Key.LeftShift, Key.Insert);
      await keyboard.releaseKey(Key.LeftShift, Key.Insert);
      keystrokeOk = true;
      console.log("[INJECT] Shift+Insert OK");
    } catch (err) {
      console.error(`ERROR: Shift+Insert failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // clipboardToast, block, or keystroke failure → transcript is already in clipboard

  const preview = text;
  console.log(`done. > "${preview.slice(0, 72)}${preview.length > 72 ? "..." : ""}"`);
  if (captureEndT0 !== undefined) {
    console.log(`[LATENCY] capture-end→paste-complete: ${(performance.now() - captureEndT0).toFixed(0)} ms`);
  }

  // Persist to shared MCP history.
  appendTranscript(configDir, { text, timestamp: new Date().toISOString(), mode: transcriptionMode });

  flushCaptureDiag({ accepted: true, discardReason: null, text });

  // Terminal state: loop to LISTENING (hands-free) or reset to IDLE (PTT).
  if (voiceMode === "handsFree") {
    transition("LISTENING", { transcript: text });
  } else {
    transition("IDLE", { transcript: text });
    pasteTargetHwnd = null;
  }

  // Show transcript preview without stealing focus (Invariant #18 — showInactive only).
  if (win) {
    suppressBlur = true;
    if (tray) positionWindowAboveTray(win, tray);
    win.showInactive();
    setTimeout(() => { suppressBlur = false; }, 400);
    console.log("[UI] showInactive preview after paste");
  }

  void keystrokeOk; // consumed by logging above
}

// ---------------------------------------------------------------------------
// uiohook hotkey registration
// PTT mode: keydown → captureTargetHwnd + markSpeechStart, keyup → takeSegment + pipeline.
// Hands-free mode: hotkey ignored (VAD drives recording). Kill-switch via tray menu.
// Re-registering with a new hotkey replaces the previous handlers live (T-08).
// ---------------------------------------------------------------------------
function registerHotkey(hotkey: HotkeyConfig): void {
  uIOhook.removeAllListeners("keydown");
  uIOhook.removeAllListeners("keyup");

  uIOhook.on("keydown", (e) => {
    console.log(`Keydown: Ctrl=${e.ctrlKey}, Alt=${e.altKey}, Shift=${e.shiftKey}, Code=${e.keycode}`);
    if (e.keycode !== hotkey.keycode) return;
    const modifiersMatch =
      (!hotkey.ctrl || e.ctrlKey) &&
      (!hotkey.shift || e.shiftKey) &&
      (!hotkey.alt || e.altKey);
    if (!modifiersMatch) return;

    // Hands-free: PTT is fallback when LISTENING (Spec degradation rule — never button-only).
    const hf = isOk(liveConfig) && liveConfig.value.voiceMode === "handsFree";
    if (hf && state !== "LISTENING") return;

    // PTT-only mode — Invariant #6: silently drop if not IDLE
    if (!hf && state !== "IDLE") return;

    // Capture HWND at keydown (Spec §4.5 — focus is trustworthy at record start)
    captureTargetHwnd();
    // Wave 3 §4.1: snapshot the prior external target at PTT keydown.
    utteranceCapture = captureNow(Date.now());

    if (!captureSession) {
      // PTT: start capture now (lazy start; in hands-free capture is always running)
      const capResult = startContinuousCapture();
      if (isErr(capResult)) {
        console.error(`ERROR: capture start failed — ${capResult.error.message}`);
        resetToIdle(`Recording failed: ${capResult.error.message}`);
        return;
      }
      captureSession = capResult.value;
    }

    captureSession.markSpeechStart();
    transition("RECORDING");
    console.log("[PTT] Recording...");
  });

  uIOhook.on("keyup", (e) => {
    console.log(`Keyup: Code=${e.keycode}`);
    if (e.keycode !== hotkey.keycode) return;
    if (state !== "RECORDING") return;

    if (!captureSession) {
      console.error("[PTT-KEYUP] captureSession is null — resetting to IDLE");
      resetToIdle();
      return;
    }

    const detailed = captureSession.takeSegmentDetailed(0);
    const wav = detailed.gainedWav;
    const health = captureSession.getHealth();
    const hf = isOk(liveConfig) && liveConfig.value.voiceMode === "handsFree";
    const pipelineMode = hf ? "handsFree" : "ptt";
    if (isCaptureDiagEnabled()) {
      pendingCaptureDiag = {
        utteranceId: newUtteranceId(),
        voiceMode: pipelineMode,
        detailed,
        vadQueueDepthMax: null,
        vadProcessLagFrames: null,
        ortRunMs: null,
        appStateAtSpeechEnd: state,
        health,
      };
    }
    if (!hf) {
      // PTT-only: stop capture (release mic) after taking the segment
      void captureSession.stop().catch(() => {});
      captureSession = null;
    }

    const t0 = performance.now();
    runPipeline(wav, pipelineMode, t0).catch((err: unknown) => {
      console.error("FATAL: Unhandled exception escaped pipeline —", err);
      flushCaptureDiag({ accepted: false, discardReason: "pipeline_error" });
      resetToIdle("Unexpected error");
    });
  });
}

// ---------------------------------------------------------------------------
// Hotkey hook lifecycle (Wave 7e — guarded start, Spec §0 Q8 / LD11)
// ---------------------------------------------------------------------------

/** Session-gated, try/catch-wrapped uIOhook start. Never throws — tray+capture survive. */
function startHotkeyHook(): void {
  if (process.platform === "linux" && getLinuxSession() !== "x11") {
    console.error("[HOTKEY] non-X11 session — PTT unavailable, hands-free unaffected (LD11)");
    return;
  }
  try {
    registerHotkey(activeHotkey);
    uIOhook.start();
    hookStarted = true;
  } catch (err) {
    console.error(`[HOTKEY] uIOhook.start failed — PTT unavailable, continuing: ${String(err)}`);
    // Never rethrow — tray + capture must survive (S-L10)
  }
}

/** Send platform-caps to the renderer once it is ready (Wave 7e / Spec §7). */
function sendPlatformCaps(): void {
  if (!win) return;
  const session = process.platform === "linux" ? getLinuxSession() : null;
  const pttAvailable = process.platform !== "linux" || hookStarted;
  const autoPaste =
    process.platform === "win32" ||
    process.platform === "darwin" ||
    (process.platform === "linux" && session === "x11");
  const payload: PlatformCapsPayload = { platform: process.platform, session, pttAvailable, autoPaste };
  win.webContents.send("platform-caps", payload);
  console.log(`[IPC] sent platform-caps: ${JSON.stringify(payload)}`);
}

// ---------------------------------------------------------------------------
// Window factory
// ---------------------------------------------------------------------------
function createWindow(): BrowserWindow {
  const browserWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,
    show: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // preload.cjs is compiled from src/preload.cts (CommonJS) — using CJS avoids
      // ESM preload edge cases where contextBridge.exposeInMainWorld fails silently.
      preload: join(__dirname, "preload.cjs"),
    },
  });

  const distUiPath = join(__dirname, "..", "dist-ui", "index.html");
  const uiMtime = existsSync(distUiPath) ? statSync(distUiPath).mtime.toISOString() : "missing";
  console.log(`[UI] loading renderer: ${distUiPath} (mtime ${uiMtime})`);

  // Dev runs keep the tray process alive across UI rebuilds — clear cache so
  // Chromium cannot serve a stale file:// bundle from a prior dist-ui build.
  const loadRenderer = (): void => {
    void browserWindow.loadFile(distUiPath, { query: { v: uiMtime } });
  };
  if (!app.isPackaged) {
    void browserWindow.webContents.session.clearCache().then(loadRenderer);
  } else {
    loadRenderer();
  }

  // Forward renderer console.log/warn/error to the main terminal so all IPC
  // debug output appears in one place without needing DevTools open.
  browserWindow.webContents.on("console-message", (_e, _level, message) => {
    console.log(`[RENDERER] ${message}`);
  });

  // T-11: click-outside hides window.
  // Guard: do not hide during programmatic show — see suppressBlur.
  browserWindow.on("blur", () => {
    if (suppressBlur) {
      console.log("[UI] blur suppressed — not hiding");
      return;
    }
    browserWindow.hide();
  });

  return browserWindow;
}

// ---------------------------------------------------------------------------
// Tray factory
// ---------------------------------------------------------------------------
function createTray(browserWindow: BrowserWindow): Tray {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  const trayInstance = new Tray(icon.resize({ width: 16, height: 16 }));
  trayInstance.setToolTip("Oracle SpeakFlow");

  function rebuildContextMenu(): void {
    const muteLabel = getMuteState().muted ? "Unmute mic" : "Mute mic (mute button)";
    const contextMenu = Menu.buildFromTemplate([
      { label: "Oracle SpeakFlow", enabled: false },
      { type: "separator" },
      { label: "Show", click: () => showWindow() },
      {
        label: muteLabel,
        click: () => {
          const nowMuted = getMuteState().muted;
          setUserMute(!nowMuted);
        },
      },
      { label: "Quit", click: () => app.quit() },
    ]);
    trayInstance.setContextMenu(contextMenu);
  }

  rebuildContextMenu();

  trayInstance.on("click", () => {
    if (browserWindow.isVisible()) {
      browserWindow.hide();
    } else {
      showWindow();
    }
  });

  // Some Windows shells swallow the auto-attached context menu on right-click.
  // Explicitly pop it up (rebuilt fresh so the mute label is current).
  trayInstance.on("right-click", () => {
    rebuildContextMenu();
    trayInstance.popUpContextMenu();
  });

  return trayInstance;
}

// Rebuild tray context menu on every mute change so the label stays current.
// Also manages capture lifecycle: kill-switch closes mic; unmute re-opens it.
function wireMuteHandler(): void {
  onMuteChange((muteState) => {
    console.log(`[MUTE] state → muted=${muteState.muted} reason=${muteState.reason ?? "none"}`);

    // Kill-switch: close mic device + stop resident engine (Invariant #19 / Q4 / §0 Q2)
    if (muteState.muted && captureSession) {
      stopCallAppPoll();
      vadEvents?.stop();
      vadEvents = null;
      void captureSession.stop().catch(() => {});
      captureSession = null;
      if (activeEngineHandle) {
        void stopEngine(activeEngineHandle).catch(() => {});
        activeEngineHandle = null;
      }
      const muteMsg =
        muteState.reason === "callApp"
          ? "Mic muted — call app detected (Zoom/Teams/Discord)"
          : muteState.reason === "micBusy"
            ? "Mic busy — another app may be using the microphone"
            : "Mic muted — mute button active";
      resetToIdle(muteMsg);
    }

    // Un-mute: re-open mic (hands-free mode restarts capture + VAD)
    if (!muteState.muted && !captureSession && isOk(liveConfig) && liveConfig.value.voiceMode === "handsFree") {
      startContinuousMode().catch((err: unknown) =>
        console.error("[MUTE] failed to restart capture:", err)
      );
    }

    // Rebuild tray menu to show current label
    if (tray) {
      const muteLabel = muteState.muted ? "Unmute mic" : "Mute mic (mute button)";
      const contextMenu = Menu.buildFromTemplate([
        { label: "Oracle SpeakFlow", enabled: false },
        { type: "separator" },
        { label: "Show", click: () => showWindow() },
        { label: muteLabel, click: () => setUserMute(!muteState.muted) },
        { label: "Quit", click: () => app.quit() },
      ]);
      tray.setContextMenu(contextMenu);
    }

    // Notify renderer of mute state
    win?.webContents.send("mute-change", muteState);
  });
}

// ---------------------------------------------------------------------------
// Position popup above tray icon (T-11)
// ---------------------------------------------------------------------------
function positionWindowAboveTray(browserWindow: BrowserWindow, trayInstance: Tray): void {
  const trayBounds = trayInstance.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const workArea = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - WINDOW_WIDTH / 2);
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - WINDOW_WIDTH));
  const y = workArea.y + workArea.height - WINDOW_HEIGHT - 8;

  browserWindow.setPosition(x, y, false);
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIpc(): void {
  // T-11: ESC key from renderer
  ipcMain.on("hide-window", () => {
    win?.hide();
  });

  // Bug #1: let renderer know whether an API key is currently configured
  ipcMain.handle("has-api-key", (): boolean => isOk(liveConfig));

  // Bug #2: quit and force-stop from renderer UI
  ipcMain.on("quit-app", () => app.quit());
  ipcMain.on("stop-recording", () => {
    if (state === "RECORDING") resetToIdle("Recording stopped");
  });

  // Mute toggle from renderer (kill-switch) — returns the resulting muted state.
  ipcMain.handle("toggle-mute", (): boolean => {
    const nowMuted = getMuteState().muted;
    setUserMute(!nowMuted);
    return getMuteState().muted;
  });
  ipcMain.handle("get-mute-state", (): boolean => getMuteState().muted);

  // T-06: Copy transcript to clipboard
  ipcMain.on("copy-to-clipboard", (_event, text: string) => {
    clipboard.writeText(text);
  });

  // Bug 2: Current key verification — renderer sends candidate, main responds true/false.
  // CLAUDE.md invariant #3: candidate is compared in main process, never logged.
  ipcMain.handle("verify-api-key", (_event, candidate: string): boolean => {
    if (!isOk(liveConfig)) return false;
    return candidate === liveConfig.value.groqApiKey;
  });

  ipcMain.handle("get-hotkey", (): HotkeyConfig => activeHotkey);

  // T-07/T-08/T-09/T-10: Config updates from renderer
  // NOTE: do NOT guard on isOk(liveConfig) here — on a fresh install liveConfig is
  // Err({ kind: "missingApiKey" }) and we must allow the user to save their API key
  // for the first time.  All partial values come from payload, not from liveConfig.
  ipcMain.on("config-update", (_event, payload: ConfigUpdatePayload) => {
    const partial: Record<string, unknown> = {};

    // CLAUDE.md invariant #3: never log raw API key
    if (payload.groqApiKey !== undefined) {
      partial["groqApiKey"] = payload.groqApiKey;
      console.log(`Config update: groqApiKey → ${MASKED_KEY}`);
    }
    if (payload.model !== undefined) {
      partial["model"] = payload.model;
      console.log(`Config update: model → ${payload.model}`);
    }
    if (payload.language !== undefined) {
      partial["language"] = payload.language;
      console.log(`Config update: language → ${payload.language}`);
    }
    if (payload.hotkey !== undefined) {
      partial["hotkey"] = payload.hotkey;
      partial["hotkeyConfigVersion"] = HOTKEY_CONFIG_VERSION;
      activeHotkey = payload.hotkey;
      console.log(`Config update: hotkey → ${JSON.stringify(payload.hotkey)}`);
      // Re-register uiohook with new hotkey live (no restart needed) — T-08
      registerHotkey(activeHotkey);
    }
    if (payload.transcriptionMode !== undefined) {
      partial["transcriptionMode"] = payload.transcriptionMode;
      console.log(`Config update: transcriptionMode → ${payload.transcriptionMode}`);
    }
    let voicePipelineDirty = false;
    if (payload.voiceMode !== undefined) {
      partial["voiceMode"] = payload.voiceMode;
      voicePipelineDirty = true;
      console.log(`Config update: voiceMode → ${payload.voiceMode}`);
    }
    if (payload.vad !== undefined) {
      partial["vad"] = payload.vad;
      voicePipelineDirty = true;
      console.log("Config update: vad thresholds");
    }
    if (payload.correction !== undefined) {
      partial["correction"] = payload.correction;
      console.log(`Config update: correction llmEnabled → ${payload.correction.llmEnabled}`);
    }
    if (payload.terminalVariantEnabled !== undefined) {
      partial["terminalVariantEnabled"] = payload.terminalVariantEnabled;
      console.log(`Config update: terminalVariantEnabled → ${payload.terminalVariantEnabled}`);
    }
    if (payload.firstRunExplainerDismissed !== undefined) {
      partial["firstRunExplainerDismissed"] = payload.firstRunExplainerDismissed;
      console.log(`Config update: firstRunExplainerDismissed → ${payload.firstRunExplainerDismissed}`);
    }

    const saveResult = saveConfig(configDir, partial);
    if (isErr(saveResult)) {
      console.error(`Config save failed: ${saveResult.error.kind}`);
    } else {
      // Reload config into memory
      liveConfig = loadConfig(configDir, { envOverride: true });
      if (voicePipelineDirty) {
        void reloadVoicePipeline();
      }
    }
  });

  ipcMain.handle("get-voice-settings", (): VoiceSettingsPayload | null => {
    if (!isOk(liveConfig)) return null;
    const { voiceMode, vad, correction, terminalVariantEnabled } = liveConfig.value;
    const firstRunExplainerDismissed =
      process.env["SPEAKFLOW_FIRST_RUN_DISMISSED"]?.trim() === "true";
    return { voiceMode, vad, correction, terminalVariantEnabled, firstRunExplainerDismissed };
  });

  // Hotfix-A: snapshot of persisted config fields needed to hydrate Settings UI.
  // Fixes the "snaps back to Cloud" bug where transcriptionMode/model/language were
  // never loaded from disk on Settings open — they defaulted to "remote" / hard-coded values.
  ipcMain.handle("get-config-snapshot", (): ConfigSnapshotPayload | null => {
    if (!isOk(liveConfig)) return null;
    const { transcriptionMode, modelTier, model, language } = liveConfig.value;
    return { transcriptionMode, modelTier, model, language };
  });

  // Hotfix-D: dev-only self-check — last pipeline execution summary.
  // Lets us verify offline/local correctness without requiring manual DOM smoke tests.
  ipcMain.handle("debug:last-pipeline-status", (): LastPipelineStatusPayload => lastPipelineStatus);

  ipcMain.handle("get-dictionary", (): DictionaryPayload => {
    const result = loadDictionary(configDir);
    return isOk(result) ? result.value : { version: 1, entries: [] };
  });

  ipcMain.handle("save-dictionary", (_event, dict: DictionaryPayload): { ok: boolean; error?: string } => {
    const result = persistDictionary(configDir, dict);
    if (isErr(result)) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  });

  ipcMain.handle("import-dictionary", (_event, json: string): { ok: boolean; dictionary?: DictionaryPayload; error?: string } => {
    const result = importDictionary(json);
    if (isErr(result)) {
      return { ok: false, error: result.error.message };
    }
    const saveResult = persistDictionary(configDir, result.value);
    if (isErr(saveResult)) {
      return { ok: false, error: saveResult.error.message };
    }
    return { ok: true, dictionary: result.value };
  });

  ipcMain.handle("export-dictionary", (): string => {
    const result = loadDictionary(configDir);
    const dict = isOk(result) ? result.value : { version: 1, entries: [] };
    return exportDictionary(dict);
  });

  // P3-T12: Open allowlisted URL in default browser.
  // Hard allowlist — never call shell.openExternal with arbitrary renderer input.
  ipcMain.handle("open-external", async (_event, url: string): Promise<void> => {
    if (!EXTERNAL_URL_ALLOWLIST.includes(url)) {
      console.warn(`[open-external] BLOCKED: not in allowlist — ${url}`);
      throw new Error("URL not permitted");
    }
    await shell.openExternal(url);
  });

  // ---------------------------------------------------------------------------
  // Tier IPC — Wave 2 (§3.6, §5.2)
  // ---------------------------------------------------------------------------

  ipcMain.handle("get-tier-status", (): TierStatusPayload[] => {
    const searchDirs = [getBundledBinDir(), join(configDir, "models")];
    return (["fast", "balanced", "accurate"] as ModelTier[]).map((tier) => ({
      tier,
      available: isTierAvailable(tier, searchDirs),
      downloading: activeDownloadTier === tier,
      pct: activeDownloadTier === tier ? downloadPct : 0,
    }));
  });

  ipcMain.handle("check-disk", (_event, tier: ModelTier): DiskCheckPayload => {
    const modelsDir = join(configDir, "models");
    const spec = TIER_LADDER[tier];
    const result = checkDiskForTier(tier, modelsDir);
    if (!result.ok && result.error.kind === "insufficientDisk") {
      return { tier, freeBytes: result.error.freeBytes, needBytes: result.error.needBytes, ok: false };
    }
    return { tier, freeBytes: 0, needBytes: spec.sizeBytes * 2, ok: true };
  });

  ipcMain.handle("download-tier", async (_event, tier: ModelTier): Promise<{ ok: boolean; error?: string }> => {
    if (TIER_LADDER[tier].source === "bundled") {
      return { ok: false, error: `Tier '${tier}' is bundled — no download needed` };
    }
    if (activeDownloadTier !== null) {
      return { ok: false, error: "Another download is in progress" };
    }

    const modelsDir = join(configDir, "models");

    const diskResult = checkDiskForTier(tier, modelsDir);
    if (!diskResult.ok && diskResult.error.kind === "insufficientDisk") {
      const needMB = Math.round(diskResult.error.needBytes / 1024 / 1024);
      const freeMB = Math.round(diskResult.error.freeBytes / 1024 / 1024);
      return { ok: false, error: `Insufficient disk space: need ${needMB} MB, have ${freeMB} MB free` };
    }

    activeDownloadAbort = new AbortController();
    activeDownloadTier = tier;
    downloadPct = 0;

    const sendProgress = (pct: number): void => {
      downloadPct = pct;
      win?.webContents.send("model-download-progress", pct);
    };

    try {
      const result = await downloadTier(tier, modelsDir, sendProgress, activeDownloadAbort.signal);
      if (!result.ok) {
        if (result.error.kind !== "cancelled") {
          console.error(`[download-tier] ${tier} failed: ${result.error.kind}`);
        }
        return { ok: false, error: result.error.kind };
      }
      console.log(`[download-tier] ${tier} complete: ${result.value}`);
      return { ok: true };
    } finally {
      activeDownloadTier = null;
      activeDownloadAbort = null;
      downloadPct = 0;
    }
  });

  ipcMain.on("cancel-tier-download", () => {
    if (activeDownloadAbort) {
      activeDownloadAbort.abort();
      console.log("[cancel-tier-download] download cancelled");
    }
  });

  ipcMain.on("select-tier", (_event, tier: ModelTier) => {
    if (!isOk(liveConfig)) return;
    const prevTier = liveConfig.value.modelTier;

    // Stop current engine when switching tiers (Spec §3.6)
    if (activeEngineHandle && tier !== prevTier) {
      void stopEngine(activeEngineHandle).catch(() => {});
      activeEngineHandle = null;
    }

    const saveResult = saveConfig(configDir, { modelTier: tier });
    if (isErr(saveResult)) {
      console.error(`[select-tier] config save failed: ${saveResult.error.kind}`);
      return;
    }
    liveConfig = loadConfig(configDir, { envOverride: true });
    console.log(`[select-tier] tier → ${tier}`);

    // Proactively start engine for non-batch tiers if the model is available
    const spec = TIER_LADDER[tier];
    if (!spec.batchAcceptable) {
      const searchDirs = [getBundledBinDir(), join(configDir, "models")];
      const modelResult = resolveTierModel(tier, searchDirs);
      if (modelResult.ok) {
        startEngine(tier, modelResult.value)
          .then((engineResult) => {
            if (engineResult.ok) {
              activeEngineHandle = engineResult.value;
              armIdleUnload(activeEngineHandle, 5 * 60_000, () => {
                console.log(`[engine] idle-unload ${tier}`);
                activeEngineHandle = null;
              });
              console.log(`[engine] started for tier ${tier} (pid ${activeEngineHandle.pid})`);
            } else {
              console.error(`[engine] start failed for ${tier}: ${engineResult.error.kind} — ${engineResult.error.message}`);
            }
          })
          .catch((err: unknown) => console.error("[engine] unexpected start error:", err));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// MCP stdio server mode (--mcp flag)
// JSON-RPC 2.0 over stdio — no BrowserWindow, no tray, no hotkey registration.
//
// Implements:
//   P3-T07  tools/call → get_last_transcript
//   P3-T08  resources/read → transcripts://history
//   P3-T09  reads shared transcript-history.json from userData
//
// Security invariant: only { text, timestamp, mode } are ever emitted.
//   API keys, system paths, and configuration data are never exposed.
// ---------------------------------------------------------------------------
function runMcpServer(userData: string): void {
  const log = (msg: string) => process.stderr.write(`[mcp] ${msg}\n`);

  const sendResponse = (id: number | string | null, result: unknown) => {
    const response = JSON.stringify({ jsonrpc: "2.0", id, result });
    process.stdout.write(response + "\n");
  };

  const sendError = (id: number | string | null, code: number, message: string) => {
    const response = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
    process.stdout.write(response + "\n");
  };

  // FR-M3-04: Write a small notification file to userData so the GUI process
  // can detect tool calls via fs.watch (OS-level, not polling). Non-fatal.
  const notifyGuiToolCall = (tool: string): void => {
    try {
      const payload: McpToolCallPayload = { tool, calledAt: new Date().toISOString() };
      writeFileSync(join(userData, "mcp-tool-notification.json"), JSON.stringify(payload));
    } catch { /* best-effort — GUI notification must never break MCP */ }
  };

  log(`MCP stdio server ready — history: ${userData}`);

  // mcpRl and mcpPendingLines are set up at module-eval time (before Electron
  // init) to capture lines that arrive before app.whenReady() resolves.
  // We now drain those lines and install the live handler.
  const processLine = (line: string) => {
    type McpRequest = {
      jsonrpc?: string;
      id?: number | string | null;
      method?: string;
      params?: {
        name?: string;
        arguments?: Record<string, unknown>;
        uri?: string;
      };
    };

    let parsed: McpRequest;
    try {
      parsed = JSON.parse(line) as McpRequest;
    } catch {
      log(`invalid JSON: ${line.slice(0, 120)}`);
      sendError(null, -32700, "Parse error");  // JSON-RPC 2.0 §5.1
      return;
    }

    const id = parsed.id ?? null;
    const method = parsed.method ?? "";
    log(`← ${method} (id=${String(id)})`);

    switch (method) {
      // ------------------------------------------------------------------
      // Handshake
      // ------------------------------------------------------------------
      case "initialize":
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "oracle-speakflow", version: "0.1.0" },
        });
        break;

      case "notifications/initialized":
        // Notification — no response required.
        log("client initialized");
        break;

      // ------------------------------------------------------------------
      // P3-T07: Tool discovery + invocation
      // ------------------------------------------------------------------
      case "tools/list":
        sendResponse(id, {
          tools: [
            {
              name: "get_last_transcript",
              description:
                "Returns the most recent voice transcription recorded by Oracle SpeakFlow. " +
                "Provides the raw text, the ISO 8601 timestamp of the recording, and whether " +
                "the transcription was performed locally or via the Groq remote API.",
              inputSchema: {
                type: "object",
                properties: {},
                required: [],
              },
            },
          ],
        });
        break;

      case "tools/call": {
        const toolName = parsed.params?.name ?? "";
        log(`tool call: ${toolName}`);

        if (toolName !== "get_last_transcript") {
          sendError(id, -32601, `Unknown tool: ${toolName}`);
          break;
        }

        // Read from shared history — never expose API keys or paths.
        const history = readHistory(userData);
        if (history.length === 0) {
          sendResponse(id, {
            content: [
              { type: "text", text: "No transcripts recorded yet. Record something with Oracle SpeakFlow first." },
            ],
          });
          notifyGuiToolCall(toolName);
          break;
        }

        const last = history[history.length - 1];
        if (last === undefined) {
          sendResponse(id, {
            content: [{ type: "text", text: "No transcripts recorded yet." }],
          });
          notifyGuiToolCall(toolName);
          break;
        }

        // Return only safe fields — never include userData path or config.
        sendResponse(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { text: last.text, timestamp: last.timestamp, mode: last.mode },
                null,
                2
              ),
            },
          ],
        });
        log(`→ get_last_transcript: ${last.text.slice(0, 60)}…`);
        notifyGuiToolCall(toolName);
        break;
      }

      // ------------------------------------------------------------------
      // P3-T08: Resource discovery + read
      // ------------------------------------------------------------------
      case "resources/list":
        sendResponse(id, {
          resources: [
            {
              uri: "transcripts://history",
              name: "Transcript History",
              description: "The last 10 voice transcriptions recorded by Oracle SpeakFlow, newest last.",
              mimeType: "text/markdown",
            },
          ],
        });
        break;

      case "resources/read": {
        const uri = parsed.params?.uri ?? "";
        log(`resource read: ${uri}`);

        if (uri !== "transcripts://history") {
          sendError(id, -32602, `Unknown resource URI: ${uri}`);
          break;
        }

        const entries = readHistory(userData);
        let markdown: string;

        if (entries.length === 0) {
          markdown = "_No transcripts recorded yet._";
        } else {
          markdown = entries
            .map((e, i) => {
              const date = new Date(e.timestamp).toLocaleString();
              return `### ${i + 1}. ${date} (${e.mode})\n\n${e.text}`;
            })
            .join("\n\n---\n\n");
        }

        sendResponse(id, {
          contents: [
            {
              uri: "transcripts://history",
              mimeType: "text/markdown",
              text: markdown,
            },
          ],
        });
        log(`→ transcripts://history: ${entries.length} entries`);
        break;
      }

      default:
        // Notifications have no id — silently drop them.
        if (id !== null) {
          sendError(id, -32601, `Method not found: ${method}`);
        }
        break;
    }
  };

  // Install the live handler; drain any lines buffered during Electron startup.
  mcpLineHandler = processLine;
  for (const buffered of mcpPendingLines.splice(0)) {
    processLine(buffered);
  }

  // If stdin was already closed before we started (e.g. file-redirect in CI),
  // quit cleanly after processing the batch.
  if (mcpStdinPreClosed) {
    log("stdin was pre-closed — processed buffered batch, shutting down");
    app.quit();
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const isMcpMode = process.argv.includes("--mcp");

// ── MCP early-attach ──────────────────────────────────────────────────────
// Electron's Chromium init runs before app.whenReady() resolves.  During that
// window, stdin can be marked "ended" if nothing is listening.  We attach the
// readline interface HERE — at module-evaluation time — so that it subscribes
// to stdin immediately and Node's stream layer buffers arriving lines.
// Lines received before runMcpServer() is called are held in mcpPendingLines
// and drained once the full handler is installed.
// ─────────────────────────────────────────────────────────────────────────
let mcpRl: ReturnType<typeof createInterface> | null = null;
const mcpPendingLines: string[] = [];
let mcpLineHandler: ((line: string) => void) | null = null;
// Set to true when stdin closes before runMcpServer() is called (e.g. file-
// redirect in tests); runMcpServer drains the buffer then calls app.quit().
let mcpStdinPreClosed = false;

if (isMcpMode) {
  // On Windows, Electron (SUBSYSTEM:WINDOWS) nullifies process.stdin during
  // Chromium's C++ initialization before any JS runs.  Reading directly from
  // file descriptor 0 bypasses that override and works correctly with piped
  // stdin from Claude Desktop / Cursor (which use child_process.spawn).
  const stdinFd0 = createReadStream("", { fd: 0, encoding: "utf-8" });
  mcpRl = createInterface({ input: stdinFd0, terminal: false });
  mcpRl.on("line", (line) => {
    if (mcpLineHandler) {
      mcpLineHandler(line);
    } else {
      mcpPendingLines.push(line);
    }
  });
  mcpRl.on("close", () => {
    if (mcpLineHandler) {
      // runMcpServer is already running — shut down immediately.
      process.stderr.write("[mcp] stdin closed — shutting down\n");
      app.quit();
    } else {
      // runMcpServer hasn't started yet (e.g. EOF before app.whenReady()).
      // Mark the flag; runMcpServer will drain buffered lines then quit.
      mcpStdinPreClosed = true;
    }
  });
}

// Single-instance lock (disabled in TEST_MODE to allow parallel integration tests)
if (process.env["TEST_MODE"] !== "true" && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) showWindow();
  });

  app.whenReady().then(() => {
    // --mcp mode: skip UI entirely, run stdio JSON-RPC server.
    // app.getPath("userData") is safe to call once app is ready.
    if (isMcpMode) {
      runMcpServer(app.getPath("userData"));
      return;
    }

    // Resolve config directory to the persistent userData path so settings
    // survive reinstalls.  Must be called after app is ready.
    configDir = app.getPath("userData");
    if (isCaptureDiagEnabled()) {
      console.log(`[CAPTURE_DIAG] ENABLED — artifacts → ${join(configDir, "capture-diag")}`);
    } else {
      console.log(`[CAPTURE_DIAG] off (set SPEAKFLOW_CAPTURE_DIAG=1 to enable)`);
    }

    // Load initial config — userData .env must override project-root .env (dev pollution fix)
    liveConfig = loadConfig(configDir, { envOverride: true });
    if (isOk(liveConfig)) {
      activeHotkey = liveConfig.value.hotkey;
      const mode = liveConfig.value.voiceMode;
      console.log(
        `Oracle SpeakFlow ready.\n` +
        `  API key: ${MASKED_KEY}\n` +
        `  Model:   ${liveConfig.value.model}\n` +
        `  Voice:   ${mode}${mode === "handsFree" ? " (speak — no hotkey)" : ""}\n` +
        `  Hotkey:  ${formatHotkeyLabel(activeHotkey)}${mode === "handsFree" ? " (PTT fallback)" : " (hold to record, release to transcribe)"}\n`
      );
    } else {
      console.warn("WARNING: GROQ_API_KEY not set — transcription will fail.");
    }

    win = createWindow();
    // Bug #1: if no API key is configured, surface an error in the UI on first load
    // so the user knows they need to set one rather than seeing a silent "sk-***".
    win.webContents.once("did-finish-load", () => {
      if (!isOk(liveConfig)) {
        transition("IDLE", { error: "API key not configured — tap here to set it" });
        return;
      }
      // Re-sync LISTENING if capture armed before renderer subscribed (startup race).
      if (state === "LISTENING") {
        transition("LISTENING");
      }
    });
    // Send platform-caps on every (re)load so the renderer always has current caps.
    win.webContents.on("did-finish-load", () => {
      sendPlatformCaps();
    });
    tray = createTray(win);
    setupIpc();

    // FR-M3-04: Watch for MCP tool-call notifications written by the headless
    // MCP process. fs.watch uses OS-level ReadDirectoryChangesW (Windows) /
    // inotify (Linux) — not polling. The watcher is closed on before-quit.
    const MCP_NOTIFY_FILE = "mcp-tool-notification.json";
    mcpWatcher = watch(configDir, { persistent: false }, (_event, filename) => {
      if (filename !== MCP_NOTIFY_FILE || !win) return;
      try {
        const raw = readFileSync(join(configDir, MCP_NOTIFY_FILE), "utf8");
        const payload: McpToolCallPayload = JSON.parse(raw) as McpToolCallPayload;
        win.webContents.send("mcp-tool-call", payload);
      } catch { /* file may be mid-write or absent — ignore */ }
    });

    // Wire mute change handler (kill-switch lifecycle + tray rebuild)
    wireMuteHandler();

    // In TEST_MODE, skip uiohook and capture — show window immediately for Playwright.
    if (process.env["TEST_MODE"] === "true") {
      win.show();
      // Announce ready state to renderer (satisfies G28 assertion (c) state-machine check).
      transition("IDLE");
      // [SPIKE] nut-js load probe — Wave 7b / G28 (Linux-only, TEST_MODE-only).
      // Verifies @nut-tree-fork/libnut-linux loads correctly from asarUnpack in the packaged app.
      if (process.platform === "linux") {
        import("@nut-tree-fork/nut-js").then(() => {
          console.log("[SPIKE] nut-js load: OK");
        }).catch((err: unknown) => {
          console.log(`[SPIKE] nut-js load: FAIL: ${String(err)}`);
        });
      }
      // Expose a test-only IPC to inject synthetic state-change events
      ipcMain.on("test:set-state", (_event, payload: StateChangePayload) => {
        win?.webContents.send("state-change", payload);
      });
      ipcMain.on("test:quit", () => {
        app.quit();
      });
    } else {
      startHotkeyHook();
      // Start continuous capture (hands-free armed from launch, or PTT-ready in ptt mode)
      if (isOk(liveConfig)) {
        startContinuousMode().catch((err: unknown) =>
          console.error("[STARTUP] continuous capture failed:", err)
        );
      }
    }

    app.on("activate", () => {
      if (win && !win.isVisible()) showWindow();
    });
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown — CLAUDE.md invariant #8: await stop() before exit
  // ---------------------------------------------------------------------------
  app.on("before-quit", () => {
    if (process.env["TEST_MODE"] !== "true" && hookStarted) {
      uIOhook.stop();
    }
    stopCallAppPoll();
    vadEvents?.stop();
    if (captureSession) {
      // Fire-and-forget cleanup; Electron will wait for the event loop to drain
      captureSession.stop().catch(() => {});
    }
    // Stop resident engine — Invariant #8 (async cleanup on shutdown)
    if (activeEngineHandle) {
      void stopEngine(activeEngineHandle).catch(() => {});
      activeEngineHandle = null;
    }
    mcpWatcher?.close();
  });

  // Also handle SIGINT in case app is run without Electron's built-in handling
  process.on("SIGINT", () => {
    if (hookStarted) uIOhook.stop();
    stopCallAppPoll();
    vadEvents?.stop();
    if (activeEngineHandle) {
      void stopEngine(activeEngineHandle).catch(() => {});
      activeEngineHandle = null;
    }
    if (captureSession) {
      captureSession.stop().finally(() => app.quit());
    } else {
      app.quit();
    }
  });
}

app.on("window-all-closed", () => {
  // Keep running in tray on Windows — do not quit when window closes.
});

export { MASKED_KEY };
