# Windows Quality Smoke — Issue #6 / #8

**Authority:** `docs/DESIGN/INTENT-windows-dictation-quality.md`  
**Log:** `docs/DESIGN/WINDOWS_QUALITY_LOG.md`  
**Tickets:** [#6](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/6) floor+streaming · [#8](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/8) ASR mastery  

**Do not** write “locked / done / accepted UX” until Dom signs the log.

---

## Standard

Brilliance every workflow. A meaning-destroying paste is a **release blocker**, not a note.

| Must prove | Bar |
|---|---|
| Mid-pause continuity | ≤2.0 s pause → **one** session (never fragment) |
| Live insert | Text visible **during** speech (Notepad + Cursor) |
| WER | ≤5% target on fixed pack; hard-fail >10% **or** >2 meaning errors / 10 |
| Latency | Last-word → final settle Dom p50 ≲ **5 s** (hangover ~2.5 s included) |
| Ceiling | ≤60 s utterance not truncated (emergency 45/28 caps ≠ pass) |

---

## Forbidden smoke phrases

Do **not** use these — they are ASR-ambiguous and produce false confidence:

| Ban | Why |
|---|---|
| “Text to text test” | Collapses into fluent garbage (“Speed flow, speech detect.”) |
| “hello hello” alone | Too short; Whisper invents outros |
| Single short nouns | No distinctive anchors; unscorable |

**Not banned (issue #12):** product name + digits is a **normal** user utterance. Dom’s exact HITL line is a **required** fixture:

> `testing speak flow testing speak flow 1 2 3 4 1 2 3 4`

Hard-fail if paste contains `speed flow` or invented `tested it here`, or last-word→paste sits near ~18 s. Automated proof: `npm run check:wer` (G-W1).

**Rule:** every scored line must include **≥2 proper nouns or SDLC tokens** (function names, file paths, ticket IDs, APIs) **or** the Dom SpeakFlow product-name line above.

---

## Preflight (Builder before Dom)

1. SHA on `feat/issue-6-dictation-quality-streaming` (or noted commit).
2. `npm run build && npm run build:ui && electron dist/electron-main.js` (or `npm run start:app`).
3. Stderr proof: `[vad] armed redemptionFrames=79` **and** `[HF] … redemptionFrames=79`.
4. Cloud: `SPEAKFLOW_TRANSCRIPTION_MODE=remote` + Groq key. Live insert on (`SPEAKFLOW_STREAMING_INSERT` ≠ `0`).
5. Clear the target field. Focus **Notepad** (or Cursor chat for C2). SpeakFlow must **not** be focused.
6. Dom reports wall-clock last-word→settle with a phone timer; Builder attaches `%APPDATA%\Electron\latency.jsonl` rows for that utterance.

---

## Gate Alpha — daily / post-fix (3 lines, ~2 min)

Run **in order**. All three must pass before claiming a fix worked.

### α1 — Anchor WER (no pause)

> Speak exactly:  
> **Refactor `parseConfig` in `src/utils/config.ts` then open pull request number 84.**

| Check | Pass? |
|---|:---:|
| Final text ≈ script (tokens `parseConfig`, `config.ts`, `84` present) | |
| Text appeared during speech (not only after silence) | |
| Last-word → settle ≲ 5 s (Dom timer) | |
| No thank-you / loop / product-name hallucination | |

### α2 — Pause continuity (the A2 contract)

> Speak exactly:  
> **Rename the helper function please** *[pause 1.0–1.5 s]* **then update every call site.**

| Check | Pass? |
|---|:---:|
| One session (post-pause continues; no early paste of first clause only) | |
| Final text ≈ script | |
| Last-word → settle ≲ 5 s | |
| Live text during speech | |

### α3 — Agentic / SDLC dictation

> Speak exactly:  
> **In Cursor, ask the agent to fix issue 8, run the typecheck, then commit with message streaming ASR backend.**

| Check | Pass? |
|---|:---:|
| Tokens present: `Cursor`, `issue 8` (or “eight”), `typecheck`, `streaming`, `ASR` (or clear equivalents) | |
| Meaning preserved (could execute the instruction) | |
| Live + settle ≲ 5 s | |

**Gate Alpha verdict:** PASS only if α1–α3 all pass. One fail → **FAIL** the build for Dom sign-off.

---

## Script A — Pause pack (10) — false-finalize gate

Each line: speak clause 1, pause **1.0–1.5 s**, speak clause 2. Must stay **one** utterance.

| # | Exact script | Pass? | Notes |
|---|---|:---:|---|
| 1 | Rename the helper function please *[pause]* then update every call site. | | α2 |
| 2 | Open `electron-main.ts` please *[pause]* and jump to the paste ladder. | | |
| 3 | Set redemption frames to seventy nine *[pause]* then rebuild the renderer. | | |
| 4 | Capture the foreground HWND now *[pause]* but never call SetForegroundWindow. | | |
| 5 | Transcribe with Groq whisper large v3 turbo *[pause]* then paste with control V. | | |
| 6 | Reject thank you hallucinations *[pause]* and skip low energy silence chunks. | | |
| 7 | Drain in-flight chunks at speech end *[pause]* then skip blocking finalize if live is good. | | |
| 8 | Growing window from utterance start *[pause]* not only the last one second. | | |
| 9 | Background finalize may correct the field *[pause]* if live text was wrong. | | |
| 10 | When Deepgram lands behind StreamingAsrBackend *[pause]* retire the Groq chunk patch loop. | | |

**Gate:** false finalize on ≤2.0 s pause = **0 / 10**.

---

## Script B — Soft finalize

| Check | Pass? |
|---|:---:|
| Silence ≥ **2.5 s** → one soft finalize OK | |
| Explicit stop / PTT release → finalize OK | |
| ≤2.0 s pause alone does **not** finalize | |

---

## Script C — Live insert targets

| Target | Partials visible while speaking? | ClipboardToast-only? |
|---|:---:|:---:|
| **Notepad** (α1) | | |
| **Cursor chat** (α3 into chat input) | | |

**Gate:** ClipboardToast-only in Cursor = **FAIL** unless Dom writes an explicit unsafe-target exception in the quality log.

---

## Script D — WER pack (10) — quiet room, cloud

Read each line **once**, clearly. Score vs reference (normalize case/punctuation; keep code tokens).

| # | Reference (exact) | Meaning OK? | Notes |
|---|---|:---:|---|
| 1 | Refactor `parseConfig` in `src/utils/config.ts` then open pull request number 84. | | α1 |
| 2 | Rename the helper function please then update every call site. | | |
| 3 | Enable hands-free mode and keep redemption frames at seventy nine. | | |
| 4 | Never steal foreground; paste into the already focused window only. | | |
| 5 | Run npm test then npm run typecheck before opening the pull request. | | |
| 6 | Write the latency row to AppData Electron latency.jsonl for this utterance. | | |
| 7 | Reject punctuation-only transcripts like a single period from silence. | | |
| 8 | Issue eight needs a StreamingAsrBackend with Deepgram for Aqua-class feel. | | |
| 9 | The agent should fix the bug, validate, then ask Dom to re-smoke Gate Alpha. | | |
| 10 | SpeakFlow must not mark issue six done until Dom signs the quality log. | | |

| Aggregate | Value |
|---|---|
| WER % (optional formal) | |
| Meaning-changing errors / 10 | |
| Verdict | ≤5% target; **FAIL** if >10% **or** >2 meaning errors |

---

## Script E — Ceiling

Dictate a continuous thought ≥ **60 s** (may use Script D lines 1–10 concatenated with short pauses &lt;1 s).

| Check | Pass? |
|---|:---:|
| `truncated: false`; first words present; no emergency-cap claim as 60 s pass | |

---

## Dom report template (paste into issue / log)

```
SHA:
Gate Alpha: α1 __ α2 __ α3 __  → PASS/FAIL
Last-word→settle (s): α1=__ α2=__ α3=__
Live during speech?: yes/no
Meaning errors (D pack if run): __ / 10
latency.jsonl: liveChars=  skippedFinalize=  pasteCompleteMs=  audioSec=
Notes:
Dom sign-off: unsigned | signed YYYY-MM-DD
```

---

## Sign-off

Copy Gate Alpha + any full pack results into `WINDOWS_QUALITY_LOG.md`.  
**Halfway ≠ done.** Floor without WER+latency+live = not done. #6 / #8 stay open until Dom signs.
