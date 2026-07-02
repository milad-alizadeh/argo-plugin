---
name: build-plan
description: Build out an EXISTING plan doc autonomously — ONE long-lived builder session works through the plan slice by slice in its own git worktree, with deterministic hooks (red-proof + trust gates) gating every commit, a checkpoint review at the plan's seam, and one final reviewer pass before the integrator lands it. Use when a plan doc already exists and you want it built hands-off; for interactive single-slice TDD use /argo:test-first instead.
---

# Build a Feature (single-session, worktree-isolated, hook-gated)

The **automated** build stage of the canonical loop: take an existing plan doc and build
it slice by slice in **one long-lived session** inside its **own git worktree**, landing
as one reviewable branch.

Why one session, not agents-per-slice: slices are strictly sequential — a fresh context
per slice re-reads the whole codebase every time and pays for it in tokens (a fleet-based
predecessor burned ~800k tokens failing on slice 1). Subagents pay off only for parallel
work or read-isolation. Determinism lives in the **gates**, and gates belong in hooks
(deterministic, ~free) — never in agent narration (expensive, gameable).

Reach for this **when a plan doc already exists**. For interactive, human-driven
single-slice TDD, use `/argo:test-first`.

## 1. Preconditions — check all, fail loudly
- **A plan doc** (any size — even ten lines): path from the user. If none, ask; don't
  invent one. A minimal hand-written plan is fine; `argo:planner` is encouraged for
  non-trivial work but not required. The plan must be reachable from the branch the
  worktree derives from (commit it to the default branch first).
- **argo:reviewer** is available (checkpoint + final review). If absent, stop and say so.
- **Verify commands** are known: the project's real typecheck/lint/test commands (from
  CLAUDE.md stack-facts or the manifests). Never guess.

No clean-tree check is needed: the build runs in a separate worktree, so the user's main
checkout (dirty or not) is untouched.

## 2. Isolate in a worktree
Call **EnterWorktree** to create a fresh worktree on a new branch off the default branch.
One run = one worktree = one branch. All building, verifying, and committing happens
inside the worktree; the main checkout is never written to, and concurrent builds in
separate worktrees never collide on the git index.

## 3. Arm the gates — `.argo/build-mode.json`
Ensure `.argo/` is gitignored, then write the build-mode marker in the worktree root.
While this file exists, the plugin's commit gates (`red-proof-gate.mjs`,
`trust-gate.mjs` — PreToolUse on `git commit`) are ARMED and fail-closed; without it
they are inert. Update it **at the start of every slice**:

```json
{
  "plan": "<plan path>",
  "slice": "<current slice id>",
  "testable": true,
  "requiresLaunch": false
}
```

- `testable: false` — copy from the plan step's marker. Non-behavioral slices (design
  tokens, config, pure styling) are exempt from red-green: no forced failing test, no
  edge-case-matrix ceremony. Verify (typecheck/lint/test suite) still runs.
- `requiresLaunch: true` — for slices that ship launchable app/UI behaviour in the Argo
  runtime: the trust gate then demands a fresh launch-evidence receipt
  (`.argo/launch-receipt.json`, written by the app itself when launched and exercised —
  e.g. by the slice's e2e run). Argo-runtime-specific; leave `false` elsewhere.

**Delete the marker when the build ends** (done or blocked) — never leave gates armed.

## 4. Build loop — per slice, in plan order
Work the plan's steps strictly in order; keep a `…-progress.md` beside the plan doc
(one row per slice: status, commit sha, notes) updated after every slice.

For each slice:
1. **Update** `.argo/build-mode.json` to this slice.
2. **Red** (skip if `testable: false`): write the test that specifies the slice's
   behaviour through the real interface (per the project's testing rules — DOM/API/CLI,
   not internals). Run it; record the non-zero exit code.
3. **Green**: implement the minimum to pass. Run the test; record exit code 0.
4. **Receipt**: write `.argo/red-proof.json`:
   ```json
   { "slice": "<id>", "testFile": "<path>", "redExit": 1, "greenExit": 0,
     "recordedAt": <epoch ms> }
   ```
   The red-proof gate blocks the commit without it — receipt must name THIS slice,
   the test file must exist, `redExit` non-zero, `greenExit` 0, and it must postdate
   HEAD (no reuse across slices).
5. **Verify** (scoped): run the affected workspace's typecheck + lint + tests — not the
   full graph every slice; the checkpoint and final review run the full suite.
6. **Commit** (conventional message, one slice = one commit). The gates check the
   receipts deterministically; if blocked, fix the real problem — never delete the
   marker to sneak a commit through.
7. **Update the progress doc.**

If a slice won't go green after ~3 honest attempts: mark it blocked in the progress doc
with the failure evidence, STOP the loop, and surface — do not thrash.

## 5. Resume protocol (verbatim — 12-slice plans outlive one context window)
If the session compacts or a fresh session takes over: read the plan doc, the progress
doc, and `git log --oneline` on the branch; the next unchecked plan step is the next
action. Never re-do a committed step.

**tdd-guard clears on every session start** — if tdd-guard is installed, its
`test.json` resets when a new session boots, so red/green evidence must be
re-established by running tests *within the resumed session*, as a **direct runner
invocation** (a turbo cache hit doesn't spawn the runner and leaves `test.json`
stale). `.argo/red-proof.json` — not tdd-guard's live file — is the durable
cross-session proof the commit gate actually checks.

## 6. Review — twice per feature, never per slice
- **Checkpoint review** at the plan's declared seam (or halfway if none declared):
  spawn `argo:reviewer` on the branch diff so far. Fix merge-blocking findings before
  building dependents on top. Run the FULL verify suite here.
- **Final review**: after the last slice, one `argo:reviewer` pass on the full branch
  diff. Fix merge-blocking findings, re-verify.

## 7. Land or surface — always close out the worktree
- **All slices done + final review clean** → delete `.argo/build-mode.json`, hand the
  branch to **`argo:integrator`**: it pushes the branch and opens/updates the PR — it
  does not merge (its preconditions forbid being on the default branch) and does not
  touch graphify. Merging happens via the PR; once `main` integrates it, the post-merge
  lefthook fires automatically, on-device, and refreshes graphify. Then **ExitWorktree**
  (`remove` once merged).
- **BLOCKED** → do NOT merge. Delete `.argo/build-mode.json`, **ExitWorktree (`keep`)**
  so the worktree + branch stay on disk for inspection. Surface the blocked slice, its
  reasons, and the progress-doc path, and stop.

For any other end-of-branch path (merge locally, keep for later, discard) —
and for the exact worktree-then-branch cleanup ordering — use
`/argo:finish-branch`.

## 8. Report
Relay: branch name, slices done vs blocked, token/time spend if tracked, the
progress-doc path, the PR link (if landed), and — for BLOCKED — the kept worktree path.
