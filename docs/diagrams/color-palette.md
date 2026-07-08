# Oracle SpeakFlow Diagram Palette

**Use for:** Excalidraw architecture / workflow posters (dark workshop style)

| Role | Hex | Usage |
|------|-----|--------|
| Canvas | `#1a1a1a` | Background |
| Title / accent | `#a5b4fc` | Headlines, indigo glow |
| Primary indigo | `#6366f1` | Capture ring, CTAs |
| Intelligence purple | `#a855f7` | Transcription / correction |
| Success green | `#22c55e` | Paste / listening armed |
| Warning amber | `#eab308` | Transcribing state |
| Error red | `#f87171` | Mute button |
| Card dark | `#27272a` | Evidence squares |
| Card border | `#3f3f46` | Square workflow cards |
| Body text | `#e4e4e7` | Labels |
| Muted | `#71717a` | Annotations |
| Arrow | `#94a3b8` | Flow connectors |
| Coffee gold | `#FFDD00` | Support / sponsor strip |

**Semantic mapping**

- **Indigo circle** — Capture layer (FFmpeg, Silero VAD, mic gain)
- **Purple circle** — Intelligence layer (Groq / local Whisper, dictionary)
- **Green circle** — Delivery layer (HWND guard, Ctrl+V, clipboard fallback)
- **Square cards** — State machine steps
- **Red square** — Mute button (mic device closed)
