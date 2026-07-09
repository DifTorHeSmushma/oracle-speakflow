# M7b Linux Parity PRD — Oracle SpeakFlow (Intent Altitude)

**Date:** 2026-07-09
**Author:** Fable 5 (STORM + WARGAME + PRD lane, per INTENT-m7b §0 routing)
**Status:** ✅ **Gate C1 APPROVED (2026-07-09)** — DOM amendment: **hands-free MUST auto-paste** (Windows parity); clipboard+toast is safety fallback only, never the primary product path. Spec is Session 2 only.
**Provenance:** `INTENT-m7b-linux-parity.md` (Gate B7b approved 2026-07-09), `storm-reports/speakflow-linux-parity-2026-briefing.md` (6/6 load-bearing citations verified), `WARGAME-m7-linux-parity.md` (adversarial score **8.3/10** — gate passed; wtype path scored **1.8/10**, settling L-C7).
**Altitude:** Intent only — *what and why*, pillars, falsification, degradation rules, metrics, locked decisions, deferral order. No file trees, no APIs, no YAML. Those live in the Spec (Gate D1, Session 2).

---

## 1. Problem

After M6 and macOS Wave 7a, SpeakFlow is credible on Windows and beta-viable on macOS — and **does not exist as a product on Linux**. There is no `build.linux` target and no Linux packaging workflow, so no user can download anything (P1); there is no Linux foreground introspection, no Linux inject/yield branch, and no PulseAudio/PipeWire capture path, so even a hand-built binary could not dictate (P2); Linux developers are a core OSS dictation audience that Handy and OpenWhispr already serve with installable artifacts (P3); and DOM's Windows machine can author every line of this but can neither build nor honestly sign off Linux behavior — GitHub's `ubuntu-latest` is the build factory and a real Linux desktop session is the human gate (P4). All four problems are evidence-cited to current code in INTENT-m7b §1; none is an opinion.

## 2. Hypothesis

If SpeakFlow **(a)** ships a deb-first (AppImage-secondary) Linux artifact from a deliberately-triggered CI workflow, **(b)** adds a Linux foreground abstraction and Ctrl+V inject behind the *existing* pure paste ladder — keystroke reachable only in a verified X11 session, **(c)** adds a one-branch PulseAudio/PipeWire capture path under the same single-mic-owner pipeline, and **(d)** ships Wayland as an honest clipboard+toast floor where hands-free VAD still works without any compositor privilege, then SpeakFlow becomes a credible third-platform OSS dictation tool — matching the Wave 7a pattern (platform branch, shared pipeline, invariants intact) without rewriting the state machine, and *beating* the category on the one axis nobody else holds: paste safety and honest platform claims.

**Observable outcome:** the thin slice of §5, demonstrated on a fresh Ubuntu 24.04 X11 session from a CI-downloaded artifact, plus a working Wayland floor, plus a README whose Linux row is generated from gate results.

## 3. Pillars

| # | Pillar | One-line bet | STORM basis |
|---|--------|-------------|-------------|
| P-L1 | **Package factory** | deb primary + AppImage secondary from a dispatch/tags-only `ubuntu-latest` workflow; deb's root-owned install path is the only default-Ubuntu-24.04-safe home for sandboxed Electron | F3, F6 |
| P-L2 | **X11 window/paste** | Read-only foreground introspection via stock X11 tooling (darwin-window pattern) + in-process nut-js Ctrl+V behind the unchanged `decidePaste` ladder; zero new native deps | F2 |
| P-L3 | **Capture** | One `-f pulse` branch covers Ubuntu 22.04 (PulseAudio) and 24.04 (PipeWire) identically; FFmpeg + X11 utils acquired via deb dependencies — zero manual user steps | F4 |
| P-L4 | **Hotkey asymmetry, honestly** | PTT via existing uiohook on X11 only (guarded start — a hook failure never kills the tray); hands-free VAD is the Wayland-proof primary mode | F5 |
| P-L5 | **Auto-paste parity + honesty** | Hands-free and PTT **must** auto-paste on every Linux configuration we claim supported (DOM C1 amendment); clipboard+toast only when safety guards fail (same as Windows); README Linux row regenerated from gates | F1; DOM C1 |

## 4. Wrong condition (falsification — pre-committed downgrade paths)

