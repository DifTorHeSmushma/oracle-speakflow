---
description: Implement a fix based on an RCA document
argument-hint: [github-issue-number]
---

# Implement Fix: GitHub Issue #$ARGUMENTS

## Prerequisites

- RCA document exists at `docs/rca/issue-$ARGUMENTS.md`
- GitHub CLI available (optional, for status updates)

---

## Step 1: Read the RCA Document

Read the entire file: `docs/rca/issue-$ARGUMENTS.md`

Optionally:

```bash
gh issue view $ARGUMENTS
```

Extract root cause, files to modify, fix strategy, testing requirements, validation commands.

Do not begin implementation until you have read the complete RCA.

---

## Step 2: Verify Current State

- Confirm the issue still exists
- Check for recent commits that may have already fixed it
- Review current state of all files listed in the RCA

---

## Step 3: Implement the Fix

For each file in the RCA "Files to Modify" section:

#### a. Read the existing file in full
#### b. Apply the fix precisely (SpeakFlow conventions + invariants)
#### c. Handle related downstream changes

---

## Step 4: Add Tests

From the RCA testing requirements:

1. Verify the fix resolves the reported issue
2. Edge cases related to the bug
3. Regression prevention

Adapt to Vitest / Playwright patterns already in the repo.

---

## Step 5: Run Validation

Execute RCA validation commands (prefer SpeakFlow scripts):

```bash
npm run typecheck
npm test
npm run test:ui
# plus any check:* scripts that apply
```

If any step fails: fix → re-run → do not proceed until green.

---

## Step 6: Manual Verification

Follow RCA reproduction steps; confirm no unintended side effects.

---

## Output Report

### Fix Summary

**Issue #$ARGUMENTS**: [Brief title]  
**Root Cause** (from RCA): [One-line summary]

### Changes Made

| File | Change |
|---|---|
| `[path]` | [What was changed] |

### Tests Added

| Test File | Cases Added |
|---|---|
| `[path]` | [names] |

### Validation Results

```
[outputs]
```

### Verification

- ✅ Reproduction steps — issue resolved
- ✅ Edge cases tested
- ✅ No new issues introduced

### Ready for Commit

```
fix(scope): resolve #$ARGUMENTS — [brief description]

Fixes #$ARGUMENTS
```

---

## Optional: Update GitHub Issue

```bash
gh issue comment $ARGUMENTS --body "Fix implemented. Ready for review."
```

---

> **Workflow**: `/rca` → `/implement-fix` → `/validate` → `/commit`
