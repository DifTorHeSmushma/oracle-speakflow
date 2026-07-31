---
description: Meta review — analyze plan adherence and generate system improvements
argument-hint: [plan-file] [execution-report-file]
---

# System Review: Improve the Process

Perform a meta-level analysis of how well the implementation followed the plan.

**Arguments:**
- `$1` — Path to the plan file that was executed
- `$2` — Path to the execution report generated after implementation

**System review is NOT code review.** You're not looking for bugs in the code — you're looking for bugs in the **process**.

---

## Purpose

- Analyze plan adherence and divergence patterns
- Identify which divergences were justified vs problematic
- Surface process improvements that prevent future issues
- Suggest specific updates to `CLAUDE.md`, plan/execute commands, or new commands

---

## Inputs to Read

1. **Plan file** (`$1`) — repo-relative path only (e.g. `.agents/plans/feature.md`)
2. **Execution report** (`$2`) — repo-relative only (e.g. `.agents/execution-reports/feature.md`)
3. **Plan command** — `.claude/commands/plan.md`
4. **Execute command** — `.claude/commands/execute.md`

If plan/execute commands are missing, note that under **process gaps**.

---

## Analysis Workflow

### Step 1: Extract the Planned Approach
From the plan: features, architecture, validation, patterns.

### Step 2: Extract the Actual Implementation
From the execution report: what shipped, divergences, challenges, skips.

### Step 3: Classify Each Divergence

**Good Divergence ✅** — plan wrong/incomplete; better pattern found; security/perf forced change  
**Bad Divergence ❌** — ignored constraints; invented architecture; shortcuts; misunderstood requirements

### Step 4: Trace Root Causes
Unclear plan / missing context / wrong assumption / missing validation / other

### Step 5: Generate System Improvements
Concrete updates to assets — not vague advice.

---

## Output

Save to: `.agents/system-reviews/[feature-name]-review.md`

### Report Structure

#### Meta Information
- Plan reviewed / Execution report / Date

#### Overall Alignment Score: __/10

| Score | Meaning |
|---|---|
| 9–10 | Perfect adherence, all divergences justified |
| 7–8 | Minor justified divergences |
| 4–6 | Mix of justified and problematic |
| 1–3 | Major problematic divergences |

#### Divergence Analysis

```yaml
divergence: [what changed]
planned: [what plan specified]
actual: [what was implemented]
reason: [agent's stated reason]
classification: good ✅ | bad ❌
root_cause: unclear plan | missing context | wrong assumption | missing validation | other
```

#### Pattern Compliance

- [ ] Followed codebase architecture
- [ ] Used documented patterns from `CLAUDE.md`
- [ ] Applied testing patterns correctly
- [ ] Met validation requirements

#### System Improvement Actions

**Update `CLAUDE.md`:** concrete section/text suggestions  
**Update `/plan` or `/execute`:** concrete checklist additions  
**Create new command** only if a manual step repeated 3+ times  
**Recurring failure class:** update a product rule or skill (stop rule 5)

#### Key Learnings
What worked / what needs improvement / for next implementation

---

## Important Rules

- Be specific (file paths, missing steps)
- Focus on patterns, not one-offs
- Every finding needs a concrete asset update suggestion
