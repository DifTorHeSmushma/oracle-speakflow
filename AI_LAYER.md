# Oracle SpeakFlow — AI Layer

Agent kit for building inside this repository. Skills live under `.claude/commands/`. Product conventions and invariants live in `CLAUDE.md`.

## Ticket + Spec

| Role | Source |
| :--- | :--- |
| **Ticket** | GitHub Issues on `DifTorHeSmushma/oracle-speakflow` |
| **Spec** | `docs/DESIGN/` (current milestone PRD / Spec / plan for the work) |

Every feature session names both: issue `#N` and a concrete path under `docs/DESIGN/`.

## Mandatory loop

```
ticket (#N) → /prime → /plan → (human approve) → /execute → /validate → (/code-review) → /commit → PR (Fixes #N)
```

Bugs: `/rca` → `/implement-fix` → `/validate` → `/commit` (or an explicit one-line waiver instead of RCA).

## Stop rules

1. **No feature implement** without a GitHub issue `#N` in the session.
2. **No `/execute`** without an approved plan from `/plan`.
3. **No PR** without `/validate` considered (and project CI / gate scripts that apply).
4. **Bugs run `/rca`** (or an explicit one-line waiver).
5. **Recurring failure classes** update a product rule (`CLAUDE.md`) or a skill under `.claude/commands/`.

## Session open (copy/paste)

```
Working on SpeakFlow issue #<N>. Spec: docs/DESIGN/<path>.
Run /prime then /plan. Do not write feature code until I approve the plan.
```

## Skills installed

| Command | Purpose |
| :--- | :--- |
| `/prime` | Load repo context + ticket/spec |
| `/prime-tools` | Prepare for MCP / electronAPI tool work |
| `/plan` | Write implementation plan (no feature code) |
| `/execute` | Implement from an approved plan |
| `/validate` | Typecheck / tests / applicable gates |
| `/code-review` | Technical review before commit |
| `/code-review-fix` | Fix review findings |
| `/system-review` | Process meta-review vs plan |
| `/execution-report` | Post-implement reflection |
| `/rca` | Root cause analysis for an issue |
| `/implement-fix` | Implement from RCA |
| `/commit` | Conventional atomic commit |
| `/create-prd` | Intent-altitude PRD from conversation |

## Notes

- Plans: `.agents/plans/`
- Reviews / reports: `.agents/code-reviews/`, `.agents/execution-reports/`, `.agents/system-reviews/`
- RCAs: `docs/rca/`
- Tracker is GitHub Issues only (no Jira / Confluence required for this product).

## Trajectory sensor

Live review workflow installed; non-blocking. Requires Claude GitHub App + `CLAUDE_CODE_OAUTH_TOKEN`.

