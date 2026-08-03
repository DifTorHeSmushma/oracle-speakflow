# Root Cause Analysis: GitHub Issue #12

## Issue Summary
- **GitHub Issue**: [#12](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/12)
- **Title**: HITL WER mush: speak flow→speed flow + invented 'tested it here'; ~18s settle (≤5s floor)
- **Reporter**: Dom (HITL)
- **Severity**: Critical (open-source shame / release blocker)
- **Status**: Open
- **Related**: [#8](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/8) ASR · [#11](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/11) Cursor delivery (must not regress)

## Problem Description

**Expected Behavior**
Spoken `testing speak flow testing speak flow 1 2 3 4 1 2 3 4` pastes a meaning-preserving transcript (product name SpeakFlow intact; no invented prefix). Last-word → paste ≤ **5 s**.

**Actual Behavior**
Pasted `tested it here speed flow, testing speed flow 1, 2, 3, 4 1, 2, 3, 4`. ~**18 s** after last word.

**Symptoms**
- Product name destroyed (`speak flow` → `speed flow`)
- Invented content (`tested it here`)
- Settle latency ~3–4× the INTENT / smoke ≤5 s bar

## Reproduction Steps
1. Focus Cursor (or any host); hands-free cloud path.
2. Speak exactly: `testing speak flow testing speak flow 1 2 3 4 1 2 3 4`
3. Observe paste text + wall clock last-word → paste.

**Reproduction Verified**: Yes (Dom HITL accepted as blocking truth).

## Root Cause

### Affected Components
- `src/services/transcription.ts` — finalize uses turbo, **no vocabulary prompt**, 25 s timeout × 1 retry
- `src/electron-main.ts` — awaits speculative Groq with full cloud budget after speech_end
- `src/services/correction.ts` — no SpeakFlow / product-name lexicon
- Settle may prefer a slow/mushy finalize over cleaner live text

### Analysis

#### Accuracy
1. **Finalize has no Whisper `prompt`.** Chunks use a hygiene prompt; full-session `transcribe()` passes none → no bias toward “SpeakFlow” / dictation fidelity.
2. **Default model is `whisper-large-v3-turbo`** for finalize — speed-biased; Dom’s pair is a classic turbo mush (`speak`↔`speed`, invented filler).
3. **Correction lexicon** has SDLC casing but **zero** SpeakFlow / “speak flow” / “speed flow” remaps — mush survives paste.
4. Dismissing the phrase as “ambiguous” is forbidden by Dom: product name + digits is a normal utterance.

#### Latency (~18 s after last word)
1. Soft-finalize hangover (~2.5 s) is intentional for the pause floor — but Dom’s 18 s is dominated by **cloud wait**, not hangover alone.
2. After speech_end, pipeline **awaits speculative Groq** with `CLOUD_TRANSCRIBE_TIMEOUT_MS = 25_000` and **one retry** (~50 s worst case). A slow speculative call alone explains ~18 s.
3. INTENT / `WINDOWS_QUALITY_SMOKE.md`: last-word → settle p50 ≲ **5 s** (hangover included). Current path has no hard cap after speech_end.

**Code Location**: `transcription.ts:23-31,274-288` · `electron-main.ts:1061-1102` · `correction.ts` (no product lexicon)

## Impact Assessment
| Dimension | Assessment |
|-----------|------------|
| Dom trust / OSS | Critical — Dom will not open-source this quality |
| Cursor delivery (#11) | Must remain green |
| Scope | All remote finalize + correction on Windows (shared services) |

## Proposed Fix

### Fix Strategy (accuracy first, latency second)

1. **Finalize ASR quality**
   - Use `whisper-large-v3` (non-turbo) for **finalize / speculative full-session** calls; keep turbo optional for live chunks only.
   - Pass a fixed **FINALIZE_PROMPT** (SpeakFlow vocabulary + “do not invent / dictate only”).
   - `temperature: 0` when the Groq API accepts it.
2. **Product lexicon in `correct()`**
   - Map `speed flow` / `speak flow` / `speech flow` / `speakflow` → `SpeakFlow` (phrase-level, case-insensitive).
   - Strip known Whisper filler prefixes when they precede product dictation (conservative list).
3. **Live vs finalize mush guard**
   - If finalize destroys a product token present in live (e.g. live has `speak`/`SpeakFlow`, finalize has only `speed flow`), prefer corrected live or lexicon-fixed finalize — never paste uncorrected mush when a cleaner candidate exists.
4. **Latency ≤5 s after speech_end for short utterances**
   - Cap speculative wait after speech_end (**~2 s**).
   - Finalize cloud: **≤4 s** timeout, **0 retries** for short audio (≤~15 s WAV).
   - Log `pasteCompleteMs`, `settleSource`, `finalizeModel`, `specWaitMs` in `latency.jsonl`.
5. **Automated fixture pack**
   - Deterministic WER/meaning gate including Dom’s **exact** spoken→hypothesis pair through correction (+ optional mock finalize path).
   - Hard-fail >10% WER or >2 meaning errors / 10 on the pack.
6. **Do not regress #11** — leave restore+Ctrl+V / G-D1b alone.

### Files to Modify
| Path | Change |
|------|--------|
| `src/services/transcription.ts` | Finalize model helper, prompt, temperature, short timeout / no retry opts |
| `src/services/correction.ts` | Product lexicon + filler prefix hygiene |
| `src/services/transcriptQuality.ts` | **CREATE** — chooseBestTranscript(live, finalized); WER helpers for fixtures |
| `src/electron-main.ts` | Wire finalize model/prompt; cap speculative wait; short finalize timeout |
| `src/services/__tests__/correction.test.ts` or new | Dom pair → SpeakFlow |
| `src/services/__tests__/transcriptQuality.test.ts` | Pack scoring |
| `scripts/gate-wer-fixtures.ts` | Automated fixture pack gate |
| `docs/rca/issue-12.md` | This RCA |
| `docs/DESIGN/WINDOWS_QUALITY_SMOKE.md` | Include Dom pair as required fixture (not “banned”) |
| `package.json` / `gate-report.mjs` | Wire G-W1 WER gate |

### Alternatives Considered
| Alternative | Rejected because |
|-------------|------------------|
| “Whisper sometimes…” / ban Dom’s phrase | Dom forbade; product name is normal |
| Deepgram-only (requires key) | Must work on Groq-only path Dom uses |
| Live-settle only | Gate Alpha / #8 hard-fail on settling live as sole truth — use as **fallback when finalize is mush**, not sole settle |
| Keep turbo + 25s retry | Causes both mush and ~18 s |

### Risks
- `whisper-large-v3` slightly slower than turbo — offset by 4 s hard timeout + no retry.
- Over-aggressive lexicon could rewrite intentional “speed flow” — acceptable for SpeakFlow product dictation; document override via dictionary later if needed.

### Testing Requirements
```bash
npm run typecheck
npm test
npm run check:focus
npm run check:delivery
npm run check:delivery:electron
npx tsx scripts/gate-wer-fixtures.ts
npm run validate:gates
```

## Next Steps
1. `/implement-fix` #12
2. `/validate` → `/commit` → PR `Fixes #12`
