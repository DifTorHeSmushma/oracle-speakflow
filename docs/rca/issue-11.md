# Root Cause Analysis: GitHub Issue #11

## Issue Summary
- **GitHub Issue**: [#11](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/11)
- **Title**: HITL: Cursor miss + ~60s settle + SpeakFlow shown as paste surface (post-#9/#10)
- **Reporter**: Dom (HITL)
- **Severity**: Critical (blocks Dom's actual daily workflow — Cursor, not Notepad demos)
- **Status**: Open
- **Related**: PR [#10](https://github.com/DifTorHeSmushma/oracle-speakflow/pull/10) / issue [#9](https://github.com/DifTorHeSmushma/oracle-speakflow/issues/9) — Notepad-class G-D1 green; Dom falsified product claim

## Problem Description

**Expected Behavior**
After hands-free dictation into Cursor, finalize text lands in the Cursor chat/input field within the cloud STT budget (~25 s hard ceiling, typically much less). SpeakFlow UI must never look like the paste destination when Cursor is empty.

**Actual Behavior**
1. Text does **not** paste into Cursor.
2. End-to-end wait is nearly **~60 seconds** after speech.
3. Text appears in SpeakFlow's **own** app window (wrong surface).

**Symptoms**
- Notepad automated harness (G-D1) can be green while Dom's job (Cursor) fails.
- Dom experiences "it pasted into SpeakFlow."

## Reproduction Steps
1. Focus Cursor chat input; start hands-free dictation.
2. Speak a short utterance; wait for soft-finalize.
3. Observe: long wait (~60 s); transcript shows in SpeakFlow tray/window; Cursor input remains empty.

**Reproduction Verified**: Yes (Dom HITL report accepted as blocking truth — no re-smoke required to confirm).

## Root Cause

### Affected Components
- `src/utils/win32-paste-hwnd.ts` — false-positive "ok" on Electron hosts
- `src/services/delivery.ts` / `src/electron-main.ts` — trusts WM_PASTE return as delivery
- `src/electron-main.ts` (`runPipeline` settle) — speculative Groq + second Groq can stack timeouts toward ~60 s
- Preview gate — shows `showInactive` when `delivered=true` even if Cursor got nothing

### Analysis

#### A) Cursor miss + SpeakFlow as paste surface (floors A + B)

`pasteViaWmPaste()` looks for Win32 edit classes (`Edit`, `RichEditD2DPT`, …). Cursor / Electron use `Chrome_WidgetWin_1` with no such child. On miss, `FindEdit` **falls back to the root HWND** and still `SendMessage(WM_PASTE)`:

```33:55:src/utils/win32-paste-hwnd.ts
  public static IntPtr FindEdit(IntPtr root) {
    string[] classes = { "RichEditD2DPT", "RichEdit20W", "RichEdit20A", "Edit", "TextBox" };
    // ...
    return root;  // ← Chromium root: message accepted, content ignored
  }
```

The helper then returns `true` (`ok|…`) because the message was *sent*, not because text was *inserted*. Chromium/Electron ignores `WM_PASTE` on the top-level widget.

Downstream:

1. `executeDelivery` treats that as success → `delivered = true`.
2. `shouldShowTranscriptPreview({ delivered: true })` → `win.showInactive()` with the transcript.
3. Dom sees text "in SpeakFlow" while Cursor stays empty — exactly wrong-condition #1/#2 from the delivery PRD, and Dom floor B.

**Code Location**: `src/utils/win32-paste-hwnd.ts:33-75`, `src/electron-main.ts:418-446`, `src/electron-main.ts:1320-1327`

#### B) ~60 s last-word → UI (floor C)

Cloud path: `CLOUD_TRANSCRIBE_TIMEOUT_MS = 25_000` with `CLOUD_RETRY_ATTEMPTS = 1` → up to **~50.5 s** on a single `transcribe()` when Groq stalls.

Hands-free finalize additionally:

1. Starts a **speculative** Groq call mid-utterance / near hangover.
2. On speech-end, `runPipeline` **awaits** that speculative promise.
3. On speculative failure/timeout, it runs a **second** full `transcribe()` (`src/electron-main.ts:1049-1062`).

Worst case: speculative burns ~50 s, then finalize burns another ~25–50 s → Dom's ~60 s (and worse) is explained without needing a mystery hang. VAD redemption (~2.5 s) and PowerShell paste (~0.2–4 s) are secondary.

**Code Location**: `src/services/transcription.ts:23-31`, `src/electron-main.ts:1040-1068`

#### C) Why Notepad-only G-D1 missed this

G-D1 proves WM_PASTE into Notepad-class edit controls. Cursor is an Electron host. PRD §10 deferred Cursor to Phase-2; Dom HITL makes Phase-2 **blocking**. Notepad green ≠ Cursor works.

## Impact Assessment

| Dimension | Assessment |
|-----------|------------|
| Scope | All Windows hands-free finalize into Cursor / Electron / Chromium chat hosts |
| Dom job | Broken — primary daily target |
| Severity | Critical |
| Workaround | Manual clipboard paste (not acceptable as "success") |
| Security / data | None beyond wrong-surface UX |
| Gate honesty | Claiming #9 done with Notepad-only proof overstated product readiness |

## Proposed Fix

### Fix Strategy

1. **Honest WM_PASTE** — return success only when a real edit-class child was found. Never treat root-fallback Chromium HWND as delivered.
2. **Electron-host delivery path** — when captured target is Chromium/Electron (`Chrome_WidgetWin_*`, `Cursor.exe`, etc.) **or** WM_PASTE cannot find an edit child: use a **narrow restore-to-captured-HWND then Ctrl+V** helper (PRD LD3 / #11 floor A). Do not steal focus to arbitrary windows.
3. **Planner update** — prefer `restoreAndKeystroke` for hosts that cannot accept background WM_PASTE; keep WM_PASTE for Notepad-class.
4. **Wrong-surface hard stop** — never `showInactive` / never claim delivery unless the delivery engine for that host class reported verified success. Prefer: if restore+keystroke fails → clipboard toast **without** preview.
5. **Latency** — eliminate double Groq on finalize: if speculative already ran (success or timeout), do **not** start a second cloud attempt; use live fallback if present, else surface typed error. Cap finalize cloud wall; log `paste_complete` + `deliveryMethod` + `transcribeWallMs` to `latency.jsonl`.
6. **Automated proof** — new gate `check:delivery:electron` (or G-D1b): spawn a minimal Electron/`Chrome_WidgetWin` fixture with a contenteditable (or input), run restore+Ctrl+V delivery path, assert text present. Notepad G-D1 remains; Cursor-class gate is merge-blocking for #11.

### Files to Modify / Create

| Path | Change |
|------|--------|
| `src/utils/win32-paste-hwnd.ts` | Fail closed when no edit child; expose edit-found vs root-fallback |
| `src/utils/win32-restore-captured.ts` | **CREATE** — restore only a previously captured HWND (LD3); sole allowlisted `SetForegroundWindow` site |
| `scripts/check-focus-grep.mjs` | Keep forbid in paste path; allowlist restore helper with documented marker; still fail if used elsewhere |
| `src/services/delivery.ts` | Plan `restoreAndKeystroke` for Electron-class / non-edit hosts |
| `src/electron-main.ts` | Execute restore+keystroke; kill double Groq; tighten preview; latency fields |
| `src/services/transcription.ts` | Optional: export retry policy / no-retry finalize helper |
| `scripts/gate-electron-delivery.ts` | **CREATE** — Electron-host fixture 10/10 (or N rounds) |
| `scripts/gate-report.mjs` / `package.json` / `WINDOWS_DELIVERY_GATES.md` | Wire G-D1b |
| `src/services/__tests__/delivery.test.ts` | Electron-host planning + no false WM_PASTE success semantics |
| `tests/transcription.test.ts` | No double-attempt finalize policy coverage |

### Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Keep WM_PASTE-only + clipboard toast for Cursor | Dom floor A — Cursor must receive text |
| Claim Notepad-only WAI | Explicitly forbidden by Dom HITL |
| UIAutomation InsertText as primary | Brittle; out of scope vs clipboard+Ctrl+V invariant |
| Arbitrary SetForegroundWindow | Violates Invariant #18 / Dom job; only **captured** restore is allowed (LD3) |
| Lower timeout only without double-Groq fix | Still stacks two attempts |

### Risks and Considerations

- Restore briefly focuses Cursor — required product behavior for Electron hosts; must never restore to a non-captured HWND.
- `check:focus` must stay honest: allowlist is narrow and greppable.
- Electron fixture may be flaky under load — poll + warm-up like Notepad gate.

### Testing Requirements

**Validation Commands**:
```bash
npm run typecheck
npm test
npm run check:focus
npm run check:delivery
npm run check:delivery:electron
npm run validate:gates
```

## Next Steps
1. `/implement-fix` for #11 (this RCA)
2. `/validate` (G-D1 + G-D1b + G-D2…G-D5)
3. `/commit` + PR `Fixes #11`
4. Comment on #11 / #9 / PR #10 that Notepad-only is not Dom-workflow proof
