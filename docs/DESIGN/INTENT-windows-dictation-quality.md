# INTENT — Windows Dictation Quality Bar (Hands-Free Must Feel Finished)

> **Altitude:** Intent only — problem, bet, falsification, outcomes.  
> **Not this file:** code, VAD numbers as final design, APIs, file trees. Those belong in `/plan` after this intent is approved.  
> **Date:** 2026-07-31  
> **Product:** Oracle SpeakFlow  
> **Ticket:** [#6](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/6)

---

## Problem

SpeakFlow “works” (mic → STT → paste) but fails the job Dom actually needs: **dictate a real thought into the focused app without fighting the tool**.

Recurring failure pattern (not a one-off):

1. Brief mid-thought pause → system treats utterance as finished → pastes a fragment.  
2. Continuing speech becomes a **second** STT/paste (or feels like “it only heard after the pause”).  
3. Words are often wrong; long thoughts hit a hard audio ceiling (~19 s ring).  
4. Sessions have been labeled “quality locked / correct” while Dom still cannot trust the product for real work.

The gap is not “missing a polish pass.” The gap is **no falsifiable definition of done** for hands-free dictation, so conduit success was mistaken for product success.

---

## Clarifying fork (must choose — product, not tuning)

Two different products share the phrase “hands-free”:

| Model | Behavior | Who does this |
| :--- | :--- | :--- |
| **A — Session dictation** | One continuous capture until **explicit stop** (hotkey / button) or a **long** idle timeout. Natural pauses do **not** paste. | Wispr Flow (desktop sessions up to ~20 min; user stops when done) |
| **B — Auto-utterance paste** | Silence hangover ends a segment → STT → paste → listen again. Pauses **are** commit points. | SpeakFlow today (Silero end → pipeline) |

**SpeakFlow today is B.** Dom’s symptoms are the failure mode of B when hangover is too eager and ASR/correction are weak.

**“Fantastic / works perfectly” is undefined until Dom picks A, B, or a hybrid (e.g. B with much longer hangover + optional PTT session mode).**

---

## Hypothesis

We believe **Dom (primary: Windows IDE / chat drafting)** will **trust SpeakFlow for multi-sentence dictation without fragment pastes** because we will **(1) freeze an explicit UX model (A / B / hybrid), (2) meet measurable endpointing + WER gates on a fixed smoke script, and (3) refuse to call the milestone done until those gates pass — including hold-out utterances not used while tuning.**

### Wrong condition (falsification) — required

If, after the quality milestone ships, **any** of the following is true on Dom’s machine under the frozen smoke protocol, we **do not** call it done (no “accepted UX” waiver without Dom sign-off):

1. **Fragment paste:** On ≥2 of 10 scripted multi-clause utterances that include a deliberate ~0.5–1.0 s mid-thought pause, SpeakFlow pastes **before** the utterance is finished (Model B failure) *or* (if Model A chosen) pastes without an explicit stop.  
2. **WER floor:** On the fixed 10-utterance cloud smoke set (quiet room, known mic), **word error rate > 10%** aggregate, or **>2** utterances with a meaning-changing error (wrong verb/noun that changes instruction).  
3. **Ceiling:** Any intentional utterance ≤ **60 s** of continuous speech is truncated or loses opening words (`truncated: true` or missing first content words).  
4. **Process regression:** A future session labels the path “locked/correct” without re-running the smoke protocol and recording results in `docs/DESIGN/WINDOWS_QUALITY_LOG.md`.

### De-risk focus

- [x] **Usability** — can Dom finish a thought without mid-paste?
- [x] **Value** — is text accurate enough to keep vs retype?
- [x] **Feasibility** — can we hit the bar with cloud Whisper + Silero (or must we change UX model / model / correction)?
- [ ] Viability — cost of cloud / correction (secondary this cycle)

---

## Success metrics (outcomes)

| Metric | Target | How measured |
| :--- | :--- | :--- |
| Mid-pause fragment pastes | **0 / 10** on pause script | Human smoke + optional diag timestamps |
| Aggregate WER (fixed script) | **≤ 10%** | Script vs pasted text |
| Meaning-changing errors | **≤ 2 / 10** utterances | Human judgment against script |
| Long utterance integrity | **0 truncations** for ≤60 s | `latency.jsonl` / diag `truncated` |
| Last-word → paste latency | Recorded; ** Dom-approved budget** (propose ≤5 s p50 cloud once endpointing fixed) | `latency.jsonl` |
| “Done” label | Only after smoke green + Dom sign-off row in quality log | Process |

---

## Thin-slice MVP (hypothesis proof)

**One sentence:** On Windows cloud hands-free, Dom can dictate **10 scripted multi-sentence thoughts** (including intentional short pauses) and get **one correct paste per thought** under the frozen UX model, with WER and truncation gates green — then sign the quality log.

In scope for thin slice:

- Freeze UX model (A / B / hybrid) in writing  
- Endpointing behavior that matches that model  
- Capture ceiling that supports ≥60 s (or session model that removes the ring as the thought boundary)  
- Cloud STT path + minimal post-ASR hygiene required to hit WER gate  
- Fixed smoke protocol + quality log sign-off  

Explicitly **not** this thin slice:

- Matching Wispr’s full product surface (agents, meetings, mobile)  
- Declaring local/offline “as good as Handy”  
- Shipping unimplemented LLM correction as if it were live  
- Linux/macOS parity work as a substitute for Windows dictation trust  

---

## Target users

**Primary:** Dom — Windows, Cursor/IDE + chat, hands-free drafting.  
**Pain:** Cannot trust SpeakFlow mid-thought; retyping kills the product.

---

## Non-goals (this bet)

- Platform expansion as the main spine  
- “Accepted ~7 s mushy cloud UX” as a success claim  
- Calling conduit success (“paste happened”) equal to dictation success  

---

## Research summary (requirements context — not the plan)

Industry / competitor evidence (for planning later):

| Finding | Implication for SpeakFlow |
| :--- | :--- |
| Silence hangover for natural speech is typically **~500–800 ms** conversational; **~800–2000 ms** when feeding Whisper so pauses are not chopped | Today’s ~40 frames (~1.3 s) can still feel early if soft dips count as silence; dictation often wants **longer** hangover or **session mode** |
| OpenWhispr realtime uses ~**800 ms** silence + **500 ms** prefix pad for soft speech | Pad + hangover are first levers under Model B |
| faster-whisper defaults use **~2 s** min silence for Whisper-oriented VAD | Aggressive short hangover hurts ASR context |
| Wispr Flow desktop keeps **one session up to ~20 minutes**; user stops when done | “Perfect like Wispr” ≈ Model **A**, not retuning B alone |
| Prior SpeakFlow competitive note: glossary/`prompt`, reject bad segments, RMS gate, abandon tiny-local | Accuracy levers after endpointing model is frozen |
| SpeakFlow correction LLM is a **stub**; turbo cloud alone will not feel “perfect” | WER gate may require model upgrade and/or real correction |

---

## Open questions (Dom must answer before `/plan` locks engineering)

1. **UX model:** A (session until stop), B (auto-paste on silence), or hybrid (e.g. longer hangover B + optional session/PTT)?  
2. **Pause budget:** How long a mid-thought pause must **not** commit (e.g. 1.5 s / 2.5 s / “until I press stop”)?  
3. **Accuracy bar:** Is ≤10% WER + ≤2 meaning errors on the fixed script the right gate, or stricter (≤5%)?  
4. **Latency trade:** Willing to wait longer after true end-of-speech to avoid fragment pastes?  
5. **Scope of “perfect”:** Windows cloud drafting only this milestone, or must local match too?

---

## Assumptions (flagged)

- Cloud Groq remains available for the thin slice.  
- Dom will run / judge the smoke on his machine (human hard floor).  
- “Fantastic” means **trust for daily drafting**, not feature parity with Wispr’s entire suite.

---

## Process rule (breaks the false-“correct” loop)

No agent or human may write “quality locked,” “accepted UX,” or “working as designed” for hands-free dictation unless:

1. This intent’s wrong conditions are checked, and  
2. Results are recorded in `docs/DESIGN/WINDOWS_QUALITY_LOG.md` with date + script IDs, and  
3. Dom signs the row.

---

## Next AI Layer steps

1. Dom answers open questions § above (especially UX model).  
2. GitHub issue references this doc.  
3. Product chat: `Working on SpeakFlow issue #<N>. Spec: docs/DESIGN/INTENT-windows-dictation-quality.md. Run /prime then /plan. Do not write feature code until I approve the plan.`  
4. `/plan` only after answers — plan must include smoke protocol and hold-out utterances.
