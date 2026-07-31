---
description: Deep feature planning — creates a context-rich implementation plan file
argument-hint: [feature name or description]
---

# Plan: Create Feature Implementation Plan

## Feature: $ARGUMENTS

## Mission

Transform a feature request into a **comprehensive, context-rich implementation plan** through systematic codebase analysis, external research, and strategic thinking.

**Core Rule**: Do NOT write feature code in this phase. The plan must be complete enough that `/execute` can implement on the first attempt without clarifying questions.

**Altitude:** This command produces the **engineering / AI spec**. Intent (problem, hypothesis, wrong condition) must already live in a PRD under `docs/DESIGN/` unless the work is surgical wiring only.

**Stop rule:** Do not run `/execute` until a human approves this plan.

**Key Philosophy**: Context is King. The plan must contain ALL information needed — patterns, mandatory reading files, external docs, validation commands.

---

## Planning Process

### Phase 1: Feature Understanding

- Extract the core problem being solved
- Identify user value and impact
- Determine feature type: New Capability / Enhancement / Refactor / Bug Fix
- Assess complexity: Low / Medium / High
- Map affected systems and components
- Confirm GitHub issue `#N` and governing `docs/DESIGN/` path

**User Story:**

```
As a <type of user>
I want to <action/goal>
So that <benefit/value>
```

### Phase 2: Codebase Intelligence Gathering

1. **Project structure** — language, frameworks, boundaries (Electron main / renderer / services)
2. **Pattern recognition** — similar implementations; conventions in `CLAUDE.md`
3. **Dependencies** — relevant libraries and version constraints
4. **Testing patterns** — Vitest unit/UI, Playwright integration; mirror existing tests
5. **Integration points** — exact files to create/modify; IPC registration if needed

If requirements are unclear after Phase 2, ask the user before continuing.

### Phase 3: External Research

Compile research references with section anchors:

```markdown
- [Library Docs - Specific Feature](https://example.com/docs#section)
  - Section: [exact section name]
  - Why: [what to learn here]
```

### Phase 4: Strategic Thinking

- Fit with existing architecture and SpeakFlow invariants
- Critical dependencies and order of operations
- Edge cases, race conditions, mute/paste/focus risks
- Testing strategy
- Performance or security implications

### Phase 5: Write the Plan File

**Output file**: `.agents/plans/{kebab-case-feature-name}.md`  
Create `.agents/plans/` if it doesn't exist.

#### Required plan structure (fill every section)

```markdown
# Feature: [Name]

**PRD / Spec authority:** `docs/DESIGN/<path>` — cite hypothesis / wrong condition if present.
**GitHub issue:** #<N>

## Feature Description
## User Story
## Problem Statement
## Solution Statement
**Approach Decision** / **Alternatives Rejected**

## Feature Metadata
- Feature Type / Complexity / Primary Systems / Dependencies

## CONTEXT REFERENCES
### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING
### New Files to Create
### Relevant Documentation
### Patterns to Follow (from this repo)

## Step-by-Step Tasks
For each task:
- Exact file path
- CREATE or UPDATE
- Implementation details
- `VALIDATE:` command (must be executable)

## Testing Strategy
## Validation Commands (full suite)
## Risks and Edge Cases
```

#### If you change schemas/props/interfaces

Include a dedicated cascade checklist:

- Update producer(s)
- Update consumer boundary
- Update defaults / migrations
- Update tests that construct the object
- Add one explicit “bad input” test with a stable, greppable error

---

## Quality Gates (before saving)

### Context Completeness
- [ ] Patterns identified and documented
- [ ] External library usage documented with links
- [ ] Integration points mapped
- [ ] Gotchas and anti-patterns captured
- [ ] Every task has an executable `VALIDATE:` command

### Implementation Ready
- [ ] Another agent could execute without asking questions
- [ ] Tasks ordered by dependency
- [ ] Each task is atomic and independently testable

### No Prior Knowledge Test
- [ ] An agent reading ONLY this plan can implement successfully

---

## Report After Creating the Plan

- Summary of feature and approach
- Full path to the plan file
- Complexity (Low/Medium/High)
- Key risks
- Confidence score (X/10) for one-pass execution

**STOP — wait for human approval before `/execute`.**
