# Judging rubric -- rendering a Tier 2 verdict

Used by both workflows: Workflow A (deciding whether an audit candidate is a real
finding worth adding to `failure-patterns.md`) and Workflow B (judging a live PR
against that rubric). The mechanics below are the same either way -- only what
happens with the verdict differs (see "Where the verdict goes" at the end).

## Why this is Tier 2, not Tier 1

Tier 1 (CI status, scope blast-radius, duplicate-vs-recent) is pure code -- API
calls and file-path checks, zero judgment, zero LLM tokens. It exists to cheaply
narrow history and surface *evidence*. **What Tier 1 structurally can't do is
confirm what a specific documented rule actually requires.** That's Tier 2's job.

**Tier 1's verdicts are inputs to your judgment, not conclusions you relay.** On
SpeakFlow, watch for:

| Tier 1 output | What it actually means here |
| :--- | :--- |
| `ci_status: PASS` with `passed: []` | **No usable CI evidence for this PR's check set** — treat as FAIL/no-evidence, not green. This repo *does* have `ci.yml`; empty list is still not a pass. |
| `scope_blast_radius: SKIP` | The heuristic didn't run. Zero signal. Not a pass. |
| `duplicate_vs_recent` naming a number | Confirm it is a PR (`gh pr view`) not an issue before citing. |

## The rubric — every verdict names the specific rule it's checking

Every Tier 2 judgment is against ONE specific entry in `failure-patterns.md` —
a rule violation or a coverage gap. Two concrete shapes:

### Shape A — Rule violation

1. Name the entry (e.g. "Violation 1 — no Fixes #N").
2. Quote the **documented rule** from `AI_LAYER.md`, `CLAUDE.md`, or
   `.claude/commands/` (verbatim short excerpt).
3. Cite **evidence** from this PR (diff hunk, body line, commit message, check).
4. State PASS / FAIL / NOT APPLICABLE for *this* PR.
5. If FAIL: one sentence on what in the AI layer would have prevented it.

### Shape B — Coverage gap

1. Name the gap entry.
2. Say whether this PR **illustrates** the gap, **avoids** it, or is unrelated.
3. Do not invent a new gap mid-review; only apply gaps already in the file.
   Propose new gaps only in Workflow A refreshes.

## Sample-size honesty

The installed rubric was mined on **2026-09-13** against **PR #8 only (n=1)**.
Never phrase a single prior observation as an established rate. Prefer
"1 of 1 prior PR showed X" over "agents usually skip Y".

## Authority — SpeakFlow only

Valid citation targets: `AI_LAYER.md`, `CLAUDE.md`, `docs/DESIGN/…`,
`.agents/…`, `.claude/commands/…`, and entries in `failure-patterns.md`.

Invalid leftovers (never cite as binding here): `PRODUCT_TRUTH_MARKETING_v1.md`,
`.cursor/commands/`, `docs/SYSTEM_PROMPT.md`, other products' AI layers.

**Never** resolve a finding by proposing `docs/SYSTEM_PROMPT.md`. This repo
already has `CLAUDE.md` — do not invent a second one.

## Where the verdict goes

- **Workflow A:** update `failure-patterns.md` only when evidence is real and
  distinct; keep n= honest.
- **Workflow B:** post ONE PR review comment; do not approve, request-changes,
  or merge. A clean report is not an auto-merge signal.
