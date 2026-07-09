# Oracle SpeakFlow

<div align="center">

![Oracle SpeakFlow Workflow](docs/diagrams/Oracle_SpeakFlow_Workflow_Indigo.png)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/oraclespeakflow)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor%20on%20GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/DifTorHeSmushma)
[![MIT License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge)](LICENSE)

</div>

Fast voice-to-text for anyone who types: speak naturally — **hands-free** or with a hotkey — and your transcript is pasted into **whatever app already has focus** (IDE, browser, chat, docs, email, terminal, and more).

**Listen → Transcribe (Groq cloud or local Whisper) → Correct → Paste where you're typing**

<div align="center">

![Oracle SpeakFlow — hands-free listening UI](docs/assets/app-screenshot.png)

</div>

## About the developer

**My name is Dom.** I'm a **Kru Muay Thai** — I train and teach Muay Thai, and for the past **18 months** I've been **self-teaching AI coding every day**. I've recently moved into a more **structured study sabbatical**, full-time focused on building my development environment and tools like SpeakFlow.

Oracle SpeakFlow is **free and open source** — offered to anyone who wants hands-free voice input wherever they type.

Any assistance — buying me a coffee or a donation — is greatly appreciated and genuinely helpful.

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/oraclespeakflow)

**Workflow diagram:** [Indigo poster](docs/diagrams/Oracle_SpeakFlow_Workflow_Indigo.png) · [Excalidraw source](docs/diagrams/Oracle_SpeakFlow_Workflow_Indigo.excalidraw) · [Study map](docs/diagrams/Oracle_SpeakFlow_Workflow.md)

## Platform support

| Platform | Status | What you get |
|----------|--------|----------------|
| **Windows** | ✅ Shipped | NSIS installer (`npm run package`); bundled local Whisper (Fast tier); hands-free + paste |
| **macOS** | 🟡 Beta (CI-built) | `.dmg` + `.zip` from **Mac Package** workflow. **Parity wave 7a:** avfoundation mic, Cmd+V paste, Accessibility. Grant **Microphone** + **Accessibility** in System Settings. Cloud transcribe; local Whisper not bundled yet. Gatekeeper: right-click → **Open**. |
| **Linux** | ⏳ In progress (M7) | Ubuntu CI runs tests on every push — **no installable build yet** |

> **Honest scope:** Windows is the full product today. macOS is a **proof build** (launch + cloud transcribe), not full parity. Linux packaging is the next milestone.

## User guide

For **Windows installer** or **macOS beta** testers — no coding required.

### Install

| Platform | How |
|----------|-----|
| **Windows** | Run `Oracle SpeakFlow Setup *.exe` from `dist-installer/` (or ask your builder for the installer file). |
| **macOS beta** | Download the `.zip` artifact from a **Mac Package** CI run. Unzip → right-click **Oracle SpeakFlow.app** → **Open** (Gatekeeper may block on first launch). |

SpeakFlow runs from the **system tray**. Click the tray icon to open the panel.

### First-run setup (Groq API key)

Required for **cloud mode** (default). Required on **macOS beta** (local Whisper is not bundled on Mac yet).

1. Click the **tray icon** → **Settings** (top-right of the panel).
2. Open the **Account** tab.
3. Enter your Groq API key → save.
4. Get a free key at https://console.groq.com/

Your key is stored locally in `%APPDATA%\oracle-speakflow\.env` (Windows) — never in the repo.

Click **Save** at the bottom of Settings when you change Voice or Engine tabs. The **Dictionary** tab saves each entry automatically when you click **Add**.

### Daily use

1. Click the **tray icon** to open SpeakFlow (you can leave it open or close it — listening continues from the tray).
2. Click into the **text field** where you want dictation (Notepad, browser, IDE, chat, email, etc.).
3. **Speak naturally** (hands-free — VAD detects start/stop) **or** hold **F8** → speak → release.
4. Corrected text is **pasted into the focused app**.
5. Click the **mute bar** (below the status area) before calls or when you need privacy.

**Important — paste tip:** SpeakFlow pastes into **whatever app already has focus**. If the **SpeakFlow window** is focused when you finish speaking, text may **not** paste into your editor — it goes to the **clipboard** with a toast instead. **Click your target app first**, then speak.

**Alt-tab safety:** If you switch apps mid-utterance, text goes to the **clipboard** — never the wrong window. Press Ctrl+V where you want it.

### Personal dictionary (fix words Whisper gets wrong)

Use this for names, commands, and phrases you say often.

