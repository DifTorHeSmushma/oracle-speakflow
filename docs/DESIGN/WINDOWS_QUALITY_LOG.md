# Windows Quality Regression Log

## Status: PENDING Issue #6 — hybrid finalize + streaming insert (NOT locked)

> **Halfway ≠ done.** Prior “WINDOWS CLOUD PATH LOCKED / Accepted UX” (2026-07-17) is **struck** for product-done claims. Cloud + pad defaults remain the ship path for capture hygiene, but Dom must re-sign after floor **and** live-insert smoke (`docs/DESIGN/WINDOWS_QUALITY_SMOKE.md`).

| Keep (capture hygiene) | Setting | Why |
|------|---------|-----|
| Cloud STT | `SPEAKFLOW_TRANSCRIPTION_MODE=remote` + Groq key + `whisper-large-v3-turbo` | Local Fast (`tiny`) produced garbage even on clear audio |
| Default VAD (issue #6) | `preSpeechPadFrames=20`, **`redemptionFrames=79` (~2.53 s)**, thresholds 0.42/0.28, `minSpeechFrames=6` | Hybrid pause budget: ≤2.0 s must not finalize; ≥2.5 s soft-end OK |
| Session PCM | Growable session buffer (ring retained for pre-speech pad only) | ≤60 s utterances must not truncate |
| Phase 1 clock | enqueue-time soft onset / speech start | Correct under VAD lag; keep with ship |

**Operator config:** `%APPDATA%\Electron\.env` and `%APPDATA%\oracle-speakflow\.env` — ensure `SPEAKFLOW_VAD.redemptionFrames` ≥ **79** or remove the override (stale `40`/`55` will false-finalize).

**Deferred:** local Whisper quality; **#8 Streaming ASR mastery** (Deepgram / growing-window / never freeze bad live); issue #7 minimal HUD.

---

## Issue #6 — Dom sign-off (blank until smoke)

| Gate | Result | Notes |
|------|--------|-------|
| False finalize ≤2.0 s pause | _FAIL Gate Alpha α2_ | **2026-08-01 Gate Alpha:** α2 returned first clause only (“Rename the helper function please.”). |
| Soft finalize ≥2.5 s or stop | _pending_ | |
| Live insert — Notepad | _FAIL — disabled pending #8_ | Groq-chunk live produced “Three-factor pass” / truncated lines; `SPEAKFLOW_STREAMING_INSERT=0` until Deepgram. |
| Live insert — Cursor chat | _pending_ | |
| WER / meaning errors | _HARD FAIL Gate Alpha_ | α1→“Three-factor pass”; α2→first clause only; α3→“So ask the agent to fix issues.” `skippedFinalize` frozen wrong live; background correct superseded. **Fix:** always full-session finalize as settle truth. |
| Last-word→paste latency | _regressed intentionally_ | Accuracy before fake latency; Deepgram (#8) restores Aqua-class feel. |
| ≤60 s truncation | _pending — do not claim pass_ | Emergency 45s/28s caps ≠ intent 60s. |
| Phase-1 feel (Groq chunked) | _FAIL — escalate Deepgram_ | See #8. |

**Unsafe-target finalize-only exception (Cursor):** _none — Dom has not OK’d_

**Dom sign-off:** _unsigned_  
**Date:** _

**Re-smoke:** Gate Alpha after rebuild. Expect **accurate** settle (may be slower). Live insert off until Deepgram key + #8 P1. Clear Notepad between lines; wait for each settle before next line.

---

## History

### Struck claim — “Accepted UX” batch latency (2026-07-17)

~~**Accepted UX:** ~7s last-word→paste~~ — superseded by issue #6 Aqua Realtime-class bar (live partials + hybrid finalize). Batch hangover alone is not done.

### Problem Description
Users on Windows 11 reporting significant degradation in transcription reliability and quality.

### Reported Symptoms
1. Missing start words
2. Mid-sentence dropouts
3. High WER / jammed text
4. (Issue #6) Mid-thought fragment pastes; no live text in field

### Phase 0 (2026-07-16)
Diag pack: dual WAV + JSONL. Primary signal VAD lag; gain secondary.

### Phase 1 VAD lag clock (2026-07-16)
Enqueue-time onset stamps. Alone insufficient while Local Fast + harsh VAD persisted.

### Config recovery (2026-07-17)
Cloud + default VAD → large jump. Ring 300→600 → first words restored on long fox sentence.

### Pass smoke (2026-07-17) — historical (batch only)
`Testing 1234 ABCDE the quick brown fox wants to build financial abundance and multimillionaire with AI`  
Diag: ~13s segment, `truncated: false`, `remote`, pad 20, ring 600. **Does not satisfy #6 streaming bar.**

### Latency (2026-07-17) — historical
Cloud Groq client timeout **10s** + no cloud retries. Logs: `[LATENCY] cloud-transcribe:` / `transcribe-wall:` + `%APPDATA%/Electron/latency.jsonl`.
