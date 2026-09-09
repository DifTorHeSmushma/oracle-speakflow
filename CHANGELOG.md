# Changelog

All notable changes to oracle-speakflow will be documented in this file.

## [Unreleased]

### Fixed
- **F8 long brain dumps dropped the head:** Finalize no longer trims to the trailing ~28s. Dumps longer than 25s are split into chronological chunks (1s overlap), transcribed, and stitched so the full hold is pasted. Guarded by `npm run check:f8-full-dump` / gate **G-F8** so trailing-trim settle cannot regress silently.
- **Muted F8 left OSF stuck Idle:** After muted hands-free F8, capture could remain without VAD so unmute skipped re-arm — UI showed Idle / “mic ready” while MuteBar said Listening and F8 produced empty errors. Muted PTT now stops capture; unmute recycles orphan capture and restarts LISTENING.
- **Hands-free ERROR with good audio, no paste:** When speculative Groq timed out/apiErrored, settle refused a recovery finalize (anti double-RTT guard over-applied). Now one recovery finalize runs after speculative has already failed.
- **Packaged Windows Groq worker:** Bundle `groqTranscribeWorker` with esbuild (embeds `groq-sdk`) and unpack the `.cjs` from asar. Before this, the installer set `SPEAKFLOW_GROQ_WORKER=1` but the worker could not resolve `groq-sdk` inside asar, silently fell back to main-thread Groq, and long dumps hit **Network timeout**. Worker is ON by default (`SPEAKFLOW_GROQ_WORKER=0` to force main-thread debug). Proof: `npm run proof:packaged-worker`. Tracked in [#9](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/9).
- **Hands-free mic “deaf” after paste:** Always resume VAD `capturePaused` in `runPipeline` `finally` — early error/clipboard exits left UI on Listening while ignoring the mic.
- **Prompt-echo paste spam:** Block Whisper echoing finalize-prompt fragments such as `Do not invent words or`; shorten `FINALIZE_PROMPT` so silence/noise cannot parrot it into Cursor.

### Added — Quantum Leap Wave 3 (2026-07-08)
- **Voice settings UI:** Hands-free / PTT toggle, VAD sliders, terminal paste mode, kill-switch explainer
- **Dictionary panel:** CRUD, enable/disable, JSON import/export (`dictionary.json` in userData)
- **Listening indicator:** Mic/mute state row + one-time first-run privacy banner
- **IPC:** `get-voice-settings`, dictionary get/save/import/export; config-update reloads capture pipeline
- **Packaging:** electron-builder NSIS polish, macOS DMG stub, VAD model + ONNX in `extraResources` / `asarUnpack`
- **Docs:** Wave 2 smoke sign-off, updated README

### Added — Quantum Leap Wave 2
- Hands-free Silero VAD, continuous capture, mute kill-switch (mic device close)
- Paste guard ladder (`decidePaste`), HWND focus capture, clipboard fallback on alt-tab
- Deterministic correction pipeline + personal dictionary service
- Config migration v3 (`SPEAKFLOW_CONFIG_VERSION`, default `handsFree`)

### Fixed
- **Recording (Windows):** Tray waveform procedural only during RECORDING — avoids mic conflict with FFmpeg DirectShow
- **Paste target (Windows):** HWND capture at record start; `SetForegroundWindow` before paste
- **UI:** Cache-bust `dist-ui` load; waveform mount timing; `start:app` script
- **Links:** GitHub Sponsors → `DifTorHeSmushma`; repo URL → `DifTorHeSmushma/oracle-speakflow`

## [0.1.0] — Phase 3 Pro (on main)

### Added
- Electron tray UI, F8 push-to-talk, real-time waveform, tabbed Settings modal
- MCP headless server (`--mcp`), Groq + local Whisper paths, model downloader
- Monetization links (Buy Me a Coffee, GitHub Sponsors) with main-process URL allowlist

### Previous releases
- Phase 1–2: Daemon, Groq transcription, hotkey → clipboard paste

---

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
