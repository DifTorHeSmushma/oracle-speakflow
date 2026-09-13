# Mining methodology -- why two passes, and what each one is actually for

This is the "how do you even find failure modes in hundreds of PRs" problem --
error analysis (look at real data, find what actually broke) applied to a PR graph
instead of a chat transcript. Read this before mining a new repo, and again before
explaining the approach to someone else -- the naive version of this genuinely fails
first, and that failure is itself the lesson worth keeping.

## Pass 1 -- title back-references (`"...(#1234)"`)

Some projects tag a fix commit's title with the PR/issue number it addresses, e.g.
`fix(workflows): resolve bash via absolute path on Windows (#1326)`. Regex for a
trailing `(#N)` on the title, count how many times each `N` gets referenced by a
*later* PR.

**This is cheap and high-precision. It is also almost useless on its own.** Run
against a real 1,321-PR history, it found exactly 2 PR numbers referenced 2+
times. Taken at face value, that says "this project has almost no interesting
failure chains." That conclusion is wrong -- most PRs simply don't use this title
convention, even in projects with a strong "fixes #N" habit in the body text. Pass 1
has low recall: it only catches the subset of authors who happened to tag the title
a specific way.

**The lesson worth keeping, independent of the tool:** the "obvious" first-pass
metric can look clean while the real signal sits somewhere you didn't check yet.
Don't report "no interesting patterns found" off a single pass -- that's the same
mistake as trusting a benchmark score without reading its methodology.

## Pass 2 -- body cross-references (where the real signal is)

Regex over the PR **body** text, not the title, for cross-reference language:
`fixes|closes|resolves|follow-up to|continuation of|regression from|reverts? #N`.

Run against the same 1,321-PR history, this found 627 references across 482 unique
target PRs -- roughly 250x the signal Pass 1 found. This is because most authors
write "Fixes #1273" or "Follow-up to #1516" in the *body*, in prose, not as a
suffix on the title.

**What the ranking means:** a PR number referenced 2+ times by later PRs is a PR
that needed revisiting. That's the "this failure mode recurred" signal -- exactly
what open coding / axial coding is looking for when the data is a chat transcript,
just expressed through a different artifact shape (a cross-reference graph instead
of a paragraph of notes).

**What it does NOT mean by itself:** a high reference count doesn't automatically
mean "root cause vs. symptom." It could also mean: a genuinely hard, multi-part
feature that took several honestly-scoped PRs; an actively-discussed area of the
codebase with lots of legitimate follow-on work; or noise from an unrelated PR that
happens to mention the same number in passing. **Read the actual PR bodies (and
comments/closing reason) before calling something a finding** -- the regex narrows
a haystack to a candidate list, it doesn't render a verdict. That verification is
Workflow A step 4 in `SKILL.md`, and it's not optional.

## What both passes do on a repo with almost no history — the SpeakFlow case

Worth its own section, because this is the state of this repo today and the
failure mode is *not* "returns nothing."

`mine DifTorHeSmushma/oracle-speakflow --limit 100` on 2026-09-13 pulled **1 PR** (#8 —
the only merged PR the repo has had) and reported:

```
Pass 1 (title back-reference '(#N)'): 0 PR(s) referenced 2+ times
Pass 2 (body cross-reference ...): 0 references across 0 unique target PRs
Duplicate-cluster detector (14-day window, title similarity >= 0.55): 0 cluster(s) found
```

Pass 1, Pass 2, and the cluster detector returned honest zeros. That is the correct
outcome when there is no later PR revisiting an earlier one. **Do not invent
recurrence** just because the table looks empty — read the single PR by hand
(see `failure-patterns.md`).

Three rules follow, and they generalise beyond this repo:

1. **A cross-reference count is only a recurrence signal if the citing PRs are
   *different* PRs, and *later* ones.** One PR citing the same number twice is one
   data point, not two.
2. **Confirm a candidate number is a PR before writing about it.** GitHub shares
   one number sequence between issues and PRs. `gh pr view <n>` 404s on an issue;
   `gh issue view <n>` resolves it. On SpeakFlow, #8 is the PR — most other
   numbers in the sequence are issues.
3. **Below roughly a dozen PRs, the heuristics cannot work and the honest method is
   to read every PR.** That is exactly what produced `references/failure-patterns.md`
   here. Say so in the audit rather than presenting a hand-read result as a mined
   one, and don't report "no interesting patterns" when what you mean is "the
   ranking tier has nothing to rank."

## The duplicate-cluster pass -- a different failure class entirely

Title-similarity clustering (stdlib `difflib.SequenceMatcher`, no embeddings, no
external service) over PRs opened within a short time window of each other. This
catches a structurally different problem than Pass 1/2: not "the fix didn't fully
work," but "multiple independent attempts fixed the same thing without knowing
about each other."

This is a coordination failure, not a logic bug -- worth stating explicitly when
reporting a finding, because the fix is different too (visibility/dedup process, not
a code change). It's also a meaningful signal specifically for **agentic** coding
workflows: parallel worktree-isolated agent runs, or several contributors each
handed the same bug independently, can produce this exact pattern. Keep this pass
live even when it has nothing to cluster today.

**Known false-positive class, filtered automatically:** Dependabot/Renovate-style
"Bump X from A to B" PRs and scheduled "Release N.N.N" PRs cluster on wording
constantly without being a coordination failure at all -- they're supposed to look
similar. `scripts/mine_prs.py` filters both patterns out of the duplicate-cluster
pass by default. A repo using a different bot-title convention (or a different
release-automation tool) may still produce this kind of noise -- eyeball clusters
before reporting them.

**Known limitation, not hidden:** this detector's recall is not perfect. Against a
known real cluster of near-identical PRs, one run recovered every member; against a
smaller, harder cluster where later PR titles diverged more in wording, it only
partially grouped correctly -- one member landed in an unrelated cluster instead.
That's a real precision/recall gap in a first-pass heuristic, and it's worth saying
out loud rather than tuning the threshold until it looks clean on one example: **a
first eval attempt rarely comes out perfect. You find what it misses, and you
decide whether that miss matters enough to fix the heuristic or just read a little
wider by hand.**
