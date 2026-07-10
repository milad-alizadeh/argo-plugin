---
title: Your first gated build
description: Run one feature through the canonical loop, start to finish.
---

This walks a small feature through the loop: a PRD, a plan, a hands-off build gated by receipts, and a review.

## 1. Write the PRD

```
/argo:write-prd
```

This produces a lightweight product spec, the durable what and why, with checkable requirements and, for UI-facing features, a user-agreed lo-fi wireframe. Skip straight to a plan for work with no meaningful product ambiguity (a bug fix, a small refactor).

## 2. Plan

Hand the PRD (or the raw task) to the `argo:planner` agent. It explores the real codebase, not a hypothetical one, and produces a step-by-step plan document with concrete file paths and an edge-case matrix, grounded in what actually exists.

## 3. Build

```
/argo:build-plan .argo/plans/<your-plan>.md
```

This is the hands-off path: one long-lived builder session works the plan slice by slice, inside its own git worktree, on its own branch. Every commit is gated, Probity enforces that each test was seen failing before the code that makes it pass, and a red-proof receipt has to exist before the commit gate lets it land. A checkpoint review runs partway through, and a final review runs after the last slice.

For interactive, one-slice-at-a-time TDD instead of a hands-off run, use `/argo:test-first`.

## 4. Land

Once the final review is clean, `argo:integrator` takes over: it syncs docs to what actually shipped, pushes the branch, and opens a pull request (or lands directly, in solo-maintainer mode), the only role permitted to push.

That is the whole loop: PRD, plan, gated build, review, land. Continue to [the pipeline](/how-it-works/the-pipeline/) for how the stages and gates fit together.
