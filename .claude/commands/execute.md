---
description: Implement a feature from a plan file
argument-hint: [path-to-plan-file]
---

# Execute: Implement from Plan

## Plan to Execute

Read plan file: `$ARGUMENTS`

If no path provided, check `.agents/plans/` for the most recent plan file.

**Stop rule:** Do not run this command unless a human has approved the plan from `/plan`.

---

## Execution Instructions

### Step 1: Read and Understand the Full Plan

- Read the **entire** plan file before touching any code
- Understand all tasks and their dependency order
- Note all validation commands
- Review the testing strategy
- Read all files listed under "Relevant Files" / "CONTEXT REFERENCES"

**Do not start implementing until you have read the complete plan and all referenced files.**

### Step 2: Execute Tasks in Strict Order

For **each task** in the Step-by-Step Tasks section:

#### a. Identify the file and action
- CREATE (new file) or UPDATE (modify existing)?
- Read the existing file in full if modifying

#### b. Implement exactly as specified
- Follow the implementation details in the task
- Use patterns referenced in the plan
- Respect `CLAUDE.md` invariants (Result types, mute gates, no foreground steal, API key masking, etc.)

#### c. Verify immediately after each task
- Run the task's `VALIDATE:` command
- Fix any errors before moving to the next task

### Step 3: Implement the Testing Strategy

- Create all test files specified in the plan
- Implement listed cases (happy path, edge, error)
- Follow existing Vitest / Playwright organization

### Step 4: Run Full Validation Suite

Prefer the project's real scripts (see `CLAUDE.md` / `package.json`), typically:

```bash
npm run typecheck
npm test
npm run test:ui
# npm run test:integration  # when Electron integration is in scope
```

If any command fails: fix → re-run → continue only when green.

### Step 5: Final Checklist

- ✅ Every plan task completed
- ✅ Every task `VALIDATE:` passed
- ✅ Tests created and passing
- ✅ Full validation considered
- ✅ Conventions and invariants respected
- ✅ No regressions

---

## Output Report

### Completed Tasks
- Tasks completed; files created/modified

### Tests Added
- Test files and results

### Validation Results
```
# Show output from each validation command
```

### Divergences from Plan
- What was planned / what changed / why

### Ready for Review
- Confirm ready for `/code-review` then `/validate` / `/commit`

---

## Notes

- Document issues not covered by the plan; continue if safe
- If the plan is wrong, note the deviation and explain why
- Fix failing tests — do not delete or weaken them
- Never skip validation steps
- If a referenced file does not exist, flag it rather than guessing