1. Tray icon → **Settings** → **Dictionary** tab.
2. **Spoken** — what Whisper tends to hear (e.g. `npm run type check`).
3. **Written** — what you want pasted (e.g. `npm run typecheck`).
4. **Match mode:**
   - **Phrase** — replaces the spoken text anywhere it appears in the transcript (best for multi-word commands).
   - **Whole word** — only replaces when the spoken text is a complete word (best for names like `TypeScript` vs `typescript`).
5. Click **Add** — saves immediately.
6. Use the **checkbox** to temporarily disable an entry; **✕** to delete.
7. **Export JSON** / **Import JSON** — backup or move your dictionary between machines.

Dictionary runs **after** transcription, **before** paste. Entries are stored in `%APPDATA%\oracle-speakflow\dictionary.json` and survive app upgrades.

### Engine: cloud vs local (Windows)

| Mode | When to use |
|------|-------------|
| **Cloud (Groq)** | Default. Fast, low latency. Needs internet + API key. |
| **Local (Whisper)** | Offline. Bundled on the **Windows installer** — no manual `whisper-cli` download. |

**Switch to local (Windows installer):**

1. Settings → **Engine** tab.
2. Select **Local (Whisper)**.
3. Pick a **model tier:**
   - **Fast** — bundled with the installer (~78 MB). Works offline out of the box.
   - **Balanced** / **Accurate** — click **Download** in the tier picker (one-time, SHA-verified).
4. Click **Save** at the bottom of Settings.
5. Focus your target app → speak as usual.

**macOS beta:** use **Cloud (Groq)** for now. After install, grant **Microphone** and **Accessibility** (System Settings → Privacy & Security). Local Whisper bundling is a later M7 slice.

### Voice settings (optional)

Settings → **Voice** tab:

- **Hands-free** vs **Push-to-talk (F8)**
- VAD sensitivity sliders (if hands-free cuts off too early or too late)
- **Terminal paste mode** — uses Shift+Insert in terminals instead of Ctrl+V
- Hotkey editor (default **F8**)

Click **Save** after changes.

## Current release status

| Milestone | Status | What you get |
|-----------|--------|----------------|
| **Phase 3 Pro** | ✅ Shipped on `main` | Electron tray UI, F8 push-to-talk, waveform, MCP bridge, tabbed settings |
| **Quantum Leap — Wave 2** | ✅ Shipped + smoke-signed | Hands-free VAD (Silero), mute kill-switch, paste guard, HWND focus ladder |
| **Quantum Leap — Wave 3** | ✅ Shipped + smoke-signed | Voice settings UI, personal dictionary UI, listening indicator, NSIS packaging |
| **Local intelligence** | ✅ On `main` | Cloud vs Local mode, model downloader, whisper-cli sidecar wiring (Windows) |
| **Windows installer** | ✅ `npm run package` | NSIS (`dist-installer/`), bundled VAD model + ONNX runtime unpack |
| **macOS CI build** | ✅ Beta | `mac-package.yml` → DMG/ZIP artifacts; G23-runner bundle verify on cloud Mac |
| **Linux installer** | ⏳ M7 | Planned — AppImage/deb + native paste/hotkey/mic |

> **Repo visibility:** The GitHub repository may still be **private** during active development. Clone and the Sponsor button work once the repo is public. Support links below work regardless.

## Features

### Core (daily use)

- **Hands-free mode (primary):** Silero VAD detects speech start/stop — no hotkey required
- **Push-to-talk:** Default hotkey **F8** (hold to record, release to transcribe and paste)
- **Mute kill-switch:** Full-width mute bar closes the mic device (OS mic dot goes dark)
- **Listening indicator:** Mic/mute state + one-time privacy explainer on first launch
- **Groq cloud transcription:** Low-latency Whisper via API (free tier supported)
- **Deterministic correction:** Whitespace + dev-term casing (`TypeScript`, `npm`, etc.)
- **Personal dictionary:** Spoken → written replacements (JSON import/export)
- **Direct paste:** Foreground-window guard + clipboard + Ctrl+V (Shift+Insert option for terminals)
- **System tray UI:** Compact panel (320×500) with live status, waveform, transcript preview

### Settings (tabbed modal)

| Tab | Contents |
|-----|----------|
| **Voice** | Hands-free / PTT, VAD sliders, kill-switch info, hotkey editor, terminal paste mode |
| **Dictionary** | Add/edit entries, phrase vs word match, import/export JSON |
| **Engine** | Groq model, language, Cloud vs Local transcription, model downloader |
| **Account** | Groq API key |
| **Support** | Buy Me a Coffee, GitHub Sponsors, repo link |

