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

**Decision:** Hybrid (session-first hands-free) — see **Decisions locked** below.

---

## Hypothesis

We believe **Dom (primary: Windows IDE / chat drafting)** will **trust SpeakFlow for multi-sentence dictation without fragment pastes** because we will **(1) freeze an explicit UX model (A / B / hybrid), (2) meet measurable endpointing + WER gates on a fixed smoke script, and (3) refuse to call the milestone done until those gates pass — including hold-out utterances not used while tuning.**

### Wrong condition (falsification) — required

If, after the quality milestone ships, **any** of the following is true on Dom’s machine under the frozen smoke protocol, we **do not** call it done (no “accepted UX” waiver without Dom sign-off):

1. **Fragment paste:** On ≥1 of 10 scripted multi-clause utterances that include a deliberate **≤ 2.0 s** mid-thought pause, SpeakFlow pastes **before** the utterance is finished (soft commit must require **≥ 2.5 s** silence or explicit stop).  
2. **WER floor:** On the fixed 10-utterance cloud smoke set (quiet room, known mic), aggregate **WER > 10%**, or **>2** utterances with a meaning-changing error. (Launch **target** is ≤ 5% WER — see Decisions.)  
3. **Ceiling:** Any intentional utterance ≤ **60 s** of continuous speech is truncated or loses opening words (`truncated: true` or missing first content words).  
4. **Process regression:** A future session labels the path “locked/correct” without re-running the smoke protocol and recording results in `docs/DESIGN/WINDOWS_QUALITY_LOG.md`.  
5. **Platform fork:** Endpointing / WER fixes land only behind Windows-specific branches so macOS/Linux packages cannot inherit the same behavior from shared services.

### De-risk focus

- [x] **Usability** — can Dom finish a thought without mid-paste?
- [x] **Value** — is text accurate enough to keep vs retype?
- [x] **Feasibility** — can we hit the bar with cloud Whisper + Silero (or must we change UX model / model / correction)?
- [ ] Viability — cost of cloud / correction (secondary this cycle)

---

## Decisions locked (2026-07-31 — architect recommendation, Dom-confirmed to proceed)

These replace the open questions. `/plan` may use them as authority.

### 1. UX model — **Hybrid (session-first hands-free)**

| Mode | Behavior |
| :--- | :--- |
| **Hands-free (default)** | **Session-oriented:** keep capturing through mid-thought pauses. Commit (STT→paste) on **(a) explicit stop** (hotkey / UI stop) **or (b) long silence hangover** (see pause budget). Not classic eager Model B. |
| **PTT** | Hold-to-talk remains for precise short bursts (unchanged product surface). |

**Why not pure A:** SpeakFlow’s bet is hands-free-first without requiring a key held every time — pure “until stop only” with no soft end frustrates short dictations.  
**Why not pure B:** Dom’s failure mode is eager silence commit; Wispr-class trust needs session continuity.  
**Why hybrid:** Match Wispr’s *feel* (think aloud, pause, continue) while keeping SpeakFlow’s hands-free default and PTT escape hatch.

### 2. Pause budget — **≥ 2.5 s silence before soft commit; mid-pauses ≤ 2.0 s must not commit**

- **Must not commit:** intentional mid-thought pauses up to **2.0 s**.  
- **Soft commit allowed:** continuous silence **≥ 2.5 s** (hangover), *or* explicit stop anytime (including sooner).  
- Engineering may express this as `redemptionFrames` / silence policy in `/plan`; the **outcome** is binding, not a specific frame count until plan freezes numbers against smoke.

### 3. Accuracy — **Target ≤ 5% WER; hard fail if > 10% or > 2 meaning-changing errors / 10**

| Gate | Bar |
| :--- | :--- |
| **Launch / “working correctly” target** | Aggregate WER **≤ 5%** on the fixed quiet-room cloud smoke script |
| **Wrong condition (must not ship as done)** | Aggregate WER **> 10%** **or** **> 2** meaning-changing errors / 10 |

Open-source bar = target ≤5%. Thin-slice may land between 5–10% only as an explicit Dom-signed interim — never as “fantastic / ready for public.”

### 4. Latency — **Yes: prefer avoiding fragments over minimizing hangover**

