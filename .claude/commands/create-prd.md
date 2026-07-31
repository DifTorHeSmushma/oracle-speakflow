---
description: Generate a Product Requirements Document from the current conversation
argument-hint: [output-filename.md]
---

# Create PRD: Generate Product Requirements Document

Generate a comprehensive PRD based on the requirements discussed in the current conversation.

**Output file**: `$ARGUMENTS` (default under `docs/DESIGN/`, e.g. `docs/DESIGN/FEATURE_PRD.md`)

---

## Instructions

### 1. Extract Requirements

Review the conversation and extract:
- Explicit requirements
- Implicit needs
- Technical constraints and preferences
- User goals and success criteria

### 2. Synthesize and Fill Gaps

- Organize into the sections below
- Flag assumptions explicitly
- Ensure feasibility; keep terminology consistent

### 3. Write the PRD (default: intent altitude)

**Rule:** Intent PRDs contain problem, bet, falsification, and outcomes — **not** tech stack, APIs, or directory trees. Engineering detail belongs in `/plan` output under `.agents/plans/`.

#### Required structure

```markdown
# Product Requirements Document (Intent): [Name]

> Altitude: Intent only — problem, bet, falsification, outcomes.
> Engineering (how): use `/plan` — not this file.
> Last updated: [date]

## Problem
[Who struggles with what. No solution language.]

## Hypothesis
We believe **[segment]** will **[observable outcome]** because **[insight]**.

### Wrong condition (falsification) — required
If we observe **[metric or event]** by **[date or window]**, we **stop or pivot**.

### De-risk focus (pick ≥1)
- [ ] Value
- [ ] Usability
- [ ] Feasibility
- [ ] Viability

## Success metrics (outcomes, not features)
| Metric | Target | How measured |

## Thin-slice MVP (hypothesis proof)
**One sentence:** smallest end-to-end path that proves or falsifies the hypothesis.
- In scope: …
- Explicitly not a smaller v1: …

## Target users
**Primary:** …  **Pain:** …

## Non-goals (this bet)
## Open questions
| Question | Owner | Resolve by |

## Assumptions (flagged)
- [Assumption] — **validate by:** [method]
```

### Legacy combined PRD

If the user insists on one document with stack/architecture, note in the header that engineering sections should migrate to a `/plan` file on the next cycle.

---

## Quality Checks Before Saving

- [ ] Hypothesis and wrong condition present and measurable
- [ ] No technology stack or API spec in intent PRD
- [ ] Thin-slice is falsifiable end-to-end
- [ ] Assumptions flagged
- [ ] Consistent terminology

---

## After Creating the PRD

1. Confirm the file path
2. Brief summary of contents
3. Highlight significant assumptions
4. Suggest next steps: open GitHub issue → `/prime` → `/plan` → human approve → `/execute`
