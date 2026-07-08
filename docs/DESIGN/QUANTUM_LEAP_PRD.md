# Quantum Leap PRD — Oracle SpeakFlow (Intent Altitude)

**Date:** 2026-07-07
**Author:** Frontier architect-engineer
**Status:** ✅ **APPROVED v2 (Gate C1 passed 2026-07-07)** — hands-free P0-primary. Session 1 complete. Engineering Spec is Session 2 (separate session) — do not author here.
**Provenance:** `storm-reports/speakflow-quantum-leap-2026-briefing.md` (incl. VAD/hands-free addendum), `WARGAME-speakflow-quantum-leap.md`
**Altitude:** Intent only — *what and why*, not *how*. No file paths, no APIs. Those live in the Spec (Session 2).

> **Amendment log (v1 → v2):** Hands-free voice activation promoted from deferrable option to **P0 primary mode, co-equal with paste reliability.** F8 push-to-talk demoted to fallback/alternate. MVP, locked decisions, deferral order, success metrics, and falsification conditions all revised. STORM gap on Silero-in-Electron / privacy UX / competitor defaults closed (see briefing addendum AF1–AF5).

---

## 1. Problem

Developers dictating into AI coding assistants (Cursor, VS Code chat) need to **think out loud and have their words appear reliably in the chat input — without pressing a button for every utterance** — correctly spelled with their own technical vocabulary. SpeakFlow today fails on two fronts: (a) paste into Cursor is intermittent because it fights Windows' foreground-ownership policy; (b) every capture requires holding F8, which is friction, keyboard wear, and a barrier to sustained spoken reasoning. It also has no way to teach the tool a user's terms or fix predictable misrecognitions. **Two co-equal P0s: paste reliability and hands-free capture.** Neither is negotiable.

## 2. Hypothesis

If SpeakFlow (a) **detects speech start/stop by voice activity — no hotkey for the record cycle**, (b) **stops stealing window focus** and pastes into the app that already holds foreground behind a target-focus guard, and (c) adds a **user-owned Personal Dictionary** plus **deterministic post-transcription correction**, then a developer will dictate into Cursor chat **hands-free**, reliably, in their own vocabulary, entirely offline — making SpeakFlow the reference open-source developer dictation utility.

**Observable outcome (48h):** A developer, with Cursor chat focused, simply **speaks** — no key pressed — and the corrected, dictionary-aware text appears in that chat input, on ≥8 of 10 consecutive hands-free utterances, with zero pastes fired while muted or into the wrong window.

## 3. Wrong condition (falsification)

The hypothesis is **wrong** — and we adjust — if, after Wave 2:
- **Hands-free cycle <8/10** consecutive sessions without a hotkey, *and* the cause is not tunable via threshold (the VAD bet itself failed → escalate VAD approach, do **not** revert to button-only).
- **Any paste fires during mute / kill-switch active**, or **any wrong-target paste** occurs (safety floor breached → block auto-paste until guard is proven).
- **Speech-end→transcribe-start >500ms** silence detection latency (hands-free feels laggy → tune hangover, not remove).
- **Paste smoke <7/10** into Cursor chat with keep-focus (paste bet failed → editor/accessibility injection, the 6th-lens path).
- **Correction adds >200ms p95** or **regresses clean-speech output** (→ deterministic-only / off by default).

**Degradation rule (locked):** If VAD + auto-paste cannot both land reliably in 48h, we still ship **VAD + clipboard-and-toast**. *Silence must never degrade to button-only; paste may degrade to clipboard fallback.*

## 4. Success metrics

**Paste & pipeline**

| Metric | Target |
|---|---|
| Paste reliability (utterance → text in Cursor chat, consecutive) | **≥9/10** without touching tray |
| Latency capture-end → text visible (local) | **<800ms** |
| Latency capture-end → text visible (cloud/Groq) | **<1.5s** |
| Correction added latency (deterministic default) | **<50ms p95**; LLM opt-in <200ms p95 |
| Wrong-target pastes | **0** (guard → clipboard+toast instead) |
| Dictionary adoption | Add a term → applied on next mispronunciation, offline |
| Offline usability | Full listen→correct→paste path works with no network |

**Hands-free (new — P0)**

| Metric | Target |
|---|---|
| Hands-free cycle works, consecutive sessions, no hotkey | **≥8/10** |
| False-positive paste during mute / kill-switch active | **0** (hard) |
| Speech-end (silence) → transcribe-start latency | **<500ms** |
| Unintended trigger during idle (no user speech) | **<1 per 30 min** at default threshold (tunable) |

**Gates:** G1–G6 green; G7–G11 pass (G11 = hands-free smoke).

## 5. Thin-slice MVP (REPRIORITIZED — hands-free end-to-end)

The smallest end-to-end path that proves the leap is now the **hands-free loop**:

> With Cursor chat focused and SpeakFlow listening, the developer **speaks** a sentence containing a dictionary dev-term (e.g. "npm run typecheck") and a homophone — **pressing no key**. VAD detects speech start, then ~300–700ms trailing silence marks the end → transcribe → deterministic correction → dictionary apply → the corrected text appears in the chat input, offline, capture-end→visible <800ms. If muted/kill-switch active, nothing fires. If the target isn't foreground, text goes to clipboard with a toast — never the wrong window.

