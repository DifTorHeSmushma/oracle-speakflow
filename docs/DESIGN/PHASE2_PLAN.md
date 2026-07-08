# Oracle-Speakflow Phase 2 — Production UI Build Plan

> **Status:** Approved — ready for implementation  
> **Constraint:** Phase 1 service files are read-only. All 24 tests must pass throughout.

---

## Layer 1: Foundation

### Tech Stack Decision: Electron + Svelte (not Tauri)

`CLAUDE.md` explicitly states:
- *"Do not add Svelte/React/TanStack until Phase 2 (tray UI)"* — Svelte is now allowed
- *"Do not add Tauri until Phase 3 (cross-platform)"* — Tauri is forbidden here

**Electron** is the correct choice for Phase 2. The existing Phase 1 stack is pure Node.js/TypeScript ESM. Electron's main process is a Node.js runtime — it can import `recorder.ts`, `transcription.ts`, and `injector.ts` directly, with zero IPC overhead for the core pipeline. Svelte compiles to vanilla JS, loads in the BrowserWindow renderer, and provides reactive state binding without a heavy runtime.

### Architecture

```
electron-main.ts            ← NEW entry point (replaces index.ts CLI loop)
  ├── Tray icon (Electron Tray + nativeImage)
  ├── State machine (IDLE/RECORDING/TRANSCRIBING/INJECTING — same logic as index.ts)
  ├── uiohook-napi hotkey (same as Phase 1, unchanged wiring)
  ├── Direct imports of Phase 1 services (no changes to those files)
  ├── BrowserWindow (frameless, 320×500, shown on tray click)
  └── ipcMain — emits state events to renderer; receives config updates

src-ui/                     ← Svelte UI (compiled to dist-ui/)
  ├── App.svelte
  ├── stores/
  │   └── daemon.ts         ← writable Svelte store; populated via ipcRenderer events
  └── components/
      ├── StatusBar.svelte        (indicator light + waveform animation + elapsed timer)
      ├── TranscriptPreview.svelte (shows text before paste, copyable)
      ├── HotkeyEditor.svelte     (key capture, modifier checkboxes, validation)
      ├── ApiKeyPanel.svelte      (masked sk-***, edit/save, never logs raw key)
      └── SettingsModal.svelte    (model dropdown, language, verbosity slider)

src/utils/config.ts         ← EXTENDED with write path for config persistence (Result<T,E>)
```

### Non-Negotiables

