#!/usr/bin/env node
// G24 gate (Spec §8 / M6_PUBLIC_LAUNCH_SPEC §6)
// Fails if any workflow triggered on push-to-branches or pull_request uses a macos runner.
// mac-package.yml is exempt: its push trigger is tags-only (push.tags: v*), not branch-triggered.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const workflowDir = resolve(root, ".github", "workflows");

function fail(msg) {
  process.stderr.write(`[check-workflows] FAIL: ${msg}\n`);
  process.exit(1);
}

// Extract the indented block under `on:` in a workflow file.
function extractOnBlock(content) {
  const m = content.match(/^on:\s*\n((?:[ \t][^\n]*(?:\n|$))*)/m);
  return m ? m[1] : null;
}

// True if the workflow has `pull_request` as an `on:` trigger.
function hasPullRequestTrigger(content) {
  // inline: on: pull_request  or  on: [pull_request, ...]
  if (/^on:\s+(?:pull_request\b|\[.*\bpull_request\b)/m.test(content)) return true;
  const block = extractOnBlock(content);
  return block != null && /^\s+pull_request\s*:/m.test(block);
}

// True if the workflow has a push trigger that is NOT restricted to tags-only.
// push: tags: ['v*'] (no branches:) is treated as tag-only and returns false.
function hasBranchPushTrigger(content) {
  // inline: on: push  or  on: [push, ...]
  if (/^on:\s+(?:push\b|\[.*\bpush\b)/m.test(content)) return true;
  const block = extractOnBlock(content);
  if (!block || !/^\s+push\s*:/m.test(block)) return false;

  // Extract the push: sub-block (lines indented deeper than the `push:` key)
  const pushMatch = block.match(/^([ \t]+)push:\s*\n((?:\1[ \t]+.*(?:\n|$))*)/m);
  if (!pushMatch) return true; // bare push: with no sub-keys = all pushes = branch-triggered

  const pushChildren = pushMatch[2];
  const hasTags = /^\s+tags\s*:/m.test(pushChildren);
  const hasBranches = /^\s+branches\s*:/m.test(pushChildren);
  // tags: only (no branches:) → tag-only push → NOT a branch push → exempt for macos
  if (hasTags && !hasBranches) return false;
  return true;
}

// Matches macos runner strings in runs-on: and matrix value lists
const MACOS_RUNNER_RE = /\bmacos-(?:latest|\d+)\b/i;

let files;
try {
  files = readdirSync(workflowDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
} catch (err) {
  fail(`Cannot read ${workflowDir}: ${err.message}`);
}

let violated = false;

for (const file of files) {
  const abs = resolve(workflowDir, file);
  let content;
  try {
    content = readFileSync(abs, "utf8");
  } catch (err) {
    fail(`Cannot read ${file}: ${err.message}`);
  }

  // G27 — generalized packaging-CI discipline (LD13 / S-L4):
  // Every *-package.yml must be dispatch/tags-only — no pull_request, no branch push.
  if (/-package\.ya?ml$/.test(file)) {
    if (hasPullRequestTrigger(content) || hasBranchPushTrigger(content)) {
      fail(`${file}: *-package.yml workflows must be workflow_dispatch/tags-only (LD13)`);
    }
  }

  const isBranchTriggered = hasPullRequestTrigger(content) || hasBranchPushTrigger(content);
  if (!isBranchTriggered) continue;

  // Workflow triggers on branches/PRs — scan non-comment lines for macos runners
  for (const [i, line] of content.split("\n").entries()) {
    if (/^\s*#/.test(line)) continue;
    if (MACOS_RUNNER_RE.test(line)) {
      process.stderr.write(
        `[check-workflows] FAIL: ${file}:${i + 1} — macos runner in branch/PR workflow: ${line.trim()}\n`,
      );
      violated = true;
    }
  }
}

if (violated) {
  fail(
    "macos runners found in branch/PR workflows — mac builds must live in mac-package.yml (dispatch/tags only)",
  );
}

process.stderr.write("[check-workflows] PASS\n");
