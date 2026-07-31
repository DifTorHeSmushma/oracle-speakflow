---
description: Fix issues identified in a code review
argument-hint: [path-to-review-file or description-of-issues]
---

# Code Review Fix

A code review was performed and issues were found.

**Review source**: `$ARGUMENTS`

If `$ARGUMENTS` is a file path, read the entire file first to understand all issues before touching any code.
If `$ARGUMENTS` is a description of issues, proceed with fixing those directly.

---

## Fix Process

Work through each issue in order of severity (critical → high → medium → low).

For each issue:

### 1. Understand the problem
- Read the file at the line referenced
- Understand the full context around it
- Confirm the issue is real before changing anything

### 2. Apply the fix
- Fix exactly what is described
- Do not refactor beyond the scope of the fix
- Follow SpeakFlow coding conventions and invariants
- Add a comment only if the fix is non-obvious

### 3. Write or update tests
- If the issue was a logic bug: write a test that would have caught it
- If the issue was an edge case: add an edge case test
- Run the relevant test to confirm the fix works

### 4. Report the fix
- Note what was wrong
- Note what was changed
- Show the relevant before/after if useful

---

## After All Fixes

Run the full validation suite:

Follow `.claude/commands/validate.md`

All required levels must pass before `/commit`.
