---
name: build-feature
description: Build out an EXISTING plan doc autonomously — runs the build-slice workflow (test-first build → verify → adversarial confirm → commit, slice by slice) isolated on a dedicated feature branch, then hands off to the integrator. Use when a plan doc already exists and you want it built hands-off; for interactive single-slice TDD use /argo:test-first instead.
---

# Build a Feature (automated, branch-isolated)

The **automated** build stage of the canonical loop: take an existing plan doc and build
it out slice by slice, hands-off, on its own branch so the default branch stays clean and
the whole feature lands as one reviewable unit. It wraps the `build-slice` workflow with
the isolation + integration lifecycle the workflow deliberately stays out of.

Reach for this **when a plan doc already exists**. For interactive, human-driven
single-slice TDD, use `/argo:test-first`.

## 1. Preconditions — check all, fail loudly
- **A plan doc** (any size — even ten lines is fine): path from the user. If none is
  given, ask; don't invent one. A minimal hand-written plan is acceptable — running
  `argo:planner` first is encouraged for non-trivial work but not required.
- **The workflow is installed:** `.claude/workflows/build-slice.*` must exist. If not,
  tell the user to run `/argo:setup-claude` first — never call a missing workflow.
- **The argo agents** `argo:builder` and `argo:reviewer` are available (the workflow uses
  them; unknown types silently downgrade to general-purpose). If absent, stop and say so.
- **Clean working tree.** The build commits in place and discards rejected attempts with
  `git reset --hard`; refuse to start on a dirty tree (the user's uncommitted work would
  be at risk). Ask them to commit or stash first.

## 2. Isolate on a feature branch
Create and switch to a dedicated branch off the repository's **default branch** (detect
it — don't assume `main`). One run = one branch: every slice commit lands here, the
default branch is untouched, and the feature is reviewable as a unit.

> Concurrent / fire-and-forget runs that must not share a working tree want a git
> **worktree** instead. That is opt-in and currently **unverified** for this workflow: the
> Workflow engine can't pin a spawned subagent's cwd, so worktree isolation depends on
> subagents inheriting the session cwd — and a wrong cwd combined with the retry
> `git reset --hard` is destructive. Confirm that behaviour empirically before using a
> worktree here; until then, prefer the branch.

## 3. Run the build-slice workflow
Invoke the **`build-slice`** workflow (Workflow tool, `name: "build-slice"`) with
`args: { planPath: "<plan>" }`. It decomposes the plan into dependency-ordered slices and,
per slice, runs builder (test-first) → verify command → adversarial reviewer-confirm →
commit, with bounded retries and a hard stop, maintaining a durable `…-progress.md` beside
the plan. Override `verifyCmd` / `maxAttempts` only if the project defaults are wrong.
Running it spawns a fleet of subagents — expected; invoking this skill is the explicit opt-in.

## 4. Land or surface
Read the workflow's result:
- **All slices DONE** → hand the branch to **`argo:integrator`**. The integrator owns the
  *authoritative* pre-merge gate (build-slice's per-slice checks are dev-time): it
  re-verifies, opens the PR / merges to the default branch, and — on-device, on the default
  branch, never a worktree — refreshes graphify.
- **BLOCKED** (a slice exhausted retries) → do NOT merge. Surface the blocked slice, its
  reasons, and the progress-doc path; leave the branch for inspection; stop. A broken
  prerequisite must not become a half-built feature.

## 5. Report
Relay: branch name, slices done vs blocked, the progress-doc path, and the PR link (if landed).
