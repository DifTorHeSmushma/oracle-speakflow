# PIV Plan: Oracle SpeakFlow — Milestone 2 Local Intelligence

**Branch:** `feat/local-whisper-sidecar`
**Base:** `main` (commit `caf577b`)
**Date:** 2026-05-15

---

## Phase Table

| Phase | Intent | Owner | Exit Gate |
|-------|--------|-------|-----------|
| **P0** | Branch hygiene — confirm baseline gates on `main` | Haiku | `npm run typecheck` clean; baseline test counts noted |
| **P1** | IPC surface sync — `preload.cts` `getHotkey`; `global.d.ts` missing methods | Haiku | `typecheck` clean; no renderer TypeScript errors on `window.electronAPI.*` |
| **P2** | Main-process model service — `check-model`, `download-model`, progress, SHA-256 hard-block | **Sonnet** | `check-model` returns bool; `download-model` rejects on hash mismatch; `typecheck` clean |
| **P3** | `open-external` IPC + URL allowlist | Haiku | Monetization buttons reach `shell.openExternal`; non-allowlisted URLs throw; `typecheck` |
| **P4** | Config — `SPEAKFLOW_TRANSCRIPTION_MODE` + `TranscriptionMode` in `ipc.ts` as canonical type | Haiku | `loadConfig`/`saveConfig` round-trip; migration test still passes; `typecheck` |
| **P5** | Pipeline wire — `runPipeline(mode)` from `liveConfig.transcriptionMode`; `config-update` persists mode | **Sonnet** | `transcribe(…, mode)` called with correct arg; `appendTranscript` uses actual `mode`; `typecheck` |
| **P6** | Settings UI — mode radio toggle in `SettingsFields`; conditional `ModelDownloader` in `SettingsModal` | Haiku | Both files ≤250 lines (Invariant #16); UI component tests pass; `typecheck` |
| **P7** | Full regression | Haiku | `npm test` (24 Phase 1 tests); `npm run test:ui`; `npm run build`; `npm run build:ui` all pass |
| **P8** | PR to `main` | Sonnet | Squash merge; smoke checklist attached to PR body |

---

## Phase Detail

### P0 — Baseline
- Verify `feat/local-whisper-sidecar` is at same commit as `main`.
- Run `npm run typecheck` and `npm test` to establish baseline counts.
- **Pre-existing failures:** none expected; if any exist, document in execution report before proceeding.

### P1 — IPC surface (Haiku)
- **`src/preload.cts`**: add `getHotkey: () => ipcRenderer.invoke("get-hotkey")`. `ipcMain.handle("get-hotkey")` already exists; `global.d.ts` already declared it; preload bridge was missing.
- **`src-ui/global.d.ts`**: add `checkModel`, `downloadModel`, `onModelDownloadProgress`, `openExternal`, `getHotkey`.

### P2 — Model service (Sonnet)
- **Constants** at top of `electron-main.ts`: `MODEL_FILENAME`, `MODEL_URL`, `MODEL_SHA256` (TODO: verify full hash before shipping).
- **`check-model`**: `existsSync(join(configDir, "models", MODEL_FILENAME))`.
- **`download-model`**: `https.get()` stream → `createWriteStream`; send `model-download-progress` events via `win.webContents.send()`; on completion compute SHA-256 via `createHash("sha256")` + `createReadStream`; if mismatch → `unlinkSync` + reject (Invariant #13 hard-block).

### P3 — open-external (Haiku)
- Add `EXTERNAL_URL_ALLOWLIST` constant (2 URLs).
- `ipcMain.handle("open-external")`: check `EXTERNAL_URL_ALLOWLIST.includes(url)`, `shell.openExternal(url)`, else `throw new Error("URL not permitted")`.

### P4 — Config (Haiku)
- **`src/types/ipc.ts`**: add `export type TranscriptionMode = "local" | "remote"` as canonical source.
- **`src/services/transcription.ts`**: import + re-export `TranscriptionMode` from `ipc.ts`; remove local type definition.
- **`src/utils/config.ts`**: import `TranscriptionMode` from `ipc.ts`; add `transcriptionMode: TranscriptionMode` to `Config`; add `SPEAKFLOW_TRANSCRIPTION_MODE` to `saveConfig`; add validated parse in `loadConfig` (default: `"remote"`).

### P5 — Pipeline wire (Sonnet)
- **`src/types/ipc.ts`** `ConfigUpdatePayload`: add `transcriptionMode?: TranscriptionMode`.
- **`electron-main.ts`** `runPipeline`: add `mode: TranscriptionMode` param.
- **`electron-main.ts`** `keyup` handler: destructure `transcriptionMode` from `liveConfig.value`; pass to `runPipeline`.
- **`electron-main.ts`** `config-update` handler: persist `payload.transcriptionMode`.
- **`electron-main.ts`** `appendTranscript` calls: replace hardcoded `"remote"` with `mode`.

### P6 — Settings UI (Haiku)
- **`SettingsFields.svelte`**: add `transcriptionMode: "local" | "remote" = "remote"` bindable prop; add radio group (Cloud / Local); wrap Groq model select in `{#if transcriptionMode === "remote"}`.
- **`SettingsModal.svelte`**: bind `transcriptionMode`; pass in `sendConfigUpdate({ model, language, transcriptionMode })`; show `<ModelDownloader>` only when `transcriptionMode === "local" && !modelPresent`.
- Verify both files ≤250 lines (Invariant #16).

### P7 — Regression
```
npm run typecheck    # zero errors
npm test             # 24 Phase 1 tests pass
npm run test:ui      # UI component tests pass
npm run build        # tsc clean
npm run build:ui     # Vite clean
```
- `npm run test:integration` (Playwright) — run if display available; skip with note in execution report if headless.

### P8 — PR
- Title: `feat(m2): Local Whisper engine + transcription mode toggle`
- PR body links: `MILESTONE_2_LOCAL_INTELLIGENCE_PRD.md`, `MILESTONE_2_PIV_PLAN.md`, gate results, manual smoke checklist.
- Do not force-push `main`.

---

## Manual Smoke Checklist (attach to PR)

- [ ] `npm run start:electron` launches without error
- [ ] Settings → F8 shown in hotkey area; status "Idle — hold F8 to record"
- [ ] Cloud mode: hold F8 → speak → release → text pasted in Notepad
- [ ] No false "API key not configured" when key is present in userData/.env
- [ ] Local mode radio selected → `ModelDownloader` appears if model absent
- [ ] Download Model button → progress bar fills → "✓ Ready" (or SHA-256 error on bad file)
- [ ] Local mode: hold F8 → speak → release → text pasted (requires `whisper-cli.exe` in `resources/bin/`)

---

## Invariants Checklist

| Invariant | Check |
|-----------|-------|
| **#3** API key never logged | grep `GROQ_API_KEY` in console.log calls — none |
| **#6 / #12** No bare return from non-IDLE | `runPipeline` always calls `resetToIdle()` on error paths |
| **#13** SHA-256 hard-block | `download-model` handler deletes partial + rejects on mismatch |
| **#15** Binaries via `getBinaryPath` | `transcribeLocal` uses `getBinaryPath("whisper-cli.exe")` |
| **#16** Svelte ≤250 lines | `SettingsFields.svelte` and `SettingsModal.svelte` both verified |
