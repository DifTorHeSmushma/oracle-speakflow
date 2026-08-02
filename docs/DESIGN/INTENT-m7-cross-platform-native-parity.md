# INTENT — M7: Cross-Platform Native Parity (macOS + Linux)

**Milestone:** M7 — "Three Platforms"
**Date:** 2026-07-08
**Author:** Oracle SpeakFlow (Intent altitude)
**Consumer:** Frontier PRD/Spec author = **Fable 5** (`claude-fable-5-thinking-high`) @ Oracle-SpeakFlow repo root
**Status:** ✅ **Gate B7 APPROVED (2026-07-09)** — DOM: macOS parity first (CI + tester artifact), then Fable 5 STORM for Linux. Repo may stay private during build.
**Altitude:** Intent only — problem, bet, falsification, outcomes, constraints. No file trees, APIs, or implementation steps.
**Prerequisite:** **M6 complete** (`docs/DESIGN/INTENT-m6-public-launch-parity.md` → PRD → Spec → build → public repo with honest README). M7 assumes bundled local inference, model tiers, paste-focus fix, and **macOS CI that builds + launches** already exist.

---

## 0. Relationship to M6 (do not merge)

| Milestone | Delivers | Does NOT deliver |
|-----------|----------|------------------|
| **M6** | Public-launch credibility: bundled local + tiers + paste fix on **Windows**; macOS **CI artifact that launches**; repo goes public | Full macOS paste/hotkey/mic UX; **any Linux** |
| **M7** | **Feature parity** on macOS and Linux: capture, hotkeys, paste, hands-free, installer — same product promise on all three OSes | Meeting notes, AI agent platform, streaming STT (OpenWhispr territory) |

M7 is **larger than M6** in surface area because almost every integration layer is platform-specific today. Treat it as its own STORM → WARGAME → PRD → Spec cycle — not a bolt-on to M6.

---

## 1. Problem (forensic — post-M6 assumed state)

After M6, Oracle SpeakFlow is **honest and credible on Windows** and can **prove the codebase compiles on macOS**, but it is still **not a cross-platform product** in the sense users expect when comparing to Handy (~24k★) or OpenWhispr (~4k★).

### P1 — macOS users cannot dictate with the same reliability as Windows
- M6 macOS proof = **launch + reach transcription** (likely cloud path first). **Native paste** (where keystrokes land), **global hotkeys** (permissions, Globe key), **mic capture** (CoreAudio vs DirectShow), and **Accessibility** (TCC prompts, `AXUIElement` or sanctioned clipboard path) are **unimplemented or stubbed**.
- VoiceInk sets the macOS quality bar (native Swift, Metal, context-aware). SpeakFlow on Mac would be Electron — acceptable if paste and hands-free **work**, not if they are "Windows build that happens to open."

### P2 — Linux is a category expectation, not a nice-to-have
- Handy and OpenWhispr ship **AppImage / deb / rpm**. Linux developers (Cursor on Ubuntu, Hyprland/Sway tiling WMs) are a natural audience for OSS dictation.
- **Linux is harder than macOS for SpeakFlow**, not easier. Handy's own README documents: Wayland vs X11 paste tools (`wtype`, `xdotool`, `dotool`), overlay stealing focus, `libgtk-layer-shell`, global shortcuts owned by the compositor, Whisper crashes on some Linux configs. SpeakFlow's Windows-centric paste ladder (`HWND`, `win32-window`, terminal class table) **does not port** — it needs a **Linux paste abstraction** with compositor-specific behavior.

### P3 — Cannot build or test Linux from a Windows dev machine alone
- Native addons (`onnxruntime-node`, `uiohook-napi`, `@nut-tree-fork/nut-js` Linux prebuilds) require **Linux-linked artifacts**. Electron **linux** targets are produced on **`ubuntu-latest` GitHub Actions runners** (or a Linux VM), not by cross-compiling from Windows.
- **From DOM's Windows box:** you can **author code and CI workflows**; you **cannot** honestly sign off Linux paste/hands-free without **CI artifacts + human smoke on a real Linux desktop** (or contributor). Same pattern as macOS: **GitHub Actions is the build factory; human gate is on the artifact.**

