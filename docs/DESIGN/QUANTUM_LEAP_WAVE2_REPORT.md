# Wave 2 — Electron Wiring Report

**Date:** 2026-07-08
**Branch:** feat/quantum-leap-v1
**Authority:** QUANTUM_LEAP_SPEC.md §10 Wave 2 / §11 invariants #17–#19 (D1 approved, S1 PASSED, Wave 1.1 complete)

---

## Gate Results

| Gate | Command | Result |
|------|---------|--------|
| **G1** | `npm run typecheck` | ✅ **0 errors** |
| **G2** | `npm test` | ✅ **132/132 pass** (all Wave 1.1 regressions held) |
| **G5** | `npm run test:integration` | ✅ **7/7 pass** (Playwright + Electron) |
| **G6** | `node scripts/test-mcp-spawn.mjs` | ✅ **5/5** — no stdout pollution |
| **G10** | `tests/paste.test.ts` | ✅ **21/21 pass** — muted→block, 0 wrong-target |

G7/G11 (human smoke): **PASS** — 2026-07-08 operator sign-off. See `QUANTUM_LEAP_WAVE2_SMOKE_SIGNOFF.md`.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/utils/win32-window.ts` | Read-only foreground introspection: `getForegroundInfo()` returns `{ hwnd, className, processName }` in one batched PS call; no `SetForegroundWindow`, no `Add-Type` on a separate per-field call. `nativeHandleEquals()` ported verbatim. |

## Files Modified

| File | Change |
|------|--------|
| `src/types/ipc.ts` | `AppState` extended: `"LISTENING" \| "CORRECTING"` added (Spec §3.4) |
| `src/electron-main.ts` | Surgical Wave 2 wiring (see §below) |
| `CLAUDE.md` | Invariants #17–#19 added (Spec §11 exact text) |

## Files Deleted

| File | Reason |
|------|--------|
| `src/utils/win32-foreground.ts` | Replaced by `win32-window.ts`; `SetForegroundWindow` / `activateWindowHandle` removed (Invariant #18) |

---

## electron-main.ts Surgical Changes (A10 — ≤~200 net new lines)

### Imports
- Removed: `activateWindowHandle`, `getForegroundWindowHandle` (from deleted `win32-foreground.ts`), `startRecording`, `RecordingSession`, `UiohookKey`
- Added: `getForegroundInfo`, `nativeHandleEquals` (from `win32-window.ts`), `startContinuousCapture`, `CaptureSession`, `createVad`, `VadEvents`, `decidePaste`, `classifyTarget`, `getMuteState`, `setUserMute`, `setCallAppMute`, `setMicBusy`, `isCallAppActive`, `onMuteChange`, `correct`, `loadDictionary`, `exec`

### New global state
- `captureSession: CaptureSession | null` — continuous FFmpeg stream (Invariant #17)
- `vadEvents: VadEvents | null`
- `callAppPollTimer` — 1s call-app poll handle

### Functions removed
- `capturePasteTargetOnKeyUp()` — replaced by `captureTargetHwnd()` (now at keydown/speechStart per Spec §4.5)
- `preparePasteTargetFocus()` — **DELETED** (Invariant #18: never SetForegroundWindow)

### Functions added
- `captureTargetHwnd()` — read-only HWND capture via `getForegroundInfo()` (no SetForegroundWindow)
- `startCallAppPoll(allowlist)` / `stopCallAppPoll()` — async 1s tasklist poll (L14 / A5)
- `startContinuousMode()` — spawns capture + VAD, wires `onSpeechStart`/`onSpeechEnd`, starts call-app poll, transitions to LISTENING
- `stopContinuousMode()` — tears down capture + VAD cleanly
- `maybeRelisten()` — after errors in hands-free, transitions back to LISTENING if capture is still active
- `wireMuteHandler()` — `onMuteChange` listener: closes mic on kill-switch, restarts in hands-free on unmute, rebuilds tray menu

### runPipeline() refactored
- Signature: `(wavBuffer: Buffer, voiceMode: "handsFree" | "ptt") → Promise<void>`
- Reads config internally (no longer takes `apiKey/model/language` parameters)
- Added **CORRECTING** state: `loadDictionary` + `correct()` after transcription
- Replaced `preparePasteTargetFocus()` + blind Ctrl+V with inline `decidePaste()` (Invariant #18)
- `clipboardToast` / `block` paths: transcript surfaced in UI; text already in clipboard
- Terminal state: `"handsFree"` → `transition("LISTENING")` (loop); `"ptt"` → `resetToIdle()`

### registerHotkey() updated
- PTT mode: `keydown` → `captureTargetHwnd()` + `captureSession.markSpeechStart()` + `transition("RECORDING")`; `keyup` → `takeSegment(0)` + `captureSession.stop()` + `runPipeline(wav, "ptt")`
- Hands-free mode: hotkey is a no-op (VAD drives the cycle)
- PTT now uses `startContinuousCapture()` (reuses same stream architecture as hands-free per Spec §0 Q1)

### app.whenReady() additions
- `wireMuteHandler()` called once at startup
- `startContinuousMode()` called in non-TEST_MODE after hotkey registration (starts FFmpeg + optional VAD)

### before-quit / SIGINT
- `stopCallAppPoll()` + `vadEvents?.stop()` + `captureSession?.stop()` replace old `activeSession.stop()`

---

## State Machine (Wave 2)

```
IDLE ──(hands-free armed)──► LISTENING ──(VAD speechStart)──► RECORDING ──(VAD speechEnd)──►
     TRANSCRIBING ──(ok)──► CORRECTING ──► INJECTING ──► LISTENING (loop)
  any error → resetToIdle() + maybeRelisten() (hands-free relists; PTT stays IDLE)

