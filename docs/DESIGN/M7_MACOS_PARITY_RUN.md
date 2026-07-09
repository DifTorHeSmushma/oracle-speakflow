# M7 Wave 7a — macOS native parity (no physical Mac)

**Milestone:** M7 (macOS slice)  
**Date:** 2026-07-09  
**Authority:** `INTENT-m7-cross-platform-native-parity.md` (Gate B7)  
**Build from:** Windows 11 — verify on GitHub `macos-latest` + Mac tester artifact  

---

## Goal

Ship **macOS feature parity** for the core dictation loop (not Linux yet):

- FFmpeg **avfoundation** mic capture (`:0` default)
- **AppleScript** foreground tracking (pseudo `darwin:AppName` hwnd)
- **Cmd+V** paste via nut-js
- **Yield-focus** ladder (hide window → re-verify frontmost app)
- Mic **entitlements** + `NSMicrophoneUsageDescription`
- **Mac Package** CI installs FFmpeg via Homebrew

**Out of scope this wave:** bundled local Whisper on Mac, notarization, Linux (→ Fable 5 STORM next).

---

## Gates

| Gate | Type | Pass when |
|------|------|-----------|
| **G7a-1** | auto | `npm run typecheck && npm test` green on Windows |
| **G7a-2** | auto | `Mac Package` workflow_dispatch green |
| **G7a-3** | auto | G23-runner bundle verify on cloud Mac |
| **G7a-4** | human | Mac tester: mic + cloud transcribe + paste into Notes/Cursor (optional until tester available) |

---

## Implementation checklist

- [x] `src/utils/avfoundation-audio.ts` — `:0` default mic
- [x] `src/utils/darwin-window.ts` — frontmost app via osascript
- [x] `src/utils/binaryNames.ts` — `ffmpeg` vs `ffmpeg.exe`
- [x] `capture.ts` / `recorder.ts` — avfoundation on darwin
- [x] `electron-main.ts` — Cmd+V, yield-focus on darwin, foreground capture
- [x] `build/entitlements.mac.plist` + `package.json` mac extendInfo
- [x] `mac-package.yml` — `brew install ffmpeg`
- [ ] Trigger `Mac Package` workflow_dispatch after push
- [ ] Mac tester smoke (when available)

---

## Mac tester instructions (send with Drive .zip link)

1. Unzip → right-click **Oracle SpeakFlow.app** → **Open**
2. System Settings → Privacy & Security → **Microphone** → allow SpeakFlow
3. System Settings → Privacy & Security → **Accessibility** → allow SpeakFlow (paste)
4. Tray → Settings → Account → Groq API key → Save
5. Open **Notes** or **Cursor** → click in text field → speak hands-free
6. Text should paste via **Cmd+V** path

---

## After this wave

1. **Fable 5 STORM** for Linux (`FABLE5-STORM-LINUX-COMMISSION.md`)
2. WARGAME → PRD → Spec → `linux-package.yml` + paste-linux backend