### P4 — "Best in class OSS" requires table-stakes parity on all three OSes
- Until M7, marketing as "cross-platform open-source Whisper flow" is **partially true** (M6) or **aspirational**. Handy wins discovery partly because **one download works everywhere**. SpeakFlow's differentiators (§5) only matter **after** parity.

**Who struggles:** developers on Mac or Linux who find SpeakFlow on GitHub, install it, and discover paste/hands-free/hotkeys don't work like on Windows — they leave a 1★ issue and install Handy.

---

## 2. Hypothesis

We believe that if Oracle SpeakFlow, **after M6**, implements **platform-native capture, hotkey, and paste abstractions** behind the existing state machine and invariants (#17–#19), and ships **installable macOS (dmg, signed/notarized as required) and Linux (AppImage or deb) artifacts from CI**, then it becomes a **credible third option** in the free OSS dictation category — not merely a strong Windows tool — while **retaining** paste safety, hands-free-first UX, mic kill-switch, and MCP as the reasons power users choose it over Handy.

### Wrong condition (falsification)
- **macOS or Linux paste reliability <7/10** on the platform's primary target (Cursor chat / terminal) after M7 → platform-specific approach failed; do not claim parity; document honest "Windows-first, Mac/Linux beta."
- **Hands-free or kill-switch regresses on any platform** (mute must still close mic / OS indicator) → safety floor breached; block release for that platform.
- **Maintenance burden causes >30 days without a release** post-M7 → viability failure; consider narrowing to Windows + one secondary platform only.
- **Linux Wayland paste cannot meet clipboard+toast floor** on default Ubuntu/Fedora → ship X11-first with documented Wayland deps (`wtype`); do not ship broken auto-paste on Wayland.

### De-risk focus
- [x] Feasibility — can Electron + platform branches deliver paste without rewriting in Tauri?
- [x] Viability — solo maintainer × 3 OSes × model tiers = support load (Handy has Discord + 60+ contributors).
- [x] Value — does "works on my Mac/Linux" unlock installs, or is Windows enough for the niche?

---

## 3. Success metrics (outcomes)

| # | Metric | Target | How measured |
|---|--------|--------|--------------|
| M7-1 | **macOS end-to-end dictation** | Hands-free or PTT → corrected text in focused app ≥8/10; 0 wrong-target paste | Human smoke on macOS |
| M7-2 | **Linux end-to-end dictation (X11)** | Same ≥8/10 on Ubuntu 22.04/24.04 X11 session | Human smoke or CI + volunteer |
| M7-3 | **Linux Wayland** | Clipboard+toast floor works; auto-paste documented with `wtype`/deps | README + smoke |
| M7-4 | **CI matrix** | GitHub Actions: `windows-latest`, `macos-latest`, `ubuntu-latest` all produce installable artifacts | CI green |
| M7-5 | **Invariant preservation** | #17–#19 pass on all platforms; no `SetForegroundWindow` equivalent abuse on Mac/Linux | Grep + review |
| M7-6 | **Windows non-regression** | M6 gate matrix still green | Automated |

---

## 4. Thin-slice MVP (per platform)

**macOS:** Fresh dmg from CI → grant mic + Accessibility → focus Cursor chat → speak hands-free → corrected text appears in chat, offline with bundled tier, kill-switch darkens mic dot.

**Linux (X11):** Fresh AppImage/deb from CI → grant mic → focus terminal or chat → PTT or hands-free → text lands via Ctrl+V or clipboard+toast per paste ladder; no manual `whisper-cli` step.

Wayland: **clipboard+toast floor only** in thin slice unless STORM proves `wtype` path is reliable.

---

## 5. Differentiation bar (why M7 + M6 = "best in class" for *your* positioning)

M7 does not try to **out-feature** OpenWhispr (meetings, notes, agents) or **out-native** VoiceInk on Mac. It tries to be the **only MIT tool** that combines:

| Capability | Handy | OpenWhispr | VoiceInk | **SpeakFlow target (post M6+M7)** |
|------------|-------|------------|----------|-----------------------------------|
| Hands-free as **default** | Secondary | Hotkey-first | Yes | **Primary** (Quantum Leap) |
| **Paste safety** (never wrong window) | Good; Linux overlay issues | Standard | macOS-native | **HWND/class ladder + clipboard floor** (best explicit policy) |
| **Mute closes mic device** (OS dot dark) | Software mute | Varies | Varies | **Yes — marketed** |
| **MCP for coding agents** | No | Yes | No | **Yes — headless `--mcp`** |
| **Dev dictionary + deterministic correction** | Yes | Yes | Yes + LLM modes | **Yes — fast, offline, no over-correction** |
| **MIT, no subscription** | MIT | MIT | GPL + paid builds | **MIT** |
| Cross-platform **feature** parity | Yes | Yes | macOS only | **Yes (M7)** |
| Bundled local + tiers | Yes | Yes | Yes | **Yes (M6)** |
| GPU / Parakeet | Yes | Yes | Yes | **Stretch post-M7** |

**"Better than Handy" for:** developers who dictate into **AI chat/IDE** and want **paste guarantees + MCP + hands-free-first** without Raycast/CLI setup.
**"Better than OpenWhispr" for:** lean scope, no cloud telemetry surface, **safety invariants as product**.
**"Better than VoiceInk" for:** Windows + Linux + MIT; not better on macOS polish until much later.

**Honest ceiling:** SpeakFlow will **not** beat Handy on stars, community size, or "most forkable" unless you invest in **distribution and community** (see §7).

---

## 6. Non-goals (M7)

- Parakeet/GPU tiers (unless trivial add-on).
- winget / Homebrew / Flathub publishing (M8 distribution).
- Real-time streaming STT.
- Full OpenWhispr feature surface.

---

## 7. Open questions (for M7 STORM)

| # | Question |
|---|----------|
| OQ-1 | macOS paste: Accessibility `AXUIElement` vs clipboard-only + toast as default? |
| OQ-2 | Linux paste abstraction: one `paste.ts` interface with `win32` / `darwin` / `linux` backends? |
| OQ-3 | Wayland: ship with overlay disabled by default (Handy pattern)? |
| OQ-4 | Notarization minimum for public Mac downloads? |
| OQ-5 | Accept community Linux smoke testers vs blocking release on DOM-only gates? |

---

## 8. Build-from-Windows reality (for DOM)

| Platform | Build from Windows PC? | Test from Windows PC? | Production path |
|----------|------------------------|------------------------|-----------------|
| **Windows** | Yes | Yes | Local + CI |
| **macOS** | **No** (need macOS runner) | **No** | **GitHub Actions `macos-latest`** + human smoke on Mac artifact |
| **Linux** | **No** (native addons need Linux link) | **No** (paste/Wayland need real session) | **GitHub Actions `ubuntu-latest`** + human smoke on VM or contributor |

You **can** write all platform branches and CI YAML from Windows. You **cannot** honestly ship Mac/Linux without CI artifacts and at least one smoke pass per platform.

**Linux difficulty vs macOS:** **Harder** for paste/focus (X11 + Wayland split, compositor shortcuts). **Similar** for capture (FFmpeg PulseAudio) and packaging (AppImage). Budget **more WARGAME scenarios for Linux than macOS.**

---

## 9. STORM / WARGAME commission (when M7 opens)

**STORM topic:** *Native paste, capture, and global hotkeys for Electron dictation on macOS and Linux (X11/Wayland) in 2026 — sanctioned patterns, permission models, and competitor failure modes (Handy Linux notes).*

**WARGAME must include:** Wayland focus steal, missing `wtype`, macOS TCC denial, unsigned Mac gatekeeper, three-platform CI drift breaking Windows.

---

## 10. Human Gate B7 — STOP

Do not start M7 until:
- M6 shipped and repo **public** with honest README.
- DOM explicitly approves M7 scope and accepts **Linux CI + external smoke** dependency.

`_M7 approved by DOM: 2026-07-09 — macOS parity first, Linux via Fable 5 STORM second_`

---

## 11. Handoff (post-M6)

When M6 is GREEN, paste §9 commission into Fable 5 with this file as authority. Same pipeline as M6: STORM → WARGAME ≥7/10 → PRD Gate C1 → Spec Gate D1 → build.

---

*Parked intent. M6 is the launch gate; M7 is how SpeakFlow becomes truly cross-platform, not just cross-compilable.*