IDLE ──(PTT keydown)──► RECORDING ──(PTT keyup)──► TRANSCRIBING ──► CORRECTING ──► INJECTING ──► IDLE
```

---

## Invariant Compliance

| Invariant | Status |
|-----------|--------|
| #6 Re-entry forbidden | ✅ VAD `onSpeechStart` checks `state === "LISTENING"`; PTT checks `state === "IDLE"` |
| #12 No bare return from non-IDLE | ✅ All runPipeline exits call `resetToIdle()` + `maybeRelisten()` or `transition()` explicitly |
| #17 Single mic owner | ✅ `getUserMedia` deleted in Wave 1.1; capture.ts is sole FFmpeg owner |
| #18 Never steal foreground | ✅ `preparePasteTargetFocus`/`activateWindowHandle`/`SetForegroundWindow` removed; tray is `showInactive` only |
| #19 No paste/record while muted | ✅ `decidePaste` returns `block` when `muted` (G10); VAD hard-checks `getMuteState()` in vad.ts |

---

## STOP — Wave 2 Complete

All automated gates green. **G7 + G11 human smokes PASS** (2026-07-08). See `QUANTUM_LEAP_WAVE2_SMOKE_SIGNOFF.md`.

---

## G7 + G11 Human Smoke Checklist (for human operator)

### G7 — Paste reliability (≥9/10 into Cursor chat, 0 wrong-target)
- [ ] Focus Cursor chat input, hold hotkey, speak, release — text pastes into Cursor
- [ ] Repeat 9 more times — ≥9/10 paste correctly, 0 paste into wrong window
- [ ] Alt-tab mid-utterance → confirm clipboard fallback (not wrong-window paste)
- [ ] Verify `t1−t0` logged to stderr < 800ms per cycle

### G11 — Hands-free (≥8/10 no hotkey; 0 paste while muted; <500ms speech-end→transcribe)
- [ ] Config: set `voiceMode=handsFree` in userData .env (or Settings tab)
- [ ] Speak without pressing any key — SpeakFlow transcribes and pastes into focused window ≥8/10
- [ ] Activate kill-switch (tray → "Mute mic") → OS mic indicator goes dark → no recording
- [ ] Confirm 0 pastes while muted
- [ ] Un-mute → mic restarts automatically, hands-free resumes
- [ ] Verify stderr `[vad] speechEnd` → `[TRANSCRIBING]` transition < 500ms (stopwatch or log timestamps)
- [ ] Leave idle 30 min → false triggers < 1 (stderr `[vad] speechStart` counter)
- [ ] Zoom/Teams running → auto-muted (call-app allowlist); close → auto-unmuted
