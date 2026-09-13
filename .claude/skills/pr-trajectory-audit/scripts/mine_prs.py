# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Deterministic half of the pr-trajectory-audit skill. Pure stdlib -- no framework,
no API key, no network calls beyond `gh` (which the user already has authenticated
if they're using GitHub at all). This is the "cheapest check first" tier: everything
in this file runs in milliseconds and costs zero LLM tokens.

Three subcommands:

  mine <owner/repo> [--limit N] [--window-days D] [--similarity T] [--out path.json]
      Pulls the repo's PR history via `gh pr list` (one bulk call, full body text
      included) and runs two passes over it:
        Pass 1 -- title back-references ("...(#N)" at the end of a title). Cheap,
                  high precision, LOW RECALL. Try this first and you'll usually
                  conclude a repo has almost no interesting failure chains. That
                  conclusion is usually wrong -- see Pass 2.
        Pass 2 -- body cross-references (fixes/closes/resolves/follow-up to/
                  regression from/reverts # N). This is where the real signal
                  lives. A PR referenced 2+ times by LATER PRs is a PR that needed
                  revisiting -- the "this failure mode recurred" signal.
      Also runs a duplicate-cluster detector: PRs opened within a short window of
      each other with high title-text similarity (stdlib difflib, no embeddings) --
      a coordination-failure signal (independent runs re-fixing the same thing),
      not a logic-bug signal.

  checks <owner/repo> <pr_number> [--window-days D] [--similarity T] [--json]
      Runs the scope blast-radius check plus a duplicate-vs-recent-PRs check on
      ONE PR, at open time -- not retrospectively. Prints structured findings
      (evidence), posts nothing. This is what the live-review workflow (Workflow B)
      calls before handing off to Claude's own Tier 2 judgment.

  scope [-] [--title T] [--files F] [--count N]
      Reads a single PR's {title, files, changedFiles} -- either as JSON piped in
      from `gh pr view <n> --json title,files,changedFiles` (pass "-") or via flags
      -- and applies a scope blast-radius heuristic: does a narrowly-titled
      "fix(module):" PR touch infra/config files or an unusually large file count
      that has no business being in that diff? Zero LLM calls. This is Tier 1, not
      Tier 2 -- it catches a real, cheap signal that a diff may not match its claim,
      *before* spending a judgment call on the actual diff content.

All three subcommands are deliberately simple heuristics, not proofs. They exist
to cheaply narrow "hundreds and hundreds of PRs" down to a handful worth a real
look -- see references/judging-rubric.md for what to do with what they flag.
"""

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher

CHAIN_TITLE_PATTERN = re.compile(r"\(#(\d+)\)\s*$")
BODY_REF_PATTERN = re.compile(
    r"(?:fixes|closes|resolves|follow-?up to|continuation of|regression from|reverts?)\s*#(\d+)",
    re.IGNORECASE,
)
# Deliberately excludes a "deps"/"dependencies" scope -- `fix(deps): ...` is a
# dependency-bump convention (Dependabot/Renovate semantic-commit presets), and
# those PRs legitimately touch lockfiles/package manifests that OUT_OF_SCOPE_MARKERS
# would otherwise flag as a false-positive scope mismatch on every single one.
NARROW_FIX_TITLE = re.compile(r"^fix\((?!deps\b|dependencies\b)[\w\-/. ]+\):", re.IGNORECASE)
# Automated/routine title patterns that legitimately cluster (same wording, close in
# time) but aren't a coordination-failure signal -- Dependabot/Renovate bumps and
# scheduled release-tag PRs. Excluded from the duplicate-cluster pass only; a repo
# using a different bot or a non-English release convention just won't match
# anything here -- see SKILL.md's Gotchas.
BOT_NOISE_TITLE = re.compile(
    r"^(bump |release \d|chore\(deps\)|deps?: bump|update dependency\b|update \S+ to v?\d)",
    re.IGNORECASE,
)
REVIEW_BOT_CHECK_NAMES = ["coderabbit", "codecov", "sonarcloud", "review"]
OUT_OF_SCOPE_MARKERS = [
    "Dockerfile", "docker-compose", "CHANGELOG", "package.json", "package-lock.json",
    "bun.lock", "yarn.lock", "poetry.lock", "uv.lock", "pyproject.toml",
    "requirements.txt", "go.mod", "go.sum", "Cargo.toml", "Cargo.lock",
    ".env.example", ".github/workflows/",
]


# ---------------------------------------------------------------------------
# mine
# ---------------------------------------------------------------------------

def _run_gh(cmd: list[str], context: str) -> str:
    """Run a `gh` command with one consistent, friendly failure mode -- used by
    every subcommand so a missing `gh`, a bad repo/PR number, or an auth problem
    fails the same clean way whether this runs interactively or unattended in CI
    (where a raw traceback is a genuinely worse failure than a `SystemExit` message,
    since it's the only signal a live-review Action run leaves behind)."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    except FileNotFoundError:
        raise SystemExit(
            f"`gh` (GitHub CLI) isn't installed or isn't on PATH -- required for {context}. "
            "Install it from https://cli.github.com/ and run `gh auth login`."
        )
    if result.returncode != 0:
        raise SystemExit(
            f"`gh` failed while {context} (exit {result.returncode}):\n{result.stderr.strip()}\n"
            "Check `gh auth status` and that the repo/PR number is correct."
        )
    return result.stdout


def fetch_prs(repo: str, limit: int, search: str | None = None) -> list[dict]:
    cmd = ["gh", "pr", "list", "--repo", repo, "--state", "all", "--limit", str(limit)]
    if search:
        cmd += ["--search", search]
    cmd += ["--json", "number,title,author,createdAt,mergedAt,closedAt,labels,state,body"]
    return json.loads(_run_gh(cmd, f"listing PRs for {repo!r}"))


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def find_duplicate_clusters(
    prs: list[dict], window_days: int, similarity_threshold: float
) -> list[list[dict]]:
    """Group PRs opened within `window_days` of each other whose titles are similar.
    Title-only, no diff/file comparison -- deliberately simple."""
    sorted_prs = sorted(
        (p for p in prs if p.get("createdAt") and not BOT_NOISE_TITLE.match(p["title"] or "")),
        key=lambda p: p["createdAt"],
    )
    clusters: list[list[dict]] = []
    used: set[int] = set()

    for i, p in enumerate(sorted_prs):
        if p["number"] in used:
            continue
        p_dt = _parse_dt(p["createdAt"])
        group = [p]
        for q in sorted_prs[i + 1:]:
            if q["number"] in used:
                continue
            q_dt = _parse_dt(q["createdAt"])
            if q_dt is None or (q_dt - p_dt).days > window_days:
                break  # sorted by date -- once past the window, stop scanning
            sim = SequenceMatcher(None, (p["title"] or "").lower(), (q["title"] or "").lower()).ratio()
            if sim >= similarity_threshold:
                group.append(q)
        if len(group) >= 2:
            for m in group:
                used.add(m["number"])
            clusters.append(group)

    return clusters


def cmd_mine(args: argparse.Namespace) -> None:
    prs = fetch_prs(args.repo, args.limit)
    by_number = {p["number"]: p for p in prs}
    print(f"Pulled {len(prs)} PRs from {args.repo} (gh pr list --state all --limit {args.limit}).")

    # Pass 1: title chains
    title_edges: dict[int, list[dict]] = defaultdict(list)
    for p in prs:
        m = CHAIN_TITLE_PATTERN.search(p["title"] or "")
        if m:
            title_edges[int(m.group(1))].append(p)
    title_multi = {ref: v for ref, v in title_edges.items() if len(v) >= 2}

    print(f"\nPass 1 (title back-reference '(#N)'): {len(title_multi)} PR(s) referenced 2+ times")
    for ref, plist in sorted(title_multi.items(), key=lambda kv: -len(kv[1])):
        print(f"  #{ref} <- {[fp['number'] for fp in plist]}")

    # Pass 2: body cross-references
    body_ref_counts: Counter = Counter()
    for p in prs:
        for m in BODY_REF_PATTERN.finditer(p.get("body") or ""):
            body_ref_counts[int(m.group(1))] += 1

    print(
        f"\nPass 2 (body cross-reference fixes/closes/resolves/follow-up to/"
        f"regression from/reverts #N): {sum(body_ref_counts.values())} references "
        f"across {len(body_ref_counts)} unique target PRs"
    )
    top = body_ref_counts.most_common(args.top)
    print(f"Top {len(top)} most-referenced (needed the most follow-up attention):")
    for ref, count in top:
        orig = by_number.get(ref)
        title = (orig["title"][:70] if orig else "(original not in this pull -- may be an issue, not a PR)")
        print(f"  #{ref} referenced {count}x -- {title}")

    # Coverage self-check: if the narrower/cheaper search (Pass 1) found far less
    # than the broader one (Pass 2), that gap is itself the finding -- flag it
    # instead of letting a thin Pass 1 read as "this repo has few interesting
    # patterns." Generalizes past this specific regex pair: any time a mining
    # method's yield is this lopsided against a broader method on the SAME data,
    # treat the narrower method's near-empty result as unproven, not as a clean
    # bill of health.
    if len(body_ref_counts) >= 10 and len(title_multi) < max(2, len(body_ref_counts) * 0.05):
        print(
            f"\n[Coverage check: Pass 1 found {len(title_multi)} vs. Pass 2's "
            f"{len(body_ref_counts)} -- Pass 1 alone would have badly undercounted here. "
            "Don't conclude a repo 'has no interesting patterns' from one search method's "
            "thin result; this is why Pass 2 always runs regardless of what Pass 1 found.]"
        )

    # Duplicate clusters
    clusters = find_duplicate_clusters(prs, args.window_days, args.similarity)
    real_clusters = [c for c in clusters if len(c) >= 2]
    print(
        f"\nDuplicate-cluster detector ({args.window_days}-day window, "
        f"title similarity >= {args.similarity}): {len(real_clusters)} cluster(s) found"
    )
    for c in sorted(real_clusters, key=lambda c: -len(c))[:args.top]:
        print(f"  cluster ({len(c)} PRs):")
        for p in sorted(c, key=lambda x: x["number"]):
            print(f"    #{p['number']} [{p['state']}] {p['title'][:80]}")

    if args.out:
        payload = {
            "repo": args.repo,
            "total_prs": len(prs),
            "top_referenced": [
                {"number": ref, "reference_count": count, "title": (by_number.get(ref) or {}).get("title")}
                for ref, count in top
            ],
            "duplicate_clusters": [
                [{"number": p["number"], "title": p["title"], "state": p["state"]} for p in c]
                for c in real_clusters
            ],
        }
        args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nWrote candidate shortlist to {args.out}")

    print(
        "\nNote: numbers above can be issues, not PRs -- GitHub shares one sequence "
        f"for both. If `gh pr view <n> --repo {args.repo}` 404s, try "
        f"`gh issue view <n> --repo {args.repo}` instead before assuming the candidate "
        "is unreachable."
    )
    print(
        "\nNext step: for the top few candidates above, run "
        "`gh pr view <n> --repo "
        f"{args.repo} --json title,files,changedFiles | uv run "
        ".claude/skills/pr-trajectory-audit/scripts/mine_prs.py scope -` "
        "for the scope check, read the actual diff for a Tier 2 judgment "
        "(references/judging-rubric.md), then write any real, distinct pattern into "
        "references/failure-patterns.md -- that file is what the live review reads on "
        "every future PR."
    )


# ---------------------------------------------------------------------------
# scope
# ---------------------------------------------------------------------------

def check_scope_blast_radius(title: str, files: list[str], changed_file_count: int) -> dict:
    if not NARROW_FIX_TITLE.match(title or ""):
        return {
            "verdict": "SKIP",
            "reason": "title doesn't claim a narrow module fix (fix(module): ...) -- heuristic doesn't apply",
        }
    hits = [f for f in files if any(marker in f for marker in OUT_OF_SCOPE_MARKERS)]
    if hits or changed_file_count > 20:
        return {
            "verdict": "FAIL",
            "reason": (
                f"title claims a narrow fix but touches {changed_file_count} files"
                + (f", including out-of-scope: {hits[:5]}" if hits else "")
            ),
        }
    return {"verdict": "PASS", "reason": f"{changed_file_count} files, scope looks consistent with title"}


def check_ci_status(repo: str, pr_number: int) -> dict:
    """Did any real CI check (not just a review bot) actually run on this PR?
    Direct evidence toward the "validation claimed, no evidence it ran" rule --
    see references/failure-patterns.md, Violation 1. Deliberately excludes
    review/lint-comment bots (CodeRabbit and similar) from counting as "real CI" --
    those comment on the diff, they don't execute the repo's own validate/test/
    build suite, which is what a documented validation step actually requires."""
    result = subprocess.run(
        ["gh", "pr", "checks", str(pr_number), "--repo", repo, "--json", "name,state,bucket"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if result.returncode != 0 and not result.stdout.strip():
        return {"verdict": "UNKNOWN", "reason": f"`gh pr checks` failed: {result.stderr.strip()[:200]}"}
    try:
        checks = json.loads(result.stdout) if result.stdout.strip() else []
    except json.JSONDecodeError:
        checks = []
    real_checks = [c for c in checks if not any(bot in (c.get("name") or "").lower() for bot in REVIEW_BOT_CHECK_NAMES)]
    if not real_checks:
        return {
            "verdict": "FAIL",
            "reason": f"no real CI check ran on this PR ({len(checks)} total check(s), all review/lint bots or none at all)",
        }
    # `gh pr checks --json bucket` returns five buckets: pass, fail, pending, skipping,
    # cancel. Only "fail" is an actual failure -- a check that's still running (pending)
    # or was cancelled (e.g. superseded by a newer push on a `synchronize` event, which
    # is exactly when this workflow itself re-runs) is NOT evidence the suite didn't
    # pass, and reporting it as FAIL is a false positive Workflow B is especially prone
    # to, since it fires on the same `pull_request: [opened, synchronize]` events real
    # CI does -- this check can easily run while CI is still mid-flight.
    failed = [c["name"] for c in real_checks if (c.get("bucket") or "").lower() == "fail"]
    if failed:
        return {"verdict": "FAIL", "reason": f"real CI ran but did not pass: {failed}"}
    pending = [c["name"] for c in real_checks if (c.get("bucket") or "").lower() == "pending"]
    if pending:
        return {
            "verdict": "PENDING",
            "reason": f"real CI is still running, not yet finished: {pending} -- re-check later rather than treating this as a failure",
        }
    cancelled = [c["name"] for c in real_checks if (c.get("bucket") or "").lower() == "cancel"]
    passed = [c["name"] for c in real_checks if (c.get("bucket") or "").lower() == "pass"]
    if cancelled and not passed:
        return {
            "verdict": "UNKNOWN",
            "reason": f"all real check(s) were cancelled, none completed: {cancelled} -- inconclusive, not a failure (often a superseded run from a later push)",
        }
    reason = f"{len(passed)} real CI check(s) ran and passed: {passed}"
    if cancelled:
        reason += f" ({len(cancelled)} other check(s) cancelled, likely superseded: {cancelled})"
    return {"verdict": "PASS", "reason": reason}


def cmd_checks(args: argparse.Namespace) -> None:
    """Tier 1 ONLY, on ONE PR, at open time -- not retrospectively. This is
    evidence-gathering, not a verdict and not a comment: it prints structured
    findings (JSON with --json, human-readable otherwise) and does nothing else.
    The live-review workflow (SKILL.md, run by Claude in CI) reads this output as
    supporting evidence for its own judgment against references/failure-patterns.md
    -- posting the actual review comment is that step's job, not this script's.
    Keeping the split this way means the deterministic checks stay testable and
    reusable on their own (this is what the audit's step 4 calls too)."""
    pr = json.loads(
        _run_gh(
            ["gh", "pr", "view", str(args.pr_number), "--repo", args.repo,
             "--json", "title,body,files,changedFiles,createdAt"],
            f"viewing PR #{args.pr_number} in {args.repo!r}",
        )
    )
    title = pr.get("title", "")
    files = [f["path"] for f in (pr.get("files") or [])]
    count = pr.get("changedFiles") or len(files)  # `or`, not `.get(default)` -- gh can return changedFiles: null

    result = {"repo": args.repo, "pr_number": args.pr_number, "title": title, "checks": {}}

    result["checks"]["ci_status"] = check_ci_status(args.repo, args.pr_number)
    result["checks"]["scope_blast_radius"] = check_scope_blast_radius(title, files, count)

    duplicates = []
    pr_dt = _parse_dt(pr.get("createdAt"))
    if pr_dt is not None and not BOT_NOISE_TITLE.match(title):
        # Date-bounded search centered on THIS PR's own created date, not "most
        # recent N" -- this must work on a PR from any point in the repo's
        # history, not just brand-new ones (a plain --limit pull only grabs the
        # newest N and silently misses older PRs' own eras once a repo has grown
        # past that limit).
        from datetime import timedelta
        start = (pr_dt - timedelta(days=args.window_days)).strftime("%Y-%m-%d")
        end = (pr_dt + timedelta(days=args.window_days)).strftime("%Y-%m-%d")
        nearby = fetch_prs(args.repo, limit=200, search=f"created:{start}..{end}")
        for other in nearby:
            if other["number"] == args.pr_number or BOT_NOISE_TITLE.match(other["title"] or ""):
                continue
            other_dt = _parse_dt(other.get("createdAt"))
            if other_dt is None or abs((pr_dt - other_dt).days) > args.window_days:
                continue
            sim = SequenceMatcher(None, title.lower(), (other["title"] or "").lower()).ratio()
            if sim >= args.similarity:
                duplicates.append({"number": other["number"], "title": other["title"], "similarity": round(sim, 2)})
    result["checks"]["duplicate_vs_recent"] = {
        "verdict": "FAIL" if duplicates else "PASS",
        "matches": sorted(duplicates, key=lambda d: -d["similarity"]),
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"PR #{args.pr_number} -- {title}")
        ci = result["checks"]["ci_status"]
        print(f"  ci_status: {ci['verdict']} -- {ci['reason']}")
        sb = result["checks"]["scope_blast_radius"]
        print(f"  scope_blast_radius: {sb['verdict']} -- {sb['reason']}")
        dv = result["checks"]["duplicate_vs_recent"]
        print(f"  duplicate_vs_recent: {dv['verdict']}" + (f" -- {len(dv['matches'])} match(es)" if duplicates else ""))
        for d in duplicates:
            print(f"    #{d['number']} ({d['similarity']:.0%} similar): {d['title']}")


def cmd_scope(args: argparse.Namespace) -> None:
    if args.input == "-":
        raw = sys.stdin.read()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise SystemExit(f"stdin wasn't valid JSON ({e}). Expected `gh pr view --json title,files,changedFiles` output.")
        title = data.get("title", "")
        files = [f["path"] for f in data.get("files", [])] if isinstance(data.get("files"), list) else []
        count = data.get("changedFiles") or len(files)  # `or`, not `.get(default)` -- gh can return changedFiles: null
    else:
        title = args.title or ""
        files = args.files.split(",") if args.files else []
        count = args.count if args.count is not None else len(files)

    result = check_scope_blast_radius(title, files, count)
    print(f"{result['verdict']}: {result['reason']}")


# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_mine = sub.add_parser("mine", help="Mine a repo's PR history for trajectory-failure candidates")
    p_mine.add_argument("repo", help="owner/repo, e.g. DifTorHeSmushma/oracle-speakflow")
    p_mine.add_argument("--limit", type=int, default=1000, help="max PRs to pull (default 1000)")
    p_mine.add_argument("--top", type=int, default=10, help="how many top candidates to print (default 10)")
    p_mine.add_argument("--window-days", type=int, default=14, help="duplicate-cluster time window (default 14)")
    p_mine.add_argument("--similarity", type=float, default=0.55, help="duplicate-cluster title-similarity threshold 0-1 (default 0.55)")
    p_mine.add_argument("--out", type=lambda s: __import__("pathlib").Path(s), default=None, help="optional path to write the candidate shortlist JSON")
    p_mine.set_defaults(func=cmd_mine)

    p_checks = sub.add_parser("checks", help="Tier 1 evidence for ONE PR: scope blast-radius + duplicate-vs-recent. Prints findings, posts nothing.")
    p_checks.add_argument("repo", help="owner/repo")
    p_checks.add_argument("pr_number", type=int, help="the PR number to check")
    p_checks.add_argument("--window-days", type=int, default=14, help="duplicate-check time window (default 14)")
    p_checks.add_argument("--similarity", type=float, default=0.55, help="duplicate-check title-similarity threshold 0-1 (default 0.55)")
    p_checks.add_argument("--json", action="store_true", help="machine-readable output (for the live-review workflow to read)")
    p_checks.set_defaults(func=cmd_checks)

    p_scope = sub.add_parser("scope", help="Check one PR's scope blast-radius (Tier 1b)")
    p_scope.add_argument("input", nargs="?", default="-", help="'-' to read `gh pr view --json title,files,changedFiles` from stdin (default), or omit and use --title/--files/--count")
    p_scope.add_argument("--title", help="PR title (only used when input isn't '-')")
    p_scope.add_argument("--files", help="comma-separated file paths (only used when input isn't '-')")
    p_scope.add_argument("--count", type=int, help="changed file count override")
    p_scope.set_defaults(func=cmd_scope)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
