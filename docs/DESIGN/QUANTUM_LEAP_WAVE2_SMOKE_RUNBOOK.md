# Wave 2 human smoke — G7 + G11 runbook

**Operator:** Dom  
**Date:** ___________  
**Build:** `main` @ ___________  
**Config:** `%APPDATA%\oracle-speakflow\.env` — `SPEAKFLOW_VOICE_MODE=handsFree`

---

## Pre-flight (automated — run on Windows before human smokes)

From the **repository root** (after `git clone`):

```powershell
npm run typecheck    # G1
npm test             # G2
npm run test:integration   # G5 (optional, ~30s)
```

| Gate | Pass? | Evidence |
|------|-------|----------|
| G1 typecheck | ☐ | 0 errors |
| G2 unit tests | ☐ | 138/138 |
| G5 integration | ☐ | 7/7 |
| G10 paste logic | ☐ | included in npm test |

---

## Launch for smoke (keep terminal visible for `[LATENCY]` lines)

```powershell
taskkill /IM electron.exe /F 2>$null
npm run build
npm run start:electron
```

Confirm startup log: `Voice: handsFree`, `[HF] hands-free armed — LISTENING`.

**Mute SpeakFlow before talking to Cursor AI** — otherwise mic picks up the assistant.

---

## G7 — Paste reliability (PTT via F8)

Target: **≥9/10** correct pastes, **0** wrong-window pastes.  
Use **any app with a text field** (Cursor chat, Notepad, etc.).

| # | App focused | Hold F8 → speak → release | Pasted correctly? | Wrong window? | Notes |
|---|-------------|---------------------------|-------------------|---------------|-------|
| 1 | | | ☐ | ☐ | |
| 2 | | | ☐ | ☐ | |
| 3 | | | ☐ | ☐ | |
| 4 | | | ☐ | ☐ | |
| 5 | | | ☐ | ☐ | |
| 6 | | | ☐ | ☐ | |
| 7 | | | ☐ | ☐ | |
| 8 | | | ☐ | ☐ | |
| 9 | | | ☐ | ☐ | |
| 10 | | | ☐ | ☐ | |

**Pass line:** ≥9 checked in “Pasted correctly”, 0 in “Wrong window”.

### G7 — Alt-tab safety

1. Focus Notepad (or Cursor).
2. Hold F8, speak 3–4 words, **alt-tab to another app mid-sentence**, release F8.
3. Expected: **no paste into wrong app**; text on clipboard + toast / transcript card.

| Result | ☐ PASS ☐ FAIL | Notes |
|--------|---------------|-------|

### G7 — Latency (terminal)

After each cycle, terminal should show:

```
[LATENCY] capture-end→transcribe-start: ___ ms   (target <500 ms for G11; <800 ms end-to-end cloud OK on paste-complete)
[LATENCY] capture-end→paste-complete: ___ ms    (target <1500 ms cloud / <800 ms local)
```

| Sample | transcribe-start ms | paste-complete ms | Pass? |
|--------|---------------------|-------------------|-------|
| 1 | | | ☐ |
| 2 | | | ☐ |
| 3 | | | ☐ |

---

## G11 — Hands-free (no hotkey)

| # | Speak without F8 | Transcribed + pasted? | Notes |
|---|------------------|----------------------|-------|
| 1 | | ☐ | |
| 2 | | ☐ | |
| 3 | | ☐ | |
| 4 | | ☐ | |
| 5 | | ☐ | |
| 6 | | ☐ | |
| 7 | | ☐ | |
| 8 | | ☐ | |
| 9 | | ☐ | |
| 10 | | ☐ | |

**Pass line:** ≥8/10 without pressing F8.

### G11 — Mute / kill-switch

| Step | Expected | Pass? |
|------|----------|-------|
| Click **Listening — click to mute** (or tray → Mute) | UI shows muted; green waveform stops | ☐ |
| Speak while muted | **No** transcript, **no** paste | ☐ |
| Windows mic icon | Mic not active for SpeakFlow while muted | ☐ |
| Click unmute | Returns to LISTENING, green waveform | ☐ |
| Speak after unmute | Works again | ☐ |

**Pass line:** 0 pastes while muted.

### G11 — speech-end → transcribe latency

From terminal, one hands-free utterance:

```
[vad] speechEnd — segment ...
[LATENCY] capture-end→transcribe-start: ___ ms
```

| ms | Pass (<500)? |
|----|--------------|
| | ☐ |

### G11 — Idle false triggers (observational)

**Full spec:** 30 min idle, <1 false `speechStart`.  
**Pragmatic for this session:** 5 min idle, no phantom transcripts. Log shows `[vad] speechStart #N` only when you actually spoke.

| Duration idle | False triggers / phantom pastes | Pass? |
|---------------|----------------------------------|-------|
| 5 min | | ☐ |
| 30 min (optional overnight) | | ☐ defer |

### G11 — Call-app auto-mute (optional)

Only if Zoom/Teams installed:

| Step | Expected | Pass? |
|------|----------|-------|
| Start Zoom/Teams meeting | SpeakFlow auto-mutes | ☐ |
| End meeting | Auto-unmutes, LISTENING resumes | ☐ |

If not installed: mark **N/A**.

---

## Sign-off

| Gate | Result | Date |
|------|--------|------|
| **G7** Paste | ☐ PASS ☐ FAIL | |
| **G11** Hands-free | ☐ PASS ☐ FAIL | |

**Operator signature / notes:**

_________________________________________________________________

When both PASS → Wave 2 human gates closed → proceed to **Wave 3**.
