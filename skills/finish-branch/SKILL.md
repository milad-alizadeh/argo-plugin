---
name: finish-branch
description: Close out a finished development branch safely — merge locally, hand to the integrator for a PR, keep for later, or discard — with the exact worktree/branch cleanup ordering. Use when work on a branch/worktree is done and the user says finish, merge, land, clean up, or discard the branch.
---

# Finish a Development Branch

The end-of-branch decision is the user's; this skill's job is to present the
real options, get an explicit choice, and execute the chosen path in the one
ordering that doesn't strand state.

## 0. Detect where you are

- `git rev-parse --abbrev-ref HEAD` — detached HEAD? Offer only options 3/4
  below (there is no branch to merge or PR).
- `git worktree list` — is this branch checked out in a worktree? That
  changes the cleanup ordering (step §3).
- `git status --short` — uncommitted changes? Surface them FIRST; never
  carry silent dirt into a merge or a discard.

## 1. Present exactly these options — user picks

1. **Merge locally** into the default branch (solo-repo fast path).
2. **Push + PR** via `argo:integrator` (the reviewed-landing path — the
   integrator pushes and opens the PR; it never merges; merging happens via
   the PR, and the post-merge hook refreshes what needs refreshing).
3. **Keep** — leave branch + worktree on disk, exit cleanly, note where it
   lives.
4. **Discard** — destroy the branch and its work.

For **discard**, require the user to literally type `discard` — a yes/y/ok
does not destroy work. List what will be lost (commits not on the default
branch: `git log --oneline <default>..<branch>`) before asking.

## 2. Execute — merge path ordering (the footgun section)

The ordering below is load-bearing; each step depends on the previous:

1. Merge: `git checkout <default> && git merge <branch>`.
2. **Verify the merged result** (project's verify commands) BEFORE any
   cleanup — a broken merge with the branch already deleted is a recovery
   job.
3. Remove the worktree FIRST: `git worktree remove <path>` — and run it
   from OUTSIDE the worktree being removed (git refuses from inside).
4. THEN delete the branch: `git branch -d <branch>` — git refuses to delete
   a branch a worktree still references, which is why 3 precedes 4.

For **discard**: same ordering, minus merge/verify, with `git worktree
remove --force` + `git branch -D` only after the typed confirmation.

## 3. Report

State what happened: merged/PR'd/kept/discarded, the default branch's new
HEAD (if merged), what was cleaned up, and anything deliberately left on
disk (kept worktrees, with paths).

Cross-refs: build-plan §7 lands its branch through option 2; the interactive
paths (1/3/4) are this skill's own. Integrator preconditions live in
`agents/integrator.md`.
