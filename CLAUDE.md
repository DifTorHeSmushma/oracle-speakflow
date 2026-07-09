# Oracle SpeakFlow — Global Rules

## What This System Does
A Windows speech-to-paste daemon. User presses Ctrl+Shift+R → holds to record → releases →
Groq Whisper transcribes → text is injected at the active window's cursor position.

## Architecture

```
src/index.ts                   ← entry point, hotkey loop, state machine
src/services/
  recorder.ts                  ← pure: start/stop mic recording, return WAV buffer
  transcription.ts             ← pure: send buffer to Groq, return Result<string, TranscriptionError>
  injector.ts                  ← pure: write text to clipboard, send Ctrl+V keystroke (CLI path only)
src/utils/
  result.ts                    ← Result<T, E> type + Ok/Err constructors
  config.ts                    ← load GROQ_API_KEY from env/file, validate on startup
  binaryPath.ts                ← resolve ffmpeg.exe/whisper-cli.exe path (packaged vs dev vs PATH)
src/types/
  node-record-lpcm16.d.ts      ← local type shim (no @types package exists on npm)
tests/
  recorder.test.ts
  transcription.test.ts
  injector.test.ts
```

**Phase 2 note — paste path in Electron:** `injector.ts` is used by the CLI entry point (`src/index.ts`) only.
In the Electron path (`src/electron-main.ts`), clipboard write and Ctrl+V keystroke are handled inline
inside `runPipeline()`. This is intentional: `clipboardy` and `nut-js` resolve their native binaries via
`__dirname`, which becomes a virtual asar path in packaged Electron apps and cannot be spawned. Electron's
own `clipboard` module and `@nut-tree-fork/nut-js` are correctly remapped to `app.asar.unpacked` via
Electron's `require()` patching. Do not route Electron paste through `injector.ts`.

## Invariants (never violate these)

1. **Service layer is pure** — no side effects except their declared IO. No global state.
2. **All errors return `Result<T, E>`** — never throw across service boundaries.
3. **API key never logged** — always use the `MASKED_KEY = "sk-***"` constant in index.ts.
   Never interpolate the raw key into any log line, even partially.
4. **No conversation logging** — Groq request bodies contain audio only, never text context.
5. **Paste uses clipboard+Ctrl+V** — direct UIAutomation injection is not in scope.
   CLI path: via `injector.ts`. Electron path: inline in `electron-main.ts:runPipeline()`
   (cannot route through `injector.ts` in packaged Electron — see Architecture note above).
6. **State machine re-entry is forbidden** — index.ts enforces IDLE/RECORDING/TRANSCRIBING/INJECTING
   states. Any hotkey DOWN event while state ≠ IDLE is silently ignored. Never allow two
   concurrent pipeline runs.
7. **stop() must be idempotent** — recorder.ts guards with a `stopped` flag. Second call
   returns `Err({ kind: "recordingFailed", message: "Already stopped" })` immediately.
8. **Async cleanup on shutdown** — SIGINT handler must `await session.stop()` (via `.finally()`)
   before calling `process.exit(0)`. Never exit while an FFmpeg process may still be running.
13. **Local-First by Default** — If a local model (whisper-cli sidecar) is available, use it. Only fall back to Groq if explicitly requested or if local fails. Per-tier SHA manifest gate (`resources/bin/models.sha256`) is enforced before every engine start and every transcription — **no unverified hash ever runs** (no-unverified-hash release rule; `scripts/check-manifest.mjs` is release-blocking).
15. **Zero-Friction Bundling** — `whisper-cli.exe` + `whisper-server.exe` are bundled via `extraResources` (`resources/bin/`). The Fast tier model (`ggml-tiny.en.bin`) ships in the installer. Balanced/Accurate models are one-click SHA-gated downloads to `userData/models`. Never require the user to run `winget` or `brew`, and never place binaries manually in production.
16. **UI Component Density** — No single Svelte component shall exceed 250 lines. Use composition over massive files.
17. **Single mic owner** — FFmpeg (main process) is the sole microphone consumer. The renderer must never call `getUserMedia`. VAD consumes FFmpeg's PCM stream; it must not open a second device handle.
18. **Never steal foreground** — the pipeline must never call `SetForegroundWindow`/`AttachThreadInput`; the tray uses `showInactive` only. Paste lands in the already-focused window or degrades to clipboard+toast.
19. **No paste/record while muted** — VAD and `decidePaste` must hard-check `mute.ts`; zero pastes and zero recording while muted or kill-switch active. Kill-switch closes the mic device (indicator dark), never discard-only.