### Pro / integrations

- **Dark theme** with shared design tokens (zinc / indigo)
- **Real-time waveform** while listening and recording
- **MCP headless server** (`--mcp`): transcript tools for AI agents
- **Configurable hotkey** with one-time migration from legacy Ctrl+Alt+* bindings

### Local intelligence

- **Transcription mode:** Cloud (Groq) or Local (Whisper sidecar)
- **Model downloader:** `ggml-tiny.en.bin` to user data with SHA-256 verification
- **Offline path** when local model + `whisper-cli.exe` are present

## Quick start (developers)

### 1. Clone and install

```bash
git clone https://github.com/DifTorHeSmushma/oracle-speakflow.git
cd oracle-speakflow
npm install
```

### 2. API key (Groq — cloud mode)

Config is stored under `%APPDATA%\oracle-speakflow\` (Windows):

- `.env` — API key, voice mode, VAD, hotkey
- `dictionary.json` — personal dictionary (separate file, survives upgrades)

On first run, open the tray UI → **Settings → Account**, or set:

```env
GROQ_API_KEY=your_key_here
```

Get a free key at https://console.groq.com/

### 3. Build and run

**After `git pull` or code changes:**

```bash
npm run start:app
```

**Daily launch** (no rebuild):

```bash
npm run start:electron
```

Equivalent manual steps: `npm run build && npm run build:ui && npm run start:electron`

### 4. Use it

1. Click the **system tray** icon.
2. Focus the **text field** where you want dictation (any app).
3. **Speak** (hands-free) or **hold F8** → speak → **release**.
4. Click the **mute bar** before calls or when you need privacy.
5. Open **Settings** for voice mode, dictionary, engine, and API key.

**Alt-tab safety:** Stay in your target window while speaking. If you switch apps mid-utterance, text goes to the **clipboard** with a toast — never the wrong window. Press Ctrl+V where you want it.

### Local mode (developers — from source)

If you run from `git clone` / `npm run start:app` (not the Windows installer):

1. Settings → **Engine** → **Local (Whisper)**.
2. **Fast tier** — bundled when you run `npm run package`; for dev, place `whisper-cli.exe` and `ggml-tiny.en.bin` in `resources/bin/` (see `docs/DESIGN/`).
3. Larger tiers — **Download** in the tier picker (Settings → Engine).
4. Click **Save** → focus target app → speak.

**Windows installer users:** skip the manual `resources/bin/` step — engine + Fast model are already bundled.

### Windows installer

```bash
npm run package
```

Output: `dist-installer/Oracle SpeakFlow Setup *.exe`. User data in `%APPDATA%\oracle-speakflow` is **not** wiped on upgrade.

## How it works

```
LISTENING ──(speech)──► RECORDING ──(silence)──► TRANSCRIBING ──► CORRECTING ──► INJECTING ──► LISTENING
         PTT: F8 down ──► RECORDING ──(F8 up)──► … same pipeline …
