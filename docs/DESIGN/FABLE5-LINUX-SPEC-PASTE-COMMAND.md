# Fable 5 — Session 2 (Spec only) — paste after Gate C1 approval

**Model:** `claude-fable-5-thinking-high` (or Opus 4.8 for M6 parity — **new session only**)  
**Repo root:** Oracle-SpeakFlow  
**Prerequisite:** Gate C1 **APPROVED** — `docs/DESIGN/M7_LINUX_PARITY_PRD.md` (DOM amendment: auto-paste mandatory)  
**Session scope:** Engineering Spec only → **STOP at Gate D1**

---

## Command (copy from here)

You are the engineering Spec author for Oracle SpeakFlow M7b Linux parity.

### Authority (read in full, in order)

1. `docs/DESIGN/M7_LINUX_PARITY_PRD.md` — **primary authority** (Gate C1 APPROVED 2026-07-09, DOM auto-paste amendment)
2. `docs/DESIGN/INTENT-m7b-linux-parity.md` — locked constraints L-C1–L-C10, L-C7 (auto-paste)
3. `docs/DESIGN/WARGAME-m7-linux-parity.md` — adversarial findings (wtype 1.8/10 — do not use)
4. `docs/DESIGN/storm-reports/speakflow-linux-parity-2026-briefing.md`
5. `CLAUDE.md` — invariants #17–#19
6. Brownfield: `paste.ts`, `darwin-window.ts`, `win32-window.ts`, `capture.ts`, `electron-main.ts`, `package.json`, `ci.yml`, `mac-package.yml`, `scripts/check-*.mjs`
7. Style reference: `docs/DESIGN/M6_PUBLIC_LAUNCH_SPEC.md`

### DOM non-negotiable (production)

- **Hands-free MUST auto-paste** into the focused app on every Linux session we claim supported — **same bar as Windows**.
- **PTT (F8)** is optional backup; must also auto-paste when used.
- **Clipboard+toast** is **guard fallback only** (own-window, unverified foreground, alt-tab) — never the designed happy path on a supported session.
- **No focus steal** — no `windowactivate`, `wmctrl -a`, `XSetInputFocus` on inject path.
- **`paste.ts` stays pure** — Linux feeds data only.
- **deb primary** artifact; `workflow_dispatch` + tags only for linux package CI.
- **Windows + macOS** regression gates stay green.

### Scope

- Linux only. Do not rewrite the PRD. **Do not implement code** — Spec deliverable only.

### Deliverable

**Output:** `docs/DESIGN/M7_LINUX_PARITY_SPEC.md`

Must resolve PRD §11 verbatim, including:

- **Supported-session matrix** — minimum **Ubuntu 24.04 X11** with verified hands-free auto-paste (L-2/L-3 hard floor). Add Wayland/GNOME only if you specify an evidence-backed auto-paste backend (e.g. `--ozone-platform=x11` / XWayland path, portal/libei spike with pass criteria). Sessions without verified auto-paste are **unsupported** — not listed in README.
- Module contracts: `linux-window.ts`, `linux-session.ts`, capture pulse branch, `linux-package.yml`
- Waves **7b–7f** with STOP gates; **7b/7c embed nut-js packaged spike** (LD7)
- Grep-gates (focus discipline, packaging CI discipline)
- Human smoke scripts: hands-free auto-paste ≥8/10, **0 wrong-target**, Cursor + GNOME Terminal, own-window guard case
- README claim table — only sessions with verified auto-paste

End with: **Gate D1 — STOP. Awaiting DOM approval. Do not implement.**

### Final message must include

```
Gate C1: APPROVED (M7_LINUX_PARITY_PRD.md — auto-paste amendment)
SPEC: docs/DESIGN/M7_LINUX_PARITY_SPEC.md — Gate D1 pending DOM
Supported-session matrix: _
Recommended first build wave after D1: 7b (linux-package.yml + deb)
Blockers for DOM: _
```

---

## After Session 2

DOM approves Spec (Gate D1) → Sonnet-tier build at repo root, waves per Spec.
