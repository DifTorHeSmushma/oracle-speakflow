# Oracle SpeakFlow Workflow (study map)

**Diagram:** [Indigo poster](./Oracle_SpeakFlow_Workflow_Indigo.png) · [Excalidraw source](./Oracle_SpeakFlow_Workflow_Indigo.excalidraw)

**Palette:** [color-palette.md](./color-palette.md)

---

## Legend

| Color | Meaning |
|-------|---------|
| Indigo | Capture layer — FFmpeg, Silero VAD, mic gain |
| Purple | Intelligence — Groq / local Whisper, dictionary correction |
| Green | Delivery — HWND guard, Ctrl+V paste, clipboard fallback |
| Red square | Mute button — mic device closed |
| Square cards | State machine steps |

---

## Three interwoven circles (equilateral Venn)

Three **equal** circles arranged in a triangle — each centre is the same distance from a shared hub, so all three overlap equally at the middle (MIC emblem).

| Position | Layer | Role |
|----------|-------|------|
| Top | **INTELLIGENCE** | Groq / local Whisper, personal dictionary |
| Lower left | **CAPTURE** | FFmpeg DirectShow, Silero VAD, mic gain |
| Lower right | **DELIVERY** | HWND guard, Ctrl+V, clipboard fallback |

Each utterance flows through all three in one pipeline pass.

---

## State machine (timeline)

| State | What happens |
|-------|----------------|
| **LISTENING** | Hands-free armed; VAD watching; mic open |
| **RECORDING** | Speech detected; ring buffer active |
| **TRANSCRIBING** | Audio sent to Whisper |
| **CORRECTING** | Personal dictionary pass (diamond) |
| **INJECTING** | Paste into focused text field |
| **→ LISTEN** | Loop back (hands-free primary) |

**Mute button:** Mute bar or tray → FFmpeg stops, mic released (OS indicator dark).

**PTT fallback:** Hold F8 anytime — same pipeline, keyed start/stop instead of VAD.

---

## Eye path

Title → L1 summary strip → triangle Venn → state timeline → evidence cards → developer card + Buy Me a Coffee → footer loop → legend.

---

## About the developer

**Dom** — Kru Muay Thai; self-taught AI coding daily for 18 months; now in structured study sabbatical, full-time on engineering.

Oracle SpeakFlow is free and open source. Support: [Buy Me a Coffee](https://www.buymeacoffee.com/oraclespeakflow) · [GitHub Sponsors](https://github.com/sponsors/DifTorHeSmushma)
