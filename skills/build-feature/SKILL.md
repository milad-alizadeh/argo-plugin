---
name: build-feature
description: Build out an EXISTING plan doc autonomously — runs the build-slice workflow (test-first build → verify → adversarial confirm → commit, slice by slice) isolated in its own git worktree, then hands off to the integrator. Use when a plan doc already exists and you want it built hands-off; for interactive single-slice TDD use /argo:test-first instead.
---

# Build a Feature (automated, worktree-isolated)

The **automated** build stage of the canonical loop: take an existing plan doc and build
it out slice by slice, hands-off, in its **own git worktree** so it never touches your
working tree, runs alongside other builds without clashing, and lands as one reviewable
branch. It wraps the `build-slice` workflow with the isolation + integration lifecycle the
workflow deliberately stays out of.

Reach for this **when a plan doc already exists**. For interactive, human-driven
single-slice TDD, use `/argo:test-first`.

## 1. Preconditions — check all, fail loudly
- **A plan doc** (any size — even ten lines): path from the user. If none, ask; don't
  invent one. A minimal hand-written plan is fine; `argo:planner` is encouraged for
  non-trivial work but not required. The plan must be reachable from the branch the
  worktree derives from (commit it to the default branch first).
- **The workflow is installed:** `.claude/workflows/build-slice.*` must exist. If not,
  tell the user to run `/argo:setup-claude` first — never call a missing workflow.
- **The argo agents** `argo:builder` and `argo:reviewer` are available (the workflow uses
  them; unknown types silently downgrade to general-purpose). If absent, stop and say so.

No clean-tree check is needed: the build runs in a separate worktree, so the user's main
checkout (dirty or not) is untouched.

## 2. Isolate in a worktree
Call **EnterWorktree** to create a fresh worktree on a new branch off the default branch.
One run = one worktree = one branch. This is the isolation boundary — verified safe: the
`build-slice` workflow's spawned subagents inherit the worktree's cwd, so all building,
verifying, the retry `git reset`, and per-slice commits happen **inside the worktree**, on
its branch. Your main checkout is never written to, and concurrent builds in separate
worktrees never collide on the git index.

## 3. Run the build-slice workflow
Invoke the **`build-slice`** workflow (Workflow tool, `name: "build-slice"`) with
`args: { planPath: "<plan>" }`. If `.argo/blast-radius.json` exists (the graphify hot-set),
read it and pass its array as `args.blastRadiusPaths` too — so editing a high-impact module
escalates to review. It decomposes the plan into dependency-ordered slices and,
per slice, runs **Red** (write the failing test first, proven red) → **Green** (implement to
pass) → verify command → adversarial reviewer-confirm → commit, with bounded retries and a
hard stop, maintaining a durable `…-progress.md` beside the plan. Override `verifyCmd` /
`maxAttempts` only if the project defaults are wrong.
Running it spawns a fleet of subagents — expected; invoking this skill is the explicit opt-in.

## 4. Land or surface — always close out the worktree
Read the workflow's result:
- **All slices DONE** → hand the branch to **`argo:integrator`** (the authoritative
  pre-merge gate; build-slice's per-slice checks are dev-time): it re-verifies, opens the
  PR / merges to the default branch, and — on-device, on the default branch, never a
  worktree — refreshes graphify. Then **ExitWorktree** (`remove` once merged).
- **BLOCKED** (a slice exhausted retries) → do NOT merge. **ExitWorktree (`keep`)** so the
  worktree + branch stay on disk for inspection (never leave it dangling implicitly).
  Surface the blocked slice, its reasons, and the progress-doc path, and stop.

Either way the worktree is explicitly closed, never leaked.

## 5. Report
Relay: branch name, slices done vs blocked, the progress-doc path, the PR link (if landed),
and — for BLOCKED — the kept worktree path for inspection.
