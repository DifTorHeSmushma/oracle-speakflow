# Fable 5 — paste this entire file as your command

**Model:** `claude-fable-5-thinking-high`  
**Repo root:** Oracle-SpeakFlow  
**Gate:** B7b approved — production-grade Linux cycle

---

## Command (copy from here)

You are the frontier PRD/Spec author for Oracle SpeakFlow M7b Linux parity.

### Authority (read in full, in order)

1. `docs/DESIGN/INTENT-m7b-linux-parity.md` — **primary authority** (Gate B7b)
2. `docs/DESIGN/INTENT-m7-cross-platform-native-parity.md` — parent M7 context
3. `CLAUDE.md` — invariants #17–#19
4. Brownfield ground truth:
   - `src/services/paste.ts`
   - `src/utils/darwin-window.ts` (mirror this pattern for Linux)
   - `src/utils/win32-window.ts`
   - `src/services/capture.ts`
   - `src/electron-main.ts`
   - `package.json` (no linux target today)
   - `.github/workflows/ci.yml`
   - `.github/workflows/mac-package.yml` (CI packaging template)

### Scope

- **Linux only.** macOS Wave 7a is **done** — do not re-scope Mac.
- **Production-grade** — match M6 milestone rigor (`INTENT-m6-public-launch-parity.md`, `M6_PUBLIC_LAUNCH_PRD.md`, `M6_PUBLIC_LAUNCH_SPEC.md` as style references).
- **Do not implement code** in this session — deliverables only.

### Execute this pipeline (sequential, no skips)

#### Step 1 — STORM

Topic (from INTENT-m7b §7):

> Native paste, capture, global hotkeys, and Electron packaging for Linux desktop dictation (X11 + Wayland) in 2026 — Handy/OpenWhispr failure modes, nut-js vs xdotool vs wtype, PulseAudio/PipeWire FFmpeg, AppImage vs deb, ubuntu-latest CI economics.

**Output:** `docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md`  
Include verification banner; cite competitor Linux docs where used.

#### Step 2 — WARGAME

Adversarial pre-mortem per INTENT-m7b §8.  
**Output:** `docs/DESIGN/WARGAME-m7-linux-parity.md`  
**Pass bar:** score ≥ **7/10**. If < 7, revise and re-score before PRD.

#### Step 3 — Brownfield PRD

**Output:** `docs/DESIGN/M7_LINUX_PARITY_PRD.md`  
Must honor locked constraints **L-C1 through L-C10** from INTENT-m7b.  
Include: pillars, falsification paths, degradation rules, success metrics L-1–L-7, non-goals, gate matrix overview.  
End with: **Gate C1 — awaiting DOM approval.**

#### Step 4 — Engineering Spec

**Output:** `docs/DESIGN/M7_LINUX_PARITY_SPEC.md`  
Include: module contracts (`linux-window.ts`, capture branch, `linux-package.yml`), wave plan 7b–7f with STOP gates, grep-gates, CI policy (workflow_dispatch only for linux package), README claim table, human smoke scripts for X11 and Wayland floor.  
End with: **Gate D1 — awaiting DOM approval.**

### Non-negotiables

- `paste.ts` remains pure — no native imports
- No focus steal on Linux (no `windowactivate` on inject path)
- X11-first; Wayland clipboard floor unless WARGAME proves wtype path
- Windows + macOS regression gates must stay green
- Cloud Groq path acceptable for M7b proof; bundled local Linux optional wave

### Final message must include

```
Gate B7b: APPROVED (INTENT-m7b-linux-parity.md)
STORM: docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md
WARGAME: docs/DESIGN/WARGAME-m7-linux-parity.md — score: _/10
PRD: docs/DESIGN/M7_LINUX_PARITY_PRD.md — Gate C1 pending DOM
SPEC: docs/DESIGN/M7_LINUX_PARITY_SPEC.md — Gate D1 pending DOM
Recommended first build wave after D1: 7b (linux-package.yml + AppImage/deb)
Blockers for DOM: _
```

---

## After Fable 5 finishes

1. DOM approves PRD (C1) — same session if possible  
2. DOM approves Spec (D1)  
3. **Start Linux build immediately** (Sonnet-tier, waves per Spec)

Mac human tester does **not** block step 3.
