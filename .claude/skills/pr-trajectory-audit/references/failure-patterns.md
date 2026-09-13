# AI-layer compliance findings — Oracle SpeakFlow

**This is not a rubric of "good PR" patterns. It's a rubric of specific, documented
rules from this repo's own AI layer, checked against real evidence of whether they
were actually followed.** The unit being evaluated isn't "is this fix correct" —
it's "did the agent's process, as evidenced by this PR's trajectory, actually
follow the workflow we defined for it."

Every finding below cites the **actual documented step** it checks against —
`AI_LAYER.md`, `CLAUDE.md`, an active spec under `docs/DESIGN/`, or a procedure
under `.claude/commands/` — and **real evidence** from this repo's own PR
record. Two kinds of finding:

- **Rule violations** — the AI layer already documents a step, and the trajectory
  shows it wasn't followed. Fix: tighten enforcement.
- **Coverage gaps** — a pattern recurs, or the AI layer structurally cannot be
  enforced, and no existing rule covers it. Fix: add a rule/hook/check.

Both feed **system evolution** — a finding isn't closed until an AI-layer file
changes.

**Authority shape (SpeakFlow):** `AI_LAYER.md` + `CLAUDE.md` + `.claude/commands/`.
There is no marketing `PRODUCT_TRUTH` file and no `.cursor/commands/` kit. A finding
that cites those foreign paths is invalid.

---

## Audit basis for this pass — and its honest limits

Mined `DifTorHeSmushma/oracle-speakflow` via
`mine_prs.py mine DifTorHeSmushma/oracle-speakflow --limit 100` on **2026-09-13**.
Verbatim result:

```
Pulled 1 PRs from DifTorHeSmushma/oracle-speakflow (gh pr list --state all --limit 100).
Pass 1 (title back-reference '(#N)'): 0 PR(s) referenced 2+ times
Pass 2 (body cross-reference ...): 0 references across 0 unique target PRs
Duplicate-cluster detector (14-day window, title similarity >= 0.55): 0 cluster(s) found
```

**The repo has exactly one merged PR in its history: #8**
("Publish working Windows delivery stack to main", merged 2026-08-03).
Issue numbers elsewhere in the sequence (#1–#7, #9–#10) are issues, not PRs —
confirm with `gh pr view` vs `gh issue view` before citing.

`AI_LAYER.md` landed **2026-07-31** (`docs(ai-layer): add agent command kit and
stop rules`), before PR #8 merged. Judging #8 against `AI_LAYER.md` is fair on
timeline.

With n=1 the mining heuristics cannot produce recurrence findings. Every finding
below comes from reading PR #8 directly plus repo configuration state, not from
ranking heuristics. Phrase sample size as **"1 of 1"** — never as an established rate.

**What PR #8 did right (so findings aren't a total-PR verdict):**
- Body lists a concrete test plan with `npm run typecheck`, `npm test` (356 passed),
  and `npm run test:ui` (50 passed) checked — aligns with `.claude/commands/validate.md`
  Levels 2–4.
- Body names restored issues (#1, #2, #6, #7) and leaves open work (#3–#5) explicit.
- Diff is a large delivery port with stated intent (Windows stack onto clean main).

---

## Rule violations

### Violation 1 — no single tracking issue + `Fixes #N` on the PR that shipped

**Documented rules:**

> `AI_LAYER.md` — *"Every feature session names both: issue `#N` and a concrete path
> under `docs/DESIGN/`."* Stop rule 1: *"No feature implement without a GitHub issue
> `#N` in the session."* Mandatory loop ends with *"PR (Fixes #N)"*.

**Real evidence:** [PR #8](https://github.com/DifTorHeSmushma/oracle-speakflow/pull/8)
body discusses closing housekeeping for restored issues #1/#2/#6/#7 but does **not**
carry a single `Fixes #<n>` for the change being merged, and the sole commit message
is `Publish working Windows delivery stack onto clean main.` with no issue trailer.
For a bulk port this may have been intentional — still a process miss against the
written contract once `AI_LAYER.md` existed.

**What would have prevented this:** require `Fixes #N` (or an explicit multi-issue
`Fixes` list) in the PR body before merge; optionally a PR template that forces it.

---

### Violation 2 — commit message not Conventional Commits

**Documented rules:**

> `.claude/commands/commit.md` — *Use Conventional Commits:
> `<type>(<scope>): <short description>`.*

**Real evidence:** PR #8's only commit headline is
`Publish working Windows delivery stack onto clean main.` — no `<type>(<scope>):`
prefix. (Contrast: the AI Layer install commit itself used
`docs(ai-layer): add agent command kit and stop rules`.)

**What would have prevented this:** `/commit` before push; a lightweight commitlint
or CI title check if the rate stays high after more PRs.

---

## Coverage gaps

### Gap 1 — no PR template encoding the mandatory loop exit criteria

**What was observed:** with only PR #8, there is no recurring template failure — but
nothing in-repo forces authors to name `Fixes #N`, the active `docs/DESIGN/` path,
or validate output before opening a PR. `AI_LAYER.md` documents the loop; GitHub
does not enforce it.

**Contrast with CI:** this repo **does** have real Actions (`.github/workflows/ci.yml`
plus package workflows). Do **not** cite "no CI" here — that is another product's
gap, not SpeakFlow's. Gap 1 here is **process surface on the PR**, not missing test CI.

**What to add (when ready):** `.github/pull_request_template.md` with required
fields: issue `Fixes #N`, spec path under `docs/DESIGN/`, validate commands run.

### Gap 2 — Dom / HITL smoke is acknowledged but not gated

**What was observed:** PR #8 test plan leaves
`Dom: npm run start:app smoke — one dictation into Cursor` unchecked. That is honest
documentation of an unrun human gate, not a fake green. `AI_LAYER.md` stop rule 3
says consider validate / project CI — it does not yet encode when HITL smoke is
mandatory vs deferrable.

**What to add (when ready):** a short CLAUDE.md or validate.md note: when Windows
delivery surfaces change, Dom smoke is required or explicitly waived in the PR body.

---

## What this pass did not check

- Content of `docs/DESIGN/` specs against the PR #8 diff (no active milestone path
  was named on the PR).
- Full Actions green history for PR #8 at merge time (check names may differ from
  today's `ci.yml`).
- Recurrence across later PRs — there are none yet. Re-run Workflow A after a few
  more merges.

---

## How live review (Workflow B) must use this file

- Judge only against entries above and the authority table in `SKILL.md`.
- Quote the documented rule text; cite PR/diff/body evidence.
- Sample size is **1 PR** — say "1 of 1", never "agents usually…".
- Never resolve a finding by inventing `docs/SYSTEM_PROMPT.md`,
  `PRODUCT_TRUTH_MARKETING_v1.md`, or `.cursor/commands/`.
- A clean trajectory report is **not** an auto-merge signal.
