# Build Plan: Milestone 5 — Visual Redesign (PIV)

**Branch:** `feat/m5-ui-redesign`  
**Authority:** `MILESTONE_5_UI_REDESIGN_PRD.md`  
**Rule:** No changes to transcription pipeline behavior unless bug fix.

---

## Milestone overview

| Phase | Goal | Model tier |
|-------|------|------------|
| M5-1 | shadcn-svelte setup + token alignment | Haiku 4.5 |
| M5-2 | App shell (Card layout) | Sonnet 4.6 |
| M5-3 | StatusBar + waveform polish | Sonnet 4.6 |
| M5-4 | Settings Dialog/Sheet + tabs | Sonnet 4.6 |
| M5-5 | Support strip + README screenshots | Haiku 4.5 |
| M5-6 | Gates + merge PR | Haiku 4.5 |

---

## Task table

| ID | Task | Implementation detail | Validation (PIV gate) |
|:---|:---|:---|:---|
| **M5-T01** | shadcn-svelte init | Add components: Card, Button, Badge, Dialog, Tabs; verify Tailwind v4 | `npm run build:ui` pass |
| **M5-T02** | Typography | Geist or Inter + CSS type scale in `app.css` | Visual check |
| **M5-T03** | App shell rewrite | Card-based `App.svelte`; preserve IPC wiring | UI tests pass; manual tray open |
| **M5-T04** | StatusBar redesign | Waveform + state colors in card | Manual: record → waveform visible |
| **M5-T05** | Settings redesign | Dialog/Sheet; tabs Voice / Engine / Account / Support | Manual: all tabs load saved config |
| **M5-T06** | Support strip | Styled sponsor buttons in shell or settings | Screenshot for README |
| **M5-T07** | Regression gates | Full matrix | `typecheck` + `test` + `test:ui` + `test:integration` |
| **M5-T08** | Smoke | F8 + Groq cloud paste | Manual 2-min script |
| **M5-T09** | Docs | README roadmap + 2 screenshots under `docs/DESIGN/assets/m5/` | PR review |

---

## Architect's gate (before merge)

1. All M5-T07 gates green.  
2. M5-T08 manual smoke recorded in execution report.  
3. At least one before/after screenshot in PR description.

---

## Archon handoff (when implementing)

Use the internal PIV workflow and product handoff paste doc (local-only builder artifacts; not published).

**Analyze and Agree** must confirm: Svelte 4 + shadcn 0.9.x + no IPC renames.
