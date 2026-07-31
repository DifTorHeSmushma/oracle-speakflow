---
description: Technical code review — bugs, security, quality, pattern adherence
---

# Code Review: Technical Quality Gate

Perform a thorough technical review of all recently changed files. Run this **before every commit** of non-trivial work.

## Review Philosophy

- Simplicity is the ultimate sophistication — every line should justify its existence
- Code is read far more often than written — optimize for readability
- Be specific (line numbers, not vague complaints)
- Focus on real bugs and risks, not style preferences
- Suggest fixes, don't just identify problems
- Flag security issues as CRITICAL (especially API key / secret exposure)

---

## Step 1: Load Codebase Context

- Read `CLAUDE.md` and `AI_LAYER.md`
- Read `README.md` for project context
- Scan `docs/DESIGN/` for governing conventions when relevant

---

## Step 2: Gather Changed Files

```bash
git status
git diff HEAD
git diff --stat HEAD
git ls-files --others --exclude-standard
```

Read each **new file** in its entirety.
Read each **changed file** in its entirety (not just the diff).

---

## Step 3: Review Each File

### 1. Logic Errors
- Off-by-one, incorrect conditionals, missing error handling
- Null/undefined gaps, race conditions / async issues
- State machine re-entry, mute/paste gates, foreground steal

### 2. Security Issues
- Exposed secrets or API keys (CRITICAL)
- Insecure data handling, missing input validation

### 3. Performance Problems
- Inefficient algorithms, memory leaks, unnecessary work on hot paths (capture/VAD)

### 4. Code Quality
- DRY violations, overly complex functions
- Poor naming, missing types, dead code
- Svelte component density (>250 lines)

### 5. Pattern Adherence
- `Result<T, E>` at service boundaries
- API key masking (`MASKED_KEY` / never raw key in logs/DOM)
- Preload CJS (`.cts`), no `getUserMedia` in renderer
- Testing standards followed

---

## Step 4: Verify Issues Are Real

- Confirm with targeted tests where possible
- Validate security concerns have real attack vectors

---

## Output

Save the review to: `.agents/code-reviews/[descriptive-name].md`

**Format each issue as:**

```
severity: critical | high | medium | low
file: path/to/file.ts
line: 42
issue: [one-line description]
detail: [why this is a problem]
suggestion: [how to fix it]
```

**Stats section:**
```
Files modified: 0
Files added: 0
Lines added: +0
Lines removed: -0
Issues found: 0 (critical: 0, high: 0, medium: 0, low: 0)
```

If no issues: "Code review passed. No technical issues detected."

---

## After the Review

- If issues found: run `/code-review-fix [review-file-path]`
- If clean: proceed to `/validate` then `/commit`