- `recorder.ts`, `transcription.ts`, `injector.ts`, `result.ts` — read-only, zero changes
- All 24 Phase 1 tests pass throughout every task
- `Result<T, E>` in all new TypeScript
- API key invariant (#3 from CLAUDE.md): masked display only, never in IPC payloads
- No classes in service layer (Electron's Tray/BrowserWindow use object APIs — wrap in functions)

---

## Layer 2: Task Breakdown (ordered by dependency)

| ID | Task | Deps | Size | Acceptance Criteria |
|----|------|------|------|---------------------|
| **T-01** | Add Electron + Vite/Svelte toolchain | — | M | `npm run build:ui` compiles Svelte to `dist-ui/`; `npm run start:electron` boots without crash; 24 tests still pass |
| **T-02** | `electron-main.ts` scaffold + tray icon | T-01 | M | Tray icon visible in Windows taskbar; clicking it opens/hides a blank BrowserWindow |
| **T-03** | Migrate state machine into electron-main | T-02 | S | Same IDLE→RECORDING→TRANSCRIBING→INJECTING logic; Ctrl+Alt+R hotkey triggers full pipeline end-to-end |
| **T-04** | IPC bridge: state events main → renderer | T-03 | S | `ipcMain` emits `state-change` on every transition; renderer store updates reactively; fully typed |
| **T-05** | `StatusBar.svelte` (light + waveform + timer) | T-04 | M | IDLE = grey dot; RECORDING = green pulse + waveform animation + elapsed seconds; TRANSCRIBING/INJECTING = spinner |
| **T-06** | `TranscriptPreview.svelte` | T-04 | S | After INJECTING, shows transcript text; "Copy" button; auto-clears after 10s |
| **T-07** | `ApiKeyPanel.svelte` (masked) | T-04 | S | Displays `sk-***`; "Edit" shows input; "Save" writes to `.env` via IPC; CLAUDE.md invariant #3 enforced |
| **T-08** | `HotkeyEditor.svelte` | T-04 | M | Key capture via `keydown` listener; modifier toggles; validates combination; saves via IPC; reflected in `electron-main` live |
| **T-09** | `SettingsModal.svelte` (model/language/verbosity) | T-04 | S | Dropdowns for Groq model + language code; verbosity toggle; persists via IPC config handler |
| **T-10** | Config write path (`config.ts` extension) | T-07, T-08, T-09 | M | `saveConfig(partial: Partial<Config>): Result<void, ConfigError>` writes back to `.env` and in-memory; raw key never in logs |
| **T-11** | Tray window polish (click-outside, positioning) | T-05, T-06 | S | Window anchors above tray icon; click elsewhere hides it; `blur` event on BrowserWindow triggers hide |
| **T-12** | Unit tests — Svelte components | T-05–T-09 | M | Vitest + `@testing-library/svelte`; IPC mocked with `vi.mock`; each component has ≥3 test cases (happy + error + edge) |
| **T-13** | Integration tests — UI ↔ daemon state sync | T-11 | L | Playwright (Electron driver); launches app in `TEST_MODE`; injects synthetic IPC state events; asserts DOM reflects each state |
| **T-14** | Build + package (`electron-builder`) | T-01–T-13 | S | `npm run package` produces a valid NSIS installer `.exe`; `node_modules` pruned |
| **T-15** | Extend CLAUDE.md for Phase 2 rules | T-14 | S | Documents IPC channel names, UI component conventions, new invariants (API key masking in renderer), Electron-specific test patterns |

---

## Context Engineering

### Foundational (always loaded before any Phase 2 work)

- `CLAUDE.md` — invariants, architecture, what is forbidden
- `src/utils/result.ts` — `Result<T,E>` type (all new code uses this)
- `src/utils/config.ts` — `Config` type (UI reads and writes this shape)
- `src/index.ts` — state machine reference (electron-main mirrors this exactly)
- Phase 1 service type signatures (not implementations)

### On-Demand (load only when working on that task)

- `src-ui/components/*.svelte` — only the component being built
- `tests/` + `src-ui/__tests__/` — when writing or fixing tests
- `vite.config.ts`, `electron-builder.config.ts` — build config tasks only
- `package.json` — only when adding/removing dependencies

---

## Testing Strategy

### Phase 1 Regression (Vitest, always runs)

```
npm test   →  24 tests, zero allowed failures at any point
```

### Phase 2 Component Tests (Vitest + @testing-library/svelte)

- Each component: happy path, error state, edge cases
- IPC mocked at boundary: `vi.mock('../ipc')` — never mock service internals
- `ApiKeyPanel`: assert raw key never appears in DOM or IPC payload
- `HotkeyEditor`: assert invalid combinations rejected before save

### Phase 2 Integration Tests (Playwright + Electron)

- Launch app with `TEST_MODE=true` (skips real uiohook, uses synthetic events)
- Inject state transitions via IPC: `IDLE → RECORDING → TRANSCRIBING → INJECTING → IDLE`
- Assert DOM state matches each transition
- Assert tray window shows/hides correctly

---

## Validation Gates

All must pass to declare Phase 2 complete:

1. `npm test` — all 24 Phase 1 tests pass (zero regressions)
2. `npm run typecheck` — zero TypeScript errors across all files
3. `npm run test:ui` — all Svelte component unit tests pass
4. Tray icon visible in Windows system tray after launch
5. Ctrl+Alt+R triggers full recording pipeline (end-to-end, no regression)
6. StatusBar reflects all 4 states visually
7. TranscriptPreview shows text before paste, clears after 10s
8. Settings (model, language, hotkey, API key) persist across restart
9. `git diff src/services/ src/utils/result.ts` — empty (Phase 1 services untouched)
10. `npm run package` produces a valid NSIS installer `.exe`
