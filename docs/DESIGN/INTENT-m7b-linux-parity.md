# INTENT — M7b: Linux Native Parity

**Milestone:** M7b — "Linux Ships" (slice of M7)  
**Date:** 2026-07-09  
**Author:** Library Architect — Oracle-SpeakFlow  
**Consumer:** Fable 5 (`claude-fable-5-thinking-high`) @ repo root → STORM → WARGAME → PRD (C1) **STOP** → Spec (D1) in **separate session**  
**Status:** ✅ **Gate B7b APPROVED (2026-07-09)** — DOM: production-grade Linux cycle; macOS Wave 7a complete; no wait for Mac human tester.  
**Altitude:** **Intent only** — problem, bet, falsification, outcomes, locked constraints, STORM commission. **No file trees, APIs, library picks, or implementation steps** — those belong in PRD/Spec after STORM+WARGAME.

**Parent:** `INTENT-m7-cross-platform-native-parity.md` (Gate B7). This doc **narrows M7 to Linux only** with post–Wave-7a brownfield truth.

**Provenance (read from disk before PRD):**
- `CLAUDE.md` — invariants #17–#19 (mic owner, no foreground steal, mute hard-block)
- `src/services/paste.ts` — pure decision ladder (Windows class table; no Linux terminals yet)
- `src/utils/win32-window.ts` + `src/utils/darwin-window.ts` — foreground pattern to mirror as `linux-window.ts`
- `src/services/capture.ts` — `dshow` / `avfoundation` branches; **no `pulse`/`alsa` branch**
- `src/electron-main.ts` — paste via Ctrl+V (win) / Cmd+V (darwin); yield-focus on win+darwin only
- `package.json` — `build.win`, `build.mac`; **no `build.linux` target**
- `.github/workflows/ci.yml` — `ubuntu-latest` runs tests only; **no `linux-package.yml`**
- `.github/workflows/mac-package.yml` — template for deliberate `workflow_dispatch` packaging
- Competitors: Handy (~24k★, AppImage/deb, Linux paste docs), OpenWhispr (~4k★, cross-platform)

---

## 0. Process (same pipeline as M6 — non-negotiable)

```
Gate B7b (this doc)     Architect / DOM           → INTENT Linux forensic
     ↓
STORM                   Fable 5 Session 1         → docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md
     ↓
WARGAME                 Fable 5 Session 1         → docs/DESIGN/WARGAME-m7-linux-parity.md (score ≥ 7/10)
     ↓
PRD                     Fable 5 Session 1         → docs/DESIGN/M7_LINUX_PARITY_PRD.md — Gate C1 (DOM) — STOP
     ↓
SPEC                    Fable 5 Session 2         → docs/DESIGN/M7_LINUX_PARITY_SPEC.md — Gate D1 (DOM) — new session only
     ↓
BUILD                   Sonnet-tier @ repo root    → waves 7b–7f per Spec; build starts same day as D1
```

**Handoff discipline:** PRD and Spec are **never** in the same session (M6 parity). Session 1 ends at C1. Session 2 reads approved PRD cold.

**Do not skip STORM or WARGAME.** Linux paste/focus is **harder than macOS** (X11 vs Wayland). A single-shot PRD will invent wrong answers.

**Mac human tester:** parallel, **not a gate** for this INTENT or Linux STORM.

---

## 1. Problem (forensic — evidence-cited to current code)

After M6 + macOS Wave 7a, SpeakFlow is **credible on Windows** and **beta-viable on macOS** (avfoundation, Cmd+V, CI package). **Linux does not exist as a product surface** — only as a CI test runner.

### P1 — No Linux installable artifact
- `package.json` `build` section has `win` and `mac` targets only — **no `linux` / AppImage / deb**.
- `.github/workflows/ci.yml` matrix includes `ubuntu-latest` for **typecheck + unit tests** — **`npm run package` is explicitly skipped** (comment: native binaries gitignored).
- **There is no `linux-package.yml`.** Users cannot download a Linux build; Handy and OpenWhispr both ship AppImage or deb.

### P2 — No Linux-native integration layer
- `src/utils/win32-window.ts` + `src/utils/darwin-window.ts` implement foreground introspection; **`getForegroundInfo()` returns `null` on non-win/non-darwin** (see `win32-window.ts` fallback).
- `electron-main.ts` inject path branches **win32 | darwin | else best-effort null** — Linux gets **no foreground capture, no yield-focus, no platform paste**.
- `capture.ts` uses `dshow` (Windows) and `avfoundation` (darwin); **no PulseAudio/PipeWire (`-f pulse`) path** for Linux mic.
- `paste.ts` `TERMINAL_PROCESSES` lists Windows `.exe` names and a few `.app` names — **no Linux terminal hosts** (`gnome-terminal`, `konsole`, `alacritty` without `.exe`, etc.).

