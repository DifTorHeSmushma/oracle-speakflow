---
description: Root cause analysis for a GitHub issue
argument-hint: [github-issue-number]
---

# Root Cause Analysis: GitHub Issue #$ARGUMENTS

## Objective

Investigate GitHub issue #$ARGUMENTS, identify the root cause, document findings, and propose a fix strategy. The output feeds `/implement-fix`.

**Prerequisites:**
- Local Git repository with GitHub origin
- GitHub CLI authenticated (`gh auth status`)
- Valid GitHub issue ID from this repository

**Stop rule:** Bug fixes run `/rca` (or an explicit one-line waiver in the session).

---

## Investigation Process

### 1. Fetch Issue Details

```bash
gh issue view $ARGUMENTS
```

Extract title, description, reporter, labels, severity, reproduction discussion.

### 2. Search the Codebase

Search for components, function names, or error messages from the issue. Compare similar implementations. Check recent changes.

```bash
git log --oneline -20 -- [relevant-paths]
```

### 3. Review Recent History

```bash
git log --oneline -20
git log --oneline -20 -- [affected-file-paths]
```

### 4. Identify the Root Cause

- What is the actual bug?
- Why does it occur?
- What was the original intent?
- Related symptoms / secondary effects?

### 5. Assess Impact

Scope, affected features, workarounds, severity, data/security implications.

### 6. Propose Fix Strategy

Files, approach, alternatives rejected, testing requirements, risks.

---

## Output: Create RCA Document

Save to: `docs/rca/issue-$ARGUMENTS.md`

### Required Document Structure

```markdown
# Root Cause Analysis: GitHub Issue #$ARGUMENTS

## Issue Summary
- **GitHub Issue**: #$ARGUMENTS
- **Title**: …
- **Reporter**: …
- **Severity**: Critical | High | Medium | Low
- **Status**: Open | In Progress

## Problem Description
**Expected Behavior** / **Actual Behavior** / **Symptoms**

## Reproduction Steps
1. …
**Reproduction Verified**: Yes / No

## Root Cause
### Affected Components
### Analysis
**Code Location**: `[file:line]`

## Impact Assessment
## Proposed Fix
### Fix Strategy
### Files to Modify
### Alternatives Considered
### Risks and Considerations
### Testing Requirements
**Validation Commands**:
```bash
npm run typecheck
npm test
# plus any gate scripts that apply
```

## Next Steps
1. Review this RCA
2. `/implement-fix $ARGUMENTS`
3. `/validate` → `/commit`
```

---

> **Workflow**: `/rca` → `/implement-fix` → `/validate` → `/commit`