## State Machine (index.ts)

```
IDLE ──(key DOWN + modifiers)──► RECORDING ──(key UP)──► TRANSCRIBING ──(ok)──► INJECTING ──► IDLE
                                     │                         │                      │
                                  (error)                   (error)                (error)
                                     │                         │                      │
                                     └─────────────────────────┴──────────────────────┘
                                                               ▼
                                                             IDLE
```

## Error Handling Rules

- `TranscriptionError.networkTimeout` → retry 2x with 500ms backoff, then surface
- `TranscriptionError.invalidApiKey` → surface immediately, no retry
- `TranscriptionError.localModelNotFound` → surface immediately, no retry (binary absent from resources/bin)
- `TranscriptionError.localTranscriptionFailed` → surface immediately, no retry (process error or bad output)
- `RecorderError.permissionDenied` → surface immediately, no retry
- `InjectorError.readOnlyTarget` → surface immediately with user-readable message
- Stream errors mid-recording → `pendingResolve` pattern resolves stop() immediately
  without waiting for the `finish` event (which may never fire after a stream error)

## Code Style

- Functional, no classes (exception: nut-js requires object use — wrap in functions)
- Fully typed, no `any` — use `as unknown as T` for SDK type gaps, with a comment
- `Result<T, E>` for all service return types
- Named exports only (no default exports)
- Tests mock at service boundary — never mock internal implementation details
- `vi.hoisted()` for shared mock state in vitest (required for ESM + vi.mock factories)

## Dependency Notes

- **nut-js**: use `@nut-tree-fork/nut-js` — the original `@nut-tree/nut-js` 404s on npm
- **FFmpeg** (audio recording): bundled at `resources/bin/ffmpeg.exe`, falls back to system PATH.
  DirectShow input uses Windows GUID form (`audio=@device_cm_{33D9A762-...}\wave:{...}`) rather than
  `audio=<name>` — the GUID is layout-independent and matches any default Windows audio device.
- **whisper-cli.exe** (local transcription sidecar): **bundled** via `extraResources` (`resources/bin/whisper-cli.exe` + `whisper-server.exe`). Fast tier `ggml-tiny.en.bin` ships in the installer; Balanced/Accurate are one-click SHA-gated downloads to `userData/models`. `whisper-cli.exe` v1.9+ is invoked with `--output-txt --output-file <tmpdir>/speakflow-<id>`; output file is `<output-file>.txt`. `whisper-server.exe` is the resident HTTP inference server for Balanced/Accurate tiers (loopback, warm model). All tier models are verified against `resources/bin/models.sha256` before use.
- **groq-sdk v0.7**: `audio.transcriptions.create({ response_format: "text" })` returns a plain
  `string` at runtime but the TS types declare `Transcription`. Use `response as unknown as string`
  with a comment explaining the SDK gap.
- **Network errors**: classify by `error.code` (`ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`, etc.)
  not by message string matching. Falls back to `message.includes("fetch failed")` for SDK wrapping.
- **uiohook-napi** (global hotkey): replaces the archived `node-global-key-listener`.
  Uses `SetWindowsHookEx(WH_KEYBOARD_LL)` via libuiohook — no spawned exe, no AV flags.
  Modifier state (`ctrlKey`, `shiftKey`) is embedded in every `UiohookKeyboardEvent`; do NOT
  reintroduce manual modifier tracking. `UiohookKey.R = 19` (hardware scan code, layout-independent).
  Must call `uIOhook.start()` after registering handlers, and `uIOhook.stop()` on shutdown.
