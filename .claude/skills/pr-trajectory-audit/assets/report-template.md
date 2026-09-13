# Trajectory review report

**Repo:** DifTorHeSmushma/oracle-speakflow  
**PR:** #<n> — <title>  
**Authority read:** `AI_LAYER.md`, `CLAUDE.md`, active `docs/DESIGN/` (if named),
`.agents/` plans/reports (if present), `.claude/commands/`.  
**Rubric:** `.claude/skills/pr-trajectory-audit/references/failure-patterns.md`

> This judges **documented process**, not code quality. It does not replace
> `/validate`, `/code-review`, or `/system-review`. A clean report is **not** a
> merge signal.

## Tier 1 — deterministic evidence

```json
<paste tier1-evidence.json>
```

Notes on Tier 1 (SpeakFlow):
- `ci_status` PASS with `passed: []` → no usable evidence for this PR, not green.
- This repo has real `ci.yml` — do not claim "no CI in the product."
- `scope_blast_radius: SKIP` → zero signal.
- Confirm duplicate hits are PRs, not issues.

## Tier 2 — judgments against the rubric

### Violation / Gap: <name from failure-patterns.md>

- **Rule (quoted):** …
- **Evidence:** …
- **Verdict:** PASS | FAIL | N/A
- **System fix (if FAIL):** …

(Repeat per applicable entry. If none apply, say so plainly.)

## Sample-size note

Installed rubric sample is **1 prior PR (#8)**. Do not inflate rates.

## Out of scope for this sensor

Technical correctness, security deep-dives, and merge decisions — human + other
commands own those.