### P3 — Category expectation: Linux devs are core OSS audience
- Cursor/VS Code on Ubuntu, Hyprland/Sway tiling WMs, SSH dev boxes — natural users for MIT dictation.
- **Handy's Linux README** documents Wayland pain (wtype, focus steal, overlay). SpeakFlow must **enter with honest scope**, not broken auto-paste on Wayland.

### P4 — Build/test reality from DOM's Windows machine
- **Author code + CI YAML on Windows:** yes.
- **Produce Linux electron-builder artifacts:** only via **`ubuntu-latest` Actions** (or Linux VM).
- **Honest sign-off for paste/hands-free:** CI artifact + human smoke on real Linux desktop (VM, contributor, or `ubuntu-latest` headless limits for paste — Spec must address).

**Who struggles:** Linux developers who install Handy/OpenWhispr today; SpeakFlow is **invisible on Linux** despite `ubuntu-latest` CI green.

---

## 2. Hypothesis

We believe that if Oracle SpeakFlow implements a **`linux-window` foreground abstraction**, **Pulse/PipeWire capture via FFmpeg**, **Ctrl+V paste with the existing `paste.ts` ladder**, and ships an **AppImage or deb from `linux-package.yml` (workflow_dispatch)**, while preserving invariants **#17–#19** and the **clipboard+toast floor** on Wayland when auto-paste fails, then SpeakFlow becomes a **credible third-platform OSS dictation tool** without rewriting the state machine — matching the macOS Wave 7a pattern (platform branch, shared pipeline).

