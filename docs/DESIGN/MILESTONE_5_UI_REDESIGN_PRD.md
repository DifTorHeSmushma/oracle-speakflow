# Milestone 5 PRD: Visual Redesign (Portfolio-Grade UI)

## 1. Objective

Deliver a **clearly new** product appearance suitable for portfolio demos, GitHub README screenshots, and monetization positioning — without changing the core voice pipeline (record → transcribe → paste).

**Non-goal:** Re-implementing transcription, hotkey handling, or MCP. Those remain as shipped on `main`.

**Relationship to Phase 3:** Phase 3 delivered **Pro foundation** (tokens, waveform, settings modal, F8). Milestone 5 is the **visual milestone** (layout, typography, shadcn-svelte shell).

## 2. Success criteria (user-visible)

| # | Criterion | Verification |
|---|-----------|--------------|
| SC-1 | First-time viewer says "this looks like a different app" vs pre-M5 screenshots | Side-by-side screenshot |
| SC-2 | Card-based layout with clear hierarchy (header, status, transcript, actions) | Manual + UI test |
| SC-3 | Settings use shadcn Dialog/Sheet with tabbed sections | Manual |
| SC-4 | Recording state is obvious (waveform + state color) | Manual smoke |
| SC-5 | Support/monetization strip visible and styled | Manual |
| SC-6 | All existing gates green: typecheck, unit, UI, integration | CI / local scripts |
| SC-7 | F8 + Groq cloud path unchanged in behavior | Manual smoke |

## 3. Functional requirements

### [FR-M5-01] Application shell
- Replace flat `App.svelte` stack with **shadcn-svelte Card** layout.
- Sections: app header (title + version), status card, transcript card, primary actions footer.
- Preserve window size target (~320×500 tray) unless design pass justifies resize (document in PIV).

### [FR-M5-02] Typography and theme
- Load **Geist** or **Inter** with defined type scale (title, body, caption).
- Extend existing zinc/indigo tokens; no regression to light-mode unless explicitly scoped.

### [FR-M5-03] Status and recording UX
- Prominent waveform region in status card.
- State-colored chrome: idle, recording, transcribing, error (map to existing state machine).

### [FR-M5-04] Settings modal redesign
- shadcn **Dialog** or **Sheet**.
- Tabs: **Voice** (hotkey), **Engine** (cloud/local, models), **Account** (API key), **Support** (sponsor links).

### [FR-M5-05] Monetization / portfolio strip
- Visible "Support development" area with styled external links (existing URLs from config).
- Suitable for README hero screenshot.

### [FR-M5-06] Component library integration
- Install and use **shadcn-svelte@0.9.x** compatible with **Svelte 4** and **Tailwind v4** already in repo.
- No duplicate design systems; remove redundant scoped CSS where components replace it.

## 4. Technical constraints

- **Svelte 4** — do not upgrade to Svelte 5 in this milestone.
- **IPC contract frozen** — no breaking changes to `preload` / `ipcMain` channel names without ADR.
- **Test baseline** — current unit/UI/integration counts must pass; add UI tests for new shell structure where practical.
- **Build** — `npm run build` + `npm run build:ui` remain the dev entry path.

## 5. Out of scope (Milestone 5)

- Installer / electron-builder (Milestone 4).
- Real-time streaming transcription.
- Svelte 5 migration.
- Changing default hotkey or MCP protocol.

## 6. Reference and inspiration

- shadcn-svelte documentation (Card, Button, Badge, Dialog, Tabs).
- Portfolio-grade dark SaaS trays (compact density, not landing-page width).

## 7. Deliverables

| Artifact | Path |
|----------|------|
| This PRD | `docs/DESIGN/MILESTONE_5_UI_REDESIGN_PRD.md` |
| PIV build plan | `docs/DESIGN/MILESTONE_5_PIV_PLAN.md` |
| Screenshots (post-impl) | `docs/DESIGN/assets/m5/` (create when ready) |
| README update | Mark M5 in progress / done when merged |

## 8. Rollback

If visual regressions block daily use: revert `feat/m5-ui-redesign` merge; `main` remains the functional Pro + M2 engine baseline.