- **Known hotkey conflict**: Ctrl+Shift+R is also Chrome's force-reload shortcut. The OS hook
  fires first (daemon works), but Chrome also reloads. Consider Ctrl+Alt+R for a future change.

## Environment

- Windows 11 only (current scope)
- Node.js ≥ 20, TypeScript 5.x, ESM modules
- FFmpeg for audio recording — bundled binary takes priority:
  - Packaged app: `resources/bin/ffmpeg.exe` (auto-unpacked from ASAR via `extraResources`)
  - Dev mode: place `ffmpeg.exe` in `resources/bin/`, or install system-wide: `winget install ffmpeg`
- Groq API key in `.env` as `GROQ_API_KEY=...`
- For startup-task (non-npm) use: set `GROQ_API_KEY` as a Windows environment variable

## dist/ Hygiene

`dist/` is produced exclusively by `tsc` (and `dist-ui/` by Vite). Electron loads
`package.json "main"` (`dist/electron-main.js`) and only modules reachable via its
static/dynamic import graph — it does **not** scan or auto-execute other files in
`dist/`. However, stray files there can still cause harm via:
- A wrong entry command (`electron dist/some-debug.js`) or a packager glob (`"dist/**/*"`)
  pulling them into the installer.
- Accidental `node dist/broken-artifact.js` execution during CI or local debugging.
- `node --check` / lint passes that flag syntax errors in unrelated files.

**Guardrail — never write scratch outputs into `dist/`:**
- Use `scripts/` for one-off helper scripts.
- Use a system temp dir or a project-local `tmp/` (already in `.gitignore`) for
  patched / instrumented copies of compiled files.
- After `npm run build`, optionally gate on: `node --check dist/**/*.js` to confirm
  every compiled file is syntactically valid before launching Electron.

## What NOT to do

- Do not add Svelte/React/TanStack until Phase 2 (tray UI) ← **Phase 2 complete; Svelte is now in use**
- Do not add Tauri until Phase 3 (cross-platform)
- Do not add retry logic to injector — if paste fails, user re-triggers
- Do not store audio blobs beyond the current recording session
- Do not expose the raw API key in logs, even with slicing — always use `MASKED_KEY`
- Do not allow state machine re-entry — check `state === "IDLE"` before any transition
- Do not expose `window.electronAPI` raw keys in DOM — API key display is always `sk-***`
- Do not use ESM `import from "electron"` in preload scripts — use `require("electron")` via `.cts` (CJS TypeScript) to avoid contextBridge silent failures

---

## Phase 2: Electron + Svelte Tray UI

### New Files

```
src/electron-main.ts           ← Electron entry point (replaces CLI index.ts)
src/preload.cts                ← CJS preload compiled to dist/preload.cjs
src/types/ipc.ts               ← Shared IPC payload types (StateChangePayload, ConfigUpdatePayload)
src-ui/                        ← Svelte renderer (compiled to dist-ui/ by Vite)
  App.svelte
  main.ts
  global.d.ts                  ← Window type augmentation for electronAPI
  stores/daemon.ts             ← Svelte writable store wired to IPC
  components/
    StatusBar.svelte           ← Indicator light + waveform + timer
    TranscriptPreview.svelte   ← Shows transcript after paste; auto-clears 10s
    ApiKeyPanel.svelte         ← Masked API key display + edit/save
    HotkeyEditor.svelte        ← Key capture + live hotkey re-registration
    SettingsModal.svelte       ← Model/language/verbosity settings
  __tests__/                   ← Vitest + @testing-library/svelte component tests
vite.config.ts                 ← Svelte build config (root: src-ui, base: "./")
vitest.ui.config.ts            ← Svelte component test config
tests/integration/
  electron.test.ts             ← Playwright + Electron end-to-end tests
playwright.config.ts           ← Playwright config (testDir: tests/integration)
```

### IPC Channels

