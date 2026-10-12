# Plan: muted F8 cold-start empty capture

**Issue:** [#13](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/13)  
**Human approve:** User approved execute ("Proceed and fix the F8 button"). Bug path — forensic RCA in `docs/rca/2026-10-12-muted-f8-cold-start.md`.

## Root cause
1. Mute kill-switch stops FFmpeg. F8 cold-starts capture and calls `markSpeechStart` before first PCM → empty 44-byte WAV.
2. Mute while `TRANSCRIBING` (capture already null) does not `resetToIdle` → F8 keydown ignored.

## Fix
1. `CaptureSession.waitForFirstPcm(timeoutMs)` 
2. PTT keydown: after cold start, await first PCM (cap ~2.5s) then `markSpeechStart`; keyup awaits same arm promise
3. Empty muted/PTT WAV: surface clear IDLE error, do not call Groq
4. Mute on: always `resetToIdle` when muted (even if captureSession already null)

## Out of scope
Cloud 20s timeout / API error 0 wording (separate).

## Validate
`npm run typecheck` + `npm test` (capture tests for waitForFirstPcm)
