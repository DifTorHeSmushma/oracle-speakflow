# Wargame — M7b Linux Parity (Adversarial Pre-Mortem)

**Date:** 2026-07-09
**Inputs:** `storm-reports/speakflow-linux-parity-2026-briefing.md` (6/6 verified; F1–F6), `INTENT-m7b-linux-parity.md` (§8 mandated scenarios; L-C1…L-C10), repo code (`paste.ts`, `darwin-window.ts`, `win32-window.ts`, `capture.ts`, `electron-main.ts`, `package.json`, `ci.yml`, `mac-package.yml`, `scripts/check-*.mjs`), `CLAUDE.md` invariants #17–#19.
**Purpose:** Stress-test every major M7b decision against failure before the PRD. Gate: weighted adversarial score ≥ 7/10.

---

## B1 — Competing approach matrix

### Axis 1 — X11 paste backend (L-2 / L-C2 / L-C3)

Evaluated on **zero-wrong-target floor**, **Invariant #18 compliance**, **new-dependency cost**, **#15 zero-friction**.

| # | Approach | Win condition | Lose condition | Verdict |
|---|---|---|---|---|
| 1 | **nut-js Ctrl+V (XTest) behind the existing `decidePaste` ladder; foreground read via `xprop` spawnSync** | Already a dependency (Linux prebuilds); zero new native deps; identical safety ladder to Windows/darwin; `xprop` is stock `x11-utils` + declared in deb `Depends` | Fork's Linux prebuild fails to load in packaged Electron — caught by Wave 7b/7c CI spike, falls to #3 floor | **PRIMARY** |
| 2 | `xdotool type`/`xdotool key ctrl+v` as the injection engine | Battle-tested (Handy uses it) | External tool on the *inject* path (#15 friction for AppImage users); slower spawn-per-paste; brings `windowactivate` temptation into the codebase (L-C3 hazard); duplicates what nut-js already does in-process | REJECT as engine; `xprop` (read-only introspection) is the only external tool touched |
| 3 | Clipboard+toast only (no keystroke) on X11 too | Never wrong window | Ships "Linux support" that doesn't paste — fails L-2 (≥8/10) and the category's table stakes | **FALLBACK FLOOR** (retained as guard outcome, not the ship) |
| 4 | UIA-equivalent (AT-SPI) direct injection | Focus-independent | Per-toolkit fragility (GTK/Qt/Electron targets all differ); heavy; the same class SpeakFlow rejected on Windows twice | REJECT |

### Axis 2 — Wayland strategy (L-3 / L-C7) — **the mandated wtype scoring**

L-C7: Wayland gets the clipboard floor **unless this Wargame scores the wtype path ≥ 7/10 with evidence.** Scored per criterion:

| Criterion | wtype auto-paste path | Score /10 |
|---|---|---|
| Works on default Ubuntu (GNOME Wayland) | **No** — Mutter lacks `virtual-keyboard-unstable-v1` (STORM R2/R3, verified primary trackers) | 1 |
| Zero-friction (#15) | **No** — user must `sudo apt install wtype`; AppImage users have no dependency channel at all | 2 |
| Paste-safety ladder preconditions (#18 / L-C2) | **No** — no foreground introspection exists on Wayland; `decidePaste` cannot verify any target; a keystroke would fire on zero evidence, which the ladder forbids by design | 1 |
| Wrong-target floor | Unverifiable — injection lands wherever the compositor routes it | 2 |
| Maintenance | Compositor-by-compositor behavior matrix (wlroots yes, Mutter no, KWin partial) — the exact per-config support burden INTENT-m7 §2 flags as viability risk | 3 |

**wtype path composite ≈ 1.8/10 → FAILS the ≥7 bar decisively. L-C7 floor confirmed: Wayland ships clipboard+toast only.** Runner-ups also rejected: `ydotool` (root/uinput daemon — worse friction, same no-verification problem), overlay/focus tricks (Handy's documented focus-steal anti-pattern — Invariant #18 spirit breach). The only future-credible path is the xdg-desktop-portal/libei route (STORM Frontier) — not available to Electron in this cycle.

| # | Approach | Verdict |
|---|---|---|
| 5 | **Clipboard+toast floor; hands-free VAD works (mic needs no compositor privilege); PTT honestly X11-only; keystroke path session-gated off** | **PRIMARY** (matches thin slice, F1/F5) |
| 6 | wtype auto-paste | **REJECT** — scored 1.8/10 above |
| 7 | ydotool/uinput daemon | REJECT — root-class setup, no target verification |
| 8 | Portal/libei injection | Not reachable from Electron 41 — **post-M7b frontier**, preserved |

### Axis 3 — Packaging (L-1 / L-C6)

| # | Approach | Verdict |
|---|---|---|
| 9 | AppImage only ("universal") | **REJECT** — verified FATAL-at-launch on stock Ubuntu 24.04 for sandboxed Electron (AppArmor userns, STORM R4); leading with it torches first-run credibility on the No. 1 target distro |
| 10 | **deb primary + AppImage secondary with documented 24.04 caveat; deb `Depends: ffmpeg, x11-utils`** | **PRIMARY** — root-owned install path keeps the Chromium SUID sandbox working; apt resolves runtime tools with zero manual steps (#15-sanctioned) |
| 11 | snap / Flathub | REJECT this cycle — INTENT §6 non-goal (distribution milestone) |
| 12 | Bundle static ffmpeg in `extraResources` now | Attractive later; adds ~80 MB and a Linux binary-provenance question mid-milestone; deb `Depends` already satisfies L-4's "no manual user binary steps" | DEFER (optional wave; falls under L-C8 optionality) |

### Axis 4 — Linux packaging CI (L-C6)

| # | Approach | Verdict |
|---|---|---|
| 13 | `linux-package.yml` on every push ("Linux minutes are cheap") | **REJECT** — quota is shared with the whole private-repo matrix; agentic fix-loops through packaging jobs are the verified failure mode (M6 W-9 class); provenance of Drive-distributed artifacts gets muddy |
| 14 | **Clone `mac-package.yml` discipline: `workflow_dispatch` + `v*` tags only, cached, gates-before-package, headless launch-verify** | **PRIMARY**; mechanized by extending `check-workflows.mjs` to all `*-package.yml` |

**Decision rule applied:** PRIMARY #1 + #5 + #10 + #14. FALLBACK = clipboard+toast floor with explicit triggers: (paste) any verify mismatch, null foreground, non-X11 session, or nut-js load failure → clipboard+toast, never a keystroke; (packaging) AppImage sandbox failure → deb is the documented answer, never `--no-sandbox` user guidance.

---

## B2 — Red-team scenario table (Trigger → Expected failure → Detection → Mitigation → Owner surface)

INTENT §8 mandated scenarios are marked ★.

| # | Trigger | Expected failure | Detection | Mitigation | Owner surface |
|---|---|---|---|---|---|
| **S-L1** ★ | Wayland session, no `wtype` installed | None — by design | n/a | SpeakFlow never calls wtype; floor is default. The scenario only bites tools that promised Wayland injection (Handy pattern). README states the floor | session gate; README |
| **S-L2** ★ | nut-js paste attempted on Wayland/Hyprland (session mis-detected, or XWayland partial) | Keystroke vanishes or lands in an unverifiable surface | Session detection (`XDG_SESSION_TYPE`/`WAYLAND_DISPLAY`) checked **before** the keystroke branch; on Wayland `getForegroundInfo()` returns null → `decidePaste` → clipboardToast anyway (belt + suspenders) | Keystroke path requires `session === "x11"` **and** a verified foreground; two independent gates must both fail open for a stray keystroke — structurally unreachable | `linux-session.ts` + inject wiring |
| **S-L3** ★ | FFmpeg `-f pulse -i default` grabs the wrong device (monitor source, secondary mic) | Silence or desk audio; VAD never triggers; user concludes "broken" | `SPEAKFLOW_VAD_DEBUG` RMS telemetry (existing); smoke script includes `pactl list sources short` check | `SPEAKFLOW_PULSE_AUDIO` env override (mirrors `SPEAKFLOW_AVF_AUDIO`); troubleshooting section in Linux user guide; wrong-device is config, not code | `pulse-audio.ts` + docs |
| **S-L4** ★ | `linux-package.yml` lands with `on: push` (agent convenience edit) burning quota | Metered minutes drained; L-C6 breached | **`check-workflows.mjs` extended rule: every `*-package.yml` must be dispatch/tags-only** — runs on every CI pass (release-blocking, G24 class) | Gate fails the build the moment the trigger widens; PR-review rule mirrors the macOS one | CI gate |
| **S-L5** ★ | Shared `electron-main.ts` edit for Linux regresses Windows/macOS inject or yield | The two proven platforms break for existing users | Full existing gate matrix (typecheck, unit, UI, Playwright, G14/G19/G24) green on every PR — free runners; win32/darwin branches not refactored | **Additive branching only (L-C1):** Linux logic enters via new `platform === "linux"` arms and new modules; existing branches byte-stable except shared-guard extension points covered by existing tests | CI policy + review |
| **S-L6** ★ | Agent "helps" flaky X11 focus with `xdotool windowactivate` / `wmctrl -a` / `XSetInputFocus` | Invariant #18 breached — Linux equivalent of `SetForegroundWindow` | **`check-focus-grep.mjs` extended:** forbidden patterns `windowactivate`, `wmctrl -a`, `XSetInputFocus(` across the paste-path files incl. `linux-window.ts` | Gate blocks merge; yield remains `win.hide()` + re-verify only (mirror darwin, L-C3) | grep-gate + inject path |
| S-L7 | AppImage FATAL on stock Ubuntu 24.04 (AppArmor userns — verified) | First-run crash; 1★ issue | Known from STORM R4 — not a surprise, a documented property | deb is the primary artifact and the README's first instruction; AppImage row carries the caveat + AppArmor-profile pointer; `--no-sandbox` never appears in user docs (CI-only) | packaging + README |
| S-L8 | `xprop` absent or non-EWMH WM (minimal/exotic setups) | Foreground read fails | `spawnSync` error/timeout path (identical shape to darwin's osascript failure handling) → `getForegroundInfo()` returns null | Ladder answers clipboardToast — degraded but safe; deb `Depends: x11-utils` makes absence an AppImage-only edge; documented | `linux-window.ts` |
| S-L9 | Electron flips to native-Wayland Ozone in a future version; XTest keystrokes stop reaching targets | Paste silently dies on "X11" sessions that are actually Wayland-hosted | Session detection reads the *session*, not Electron's backend; smoke protocol re-run per Electron major (existing discipline) | If observed: document `--ozone-platform=x11` launch flag; keystroke still gated on verified foreground, so failure mode is clipboardToast, not wrong-target | smoke protocol + docs |
| S-L10 | `uIOhook.start()` throws or hooks nothing in a Wayland session | Tray app crashes at startup — total product death on default Ubuntu | Guarded start: try/catch + session check; hook failure logs and continues (hands-free unaffected — F5) | PTT honestly X11-only in UI/README; VAD mode is the Wayland path; a hotkey failure must never take down capture/tray | `electron-main.ts` startup |
| S-L11 | `@nut-tree-fork/libnut-linux` prebuild missing/incompatible in packaged app (STORM Assumption 1) | Paste keystroke throws on every X11 attempt | **Wave 7b/7c embedded spike:** packaged-artifact launch-verify + first X11 smoke exercise the import + keystroke early | Keystroke failure already caught per-attempt (existing try/catch) → clipboardToast; if systemic → STOP, escalate; floor still ships, README claims scoped down (falsification clause) | packaging + spike |
| S-L12 | Own-window detection wrong on X11 (WM_CLASS/PID mismatch under sandboxing) | SpeakFlow pastes into itself (M-3 class regression) | Own-window check = PID match against `process.pid` **plus** WM_CLASS fallback; mis-detection direction is safe (false-positive own-window → clipboardToast) | Same retained final own-window gate as Windows (Wargame-M6 S8); X11 smoke includes the focused-own-window case | `linux-window.ts` + `decidePaste` |
| S-L13 | Terminal variant: Shift+Insert pastes PRIMARY (not CLIPBOARD) in xterm-class terminals | Stale/unexpected text pasted | Known X11 selection semantics | `terminalVariantEnabled` stays **opt-in, off by default** (existing); Linux terminal table classifies conservatively; docs note the xterm nuance | `paste.ts` table + docs |
| S-L14 | Headless runner launch-verify false-passes (app "runs" under xvfb but is broken on real desktops) | L-1 declared green while artifact is dead | Launch-verify is scoped honestly: proves *launch + main-process alive + renderer loads* (more than Mac's bundle inspection ever proved); UX claims gated on the **human** X11 smoke (L-2), never on CI | Two-tier claim discipline: CI gate = "launches"; human gate = "works" | CI + gate matrix |
| S-L15 | Tray icon invisible on vanilla GNOME (no AppIndicator support) | User can't reach settings/mute UI | Ubuntu ships the AppIndicator extension by default (target distro OK); vanilla GNOME documented | README notes the extension for non-Ubuntu GNOME; kill-switch also reachable via hotkey-less UI paths; not release-blocking for Ubuntu-scoped L-2 | docs |
| S-L16 | User selects **Local** transcription mode on Linux (no Linux whisper binaries shipped in M7b) | Silent cloud fallback would breach L-C10/#13 | Existing hard-block machinery: `resolveTierModel`/binary probe fails → `localModelNotFound` surfaces, **never** falls through to Groq (M6 L5 unchanged, platform-agnostic) | UI shows local-unavailable-on-Linux honestly; README claim table row; optional local-Linux wave (L-C8) may close it later | transcription surface + README |

---

## B3 — Timeline war-game (wave-shaped, mirrors M6 discipline)

| Slice | Deliverable | Human checkpoint | Kill criteria (cut if behind) |
|---|---|---|---|
| **Research** | STORM (done) + this Wargame + PRD → **Gate C1** | C1: PRD approval | — (research is load-bearing) |
| **Wave 7b — package factory** | `build.linux` (deb+AppImage) + `linux-package.yml` (dispatch/tags, cached) + `check-workflows` extension + runner launch-verify + hygiene | Artifact downloads + launches (CI-proven); DOM eyeballs artifact list | If deb+AppImage both fail to build → STOP (viability falsification — no Linux claim at all). If only AppImage fails → ship deb-only, honest row |
| **Wave 7c — window/paste (X11)** | `linux-session.ts` + `linux-window.ts` (pure parsers unit-tested) + inject/yield wiring + `paste.ts` Linux terminal table + grep-gate extension | Auto gates only (pure logic); STOP-report | Cut nothing — this is the product. If nut-js load fails systemically (S-L11) → STOP, escalate; clipboard floor + honest README is the sanctioned downgrade |
| **Wave 7d — capture (pulse)** | `pulse-audio.ts` + `capture.ts` linux branch + runner null-source smoke | Auto + capture smoke evidence | If runner audio smoke is infeasible → degrade gate to device-enumeration assert; human smoke carries the proof |
| **Wave 7e — hotkey/PTT (X11)** | Guarded `uIOhook.start()` + session gating + PTT verified in packaged build | **L-2 human X11 smoke** (VM or contributor): ≥8/10, 0 wrong-target | If PTT flaky but hands-free passes → ship hands-free-first honestly (it's the product's primary mode anyway); PTT row scoped down |
| **Wave 7f — Wayland floor + honesty** | Session-gated floor verified on GNOME Wayland; toast copy; README/user-guide Linux rows regenerated from gate results | **L-3 Wayland floor smoke** + DOM README review (L-7) | Never cut the honesty pass. If floor itself fails (clipboard write breaks on Wayland) → block Linux release entirely (falsification clause) |

**Deferral ranking (first to cut):** AppImage target (deb-only ship) → PTT-on-X11 claim (hands-free-first) → runner audio smoke (human smoke carries it).
**NEVER cut:** invariants #17–#19 gates, 0-wrong-target floor, session gating of the keystroke path, `*-package.yml` dispatch/tags discipline, README honesty row, Windows+macOS regression matrix.

---

## B0.2 — Best-in-class parity bar (Linux, honest)

| Axis | Handy | OpenWhispr | **SpeakFlow after M7b** | Stance |
|---|---|---|---|---|
| Linux installable artifact | ✅ AppImage | ✅ (Electron, AppImage/deb cited) | ✅ **deb primary + AppImage** | **MATCH**, with the only 24.04-sandbox-aware default in the category |
| X11 auto-paste | ✅ (xdotool, external tool) | ✅ (standard) | ✅ **in-process nut-js behind the verified-target ladder** | **BEAT** (no external inject tool; explicit safety policy) |
| Wayland auto-paste | ⚠️ wtype/dotool user-installed; focus-steal documented | ⚠️ | ❌ **deliberately not — clipboard+toast floor, stated** | **DELIBERATELY PARTIAL** — honesty is the differentiator; nobody has a sanctioned Wayland paste |
| Wayland no-hotkey operation | ❌ (DE-shortcut homework) | ❌ (hotkey-first) | ✅ **hands-free VAD needs no compositor privilege** | **BEAT** (F5) |
| Paste safety (wrong-target floor) | ⚠️ | ⚠️ | ✅ same ladder as Windows, session-gated | **BEAT** |
| Mic kill-switch closes device | ❌ | ❌ | ✅ (platform-agnostic, preserved) | **BEAT** |
| Local transcription on Linux | ✅ | ✅ | ❌ cloud-first M7b, honest row (optional wave) | **DELIBERATELY PARTIAL** (L-C8) |

---

## B4 — Adversarial score (independent evaluator persona)

Scoring the chosen strategy (deb-first packaging + xprop/nut-js X11 ladder + session-gated keystrokes + clipboard Wayland floor + dispatch-only CI):

| Criterion | Score /10 | Rationale |
|---|---|---|
| Safety-floor evidence (0 wrong-target; #18/#19) | 9 | Keystroke requires X11 session **and** verified foreground **and** the retained own-window gate — three independent gates; Wayland cannot reach a keystroke by construction; grep-gate mechanizes L-C3; mute hard-block is platform-agnostic and untouched |
| Feasibility within milestone | 8 | Every mechanism is either already shipped cross-platform (uiohook, nut-js, FFmpeg branch, decide-ladders) or a stock-tool spawnSync mirroring a proven darwin module; the one real unknown (nut-js Linux prebuild in packaged Electron) is spiked in the first two waves with a named floor fallback |
| Invariant compliance (#17–#19, L-C1…L-C10) | 9 | #17 by construction (FFmpeg sole owner, VAD platform-agnostic); #18 mechanized (grep-gate + hide-only yield); #19 untouched pure logic; L-C6 mechanized (check-workflows extension); L-C7 settled by evidence (wtype 1.8/10); L-C10 inherited from M6 L5 machinery |
| Testability | 7 | Parsers/session/ladder/terminal-table are pure and unit-tested on any OS; runner launch-verify beats the Mac equivalent; but L-2/L-3 remain human smokes on real desktops that DOM does not own — the milestone's honest bottleneck (VM or contributor required) |
| Economics / maintainability | 8 | Cheapest runner, cached, dispatch-only, mechanized; one new OS module + one audio resolver + one workflow; Wayland floor avoids the compositor-matrix support burden that INTENT-m7 §2 flags as the viability killer |
| Honest-claim readiness (L-7) | 9 | Every README row maps to a gate; falsification pre-commits the downgrades (deb-only, hands-free-first, floor-only, or no-Linux-claim); the Wayland row states the floor instead of Handy-style tool homework |

**Weighted average ≈ 8.3 / 10 → PASSES the ≥7/10 gate. Proceed to PRD.**

**Weakest link:** testability (7) — L-2/L-3 need a real Linux desktop session (Ubuntu VM or community smoke tester), which DOM's Windows box cannot provide. Mitigation: everything decision-shaped is pure and CI-tested; the human smokes verify only OS keystroke/audio behavior, and the artifact reaches testers via the Actions→Drive path already proven for macOS (L-C9). Second-weakest: nut-js fork prebuild (S-L11) — spiked earliest, floor-preserving fallback named.
