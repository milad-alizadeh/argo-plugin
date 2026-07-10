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

**NEVER `git checkout` / `git switch` / `git reset` the primary checkout to
satisfy any precondition below.** The build lives entirely in a worktree forked
from the base ref (§2); the primary checkout's branch and working tree must be
left exactly as the user had them. Switching it corrupts every parallel session
rooted there — this is the single most damaging thing this skill can do. The
plan living on the default branch but NOT on the branch the user currently has
checked out is the EXPECTED, correct state — never "fix" it by moving the
primary checkout.

- **A plan doc** (any size — even ten lines): path from the user. If none, ask; don't
  invent one. A minimal hand-written plan is fine; `argo:planner` is encouraged for
  non-trivial work but not required. The plan must be committed to the base ref the
  worktree derives from (the default branch). **Validate it against that base ref,
  not the current working tree** — the current checkout may be on an unrelated
  branch that never carried the plan. Resolve the base ref (`git symbolic-ref
  refs/remotes/origin/HEAD` → e.g. `origin/main`, matching what `worktree.baseRef`
  forks from) and check the plan there: `git cat-file -e <baseRef>:<path>` for
  existence, `git show <baseRef>:<path>` to read it. If it is missing from the base
  ref, STOP and ask the user to commit it to the default branch — do not go hunting
  for it by switching branches. (Equivalently, defer this whole check until after
  §2's worktree exists and validate inside the worktree, which forks from the base
  ref and therefore carries the plan.)
- **The plan is cleared for build**: run `argo plans check --plan <path>` **against
  the base-ref copy or the worktree copy** (never the primary checkout) — it refuses
  any plan whose frontmatter is not `status: queued` (a `draft` plan is still being
  written; missing/invalid frontmatter also refuses). Never build a draft; ask the
  user to flip the plan to `queued` on the default branch instead of editing it
  yourself. Do NOT edit plan status from the worktree during the build — live state
  belongs to the run store (`~/.argo/state/`), and `argo plans` overlays it.
- **argo:reviewer** is available (checkpoint + final review). If absent, stop and say so.
- **Verify commands** are known: the project's real typecheck/lint/test commands (from
  CLAUDE.md stack-facts or the manifests). Never guess.
- **Runners actually execute here**: before slice 1, prove every runner the plan's
  verify commands need can run in THIS environment — unit, component, AND the e2e
  launcher (e.g. the app binary exists). If one can't, STOP and surface it; never
  substitute hand-verification or author specs you cannot execute (a sandboxed build
  once shipped e2e tests that had never run — two latent bugs surfaced on first real
  execution).
- **Session rooting is a HARD requirement, not a preference**: the build session
  must be rooted in the worktree being built (EnterWorktree re-roots; an
  orchestrator spawning a builder agent must use true worktree isolation, never
  "create a worktree and cd into it" — cd does not move the session root).
  Probity reads the SESSION TRANSCRIPT itself, not a per-worktree data dir, so
  it is parallel-session safe by construction — concurrent builds no longer
  overwrite each other's evidence. Root the session correctly anyway: it is
  still how the build's own tooling (CLAUDE_PROJECT_DIR-relative paths, gate
  markers under `.argo/`) resolves to the right checkout.

- **A static site deploying to a non-root hosted path** (e.g. GitHub Pages
  project sites — `<user>.github.io/<repo>/`, not a root `<user>.github.io`
  site) needs its framework's base-path config (Astro's `site`/`base`,
  Vite's `base`, etc.) set to match the real deploy target BEFORE build —
  `build` succeeding is not evidence this is right, since a missing base path
  fails silently (assets/links resolve against `/` instead of the real
  subpath, breaking only once actually served from that subpath). Confirm
  the config against the real target path, don't assume root hosting.

No clean-tree check is needed: the build runs in a separate worktree, so the user's main
checkout (dirty or not) is untouched.

## 2. Isolate in a worktree
Call **EnterWorktree** to create a fresh worktree on a new branch off the default branch.
One run = one worktree = one branch. All building, verifying, and committing happens
inside the worktree; the main checkout is never written to, and concurrent builds in
separate worktrees never collide on the git index.

**Fresh-worktree checklist — run BEFORE the first slice, not when something breaks:**
1. **Read CLAUDE.md + `.claude/rules/` from the worktree first** — verify commands,
   test env flags, which binaries the e2e suite spawns, known worktree gotchas. This
   survival kit informs every later step; don't rediscover it mid-slice.
2. **Install dependencies from the worktree root** with the project's package manager
   (a fresh worktree has no `node_modules`/venv/build cache; in a workspace monorepo
   never install from inside a workspace).
