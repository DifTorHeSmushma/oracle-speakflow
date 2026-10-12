# RCA: muted F8 empty capture / F8 dead while muted

**Issue:** [#13](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/13)  
**Date:** 2026-10-12  
**Evidence:** `%APPDATA%\oracle-speakflow\latency.jsonl` (71 empty PTT; last 2026-09-13 `audio_too_short`)

## Symptom
Mute on → hold F8 → release → no paste / feels like F8 broken, even when hands-free works.

## Root cause
1. Mute kill-switch (Invariant #19) stops FFmpeg. F8 cold-starts capture and called `markSpeechStart` immediately → often **before first PCM** → 44-byte empty WAV → Groq `audio_too_short` or silent fail.
2. Mute while `TRANSCRIBING` with `captureSession === null` did not `resetToIdle` → F8 keydown ignored (state ≠ IDLE/LISTENING) while MuteBar showed muted.

## Fix
- `CaptureSession.waitForFirstPcm` + PTT arm before `markSpeechStart`
- Empty PTT segment → clear IDLE message, no Groq call
- Mute always `resetToIdle`

## Non-cause (separate)
Cloud `API error 0` / `Cloud transcription exceeded 20000ms` — network/timeout path; not this ticket.