```

- **Capture:** FFmpeg (bundled or PATH) + Silero VAD ONNX
- **Transcription:** Groq API (remote) or `whisper-cli.exe` (local)
- **Correction:** Deterministic rules → personal dictionary (authoritative last)
- **Injection:** Mute check → foreground guard → clipboard + nut-js paste

See the [workflow diagram](docs/diagrams/Oracle_SpeakFlow_Workflow_Indigo.png) for the full architecture.

### Key paths

| Path | Role |
|------|------|
| `src/electron-main.ts` | Main process, state machine, pipeline, IPC |
| `src/preload.cts` | Renderer bridge (`window.electronAPI`) |
| `src-ui/` | Svelte tray UI |
| `src/services/` | Capture, VAD, transcription, correction, dictionary, paste |
| `docs/DESIGN/` | PRDs, Quantum Leap spec, smoke sign-off |
| `docs/diagrams/` | Excalidraw workflow poster |

## Development

### Prerequisites

- Node.js **20+**
- **Windows** — primary dev and ship target
- **macOS** — CI packages via `Mac Package` workflow; local Mac dev optional
- **Linux** — CI test matrix only until M7 ships an installer
- FFmpeg on PATH for dev, or `resources/bin/ffmpeg.exe` (Windows)
- Groq API key for cloud mode (required on macOS beta; optional on Windows if using local mode)

### Scripts

```bash
npm run start:app        # Rebuild + launch (after code changes)
npm run start:electron   # Launch only (daily use)
npm run typecheck        # TypeScript
npm test                 # Unit tests (138)
npm run test:ui          # Svelte component tests (38)
npm run test:integration # Playwright + Electron
npm run build            # Compile main process
npm run build:ui         # Build tray UI → dist-ui/
npm run package          # electron-builder → dist-installer/
```

### Validation gates (before merge)

```bash
npm run typecheck && npm test && npm run test:ui && npm run test:integration
```

## Configuration (user data)

| Variable / file | Purpose |
|-----------------|---------|
| `GROQ_API_KEY` | Groq API key (required for cloud mode) |
| `SPEAKFLOW_VOICE_MODE` | `handsFree` (default) or `ptt` |
| `SPEAKFLOW_HOTKEY` | JSON hotkey config (default F8) |
| `SPEAKFLOW_VAD` | JSON VAD tuning (thresholds, hangover, pre-roll) |
| `SPEAKFLOW_CORRECTION` | JSON correction config (`llmEnabled` off by default) |
| `SPEAKFLOW_TERMINAL_VARIANT` | `true` = Shift+Insert in terminals |
| `SPEAKFLOW_FIRST_RUN_DISMISSED` | One-time privacy explainer dismissed |
| `SPEAKFLOW_TRANSCRIPTION_MODE` | `remote` or `local` |
| `SPEAKFLOW_MODEL` | Groq model id |
| `SPEAKFLOW_LANGUAGE` | Language code |
| `dictionary.json` | Personal dictionary (import/export via Settings) |

Location: `%APPDATA%\oracle-speakflow\`

## MCP (AI agents)

Headless stdio server for Claude Desktop, IDE agents, and other MCP clients:

```bash
npm run build
electron dist/electron-main.js --mcp
```

See `docs/DESIGN/MILESTONE_3_PRD.md`.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| UI looks old / no waveform | `npm run start:app` after `git pull`; kill stale `electron.exe` |
| “Sometimes works, sometimes not” | One instance only (tray → Quit); check `.env` for API key |
| Paste goes to wrong window | Focus target field **before** speaking; alt-tab → clipboard fallback |
| Nothing pastes when SpeakFlow window is focused | Click your editor/chat first — paste targets the **focused** app, not SpeakFlow |
| Local mode fails (installer) | Settings → Engine → Local; ensure **Fast** tier shows available; click **Save** |
| Local mode fails (dev clone) | Add `whisper-cli.exe` + model to `resources/bin/` or use **Download** for tiers |
| Old installed `.exe` shows stale UI | Uninstall `%LOCALAPPDATA%\Programs\Oracle SpeakFlow\`; use dev launch |

## Roadmap

- [x] **Phase 1–2:** Daemon, Groq transcription, Electron tray UI
- [x] **Phase 3 Pro:** F8 default, waveform, MCP, design tokens, settings
- [x] **Quantum Leap Wave 2:** Hands-free VAD, mute, paste guard, correction pipeline
- [x] **Quantum Leap Wave 3:** Voice + dictionary settings UI, installer bundling
- [x] **Local intelligence:** Cloud/local mode + model downloader
- [x] **Visual redesign:** shadcn-svelte Card layout, tabbed Settings Dialog
- [x] **macOS (M6):** CI-built DMG/ZIP + G23-runner verify — beta, cloud path (proof not parity)
- [ ] **Linux (M7):** Installable build + native paste/hotkey/mic
- [ ] **macOS parity (M7):** Native paste, hotkeys, mic, bundled local Whisper
- [ ] **LLM correction pass:** Opt-in polish (not implemented; adds cost + latency)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) (invariants and architecture).

## Privacy

- Audio sent to **Groq** only in **cloud** mode.
- **Local** mode processes audio on device when configured.
- No transcript text logged to disk by default.
- API key stored in user data (keychain deferred — see `docs/DESIGN/ADR-0001-nfr04-keychain-deferral.md`).

## Support the project

Oracle SpeakFlow is **free and MIT open source**. If it saves you time, consider supporting development during my study sabbatical.

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/oraclespeakflow)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor%20on%20GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/DifTorHeSmushma)

GitHub also shows a **Sponsor** button via [`.github/FUNDING.yml`](.github/FUNDING.yml) (`buy_me_a_coffee: oraclespeakflow`, `github: DifTorHeSmushma`).

## License

MIT — see [LICENSE](LICENSE)

---

Built for accessible, flow-state voice input — wherever you type.