After *true* end-of-speech, waiting **~0.5–1.5 s extra** (within the 2.5 s soft-commit policy) is acceptable. Fragment pastes are worse than a slightly slower paste. Cloud STT wall time remains a separate budget (record p50; propose ≤5 s last-word→paste once endpointing is fixed — Dom may re-tune later).

### 5. Scope — **Shared-repo cloud dictation quality this milestone; local deferred; all platforms inherit code**

| In this milestone | Deferred |
| :--- | :--- |
| Endpointing + capture ceiling + cloud STT hygiene/accuracy on the **shared** path (`vad` / `capture` / `transcription` / HF pipeline) | Local/offline matching Handy; claiming tiny/local Fast is good |
| **Prove on Windows** (Dom machine = human hard floor) | Replacing Linux/macOS smoke as the primary sign-off this cycle |
| macOS + Linux **get the same behavior automatically** when they use the shared services (no Windows-only fork for hangover/WER) | Full G32/G33 / Mac native sign-off as a substitute for Windows quality |

**Cross-platform inheritance (explicit):**

- VAD + pipeline live in shared TypeScript services — **not** under `win32`-only branches for endpointing.  
- Capture backends differ (DirectShow / avfoundation / pulse); **frame → VAD → STT → paste** policy should stay platform-agnostic.  
- Shipping “applies to three builds” means: **one repo change → rebuild each package** (Windows NSIS, macOS, Linux deb). Installers do not auto-update; code inheritance is automatic, distribution is per-artifact.  
- Open-source public repo only after this quality bar is green (process: Dom sign-off on Windows smoke + no known platform-specific regression in shared path).

---

## Success metrics (outcomes) — updated

| Metric | Target | How measured |
| :--- | :--- | :--- |
| Mid-pause fragment pastes | **0 / 10** on pause script (pauses ≤ 2.0 s) | Human smoke + diag |
| Soft commit | Only after ≥ **2.5 s** silence **or** explicit stop | Smoke + timestamps |
| Aggregate WER | **≤ 5%** target; **> 10%** = fail | Fixed script vs paste |
| Meaning-changing errors | **≤ 2 / 10** (hard); aim **0–1** | Human judgment |
| Long utterance integrity | **0 truncations** for ≤ **60 s** (session may run longer with explicit stop) | diag `truncated` / latency log |
| Last-word → paste | Recorded; propose ≤5 s p50 once endpointing fixed | `latency.jsonl` |
| Cross-platform | No Windows-only endpointing fork; shared services | Code review gate in `/plan` |
| “Done” label | Smoke green + Dom sign-off in quality log | Process |

---

## Open questions (Dom must answer before `/plan` locks engineering)

**Status: CLOSED** — decisions locked above (2026-07-31). Re-open only if Dom rejects a row.

---

## Assumptions (flagged)

- Cloud Groq remains available for the thin slice and public cloud path.  
- Dom will run / judge the **Windows** smoke (human hard floor); macOS/Linux inherit shared code and get platform smoke later.  
- “Fantastic” means **trust for daily drafting** and a bar fit for **public open-source**, not feature parity with Wispr’s entire suite.  
- Local STT quality is a **later** milestone; this cycle must not make local the blocker for cloud dictation trust.

---

## Process rule (breaks the false-“correct” loop)

No agent or human may write “quality locked,” “accepted UX,” or “working as designed” for hands-free dictation unless:

1. This intent’s wrong conditions are checked, and  
2. Results are recorded in `docs/DESIGN/WINDOWS_QUALITY_LOG.md` with date + script IDs, and  
3. Dom signs the row.

---

## Next AI Layer steps

1. ~~Dom answers open questions~~ → **locked.**  
2. GitHub issue **#6** references this doc.  
3. Product chat session open:

```
Working on SpeakFlow issue #6. Spec: docs/DESIGN/INTENT-windows-dictation-quality.md.
Run /prime then /plan. Do not write feature code until I approve the plan.
```

4. `/plan` must include: hybrid endpointing design, ≥60 s capture/session ceiling, cloud accuracy levers, Windows smoke + hold-out script, and a **no Windows-only fork** check for shared services.

