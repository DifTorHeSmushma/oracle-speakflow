---
description: Run full validation suite — lint, types, tests, package checks
---

# Validate: Full Project Validation

Run the complete validation suite and report results. Prefer this repo's real scripts from `CLAUDE.md` / `package.json`.

**Run this before every PR / commit of feature work.**

---

## Rule: prefer repo-specific commands

Before running anything, read `CLAUDE.md` and `package.json` and use SpeakFlow's actual scripts.

### Level 1: Syntax & Style (if configured)

```bash
# Prefer project lint script when present
npm run lint
```

Skip with a note if no lint script is defined.

### Level 2: Type Checking

```bash
npm run typecheck
```

**Expected**: 0 errors.

### Level 3: Unit Tests

```bash
npm test
```

**Expected**: All tests pass.

### Level 4: UI Component Tests

```bash
npm run test:ui
```

**Expected**: All UI tests pass when UI is in scope.

### Level 5: Integration Tests (when in scope)

```bash
npm run test:integration
```

**Expected**: All Playwright Electron tests pass when that gate applies.

### Level 6: Release / manifest gates (when packaging or model paths touched)

```bash
npm run check:manifest
npm run check:focus
npm run check:workflows
```

Run the subset that applies to the change. Skip with a note when out of scope.

---

## Summary Report

| Level | Check | Status | Details |
|---|---|---|---|
| 1 | Linting | ✅/❌/⏭ | |
| 2 | Type checking | ✅/❌ | |
| 3 | Unit tests | ✅/❌ | |
| 4 | UI tests | ✅/❌/⏭ | |
| 5 | Integration | ✅/❌/⏭ | |
| 6 | Manifest/focus/workflows | ✅/❌/⏭ | |

**Overall**: PASS ✅ or FAIL ❌

Do not proceed to `/commit` or open a PR if required levels fail.
