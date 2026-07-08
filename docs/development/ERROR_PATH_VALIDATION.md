# Error-Path Validation Checklist Template

## Purpose

Automated tests prove the happy path. Manual validation proves failure paths.

A commit message that says "N tests passing" is implementation evidence, not validation
evidence. The PIV loop is not complete until every error path in this checklist has been
manually exercised and the results recorded in the commit message.

---

## How to Use This Template

When writing a plan (T-XX tasks), apply the generator rules below to every user story that
touches a state machine or has a prerequisite (credentials, device, network, process). Add
the resulting error-path checklist to the plan as a named validation section. The validation
gate is only satisfied when every item is checked off with observed evidence.

---

## Generator Rules

For each user story, ask: **what prerequisites does this story require?**

| Prerequisite type       | Error paths to include                                                                 |
|-------------------------|----------------------------------------------------------------------------------------|
| API credentials         | Missing entirely; present but invalid; present but expired/revoked                    |
| External process/binary | Not installed; installed but wrong version; installed but permission denied            |
| Hardware/device         | Device not found; device found but access denied; device found but in use by other app |
| Network                 | No connectivity; timeout; server-side error (4xx, 5xx)                                |
| File/config on disk     | File missing; file present but malformed; file present but wrong permissions           |
| State machine entry     | Handler reached while already in non-IDLE state                                       |

For each error path, the acceptance criteria must specify:
1. What the user sees (UI message, indicator state, system tray notification)
2. That the system returns to a **recoverable state** (state machine back to IDLE)
3. That a **subsequent valid trigger works** (second hotkey press succeeds after error)

---

## Example: Hotkey-triggered speech pipeline

**User story:** "User presses Ctrl+Alt+R, holds to record, releases — transcript is pasted."

**Prerequisites:** GROQ_API_KEY configured, SoX installed, microphone accessible, network reachable.

**Generated error-path checklist:**

### Credentials
- [ ] **No API key** — Launch with no `.env` / no key in userData. Press hotkey.
  - Expected: UI shows error ("API key not configured"), state returns to IDLE within 500ms.
  - Subsequent press: accepted (not silently ignored).
  - Evidence: `Launched without API key, pressed Ctrl+Alt+R, UI showed "API key not configured", state returned to IDLE, pressed again, pipeline ran.`

- [ ] **Invalid API key** — Set `GROQ_API_KEY=sk-invalid`. Complete a recording.
  - Expected: UI shows "Invalid API key", state returns to IDLE.
  - Evidence: `Set invalid key, recorded audio, UI showed invalid key error, state returned to IDLE.`

### External binary
- [ ] **SoX not installed** — Remove SoX from PATH. Press hotkey.
  - Expected: UI shows recording error, state returns to IDLE.
  - Evidence: `Removed SoX, pressed hotkey, UI showed recording failed, state returned to IDLE.`

### Network
- [ ] **Network timeout** — Block `api.groq.com` via hosts file. Complete a recording.
  - Expected: UI shows timeout error after retry backoff, state returns to IDLE.
  - Evidence: `Blocked Groq endpoint, recorded audio, UI showed network timeout, state returned to IDLE.`

### State machine
- [ ] **Hotkey pressed while RECORDING** — Hold hotkey, tap it again without releasing.
  - Expected: Second keydown silently ignored (Invariant #6). No state corruption.
  - Evidence: `Double-tapped hotkey during recording, second press was silently ignored, pipeline completed normally on keyup.`

---

## Validation Evidence Format

Record evidence in the commit message using this format:

```
Manual error-path validation:
- No API key: launched without .env, pressed hotkey, UI showed error, returned to IDLE, second press succeeded.
- Invalid key: set sk-invalid, recorded, UI showed invalid key error, returned to IDLE.
- SoX missing: removed from PATH, pressed hotkey, UI showed recording failed, returned to IDLE.
- Network blocked: blocked api.groq.com, recorded, UI showed timeout after retry, returned to IDLE.
- Re-entry guard: double-tapped during recording, second press ignored, pipeline completed normally.
```

If a path cannot be exercised (e.g., testing hardware denial without hardware), document why:
```
- Microphone denied: SKIPPED — no second audio device available in test environment.
```

Skipped paths must be listed; they may not be silently omitted.

---

## Invariant Cross-Reference

Error-path validation enforces two invariants from CLAUDE.md directly:

- **Invariant #6** (state machine re-entry is forbidden): every error path must confirm that
  re-entry after an aborted pipeline attempt is accepted, not silently ignored.
- **Invariant #12** (no bare returns from non-IDLE state): any error path that causes an early
  exit from a state-transition handler must leave state = IDLE, not whatever state the handler
  entered. If the system is stuck after an error path, Invariant #12 was violated.