The bet is **wrong** — and we take the named downgrade instead of iterating — if:

- **P-L1:** `linux-package.yml` cannot produce a launchable artifact on `ubuntu-latest` → viability failure; **no Linux download link is published, no Linux claim is made** (INTENT §2). If only AppImage fails its launch check, ship **deb-only** with an honest row.
- **P-L2:** X11 paste reliability **< 8/10** on Ubuntu 22.04/24.04 (Cursor chat + terminal) after the milestone → do not claim "Linux supported"; document Windows+macOS, keep the Linux artifact as "experimental — clipboard mode." **Any wrong-target paste or any focus-steal-equivalent → hard-floor breach; block the Linux release outright** (Invariant #18 spirit; same bar as M6 M-3/M-4).
- **P-L2 (dependency):** the nut-js fork's Linux runtime fails systemically in the packaged app (WARGAME S-L11) → STOP, escalate to DOM; the sanctioned downgrade is clipboard+toast on X11 too, with the README claim scoped down — never a swap to an external injection tool mid-milestone.
- **P-L3:** hands-free or the mute kill-switch regresses **on any platform** → block release (Invariant #19; L-5 hard floor).
- **P-L5:** Hands-free on a **supported** Linux configuration does not auto-paste into the focused field ≥8/10 → milestone fails (DOM C1: same bar as Windows). Clipboard+toast as the *designed* primary outcome on a claimed-supported session is a scope breach.
- **Windows/macOS:** any existing gate goes red from Linux work → merge blocked; Linux work is additive-only by construction (L-C1).

### Degradation rules (locked)

1. Paste may degrade to clipboard+toast **only** when safety guards fire (own-window focused, foreground unverified, alt-tab mid-utterance) — same semantics as Windows — never as the designed hands-free happy path on a supported session.
2. Keystroke path requires verified foreground + session/backend where injection is technically viable; unverified targets never receive a keystroke (structurally unreachable).
3. Local transcription mode on Linux (no Linux inference binaries this cycle) hard-blocks exactly like Windows — **never silent cloud** (L-C10, inherits M6 L5 machinery unchanged).
4. Packaging may degrade AppImage→deb-only; it may never degrade to instructing users to disable the sandbox (`--no-sandbox` is CI-verification-only, forbidden in user-facing docs).
5. PTT may degrade to hands-free-only (the product's primary mode) with an honest README row; hands-free may not degrade at all.

## 5. Thin-slice MVP (one falsifiable path — INTENT §4, unchanged)

On a **fresh Ubuntu 24.04 X11** session, the user downloads the **CI-built deb** (Actions → Drive link, repo stays private — L-C9), installs it (apt resolves FFmpeg and X11 tooling automatically — zero manual binary steps), grants mic permission, focuses a **text field in Cursor or GNOME Terminal**, speaks hands-free or via PTT, and **corrected text appears in that field** via Ctrl+V or the sanctioned clipboard fallback — cloud Groq path acceptable for this proof (L-C8).

**Supported-session bar (DOM C1):** On every Linux configuration listed in the README as supported, hands-free → **corrected text auto-pastes into the focused field** (≥8/10, 0 wrong-target). PTT (F8) is backup. Spec defines the minimum supported matrix (at minimum Ubuntu 24.04 X11; may include Wayland only if Spec proves a verified auto-paste backend — e.g. XWayland/`--ozone-platform=x11`, portal/libei spike — with human smoke evidence).

**Explicitly NOT in the thin slice:** bundled local Whisper on Linux (optional follow-on wave under L-C8); Flathub/snap; GPU/Parakeet; any compositor beyond Ubuntu X11 + GNOME Wayland floor.

## 6. Success metrics (outcomes, verbatim floors from INTENT §3)

| # | Metric | Target | How measured |
|---|--------|--------|--------------|
| L-1 | **Linux CI artifact** | `workflow_dispatch` produces deb (and AppImage best-effort) that **launches** | CI + runner-side launch/bundle verify (G23-class, but headless-executable on Linux) |
| L-2 | **X11 end-to-end dictation** | Hands-free or PTT → corrected text in focused app **≥ 8/10**; **0 wrong-target paste** (hard) | Human smoke, Ubuntu 22.04/24.04 X11 (VM or contributor), fixed protocol |
| L-3 | **Auto-paste on supported sessions** | Hands-free auto-paste ≥8/10 on every README-listed supported config (X11 minimum; Wayland only if Spec proves backend); **0 wrong-target**; clipboard+toast = guard fallback only | Human smoke per supported matrix + README row |
| L-4 | **Capture** | Mic works via FFmpeg pulse with zero manual user binary steps (deb dependency acquisition) | CI capture smoke + human smoke |
| L-5 | **Invariants preserved** | #17 single mic owner, #18 no foreground steal, #19 mute blocks everything | grep-gates (extended to Linux surfaces) + review |
| L-6 | **Windows + macOS non-regression** | Existing gate matrix green; `mac-package.yml` behavior unchanged | every PR, free runners |
| L-7 | **Honest README** | Linux row lists only sessions with verified auto-paste; hands-free + PTT both auto-paste on supported configs; local-mode not-yet | DOM review at release |

**Hard floors:** L-5, and **0 wrong-target paste** within L-2 — a breach blocks the milestone regardless of other progress (same bar as Quantum Leap G10 / M6 M-3/M-4).

## 7. Locked decisions (from STORM + WARGAME — the Spec must honor)

Each decision cites the INTENT locked constraint (L-C1…L-C10) it discharges.

| # | Decision | Basis |
|---|---|---|
| LD1 | **Additive branching only.** Linux enters via new `process.platform === "linux"` arms and new Linux-only modules; Windows and macOS code paths are byte-stable in behavior; the full existing gate matrix is a merge precondition. | L-C1; WARGAME S-L5 |
| LD2 | **`paste.ts` stays pure.** Linux contributes only data (a Linux terminal class/process table) and consumes the existing `ForegroundInfo` shape via a pseudo-hwnd (`linux:` namespace, mirroring `darwin:`); no OS calls, no native imports, no new decision variants. | L-C2; STORM F2 |
| LD3 | **No focus steal, mechanized.** No `xdotool windowactivate`, `wmctrl -a`, or `XSetInputFocus` anywhere in the inject path; yield = `win.hide()` + re-verify only (mirror darwin). The existing focus grep-gate is **extended** with these Linux patterns and the new Linux window module in its checked set. | L-C3; WARGAME S-L6 |
| LD4 | **Keystroke path is session-gated to X11** — detected from the session environment, checked *before* any keystroke branch — **and** still requires a verified foreground target plus the retained own-window final gate. Wayland/headless/unknown sessions cannot reach a keystroke by construction (two independent locks). | L-C3/L-C7; WARGAME S-L2 |
| LD5 | **Mute hard-block and single-mic-owner are untouched surfaces.** `decidePaste` muted→block and the FFmpeg-owns-the-mic pipeline are platform-agnostic already; Linux adds an input-format branch, nothing else. Kill-switch closes the device on Linux exactly as on Windows. | L-C4/L-C5 |
| LD6 | **X11 foreground introspection = read-only spawnSync of stock X11 tooling** (EWMH active-window + class + PID → process name), wrapped in the darwin-window module pattern with pure, unit-testable parsers. No xdotool dependency; the required tooling is declared as a deb dependency. Failure of the read degrades to null-foreground → clipboard+toast (safe direction). | L-C2/L-C3; STORM F2; WARGAME S-L8 |
| LD7 | **In-process nut-js Ctrl+V is the X11 injection engine** (already a dependency; Linux prebuilds; no external inject tool). Its packaged-runtime viability is **cited-unverified → the first Linux package run + first X11 smoke are the embedded spike**; systemic failure → STOP + clipboard-floor downgrade (never a mid-milestone engine swap). | STORM Assumption 1; WARGAME S-L11 |
| LD8 | **deb is the primary artifact; AppImage is secondary with a documented Ubuntu 24.04 sandbox caveat.** Rationale is verified (AppArmor userns restriction breaks sandboxed Electron AppImages on stock 24.04). `--no-sandbox` never appears in user-facing guidance. | STORM F3; WARGAME S-L7 |
| LD9 | **Zero-friction dependency acquisition via deb `Depends`** (FFmpeg + X11 utils resolved by apt at install — the Linux equivalent of `extraResources` bundling; no winget/brew-class manual step). AppImage documents the gap honestly; bundling a static FFmpeg is deferred, not required. | L-C8 spirit / Invariant #15; STORM F4 |
| LD10 | **Capture = one `-f pulse -i default` branch** with an env override mirroring the avfoundation pattern; verified to cover PulseAudio (22.04) and PipeWire (24.04) through the same API. Wrong-default-device is handled as configuration (override + documented `pactl` triage), not code. | L-C5; STORM F4; WARGAME S-L3 |
| LD11 | **PTT is X11-only and guarded; hands-free is the Wayland story.** The global-hook start is wrapped so failure logs and continues — a hook failure must never take down tray/capture. UI/README state the asymmetry plainly. | STORM F5; WARGAME S-L10 |
| LD12 | **Auto-paste is mandatory on supported Linux (DOM C1).** wtype-on-native-Wayland failed WARGAME (1.8/10) — not the ship path. Spec must deliver verified auto-paste on the **minimum supported matrix** (Ubuntu 24.04 X11 required); may add Wayland only with evidence-backed backend (XWayland/ozone=x11, portal/libei spike, etc.). ydotool/uinput and overlay focus-steal rejected. Configurations without verified auto-paste are **unsupported**, not clipboard-primary. | DOM C1; L-C7 revised; WARGAME Axis 2 |
| LD13 | **Linux package CI = `workflow_dispatch` + `v*` tags only, cached, gates-before-package** — cloned from the proven Mac workflow discipline — and the workflow-trigger grep-gate is **generalized to every packaging workflow** so the rule is mechanical, not tribal. Artifact reaches testers via Actions download → Drive link; repo may stay private. | L-C6/L-C9; STORM F6; WARGAME S-L4 |
| LD14 | **Runner-side launch verification is claim-scoped:** CI proves *launches*; only the human X11 smoke proves *works*. No UX claim ships on a headless green. | WARGAME S-L14 |
| LD15 | **Local mode on Linux hard-blocks honestly this cycle** (no Linux inference binaries shipped): the existing no-silent-cloud machinery surfaces the block; the UI/README say "local coming later" rather than pretending. Bundled local Linux is an optional follow-on wave under the same SHA-manifest law if scoped by the Spec. | L-C8/L-C10; WARGAME S-L16 |
| LD16 | **README honesty pass ships inside the milestone:** the Linux claim table is generated from gate results and reviewed by DOM; falsification downgrades (deb-only, hands-free-first, floor-only, no-claim) are pre-authorized wording, not emergencies. | L-7; M6 L15 pattern |

## 8. Gate matrix overview (Spec will number and mechanize)

| Gate class | Covers | Type | Floor? |
|---|---|---|---|
| Package-CI discipline | LD13 — dispatch/tags-only for all packaging workflows | auto (grep-gate, every CI run) | release-blocking |
| Artifact launch | L-1 — deb/AppImage build + headless runner launch-verify + hygiene (no `.env`, no runner paths) | auto (deliberate dispatch) | release-blocking |
| Pure-logic | Linux parsers, session detection, terminal table, ladder behavior with `linux:` pseudo-hwnds | auto (unit, every PR, any OS) | blocking |
| Focus discipline | LD3 — extended forbidden-API grep across the Linux inject surface | auto (every CI run) | **hard floor** |
| Non-regression | L-6 — full existing Windows+macOS matrix | auto (every PR) | blocking |
| Capture | L-4 — pulse branch + runner audio smoke (or enumeration assert) | auto + human | blocking |
| X11 dictation | L-2 — ≥8/10, **0 wrong-target** (fixed 10-utterance protocol, Cursor + GNOME Terminal, incl. focused-own-window case) | **human** | **hard floor** |
| Auto-paste smoke | L-3 — hands-free auto-paste on every README-supported session | **human** | **hard floor** |
| Honest README | L-7 — Linux rows regenerated from gate results | DOM review | never cut |

**Metric → gate coverage (no orphan metrics):** L-1→artifact gate · L-2→X11 smoke · L-3→auto-paste smoke (supported matrix) · L-4→capture gates · L-5→focus/mute gates + review · L-6→non-regression matrix · L-7→DOM review.

## 9. Non-goals (explicit, per INTENT §6)

- Claiming Wayland (or any session) supported without verified hands-free auto-paste (DOM C1).
- wtype-on-native-GNOME-Wayland, ydotool/uinput daemons, overlay focus-steal (rejected with evidence).
- Bundled local Whisper on Linux as a blocker (optional wave only — L-C8; cloud Groq proves the slice).
- Flathub, snap, winget, Homebrew (distribution milestone).
- GPU / Parakeet.
- Compositor matrix beyond Ubuntu X11 + GNOME Wayland floor (no Hyprland/Sway/KDE commitments this cycle).
- macOS re-scoping of any kind (Wave 7a shipped; Mac human smoke runs in parallel, not as a gate here).

## 10. Deferral order (first-cut-first, if behind)

1. AppImage target (ship deb-only, honest row).
2. PTT-on-X11 claim (ship hands-free-first — the product's primary mode — PTT row scoped down).
3. Runner audio capture smoke (human smoke carries L-4 proof).
4. Linux terminal-table breadth (ship the top terminals; classifier's unknown→clipboard default keeps the long tail safe).

**NEVER cut:** invariants #17–#19 and their gates, the 0-wrong-target floor, session gating of the keystroke path, packaging-CI dispatch/tags discipline, Windows+macOS non-regression, the README honesty pass.

## 11. Open questions (resolve in Spec — Gate D1, Session 2)

1. Exact foreground-read tool invocation and parser contracts (active-window id → class/PID → process name), timeout values, and the pseudo-hwnd format — plus own-window detection method (PID match vs class match precedence) and its false-positive-safe direction.
2. Session-detection contract (env precedence: `XDG_SESSION_TYPE` vs `WAYLAND_DISPLAY` vs `DISPLAY`) and where the gate sits relative to the yield ladder.
3. `linux-package.yml` shape: cache keys, gates-before-package order, deb metadata (category/maintainer/depends list), AppImage config, headless launch-verify method (`xvfb`/TEST_MODE) and its pass assertions, artifact hygiene checks.
4. The workflow grep-gate generalization (all `*-package.yml` dispatch/tags-only) without breaking the existing macOS rule.
5. Focus grep-gate extension: exact forbidden patterns and the checked-file set including the new Linux module.
6. Linux terminal table entries (WM_CLASS + process names) and the Shift+Insert/PRIMARY-selection nuance handling for the opt-in terminal variant.
7. Capture branch wiring: env override name, default source, `pactl` triage copy, and the runner audio smoke design (null-source feasibility).
8. uiohook guarded-start contract on Linux (try/catch + session check + user-visible messaging when PTT is unavailable).
9. Wave sequencing 7b–7f with STOP gates, per-wave deliverables, and L-2/L-3 human smoke scripts (**auto-paste required** on every supported session).
10. README claim-table rows and Linux user-guide (install, mic, supported sessions, auto-paste verification, PTT backup, troubleshooting).
11. **Supported-session matrix** — minimum Ubuntu 24.04 X11; optional Wayland only with evidence-backed auto-paste backend; launch flags (`--ozone-platform=x11`) if required.

## 12. Human Gate C1 — STOP

**STOP.** This PRD is at intent altitude. Do not write the Engineering Spec (Session 2) or any implementation code until DOM approves:

- the problem framing and hypothesis (§1–§2) and the five pillars (§3),
- the falsification conditions incl. the **0-wrong-target hard floor** and the five degradation rules (§4),
- the thin-slice MVP (§5) and metrics L-1–L-7 with their floors (§6),
- **locked decisions LD1–LD16** — especially LD4 (session-gated keystroke), LD7 (nut-js embedded spike with clipboard-floor fallback), LD8 (deb-first), LD12 (Wayland floor, wtype rejected at 1.8/10), LD13 (packaging-CI discipline, mechanized),
- the gate-matrix overview (§8), non-goals (§9), deferral order (§10), and the Spec-bound open questions (§11).

`_PRD approved by DOM (Gate C1): YES — 2026-07-09`
`_Amendments: DOM C1 — hands-free MUST auto-paste on supported Linux (Windows parity). Clipboard+toast is guard fallback only, not primary product path. LD12/L-3/P-L5 revised accordingly. Spec must define supported-session matrix with evidence.`

**Gate C1 — APPROVED.** Engineering Spec (`M7_LINUX_PARITY_SPEC.md`, Gate D1) is authored in **Session 2** via `FABLE5-LINUX-SPEC-PASTE-COMMAND.md`, resolving §11 verbatim.
