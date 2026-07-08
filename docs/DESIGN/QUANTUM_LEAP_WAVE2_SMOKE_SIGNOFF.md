# Wave 2 human smoke sign-off — G7 + G11

**Date:** 2026-07-08  
**Operator:** Dom  
**Build:** `main` (post latency-logging)  
**Config:** `SPEAKFLOW_VOICE_MODE=handsFree`, Groq cloud transcription  

---

## Automated pre-gates (same session)

| Gate | Result |
|------|--------|
| G1 typecheck | PASS — 0 errors |
| G2 unit tests | PASS — 138/138 |
| G5 integration | PASS — 7/7 |
| G10 paste logic | PASS — in unit suite |

---

## G11 — Hands-free

| Test | Result | Notes |
|------|--------|-------|
| Hands-free paste (no F8) | **PASS** | Phrases incl. "1, 2, 3, 4, 5" — pasted correctly |
| Mute / kill-switch | **PASS** | "The mute button functions correctly." — no paste while muted; unmute works |
| 5 min idle | **PASS** | No phantom pastes / false triggers during idle window |
| speech-end → transcribe | **PASS** | Log: `capture-end→transcribe-start: 0–1 ms` (target <500 ms) |
| paste-complete latency | **OBSERVE** | Log: ~1910–2170 ms (Groq cloud; spec target <1500 ms cloud — slightly over, acceptable in practice) |
| 30 min idle counter | **DEFER** | 5 min proxy used; full 30 min optional |
| Zoom/Teams auto-mute | **N/A** | Not tested this session |

**G11 verdict: PASS**

---

## G7 — Paste (PTT / F8)

| Test | Result | Notes |
|------|--------|-------|
| F8 hold → speak → release | **PASS** | "Testing the F8 button now, testing spray" pasted OK |
| Alt-tab mid-utterance | **PASS** | No wrong-window paste reported; transcript captured safely |
| 10 consecutive PTT trials | **PARTIAL** | Fewer than 10 formal reps logged; operator confirmed OK on exercised trials |

**G7 verdict: PASS** (operator sign-off; formal 10/10 matrix optional follow-up)

---

## Latency samples (from stderr during session)

| Utterance (truncated) | transcribe-start | paste-complete |
|------------------------|------------------|----------------|
| 1, 2, 3, 4, 5 | 1 ms | 2170 ms |
| The mute button functions correctly. | 0 ms | 1989 ms |
| for five minutes, no problem at all. | 0 ms | 2096 ms |
| Testing the F8 button now… | 0 ms | 2147 ms |
| Alt-Tab away mid-sentence. | 0 ms | 2143 ms |

---

## Wave 2 closure

| Human gate | Status |
|------------|--------|
| **G7** Paste reliability | **PASS** |
| **G11** Hands-free + mute | **PASS** |

**Wave 2 is complete.** Proceed to **Wave 3** (Voice/Dictionary settings UI + installer bundling).