| Channel | Direction | Payload |
|---------|-----------|---------|
| `state-change` | main → renderer | `StateChangePayload { state, transcript?, error? }` |
| `config-update` | renderer → main | `ConfigUpdatePayload { groqApiKey?, model?, language?, hotkey? }` |
| `hide-window` | renderer → main | none |
| `copy-to-clipboard` | renderer → main | `string` |
| `test:set-state` | renderer → main | `StateChangePayload` (TEST_MODE only) |

### Preload Pattern

Always use `.cts` (CJS TypeScript) for preload scripts:

```typescript
// src/preload.cts — compiles to dist/preload.cjs
const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");
contextBridge.exposeInMainWorld("electronAPI", { ... });
```

Reference in electron-main.ts: `preload: join(__dirname, "preload.cjs")`

**Never** use ESM `import { contextBridge } from "electron"` in preloads — this causes `contextBridge.exposeInMainWorld` to fail silently, leaving `window.electronAPI` undefined in the renderer.

### Svelte Component Conventions

- All components read from `daemonStore` (writable Svelte store in `src-ui/stores/daemon.ts`)
- Components use `window.electronAPI` methods for IPC — always guard with `if (window.electronAPI)`
- The `src-ui/tsconfig.json` sets `verbatimModuleSyntax: true` to prevent TypeScript from eliding Svelte component imports (which are only referenced in HTML templates, not script blocks)
- `vite.config.ts` also sets `esbuild.tsconfigRaw.verbatimModuleSyntax: true` for the same reason

### New Invariants (Phase 2)

9. **API key masked in renderer** — `window.electronAPI.sendConfigUpdate({ groqApiKey })` is the only path to update the key; the raw value must never appear in DOM text nodes, console logs, or IPC channel names.
10. **Preload must be CJS** — compile from `.cts` source, load via `preload.cjs`. ESM preloads with contextIsolation silently fail in Electron + Playwright environments.
11. **Svelte imports need verbatimModuleSyntax** — always keep `verbatimModuleSyntax: true` in both `src-ui/tsconfig.json` and `vite.config.ts`'s `esbuild.tsconfigRaw`. Removing it causes component imports to be elided (5.9 kB bundle with undefined components at runtime).
12. **No bare returns from non-IDLE state** — Any function that reads `state` and may
    transition it forward (IDLE → RECORDING, or any non-IDLE state) must call
    `resetToIdle()` on every exit path that does not complete the transition. A bare
    `return` while state ≠ IDLE is forbidden; it leaves the state machine permanently
    stuck and silently blocks all future pipeline runs via Invariant #6.

### MCP Stdio Server Mode

Start with `--mcp` flag: `electron . --mcp` (or `node dist/electron-main.js --mcp` in dev).

In MCP mode the process:
- Skips all UI, tray, hotkey registration, and state machine setup
- Reads JSON-RPC 2.0 requests from `process.stdin` (newline-delimited)
- Writes JSON-RPC 2.0 responses to `process.stdout` exclusively

**Critical constraint**: `process.stdout` is reserved for JSON-RPC only. Any `console.log` or
`process.stdout.write` added to code that runs in MCP mode corrupts the transport silently.
All debug output in MCP mode must go to `process.stderr` (use the `log()` helper in `runMcpServer`).

### Test Commands

```bash
npm test                   # Phase 1 regression (24 tests — must always pass)
npm run test:ui            # Svelte component unit tests (26 tests)
npm run test:integration   # Playwright Electron end-to-end (6 tests)
npm run typecheck          # Zero TS errors required
npm run package            # Build NSIS installer → dist-installer/*.exe
```

### Integration Test Pattern

Playwright Electron tests inject state via `electronApp.evaluate` (main process), not `page.evaluate` (renderer). `contextBridge`-exposed APIs are not accessible via CDP `page.evaluate` calls:

```typescript
// CORRECT — injects from main process via BrowserWindow.webContents.send
await electronApp.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.webContents.send("state-change", { state: "RECORDING" });
});

// WRONG — window.electronAPI is undefined in Playwright's CDP evaluate context
await page.evaluate(() => {
  window.electronAPI.testSetState({ state: "RECORDING" }); // throws
});
```
