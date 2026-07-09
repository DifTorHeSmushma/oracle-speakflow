# Fable 5 — STORM commission: Linux parity (M7b)

**Consumer:** Fable 5 (`claude-fable-5-thinking-high`) @ Oracle-SpeakFlow repo root  
**Date:** 2026-07-09  
**Authority:** `docs/DESIGN/INTENT-m7b-linux-parity.md` (Gate B7b — **primary**) + `docs/DESIGN/INTENT-m7-cross-platform-native-parity.md` (parent)  
**Fable 5 command:** `docs/DESIGN/FABLE5-LINUX-PASTE-COMMAND.md` — **paste that file whole**  
**Prerequisite:** macOS Wave 7a merged + Mac Package CI green on `main` ✅

---

## Your task

Run **STORM** (5-lens briefing) on:

> **Native paste, capture, and global hotkeys for Electron dictation on Linux (X11 + Wayland) in 2026 — sanctioned patterns, permission models, and competitor failure modes (Handy Linux notes, OpenWhispr).**

Deliverable: `docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md`

Then **WARGAME** (adversarial pre-mortem, score ≥ 7/10) → `docs/DESIGN/WARGAME-m7-linux-parity.md`

Then **brownfield PRD** → `docs/DESIGN/M7_LINUX_PARITY_PRD.md` (Gate C1 — DOM approval) — **Session 1 STOP**

Then **engineering Spec** → `docs/DESIGN/M7_LINUX_PARITY_SPEC.md` (Gate D1) — **Session 2 only** (`FABLE5-LINUX-SPEC-PASTE-COMMAND.md`)

---

## Ground truth (read from disk first)

| File | Why |
|------|-----|
| **`docs/DESIGN/INTENT-m7b-linux-parity.md`** | **Primary authority — forensic Linux intent** |
| `CLAUDE.md` | Invariants #17–#19 (paste safety, no foreground steal) |
| `src/services/paste.ts` | Pure decision ladder — add `linux` backend, do not break Windows |
| `src/utils/win32-window.ts` | Foreground API — pattern for `linux-window.ts` |
| `src/utils/darwin-window.ts` | macOS parity just landed — mirror abstraction style |
| `src/services/capture.ts` | FFmpeg platform branches |
| `.github/workflows/mac-package.yml` | CI pattern for `linux-package.yml` |
| `docs/DESIGN/INTENT-m7-cross-platform-native-parity.md` | M7 outcomes M7-1…M7-6 |

---

## Linux-specific STORM lenses (mandatory)

1. **X11 paste:** `xdotool`, nut-js, clipboard+toast floor
2. **Wayland:** compositor shortcuts, `wtype`, focus steal, Handy overlay-disabled pattern
3. **Capture:** PulseAudio vs PipeWire via FFmpeg (`-f pulse`)
4. **Packaging:** AppImage vs deb — what Handy/OpenWhispr ship
5. **CI:** `ubuntu-latest` electron-builder, native addon prebuilds (`uiohook-napi`, `onnxruntime-node`)
6. **Falsification:** Wayland auto-paste fails → ship clipboard-only with honest README

---

## Success metrics (from INTENT)

| ID | Target |
|----|--------|
| M7-2 | Ubuntu 22.04/24.04 X11: hands-free/PTT → paste ≥ 8/10 |
| M7-3 | Wayland: clipboard+toast floor documented + smoke |
| M7-4 | CI produces installable Linux artifact |
| M7-5 | Invariants #17–#19 preserved |

---

## Non-goals (this cycle)

- Parakeet / GPU
- Flathub/winget
- macOS further polish (separate if needed)

---

## Handoff block (complete in your final message)

```
STORM: docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md
WARGAME score: _/10
PRD path: docs/DESIGN/M7_LINUX_PARITY_PRD.md
Spec path: docs/DESIGN/M7_LINUX_PARITY_SPEC.md
Recommended build waves: 7b package CI → 7c paste-linux → 7d capture → 7e hotkeys → 7f Wayland floor
Blockers for DOM: _
```

---

*Use `FABLE5-LINUX-PASTE-COMMAND.md` — not this file alone.*