### Wrong condition (falsification) — stop/pivot, do not claim parity
- **X11 paste reliability < 7/10** on Ubuntu 22.04/24.04 (Cursor chat + terminal) after M7b → do not claim "Linux supported"; document Windows+Mac only.
- **Any paste into wrong window** or **focus-steal equivalent** on Linux → safety floor breached; block release (Invariant #18 spirit).
- **Hands-free or mute kill-switch regresses** on Linux → block release (Invariant #19).
- **Wayland without verified auto-paste backend** → do not list as supported; do not ship clipboard-primary as the product (DOM C1).
- **`linux-package.yml` cannot produce a launchable artifact** on `ubuntu-latest` → viability failure; do not publish Linux download link.

### De-risk focus
- [x] Feasibility — Electron + nut-js + FFmpeg pulse on Ubuntu CI
- [x] Viability — solo maintainer; X11-first, Wayland floor
- [x] Value — table-stakes for OSS category credibility

---

## 3. Success metrics (outcomes)

| # | Metric | Target | How measured |
|---|--------|--------|--------------|
| L-1 | **Linux CI artifact** | `workflow_dispatch` produces AppImage **or** deb that launches | CI + G23-style bundle verify on runner |
| L-2 | **X11 end-to-end dictation** | Hands-free or PTT → corrected text in focused app ≥ **8/10**; **0 wrong-target paste** | Human smoke Ubuntu X11 (VM or contributor) |
| L-3 | **Auto-paste on supported sessions** | Hands-free auto-paste ≥8/10 on every README-listed config; 0 wrong-target; clipboard = guard fallback only | Human smoke + README |
| L-4 | **Capture** | Mic works via FFmpeg pulse (or documented fallback) without manual user binary steps | CI + smoke |
| L-5 | **Invariants preserved** | #17 single mic owner, #18 no foreground steal, #19 mute blocks paste | grep-gate + review |
| L-6 | **Windows + macOS non-regression** | Existing gates green | `ci.yml` + `mac-package.yml` unchanged behavior |
| L-7 | **Honest README** | Linux row matches shipped reality (X11 vs Wayland) | DOM review |

**Hard floor:** L-5 and **0 wrong-target paste** on X11 smoke — same bar as Quantum Leap G10.

---

## 4. Thin-slice MVP (one falsifiable path)

**One sentence:** On a **fresh Ubuntu 24.04 X11** session, user downloads the **CI-built AppImage/deb**, grants mic permission, focuses a **text field in Cursor or GNOME Terminal**, speaks hands-free or via PTT, and **corrected text appears in that field** via Ctrl+V or sanctioned clipboard fallback — **no manual `whisper-cli` step** (cloud Groq path acceptable for M7b thin slice; bundled local Linux binaries may follow Windows pattern in a later wave if Spec scopes it).

**Wayland:** included in supported matrix **only if** Spec proves verified auto-paste backend with human smoke; otherwise unsupported (not clipboard-primary).

**DOM C1 (2026-07-09):** Hands-free **must** auto-paste on supported Linux — same bar as Windows. PTT is backup.

**Explicitly NOT in thin slice (defer to Spec waves or M7c):**
- Bundled local Whisper on Linux (optional follow-on; Windows has bundled; Mac cloud-first)
- Flathub/snap publishing
- GPU / Parakeet
- Full compositor matrix beyond Spec-defined supported sessions

---

## 5. Locked constraints (PRD/Spec must honor)

| # | Constraint | Basis |
|---|------------|-------|
| L-C1 | **Additive branching only** — Windows and macOS paths unchanged in behavior; Linux via `process.platform === "linux"` modules | L-6 |
| L-C2 | **`paste.ts` stays pure** — Linux foreground types feed the existing ladder; no OS calls in `paste.ts` | Quantum Leap pattern |
| L-C3 | **No focus steal** — no `xdotool windowactivate` / `wmctrl -a` on inject path; yield uses `win.hide()` + re-verify only (mirror darwin) | Invariant #18 |
| L-C4 | **Mute hard-block** — `decidePaste` returns `block` when muted | Invariant #19 |
| L-C5 | **Single mic owner** — FFmpeg pipe capture; no renderer `getUserMedia` | Invariant #17 |
| L-C6 | **Linux package CI = `workflow_dispatch` + tags only** — mirror `mac-package.yml` / G24 discipline; **no** expensive runner loops on every push | C-10 pattern |
| L-C7 | **Auto-paste on supported sessions (DOM C1)** — hands-free and PTT must auto-paste on every Linux configuration we claim supported (Windows parity). Clipboard+toast is guard fallback only. Unsupported sessions are not listed in README. Spec proves minimum matrix (X11 required; Wayland only with evidence-backed backend). | DOM C1 |
| L-C8 | **Cloud path minimum for M7b proof** — local Whisper bundling on Linux is **optional wave**, not a blocker for L-1 if README is honest | M6 parity |
| L-C9 | **Repo may stay private** — artifacts distributed via Actions download → Drive link; no source exposure | DOM decision |
| L-C10 | **No silent cloud on local failure** — if local mode added later, same L5 hard-block as Windows | M6 C-7 |

---

## 6. Non-goals (M7b)

- macOS further polish (Wave 7a shipped; human smoke parallel)
- Flathub, snap, winget, Homebrew
- Parakeet / GPU
- Meeting notes / agent platform (OpenWhispr scope)
- Supporting every compositor — Ubuntu X11 + Wayland floor only

---

## 7. STORM commission (Fable 5 — mandatory lenses)

**Topic:** *Native paste, capture, global hotkeys, and Electron packaging for Linux desktop dictation (X11 + Wayland) in 2026 — Handy/OpenWhispr failure modes, nut-js vs xdotool vs wtype, PulseAudio/PipeWire FFmpeg, AppImage vs deb, ubuntu-latest CI economics.*

**Mandatory lenses:**
1. X11 paste — nut-js Ctrl+V, terminal class table, clipboard floor  
2. Wayland — wtype, dotool, focus steal, Handy overlay-disabled pattern  
3. Capture — `-f pulse` default device, PipeWire compatibility on Ubuntu 24.04  
4. Packaging — electron-builder `linux` target; AppImage vs deb for Cursor/Ubuntu users  
5. CI — native addons (`uiohook-napi`, `onnxruntime-node`, `@nut-tree-fork/nut-js` linux prebuilds)  
6. Competitor forensics — Handy Linux README pain points; what SpeakFlow must not repeat  

**Save STORM to:** `docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md`

---

## 8. WARGAME must include

- Wayland session with no `wtype` installed  
- nut-js paste fails on Wayland/hyprland  
- FFmpeg pulse default wrong device  
- `linux-package.yml` accidentally on `push` burning minutes  
- Windows regression from shared `electron-main` edit  
- Agent suggests `xdotool windowactivate` — reject (L-C3)

**Pass bar:** score ≥ **7/10** or PRD blocked.

---

## 9. Recommended build waves (for Spec — Fable 5 may refine)

| Wave | Deliverable |
|------|-------------|
| **7b** | `linux-package.yml` + `build.linux` in electron-builder → AppImage/deb artifact |
| **7c** | `linux-window.ts` + `electron-main` linux inject/yield + Ctrl+V |
| **7d** | `capture.ts` pulse audio input on linux |
| **7e** | Global hotkey / PTT on X11 (uiohook) |
| **7f** | Wayland clipboard floor + README honesty |

---

## 10. Human gates

| Gate | Owner | When |
|------|-------|------|
| **B7b** | DOM | This INTENT approved — **2026-07-09** |
| **C1** | DOM | After WARGAME ≥ 7/10 — approve PRD |
| **D1** | DOM | Approve Spec — **then build same day** |
| **L-2** | DOM / VM / contributor | X11 human smoke on artifact |

---

## 11. Handoff to Fable 5

Gate B7b reached. Next: **Session 1** — `docs/DESIGN/FABLE5-LINUX-PASTE-COMMAND.md` (STORM → WARGAME → PRD → STOP C1). **Session 2** — `FABLE5-LINUX-SPEC-PASTE-COMMAND.md` after C1 approval only.

`_B7b approved by DOM: 2026-07-09 — Linux INTENT production-grade; proceed Fable 5 immediately_`
