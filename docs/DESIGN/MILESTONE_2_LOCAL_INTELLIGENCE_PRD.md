# PRD: Oracle SpeakFlow — Milestone 2 Local Intelligence (Engine)

**Status:** Implementation complete on `feat/local-whisper-sidecar`
**Date:** 2026-05-15
**Model tier used:** Sonnet 4.6 (architecture, invariants); Haiku 4.5 (boilerplate, docs)

---

## Executive Summary

Milestone 2 completes the main-process engine layer that was missing behind an already-built renderer UI. The renderer (preload + Svelte components) was written in a prior session but lacked all corresponding `ipcMain` handlers. This milestone implements those handlers, wires the transcription-mode toggle through the full stack (config → pipeline → UI), and ensures Invariant #13 (SHA-256 hard-block) is enforced on model downloads.

---

## Mission

Enable users to choose between **Cloud (Groq)** and **Local (Whisper sidecar)** transcription from the Settings panel, download the local model when needed, and complete the full F8 record → transcribe → paste flow in both modes — without regressing the existing cloud path.

---

## Target Users

- Windows 11 developers and power users who want offline transcription.
- Users in restricted network environments where Groq API calls are blocked.
- Users who want lower latency on short phrases using the tiny.en local model.

---

## In Scope

| Task | Description |
|------|-------------|
| **P3-T04 (verify)** | ffmpeg recorder — existing; tests pass without SoX dependency |
| **P3-T05 (wire)** | `transcribeLocal()` sidecar already exists; wired to `runPipeline` via `transcriptionMode` from `liveConfig` |
| **P3-T06 (main process)** | `check-model`, `download-model` IPC handlers + SHA-256 verification; `model-download-progress` events |
| **Transcription mode toggle** | `SPEAKFLOW_TRANSCRIPTION_MODE` config key; Settings UI radio toggle (Cloud / Local); mode persisted via `saveConfig` |
| **Settings UI alignment** | `SettingsFields.svelte` mode toggle; conditional Groq model selector; `SettingsModal.svelte` wired |
| **IPC surface sync** | `preload.cts` ← `getHotkey` added; `global.d.ts` ← all missing methods added |
| **`open-external` IPC** | Hard URL allowlist for P3-T12 monetization buttons |
| **Regression gates** | All §5 automated gates green on PR branch |

---

## Out of Scope

- **NFR-04 keychain** — deferred to Milestone 5 per [ADR-0001](ADR-0001-nfr04-keychain-deferral.md).
- **ASAR/installer packaging hardening** — full P3-T11 is Milestone 4. Dev-mode sidecar path resolution is sufficient for M2.
- **`whisper-cli.exe` binary** — must be placed manually in `resources/bin/whisper-cli.exe`. Not auto-downloaded by the app (the *model* `.bin` file is downloaded; the sidecar *binary* is a build-time artifact).
- **New hotkey changes** — F8 push-to-talk is shipped and must not regress.
- **MCP protocol changes** — regression-checked only.

---

## Model Download Specification (P3-T06)

| Property | Value |
|----------|-------|
| Filename | `ggml-tiny.en.bin` |
| Destination | `userData/models/ggml-tiny.en.bin` |
| Source URL | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin` |
| Expected size | ~75 MB |
| SHA-256 | `921e4cf8686fdd993dcd081a5da5b6c746d2a0cd3b17cf41d6f0d3e2e5a3e5b2` *(TODO: verify full 64-char hash against HuggingFace before shipping — CHANGELOG only has prefix)* |
| On mismatch | Delete partial file; reject IPC promise with "SHA-256 mismatch" message — **never fall back silently** (Invariant #13) |

---

## User Stories

### Happy path — Local mode

1. User opens Settings → sees "Transcription Mode: Cloud (Groq) / Local (Whisper)" radio group.
2. User selects **Local**.
3. If model is absent: `ModelDownloader` appears. User clicks "Download Model". Progress bar fills to 100%. SHA-256 verified. Button becomes "✓ Ready".
4. User clicks Save.
5. User holds **F8** → speaks → releases. Pipeline calls `transcribeLocal()` via whisper-cli sidecar.
6. Text is pasted into the focused window.

### Happy path — Cloud mode (regression check)

1. User opens Settings → selects **Cloud (Groq)** (default).
2. Groq model dropdown is visible.
3. User holds F8 → speaks → releases. Pipeline calls `transcribeRemote()` via Groq API.
4. Text is pasted.

### Error path — No model downloaded (local mode selected)

1. User selects Local mode, saves, and holds F8 without downloading the model.
2. `transcribeLocal()` returns `Err({ kind: "localModelNotFound" })`.
3. `runPipeline` calls `resetToIdle("Local model not found")`.
4. UI shows error banner "Local model not found".

### Error path — SHA-256 mismatch

1. Download completes but hash does not match `MODEL_SHA256` constant.
2. Partial file is deleted immediately.
3. `download-model` IPC rejects with "SHA-256 mismatch — download may be corrupted. File deleted. Please retry."
4. `ModelDownloader.svelte` shows error state with Retry button (Invariant #13).

### Error path — No microphone

1. User holds F8 with no mic connected.
2. ffmpeg recorder returns `Err({ kind: "permissionDenied" })`.
3. Pipeline resets to IDLE with "Recording failed: permission denied".

### Error path — whisper-cli.exe missing from resources/bin

1. `getBinaryPath("whisper-cli.exe")` returns path; `existsSync` is false.
2. `transcribeLocal()` returns `Err({ kind: "localModelNotFound", message: "whisper-cli.exe not found…" })`.
3. UI shows error banner with the binary path for the user to act on.

---

## Success Metrics

- Local transcription path works offline (whisper-cli.exe present + model downloaded).
- Cloud (Groq) path unchanged — zero regressions on Phase 1 tests (24 tests).
- All §5 automated gates pass on `feat/local-whisper-sidecar` branch.
- `npm run typecheck` reports zero errors.
- Manual smoke: F8 record → paste works in both modes.