3. **Re-confirm the §1 runner proof against the FRESH install** — §1 proved the
   runners work in some environment; re-prove with one fast existing test per runner
   here, because fresh installs drop postinstall artifacts (a bundled app binary the
   e2e launcher needs is the common casualty; step 1's stack-facts usually name the
   fix).

## 3. Arm the gates — `.argo/evidence/build-mode.json`
Ensure `.argo/` is gitignored (deny-by-default: `/.argo/*` with explicit re-includes
for `config.json`, `plans/`, `design/` only — never a narrower ignore, `.argo/` also
holds secrets), then `mkdir -p .argo/evidence` and write the build-mode marker in the
worktree root.
While this file exists, the plugin's commit gates (`red-proof-gate.js`,
`trust-gate.js`, in `@argohq/toolkit`'s `packs/code/` — dispatched via the
`bash-pretooluse` route, a PreToolUse hook on every Bash call, not just `git
commit`) are ARMED and fail-closed; without it they are inert. Update it **at
the start of every slice**:

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
  (`.argo/evidence/launch-receipt.json`, written by the app itself when launched and exercised —
  e.g. by the slice's e2e run). Argo-runtime-specific; leave `false` elsewhere.

**Delete the marker when the build ends** (done or blocked) — never leave gates armed.

## 4. Build loop — per slice, in plan order
Work the plan's steps strictly in order; keep a `…-progress.md` beside the plan doc
(one row per slice: status, commit sha, notes) updated after every slice.

For each slice:
1. **Update** `.argo/evidence/build-mode.json` to this slice.
2. **Red** (skip if `testable: false`): write the test that specifies the slice's
   behaviour through the real interface (per the project's testing rules — DOM/API/CLI,
   not internals). Run it; record the non-zero exit code. **Run only THAT spec file**
   (`<e2e-runner> <file>`, direct invocation) — never the full e2e suite for a
   red/green proof; each full-app boot costs tens of seconds and red-green-rerun
   multiplies it.
3. **Green**: implement the minimum to pass. Run the test (same single-file scope);
   record exit code 0. **Exception — cross-cutting slices**: if the slice touched a
   shared surface other specs depend on (a common fixture, selector, shared
   component, global setup), run the full e2e suite once now, on green — per-file
   scoping must never let a slice silently break its neighbours.
4. **Receipt**: write `.argo/evidence/red-proof.json`:
   ```json
   { "slice": "<id>", "testFile": "<path>", "redExit": 1, "greenExit": 0,
     "recordedAt": <epoch ms> }
   ```
   The red-proof gate blocks the commit without it — receipt must name THIS slice,
   the test file must exist, `redExit` non-zero, `greenExit` 0, and it must postdate
   HEAD (no reuse across slices).

   **Ordering matters — gates run BEFORE your command executes.** The commit gates
   are PreToolUse hooks: they judge the disk and index as they are *before* the
   command runs. Write the receipt in one command, stage in the next, commit in a
   third — a single compound command that writes the receipt and commits will be
   judged on pre-command state and blocked. The one sanctioned compound form is
   `git add <testFile> && git commit …` (the gate parses that exact `&&` chain).
5. **Verify** (scoped): run the affected workspace's typecheck + lint + tests — not the
   full graph every slice; the full e2e suite runs **at minimum** at the checkpoint
   and the final review (plus any cross-cutting slice per step 3's exception). There
   is no pre-push hook — the checkpoint and final review ARE the coverage, in both
   landing modes. These are floors, not ceilings —
   when in doubt about blast radius, run the suite.

   **When a `testable: false` slice's own plan text says "visually confirm" or
   "preview" — actually drive a browser.** `grep`/`curl -I`/any text check of
   build output is NOT a visual check and must never be reported as one (a
   docs-site build once shipped with CSS 404ing on the deployed path because
   "visual grep confirms" stood in for a real screenshot — the string was
   present in the HTML; the page was unreadable). If browser tooling genuinely
   isn't available, say so plainly instead of downgrading silently.
6. **Commit** (conventional message, one slice = one commit). The gates check the
   receipts deterministically; if blocked, fix the real problem — never delete the
   marker to sneak a commit through.
7. **Update the progress doc** — after EVERY slice, before starting the next. This is
   not bookkeeping polish: a stale progress doc breaks the resume protocol (§5) and
   makes external monitoring read completed work as skipped. If a checkpoint review
   ran, its verdict goes in the doc the moment it returns.

If a slice won't go green after ~3 honest attempts: mark it blocked in the progress doc
with the failure evidence, STOP the loop, and surface — do not thrash.

**Run continuously — never end a turn on a status update.** This build is hands-off:
there are exactly two legitimate final messages, the completed build report (§8) or a
blocked report (§7). Ending a turn to narrate progress, summarize "status so far", or
acknowledge an incoming message stalls the build until someone notices and nudges it —
observed in dogfooding, where two such stalls cost more wall-clock than every guard
block combined. If a message arrives mid-build (from a coordinator, monitor, or user):
apply what it asks, fold it into the current slice, and CONTINUE — reply only as part
of continuing work, never as a stopping point.

## 5. Resume protocol (verbatim — 12-slice plans outlive one context window)
If the session compacts or a fresh session takes over: read the plan doc, the progress
doc, and `git log --oneline` on the branch; the next unchecked plan step is the next
action. Never re-do a committed step.

**A resumed session has no test history** — Probity watches the session
transcript, so its red/green evidence is whatever tests THIS session actually
ran; a fresh session (resume, compaction, new agent taking over) starts with an
empty transcript and must re-run the current slice's failing (or passing) test
in-session before the next guarded edit, as a **direct runner invocation** (a
turbo cache hit doesn't spawn the runner and leaves no transcript trace).
`.argo/evidence/red-proof.json` is the durable cross-session proof the commit
gate itself checks.

**When the plan edits this plugin's own hooks:** the session runs the INSTALLED
plugin cache's hooks, not the branch's freshly edited copies. Expect gate
behaviour to match the cached version until `claude plugin update` + a session
restart; don't burn time debugging a "fix that didn't take".

## 6. Review — twice per feature, never per slice
- **Checkpoint review** at the plan's declared seam (or halfway if none declared):
  spawn `argo:reviewer` on the branch diff so far. Fix merge-blocking findings before
  building dependents on top. Run the FULL verify suite here.
- **Final review**: after the last slice, one `argo:reviewer` pass on the full branch
  diff. Fix merge-blocking findings, re-verify.

**Dispatching the reviewer** — hand over FILES, not pasted context: point it at the
branch, the plan doc, and the progress doc by path (everything pasted into a dispatch
prompt stays resident in your context and is re-read every turn). Never pre-judge
findings in the dispatch prompt — if you are writing "do not flag X", stop: you are
pre-judging.

**Receiving the review** — findings are claims, not orders:
- Verify each finding against the actual code before acting on it; a reviewer citing
  the wrong line or a mitigated path gets pushed back with the evidence, plainly.
- Before accepting a "you should also handle / generalize" suggestion, grep for actual
  usage — if no call site needs it, decline it as YAGNI and say so in the progress doc.
- No performative agreement: never "You're absolutely right!" — state what you
  verified, what you fixed, what you rejected and why.

**Per-slice verify is the SCOPED commands from the plan** — the full suite runs at the
checkpoint and final review only. For cosmetic/layout fixes within a slice, assert
structure or computed style at the fix's owner (one place), never boundingBox pixel
math re-asserted per consumer layer.

## 7. Land or surface — always close out the worktree
- **A feature that ships a live deploy target (a CI deploy workflow, a hosted
  URL) is not verified until the LIVE artifact has been checked**, not just a
  local build/preview — a local preview can pass while the deployed page is
  broken (base path, CDN rewrites, env config all differ from same-machine
  builds). Once the deploy has actually run (may require the integrator's own
  push first), load the real URL and confirm it renders — before reporting
  the feature done. Note this explicitly in the progress doc; if the deploy
  workflow hasn't run yet at build time, say so and name it as follow-up
  rather than silently treating local build success as equivalent.
- **All slices done + final review clean** → delete `.argo/evidence/build-mode.json`, hand the
  branch to **`argo:integrator`**. How it lands depends on the project's landing mode
  (`.argo/config.json`'s `landing` field, set by `/argo:init`): in **pr** mode (the default) it
  pushes the branch and opens/updates the PR — it never merges, and merging happens
  via the PR. In **merge** mode (solo maintainer) it lands the branch straight onto
  the default branch (`git push origin HEAD:<default>`, its own re-verification as
  the gate) with no PR to self-review. Either way it does not touch graphify — the post-merge
  lefthook refreshes it when the local default branch integrates the work. Then
  **ExitWorktree** (`remove` once merged). **No plan archiving**: plans stay in
  `.argo/plans/` forever — there is no `done/` folder and no `landed` frontmatter.
  "Landed" is DERIVED from git (`argo plans` computes it); git history is the archive.
- **BLOCKED** → do NOT merge. Delete `.argo/evidence/build-mode.json`, **ExitWorktree (`keep`)**
  so the worktree + branch stay on disk for inspection. Surface the blocked slice, its
  reasons, and the progress-doc path, and stop.

For any other end-of-branch path (merge locally, keep for later, discard) —
and for the exact worktree-then-branch cleanup ordering — use
`/argo:finish-branch`.

## 8. Report
Relay: branch name, slices done vs blocked, token/time spend if tracked, the
progress-doc path, the PR link (if landed), and — for BLOCKED — the kept worktree path.
