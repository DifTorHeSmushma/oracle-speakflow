# Windows Quality Regression Log

## Status: WINDOWS CLOUD PATH LOCKED (2026-07-17) — local STT deferred

**Ship / use this combination until local is revisited:**

| Keep | Setting | Why |
|------|---------|-----|
| Cloud STT | `SPEAKFLOW_TRANSCRIPTION_MODE=remote` + Groq key + `whisper-large-v3-turbo` | Local Fast (`tiny`) produced garbage even on clear audio |
| Default VAD | `preSpeechPadFrames=20`, `redemptionFrames=40`, thresholds 0.42/0.28, `minSpeechFrames=6` | Saved harsh VAD (pad 5 / redemption 16) chopped sentences |
| Bigger ring | `RING_BUFFER_FRAMES=600` (~19.2 s) in code | At 300, long utterances set `truncated: true` and dropped opening words |
| Phase 1 clock | enqueue-time soft onset / speech start | Correct under VAD lag; keep with ship |

**Do not switch back to Local/Fast for daily drafting until a dedicated local-quality pass.**

**Operator config file (this machine):** `%APPDATA%\Electron\.env`  
Backup of pre-recovery harsh settings: `%APPDATA%\Electron\.env.bak-2026-07-17-pre-recovery`

**Deferred:** local Whisper quality (balanced/accurate + VAD retune). **Next product spine:** finish macOS + Linux build/parity; then revisit local.

**Pass smoke (2026-07-17):**  
`Testing 1234 ABCDE the quick brown fox wants to build financial abundance and multimillionaire with AI`  
Diag: ~13s segment, `truncated: false`, `remote`, pad 20, ring 600.

**Latency (2026-07-17):** Cloud Groq client timeout **10s** (was SDK default 60s) + no cloud retries — stops 50–90s “transcribing” hangs. Logs: `[LATENCY] cloud-transcribe:` / `transcribe-wall:` + always-on `%APPDATA%/Electron/latency.jsonl`. Hands-free silence gate loosened under fan noise. **Accepted UX:** ~7s last-word→paste (cloud ~1.7s; speech-end→paste ~4s).

---

## History

### Problem Description
Users on Windows 11 reporting significant degradation in transcription reliability and quality.

### Reported Symptoms
1. Missing start words
2. Mid-sentence dropouts
3. High WER / jammed text

### Phase 0 (2026-07-16)
Diag pack: dual WAV + JSONL. Primary signal VAD lag; gain secondary.

### Phase 1 VAD lag clock (2026-07-16)
Enqueue-time onset stamps. Alone insufficient while Local Fast + harsh VAD persisted.

### Config recovery (2026-07-17)
Cloud + default VAD → large jump. Ring 300→600 → first words restored on long fox sentence.
