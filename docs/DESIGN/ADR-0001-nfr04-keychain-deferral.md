# ADR-0001: NFR-04 OS-Keychain Deferral

**Status:** ACCEPTED — NFR-04 DEFERRED to post-MVP (Milestone 5)
**Date:** 2026-05-14
**Author:** Phase 3 PIV session

---

## Context

PRO_UPGRADE_PRD.md §4 [NFR-04] requires that API keys be stored in an encrypted OS-level
keychain (e.g. `node-keytar`). The current implementation stores `GROQ_API_KEY` in a
plaintext `.env`-style file under `app.getPath('userData')`.

## Decision

**Defer NFR-04 to Milestone 5 (post-MVP).** Reasons:

1. **Scope constraint.** `node-keytar` is a native Node.js addon that requires platform-specific
   pre-built binaries. Integrating it into the ASAR packaging pipeline (P3-T11) risks introducing
   cross-machine build failures that block the current MVP ship date.

2. **Threat model is acceptable at MVP.** The current userData directory is:
   - Per-user, writable only by the running user (Windows ACL default).
   - Not synced to cloud storage by default (not in `%USERPROFILE%\OneDrive\`).
   - Readable by the current user — which is the same privilege level as keytar on Windows 11
     (DPAPI-backed keychain is also per-user).

3. **No data-at-rest difference in practice.** Windows DPAPI (used by Credential Manager)
   encrypts with the user's login credentials — exactly the same security boundary as the
   current userData location without DPAPI. The primary benefit of keytar is resistance to
   *offline* dump attacks, which are out of scope for a developer-tool MVP.

## Compensating Controls (in force during deferral)

- CLAUDE.md invariant #3: raw API key is **never** logged, emitted to stdout, or sent via IPC.
- `verify-api-key` IPC handler compares in the main process only; value never surfaces to renderer.
- `preload.cts`: API key is never serialised into renderer-accessible state.
- Config file path is in `userData`, not shipped in the ASAR bundle.

## Target Milestone

NFR-04 will be satisfied in **Milestone 5** using one of:
- `node-keytar` (keychain native addon) — preferred if binary distribution is resolved.
- Electron `safeStorage` API (Electron ≥ 15) — alternative that avoids native addon entirely;
  uses OS DPAPI/Keychain without a separate npm package.

## Resolution Required Before Closure

1. Update `PRO_UPGRADE_PRD.md` NFR-04 status → DEFERRED with link to this ADR.
2. Update `PRO_UPGRADE_BUILD_PLAN.md` Milestone 4 / P3-T10 notes accordingly.
3. Add CHANGELOG entry.
4. At Milestone 5: implement Path A (keytar or `safeStorage`), migrate existing key, update ADR status → RESOLVED.

---

*This ADR is the authoritative record. The phrase "silent deferral" is never acceptable — any
NFR-04 status of UNKNOWN in future review sessions must be treated as a BLOCK.*
