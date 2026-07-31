---
description: Create an atomic commit with a conventional commit message
---

# Commit: Create Atomic Commit

Create a clean, atomic commit for staged/unstaged changes that belong together.

---

## Step 1: Assess the State

```bash
git status
git diff HEAD
git diff --stat HEAD
git ls-files --others --exclude-standard
```

Review cohesion. If unrelated changes are mixed, stage only the relevant files.

---

## Step 2: Stage the Changes

```bash
git add [relevant files]
```

---

## Step 3: Write the Commit Message

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body — explain WHY, not WHAT]

[optional footer — Fixes #N]
```

**Types:** `feat` | `fix` | `docs` | `refactor` | `test` | `chore` | `perf`

**Rules:**
- Short description ≤72 characters, imperative mood
- Body explains motivation
- Keep scope concise

**Examples:**
```
feat(capture): add pulse input path for Linux

fix(mute): only mute when call app is foreground

docs(ai-layer): add agent loop kit and stop rules
```

---

## Step 4: Commit

```bash
git commit -m "<type>(<scope>): <description>" -m "<optional body>"
```

Do not skip hooks. Do not amend unless the user explicitly requests it and amend rules are met.

---

## Step 5: Confirm

```bash
git log -1 --oneline
git status
```
