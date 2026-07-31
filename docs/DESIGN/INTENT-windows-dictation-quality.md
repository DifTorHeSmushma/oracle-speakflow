# INTENT — Dictation Quality Bar (Aqua Realtime-class)

> **Altitude:** Intent only — problem, bet, falsification, outcomes.  
> **Not this file:** APIs, providers, file trees, frame counts as final design — those belong in `/plan`.  
> **Date:** 2026-07-31  
> **Product:** Oracle SpeakFlow  
> **Ticket:** [#6](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/6)

---

## Problem

SpeakFlow “works” (mic → STT → paste) but fails the job Dom needs: **dictate into chat/IDE with Aqua-class trust**.

Recurring failure pattern:

1. Brief mid-thought pause → fragment paste → continue becomes a second utterance.  
2. Words often wrong; long thoughts hit ~19 s ring ceiling.  
3. Sessions labeled “quality locked” while Dom still cannot trust the tool.  
4. Watched demos (**Aqua Voice Realtime**) show text **appearing in the field as you speak** — SpeakFlow never does that (batch-after-silence only).

Conduit success was mistaken for product success. **Halfway (better hangover only) is not done.**

---

## Competitive north star — Aqua Voice

People say “Aqua Flow”; the product is **[Aqua Voice](https://aquavoice.com/)** (YC W24). Commercial, closed-source — not an OSS SpeakFlow sibling on GitHub.

| Dimension | Aqua Voice | SpeakFlow today |
| :--- | :--- | :--- |
| **Insert model** | **Realtime** (ex-Streaming): words appear **in the target app while you talk**; also Instant (hold → talk → release → ~450 ms) | **Batch only:** VAD end → one Whisper call → one paste |
| **ASR** | Proprietary **Avalon** (~5.5–6% WER Open ASR LB; ~97% on their tech-term set) | Groq **whisper-large-v3-turbo** |
| **Cleanup** | Model + formatting + **Deep Context** (screen vocabulary) | Normalize/dict stubs; LLM correction **stub** |
| **Pauses** | Natural pauses OK; stream keeps refining | Eager silence → fragment |
| **Latency feel** | Startup &lt;50–200 ms; Instant ~450 ms; Realtime continuous | Often **4–9 s** after `speech_end` |
| **License** | Paid cloud SaaS | Aim: public OSS when bar is green |

**Why demos look perfect:** streaming partials into the caret + strong ASR — not SpeakFlow’s “wait → dump” loop.

---

## Clarifying fork (resolved)

| Model | Behavior |
| :--- | :--- |
| **A — Session** | Capture until explicit stop / long idle (Wispr-like) |
| **B — Auto-utterance** | Silence → STT → paste (SpeakFlow today) |
| **Hybrid + Realtime** | Session-safe finalize **and** live insert while speaking (**chosen**) |

SpeakFlow today is **B**. Dom’s watched bar is **Aqua Realtime**. Floor endpointing without streaming is **necessary but not sufficient**.

---

## Hypothesis

We believe **Dom (Windows hard-floor smoke; Mac/Linux via shared builds)** will **trust SpeakFlow like Aqua Realtime** because we will **(1) stop false finalize on mid-thought pauses, (2) stream partials into the focused field while speaking, (3) hit ≤5% WER target on a fixed smoke, and (4) refuse “done” until both floor and streaming bars pass with Dom sign-off.**

### Wrong condition (falsification)

Do **not** call done if any of these hold after the milestone:

1. **Fragment finalize:** ≥1 / 10 pause-script utterances (≤ **2.0 s** mid-pause) finalizes early.  
2. **WER:** aggregate **> 10%** or **> 2** meaning-changing errors / 10 (target remains ≤ **5%**).  
3. **Ceiling:** ≤ **60 s** utterance truncated / missing first words.  
4. **No realtime feel:** product claimed ready but text still only appears as **one paste after silence** (no live partials in focused field).  
5. **False “locked”** without smoke + Dom sign-off in `docs/DESIGN/WINDOWS_QUALITY_LOG.md`.  
6. **Windows-only fork** so Mac/Linux packages cannot inherit shared behavior.

### De-risk focus

- [x] Usability — no mid-paste fragments **and** live text while speaking  
- [x] Value — accuracy good enough to keep  
- [x] Feasibility — streaming insert without breaking paste ladder / focus invariants  
- [ ] Viability — streaming cloud cost (secondary)

---

## Decisions locked (2026-07-31)

### 0. Product bar — **Aqua Realtime-class (not “better batch”)**

- **North star:** live text in focused chat/IDE while speaking; refine; finalize without fragments.  
- **Floor:** hybrid session finalize + WER/truncation gates.  
- **Forbidden:** labeling floor-only (hangover/WER without live insert) as done or open-source-ready.

### 1. UX model — **Hybrid session + Realtime insert**

| Mode | Behavior |
| :--- | :--- |
| **Hands-free** | Session through mid-pauses; **stream partials** into focused field; finalize on explicit stop **or** ≥ **2.5 s** silence |
| **PTT** | Stream while held; finalize on release |

### 2. Pause budget

- ≤ **2.0 s** mid-pause → must **not** finalize  
- ≥ **2.5 s** silence **or** stop → soft finalize OK  
- Live partial updates during session are **not** fragment pastes

### 3. Accuracy

| Gate | Bar |
| :--- | :--- |
| Target (OSS / “working correctly”) | ≤ **5%** WER on fixed quiet-room cloud smoke |
| Hard fail | **> 10%** WER **or** **> 2** meaning errors / 10 |

Do not claim Avalon parity without evidence. Use best available cloud path + hygiene/prompt/correction in `/plan`.

### 4. Latency

- Partials: low perceived lag (ms targets in `/plan`)  
- Finalize after true EOS: **+0.5–1.5 s** hangover OK to avoid false finalize  
- Batch “≤5 s after silence” is fallback only — **not** the success definition

### 5. Scope

| In this milestone | Deferred |
| :--- | :--- |
| Shared-path **endpointing + streaming insert + ceiling + cloud accuracy** | Cloning Avalon / Deep Context 1:1 |
| Prove on **Windows** | Local/offline as primary quality engine |
| Mac + Linux inherit via shared code + rebuild | iOS keyboard parity |

**Inheritance:** one repo change in shared services → rebuild NSIS / Mac / deb. Installers do not auto-update.

---

## Success metrics

| Metric | Target |
| :--- | :--- |
| False finalize on ≤2.0 s pause | **0 / 10** |
| Soft finalize | Only ≥2.5 s silence or stop |
| **Live insert during speech** | Required (human-visible partials) |
| WER | ≤5% target; >10% fail |
| Meaning errors | ≤2 / 10 hard |
| Truncation ≤60 s | **0** |
| Done | Floor **and** streaming green + Dom sign-off |

---

## Thin-slice MVP

Dom dictates a multi-sentence thought (with ≤2 s pauses) into chat/IDE on Windows cloud hands-free: **sees text as he speaks**, one coherent finalize, WER gates green, signs quality log.

**Out of scope:** Avalon weight clone; local-first streaming; “batch hangover only” as public launch.

---

## Deferred UX note — chrome / HUD (2026-07-31, Dom)

**Not in this milestone’s thin-slice** (dictation quality / streaming bar first). Capture so it is not lost:

| | Oracle SpeakFlow (today) | Aqua Voice |
| :--- | :--- | :--- |
| **Chrome** | Large on-screen **box / panel** that sits on the monitor and visually (and often focus-wise) interferes with whatever is behind it | App can be **fully minimized**; only a **very small icon** sits mid-bottom of the monitor / over the IDE |
| **Goal (later)** | Match Aqua’s **minimal presence**: tiny bottom-center affordance while dictating; no huge blocking box over the work surface |

Track as a follow-up issue after #6 streaming/quality gates are green (or spike in parallel only if Dom prioritizes). Working name: **“minimal HUD / Aqua-like tray presence.”**

---

## Non-goals

- Platform work as substitute for dictation trust  
- “Accepted mushy batch UX” as success  
- Halfway labeled done  

---

## Research notes (for `/plan`, not design yet)

- Aqua Realtime = streaming insert + Avalon; SpeakFlow must add streaming.  
- Industry hangover ~0.5–2 s helps finalize; does not replace streaming.  
- OpenWhispr-style pad/hygiene helps WER floor.  
- Correction LLM in SpeakFlow is still a stub.

---

## Process rule

No “quality locked / accepted UX / working as designed” unless floor **and** streaming wrong conditions are checked, logged, and Dom-signed. **Halfway ≠ done.**

---

## Next AI Layer steps

```
Working on SpeakFlow issue #6. Spec: docs/DESIGN/INTENT-windows-dictation-quality.md.
Run /prime then /plan. Do not write feature code until I approve the plan.
```

`/plan` must include: hybrid finalize, **streaming insert architecture**, ≥60 s ceiling, partials-capable cloud path, Windows smoke for **live text + no fragments + WER**, no Windows-only fork.
