# Phase 0 — Capture Diagnostics Spec (Windows Quality)

**Status:** APPROVED for implementation (DOM 2026-07-16)  
**Authority:** Forensic dual-auditor review; `WINDOWS_QUALITY_LOG.md`; CLAUDE.md #17–#19  
**Altitude:** Evidence only — **no default behavior / gain / VAD / FFmpeg arg changes.**

---

## Goal

Instrument the existing single-mic FFmpeg capture path so failing utterances produce an **ungammable** evidence pack that distinguishes:

| Class | Evidence |
|-------|----------|
| Software gain clip | raw clean, gained clipped |
| Onset / VAD clock | lag frames, soft-onset, pad, HF≠PTT |
| Continuity | holey raw WAV, bytes/s, FFmpeg rterr, ring truncate |
| Orchestration discard | `speechEnd` while state ≠ RECORDING |
| ASR-only | good raw+gained continuous WAV + accept + bad text |

## Enable

```text
SPEAKFLOW_CAPTURE_DIAG=1
```

Optional alias: `SPEAKFLOW_VAD_DEBUG=1` continues existing stderr RMS logs; diag writes files independently.

## Artifacts (per utterance)

Under `userData/capture-diag/`:

- `{utteranceId}.raw.wav` — ungained s16le PCM (same frame span)
- `{utteranceId}.gained.wav` — post-`micGain` PCM (what ASR receives)
- `utterances.jsonl` — one JSON object per line (no transcript text)

## Hard rules

1. No second mic / `getUserMedia` (#17).
2. No mute semantics change (#19).
3. No focus/paste changes (#18).
4. No transcript text in diag logs (Invariant #4 / A6).
5. Diag off → byte-identical capture/VAD/pipeline behavior (aside from optional no-op checks).

## Phase 1 unlock

Only after ≥N failing utterances have E1–E4-class metrics and the split decision tree is applied. One change class per proven class — not a bundled gain+dshow+ring fix.

## Smoke (human)

1. Launch with `SPEAKFLOW_CAPTURE_DIAG=1`.
2. Reproduce bad dictation (HF + PTT).
3. Inspect `capture-diag/` dual WAVs + JSONL.
4. Hand pack to Architect before any Phase 1 code.
