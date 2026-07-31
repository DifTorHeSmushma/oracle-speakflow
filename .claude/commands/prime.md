---
description: Load project context at session start
---

# Prime: Load Project Context

## Objective

Build comprehensive understanding of the codebase before any implementation work. Run this at the start of every session.

## Process

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure (adjust depth as needed):
- Linux/Mac: `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build|dist-ui|dist-installer'`
- Windows: `tree /F /A` or use `ls` recursively

### 2. Read Core Documentation

- Read `CLAUDE.md` and `AI_LAYER.md` at project root
- Read `README.md`
- Read the governing design doc for this session under `docs/DESIGN/` (cite the path named in the session open)

### 3. Identify and Read Key Files

Based on Oracle SpeakFlow:

- **Entry points**: `src/electron-main.ts`, `src/index.ts`, `src/preload.cts`
- **Config**: `package.json`, `tsconfig.json`, `src/utils/config.ts`
- **Core services**: `src/services/` (capture, transcription, mute, paste, vad)
- **UI**: `src-ui/` (Svelte stores + components)
- **IPC**: `src/types/ipc.ts`

### 4. Check Current Git State

Recent history:
!`git log -10 --oneline`

Current status:
!`git status`

### 5. Ticket + Spec

Confirm the session names:

- GitHub issue `#N` (required for feature work)
- Spec path under `docs/DESIGN/`

## Output Report

Provide a concise, scannable summary:

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version or state

### Architecture
- Overall structure and major directories
- Service or module boundaries (main vs renderer vs services)

### Tech Stack
- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles
- Invariants from `CLAUDE.md`
- Testing approach and coverage requirements

### Current State
- Active branch and recent development focus
- Ticket `#N` and spec path for this session
- Any immediate observations (missing docs, failing tests, etc.)

**Keep this scannable — use bullet points and clear headers.**
