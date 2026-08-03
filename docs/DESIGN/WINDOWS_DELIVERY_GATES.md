# Windows Dictation Delivery — Automated Gate Matrix

> **Authority:** `PRD-windows-dictation-delivery-brownfield.md` §6/§8 + issue [#11](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/11)
> **Rule:** every gate below is automated. **No human smoke run is a merge gate.**
> **Dom HITL (#11):** Notepad-only green is **not** proof Cursor works.

Run everything with:

```bash
npm run validate:gates
```

---

## Gate matrix

| Gate | Metric | Proves | Command | Floor |
|------|--------|--------|---------|-------|
| G-D1 | M1 | Notepad-class HWND receives finalize text, 10/10 | `npm run check:delivery` | yes |
| G-D1b | M1/#11 | Electron/`Chrome_WidgetWin` host receives text via **restore+Ctrl+V** | `npm run check:delivery:electron` | yes |
| G-D2 | M2 | No keystroke paste into SpeakFlow's own window | delivery unit tests | yes |
| G-D3 | M3 | 2.0 s mid-pause does not false-finalize | vad tests | yes |
| G-D4 | M4 | Cloud STT timeouts typed; no opaque apiError(0) | transcription tests | yes |
| G-D5 | M5 | typecheck + unit suite + focus grep | compose | yes |
| G-D6 | M6 | No "Dom must smoke" merge checkbox | this doc + PR body | yes |

---

## Why G-D1b exists (issue #11)

PR [#10](https://github.com/DifTorHeSmushma/oracle-speakflow/pull/10) proved WM_PASTE into Notepad. Dom's job is **Cursor**. Chromium top-level HWNDs accept `SendMessage(WM_PASTE)` and ignore it — the old helper returned `ok`, `delivered=true`, and SpeakFlow showed the transcript preview (wrong surface) while Cursor stayed empty.

G-D1b:

1. Spawns a minimal Electron window (`Chrome_WidgetWin_*`) with a textarea.
2. Runs the production `restoreCapturedHwnd` + Ctrl+V path (same engine as Cursor delivery).
3. Polls the textarea contents via a side channel file until the marker appears.
4. Requires N/N rounds. Off Windows → `G-D1b SKIP` exit 0.

---

## Latency proof (floor C)

`%APPDATA%/Electron/latency.jsonl` (or the packaged app userData path) records:

- `transcribe_done` — `transcribeWallMs`, `settleSource` (`deepgram` | `speculative` | `groq` | `live-fallback`)
- `paste_complete` — `pasteCompleteMs`, `delivered`, `deliveryMethod`, `settleSource`

After speculative finalize has already run, SpeakFlow **must not** start a second Groq call (#11 ~60 s stack).

---

## Focus grep honesty (LD3)

`SetForegroundWindow` / `AttachThreadInput` remain forbidden in the paste planner and Electron main. The sole allowlisted site is `src/utils/win32-restore-captured.ts` with marker `ALLOW_CAPTURED_TARGET_RESTORE` — restore of the **speech-end captured** HWND only.

---

## What is explicitly not a gate

Dom running another Cursor trial by hand. Builder says ready only after G-D1b + latency fields prove the path.