This exercises all four pillars in one motion: **VAD/hands-free trigger**, **paste v2 (keep-focus + guard + fallback)**, **deterministic correction**, and the **Personal Dictionary**. **F8 push-to-talk remains available as an alternate/fallback mode**, not the primary UX.

## 6. Locked decisions (from STORM + Wargame + C1 amendment)

| # | Decision | Basis |
|---|---|---|
| L1 | **Never steal foreground.** Keep target foreground; paste into the already-focused window. | STORM F1 (MS docs verified) |
| L2 | **HWND allowlist guard before paste.** If foreground ≠ captured target (or is SpeakFlow/unknown), do NOT paste. | Wargame S1–S2, S18 |
| L3 | **Clipboard-only + toast is the guaranteed fallback**, triggered by the guard. | Wargame Approach 3 |
| L4 | **Remove per-paste PowerShell `Add-Type` / `SetForegroundWindow`** — bug + latency violation. | STORM F1/F5 |
| L5 | **Correction defaults to deterministic/rule-based** (dev-term map, casing, punctuation), offline. LLM correction opt-in, constrained, latency-gated. | STORM F4 |
| L6 | **Personal Dictionary is a first-class, versionable JSON artifact** (import/export), applied at the deterministic layer, authoritative, runs last. | STORM F2; Wargame S8 |
| L7 | **Local-first default; Groq optional.** Architect for latency + privacy, not cloud cost. | STORM F3; Invariant #13 |
| **L8 (REPLACED)** | **VAD / hands-free is the PRIMARY mode; F8 push-to-talk is the fallback/alternate.** Hands-free is co-equal P0 with paste and is never the first deferral. | **C1 amendment** |
| L9 | **Bundle ffmpeg + whisper via installer**; hard-BLOCK on missing critical binary, no silent degradation. | Invariants #13/#15; Wargame S3 |
| L10 | **Shift+Insert is a conditional terminal-only variant**, not the primary fix. | STORM R5 (verified: terminals) |
| **L11 (NEW)** | **Global privacy kill-switch** (hotkey + tray toggle) — instant mute, no lag; **closes the mic device** so the OS indicator goes dark. | C1 amendment; STORM AF4/AF5 |
| **L12 (NEW)** | **VAD must not paste (or record) during configured mute state or when the kill-switch is active.** Zero pastes while muted is a hard gate. | C1 amendment |
| **L13 (NEW)** | **Debounce/hangover gating** on VAD: minimum speech duration (~250ms) and trailing silence (~300–700ms) before a cycle fires, to reject clicks/breaths/transients. | STORM AF2/AF4 (Silero) |
| **L14 (NEW)** | **Auto-mute when another app holds the mic / an allowlisted call app is active** (Zoom/Teams/Meet), since Silero cannot distinguish the user's voice from call audio. | STORM AF3/AF4 |
| **L15 (NEW)** | **Auto-paste targets the recoverable chat input only.** Terminals/editor panes/unknown windows get clipboard+toast, never a blind injected keystroke. | STORM AF3/AF4; Wargame S18 |

## 7. Non-goals (explicit deferrals)

- **Mac / Linux support** — Windows 11 only this cycle.
- **Wake-word / branded assistant** — no wake word; VAD is neutral speech-detection, gated by mute + kill-switch. (Hands-free itself is **no longer** a non-goal — it is P0.)
- **Paid / cloud-lock features** — no subscription; Groq stays optional BYO-key.
- **Editor-native / UI Automation injection** — the deterministic 6th-lens path; investigated post-48h.
- **Real-time streaming transcription** — batch on speech-end (VAD) or key-up (PTT).
- **Speaker identification / voice biometrics** — out of scope; call-app auto-mute (L14) is the pragmatic substitute for "is this the user talking."
- **Multi-language correction** — English dev vocabulary first.

## 8. Open questions (resolve in Spec)

1. **VAD audio path:** where is the 16kHz/512-sample reframing done, and does VAD run in the renderer (WebAudio) or main (native), given the mic-conflict history with FFmpeg DirectShow (recording GAP-B)?
2. **Default thresholds:** starting values for positive/negative speech thresholds + min-speech/min-silence, and how the user tunes them from Settings.
3. **Guard precision:** foreground-HWND match vs also window-class detection (to auto-select Shift+Insert for terminals and enforce L15 recoverable-target policy).
4. **Kill-switch semantics:** ✅ **RESOLVED at C1 — the kill-switch CLOSES the mic device; the OS mic indicator must go dark. Discard-only is not acceptable.** (Spec must implement device close, not audio discard.)
5. **Latency + upgrade contract:** anchor point for the capture-end→visible timer (objective G-smoke), and the config version/migration contract preserving API key, hotkey, dictionary, and voice-mode settings across install-over-existing.

## 9. Human Gate C1 (re-presentation)

**STOP.** This amended PRD is at intent altitude. Do not write the Engineering Spec (Session 2) or any implementation code until the maintainer approves:
- hands-free-primary **problem framing and hypothesis** (§1–2),
- the **amended falsification conditions** incl. the degradation rule (§3),
- the **hands-free success metrics** (§4),
- the **locked decisions L1–L15**, especially replaced **L8** and new **L11–L15** (§6),
- and the **reprioritized hands-free thin-slice MVP** (§5).

On approval, proceed to `QUANTUM_LEAP_SPEC.md` (Phase D) and resolve the five open questions there.
