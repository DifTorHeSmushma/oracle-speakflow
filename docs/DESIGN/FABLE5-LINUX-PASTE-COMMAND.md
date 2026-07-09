# Fable 5 — Session 1 (PRD only) — paste this entire file as your command

**Model:** `claude-fable-5-thinking-high`  
**Repo root:** Oracle-SpeakFlow  
**Gate:** B7b approved — production-grade Linux cycle  
**Session scope:** STORM → WARGAME → PRD → **STOP at Gate C1**

> **Handoff discipline (M6 parity):** PRD and Spec are **never** in the same session. This session ends at C1. Spec is Session 2 (`FABLE5-LINUX-SPEC-PASTE-COMMAND.md`) after DOM approves the PRD.

---

## Command (copy from here)

You are the frontier PRD author for Oracle SpeakFlow M7b Linux parity.

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
5. Style reference: `docs/DESIGN/M6_PUBLIC_LAUNCH_PRD.md` (intent altitude, Gate C1 STOP)

### Scope

- **Linux only.** macOS Wave 7a is **done** — do not re-scope Mac.
- **Production-grade** — match M6 PRD rigor.
- **Do not implement code** in this session.
- **Do NOT write the Engineering Spec** — that is a **separate session** after DOM approves Gate C1.

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
**Altitude:** intent only — no file trees, no APIs, no library versions (those belong in Spec).  
End with: **Gate C1 — STOP. Awaiting DOM approval. Do not write Spec.**

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
SPEC: NOT IN THIS SESSION — use FABLE5-LINUX-SPEC-PASTE-COMMAND.md after C1 approval
Blockers for DOM: _
```

End with a one-paragraph handoff: Gate C1 reached; next step is DOM approval, then **new session** for Spec.

---

## After Session 1 finishes

1. DOM reviews and approves PRD (Gate C1)  
2. **New session** — paste `FABLE5-LINUX-SPEC-PASTE-COMMAND.md` (not this file)  
3. DOM approves Spec (Gate D1) → build waves per Spec

Mac human tester does **not** block step 3.
