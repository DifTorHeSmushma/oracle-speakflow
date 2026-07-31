---
description: Post-implementation reflection — what happened vs the plan
---

# Execution Report

Generate a structured reflection on the implementation just completed. Run this immediately after finishing execution, before the session context fades.

**Purpose**: Document what happened, what diverged, and capture improvements for the system.

---

## Context

Reflect on the implementation you just completed:

- What did you implement?
- How closely did it follow the plan?
- What challenges came up?
- What would you do differently?

---

## Report Structure

Save to: `.agents/execution-reports/[feature-name].md`

### Meta Information

- **Plan file**: [path]
- **Date**: [today's date]
- **GitHub issue**: #<N>
- **Files added**: [list with paths]
- **Files modified**: [list with paths]
- **Lines changed**: +X -Y

### Validation Results

| Check | Status | Notes |
|---|---|---|
| Type checking | ✅/❌ | |
| Unit tests | ✅/❌ | |
| UI tests | ✅/❌/⏭ | |
| Integration tests | ✅/❌/⏭ | |

### What Went Well

- [Concrete examples]

### Challenges Encountered

- [What was difficult and why]

### Divergences from Plan

**[Divergence title]**
- **Planned**: …
- **Actual**: …
- **Reason**: …
- **Type**: Better approach found | Plan assumption wrong | Security concern | Performance issue | Missing context | Other

### Skipped Items

- [What was skipped] — **Reason**: …

### Recommendations for Next Time

- **Plan command improvements**: …
- **Execute command improvements**: …
- **CLAUDE.md additions**: …
- **New commands to create**: …
- **Rule/skill updates** (if recurring class): …
