# Fable 5 — Session 2 (Spec only) — paste after Gate C1 approval

**Model:** `claude-fable-5-thinking-high` (or Opus 4.8 for M6 parity — either in a **new** session)  
**Repo root:** Oracle-SpeakFlow  
**Prerequisite:** Gate C1 approved — `docs/DESIGN/M7_LINUX_PARITY_PRD.md` exists and DOM signed off  
**Session scope:** Engineering Spec only → **STOP at Gate D1**

> **Never combine with Session 1.** Read the approved PRD cold in this session.

---

## Command (copy from here)

You are the engineering Spec author for Oracle SpeakFlow M7b Linux parity.

### Authority (read in full, in order)

1. `docs/DESIGN/M7_LINUX_PARITY_PRD.md` — **primary authority** (Gate C1 approved)
2. `docs/DESIGN/INTENT-m7b-linux-parity.md` — locked constraints L-C1–L-C10
3. `docs/DESIGN/WARGAME-m7-linux-parity.md` — adversarial findings
4. `docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md` — research grounding
5. `CLAUDE.md` — invariants #17–#19
6. Brownfield: `paste.ts`, `darwin-window.ts`, `win32-window.ts`, `capture.ts`, `electron-main.ts`, `package.json`, `ci.yml`, `mac-package.yml`
7. Style reference: `docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md`

### Scope

- **Linux only.** macOS Wave 7a is done.
- **Do not rewrite the PRD** — implement its decisions in engineering detail.
- **Do not implement code** in this session — Spec deliverable only.

### Deliverable

**Output:** `docs/DESIGN/M7_LINUX_PARITY_SPEC.md`

Include:
- Module contracts (`linux-window.ts`, capture branch, `linux-package.yml`)
- Wave plan 7b–7f with STOP gates
- Grep-gates and CI policy (`workflow_dispatch` only for linux package)
- README claim table
- Human smoke scripts for X11 and Wayland floor
- Resolves PRD open questions

End with: **Gate D1 — STOP. Awaiting DOM approval. Do not implement.**

### Non-negotiables

Same as PRD: pure `paste.ts`, no focus steal, X11-first + Wayland floor, Windows/macOS regression green.

### Final message must include

```
Gate C1: APPROVED (M7_LINUX_PARITY_PRD.md)
SPEC: docs/DESIGN/M7_LINUX_PARITY_SPEC.md — Gate D1 pending DOM
Recommended first build wave after D1: 7b (linux-package.yml + AppImage/deb)
Blockers for DOM: _
```

---

## After Session 2 finishes

DOM approves Spec (Gate D1) → Sonnet-tier build at repo root, waves per Spec.
