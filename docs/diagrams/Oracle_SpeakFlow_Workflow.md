# Oracle SpeakFlow Workflow (study map)

**Diagram:** [Indigo poster](./Oracle_SpeakFlow_Workflow_Indigo.png) · [Excalidraw source](./Oracle_SpeakFlow_Workflow_Indigo.excalidraw)

**Palette:** [color-palette.md](./color-palette.md)

**Regenerate PNG after editing `.excalidraw`:**

```bash
python docs/diagrams/patch_workflow_m6.py   # only if re-applying M6 text map
node docs/diagrams/export_workflow_png.mjs
```

---

## Legend

| Color | Meaning |
|-------|---------|
| Indigo | Capture layer — FFmpeg, Silero VAD, mic gain |
| Purple | Intelligence — Groq / local Whisper, tier ladder, dictionary correction |
| Green | Delivery — yield-focus guard, Ctrl+V paste, clipboard fallback |
| Red square | Mute button — mic device closed |
| Square cards | State machine steps |

---

## Three interwoven circles (equilateral Venn)

Three **equal** circles arranged in a triangle — each centre is the same distance from a shared hub, so all three overlap equally at the middle (MIC emblem).

| Position | Layer | Role |
|----------|-------|------|
| Top | **INTELLIGENCE** | Groq cloud or bundled whisper-cli (Windows), 3-tier ladder, personal dictionary |
| Lower left | **CAPTURE** | FFmpeg per-OS mic (dshow / avfoundation / pulse), Silero VAD, mic gain |
| Lower right | **DELIVERY** | Yield-focus guard, Ctrl/Cmd+V, clipboard fallback |

Each utterance flows through all three in one pipeline pass.

---

## State machine (timeline)

| State | What happens |
|-------|----------------|
| **LISTENING** | Hands-free armed; VAD watching; mic open |
| **RECORDING** | Speech detected; ring buffer active |
| **TRANSCRIBING** | Groq cloud or local whisper-cli; tier picker (Fast / Balanced / Accurate) |
| **CORRECTING** | Personal dictionary pass (spoken → written) |
| **INJECTING** | Paste into focused text field (yield-focus; clipboard if SpeakFlow focused) |
| **→ LISTEN** | Loop back (hands-free primary) |

**Mute button:** Mute bar or tray → FFmpeg stops, mic released (OS indicator dark).

**PTT fallback:** Hold F8 anytime — same pipeline, keyed start/stop instead of VAD.

**Paste tip (M6):** User must **focus the target app before speaking**. If SpeakFlow's own window is focused, text goes to clipboard — not the wrong window.

---

## Platforms (build proof)

| Platform | Status |
|----------|--------|
| **Windows** | Shipped — bundled Fast tier, offline local |
| **macOS** | Beta — GitHub cloud Mac Package + G23-runner; cloud transcribe |
| **Linux** | CI package — deb/AppImage + G28 launch; human X11 G32 smoke pending |

---

## Eye path

Title → L1 summary strip → triangle Venn → state timeline → evidence cards → platform/user-tips card → footer loop → legend.

---

## About the developer

**Dom** — Kru Muay Thai; self-taught AI coding daily for 18 months; now in structured study sabbatical, full-time on engineering.

Oracle SpeakFlow is free and open source. Support: [Buy Me a Coffee](https://www.buymeacoffee.com/oraclespeakflow) · [GitHub Sponsors](https://github.com/sponsors/DifTorHeSmushma)
