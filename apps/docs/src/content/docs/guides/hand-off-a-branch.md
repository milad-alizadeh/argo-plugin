---
title: Hand off a branch
description: Close out a finished development branch safely.
---

The end-of-branch decision — merge, PR, keep, or discard — belongs to the person doing the work. Argo's job is to present the real options and execute the chosen one without stranding state.

## Run it

```
/argo:finish-branch
```

This first detects where the branch actually is: whether it's checked out in a worktree (which changes the cleanup ordering), whether there's uncommitted work (surfaced before anything else happens, never silently carried into a merge or a discard), and whether the current HEAD is even a branch at all.

## The options

- **Merge locally** — for solo-maintainer projects in merge landing mode; lands the branch on the default branch directly.
- **Hand to the integrator for a PR** — the normal path in PR landing mode. `argo:integrator` syncs docs to what actually shipped, pushes the branch, and opens or updates the pull request. It's the only role permitted to push.
- **Keep for later** — leaves the branch and its worktree on disk, untouched, for a future session to pick back up.
- **Discard** — for abandoned work; removes the branch and its worktree after confirming there's nothing worth keeping.

## Worktree cleanup ordering

A branch built inside a git worktree (the default for `/argo:build-plan` runs) has to be exited before its worktree can be removed — removing the worktree out from under a live session strands it. `/argo:finish-branch` handles that ordering itself; it never asks the person driving it to remember the sequence.

That closes the loop this guide set covers: install, run a feature through the pipeline, wire up design if the project uses Figma, resolve review feedback, and hand off the finished branch. See [the pipeline](/how-it-works/the-pipeline/) for how the stages fit together, or the [reference](/reference/) section for every skill, agent, and playbook in detail.
