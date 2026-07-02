---
name: orchestrate
description: Supervise hands-off background builds (build-plan runs and other long-lived agents) from the main session — spawn them correctly, monitor for stalls and guard-block churn, intervene without derailing, recover from rate limits, and score each run. Use when kicking off or babysitting one or more background builds, or when the user asks to monitor/supervise agents.
---

# Orchestrate background builds

A hands-off build is only hands-off for the USER — someone must still watch it.
This skill is that someone's job description: everything below was learned by
supervising real gated builds (stalls, evidence races, account-wide throttles)
and is written so any main session can play the role.

## 1. Spawn correctly — most later pain is created here

- **Root the builder session in its worktree.** Use true worktree isolation at
  spawn (the Agent tool's worktree isolation, or `claude -w` / EnterWorktree).
  NEVER "create a worktree and tell the builder to cd into it": cd does not
  move the session root, so hooks (tdd-guard's evidence reads, commit gates)
  resolve against the parent checkout — and two such builds clobber each
  other's evidence and false-block (observed repeatedly).
- **Spawn the builder agent directly** (the builder agent invoking the
  build-plan skill). Do not wrap it in a generic agent that forks a worker:
  the relay layer idles, emits false "completed" notifications, and swallows
  messages.
- **One build per parent root at a time** if worktree-rooting is unavailable;
  the degraded evidence-bridge in build-plan §1 is single-build-only.

## 2. Monitor — proactively, not on request

Arm a watcher the moment the build starts. Signals worth emitting, and only
these (silence must be distinguishable from "still working"):

- **Slice commits** on the build branch (`git -C <worktree> log -1`) — the
  heartbeat of progress.
- **Guard blocks** (count occurrences in the builder's transcript/log) — a
  rising count inside ONE slice is a protocol problem worth reading; spread
  across slices it's normal enforcement.
- **True stalls** — no transcript growth AND no worktree file writes for
  ~10 minutes while the progress doc has pending rows. Either signal alone is
  a false positive: long e2e batches write files but no transcript; long
  thinking writes transcript but no files.
- **Close-out** — worktree removal / final report.

Cross-check the progress doc against commits when something looks off — a
stale progress doc usually means bookkeeping slipped, not work lost.

## 3. Intervene without derailing

- Every mid-build message MUST carry: "do not end your turn to acknowledge
  this — act on it and continue." Without the rider, builders stop to reply
  and the build silently stalls until someone notices.
- On a stall: first check the worktree passively (recent files, last commit).
  If genuinely idle, resume with a message that restates: where its state
  lives (worktree/branch), that committed work is safe, what remains, and any
  protocol it must re-establish (tdd-guard evidence clears on session start —
  it must re-run the current test directly before its next guarded edit).
- On guard-block churn (3+ blocks on one edit): read the actual block text
  from the transcript before intervening — blocks are usually legitimate; the
  fix is protocol coaching (see build-plan's tdd-guard rules), not loosening.

## 4. Recover from rate limits — work on disk survives

All concurrent agents plus any eval/`claude --print` spawns share ONE
subscription. A parallel burst trips a server-side throttle that kills EVERY
running agent with "Rate limited" — it is not a usage limit and not fatal:

- Never run parallel model-spawning tasks (evals, fleets) while builds are in
  flight; serialize eval spawns (concurrency 1, sequential repeats).
- On a throttle kill: wait minutes (schedule a wakeup rather than hammering),
  then resume each agent from its worktree/branch state — commits and working
  trees are intact; only the session context is gone. Include the tdd-guard
  re-establish step in the resume message.
- Tell resumed builders: "if rate-limited again, wait 120s between retries
  rather than dying."

## 5. Score every run — dogfooding is the point

After each build, report a short scorecard, not a metrics wall: spec adherence
(red-first honored, reviews run, gates never bypassed, progress doc current),
efficiency (wall-clock, tokens, guard blocks per slice, stalls), and defects.
Route every defect to its owner: agent/skill wording → the plugin repo (fix +
version bump so every user gets it); app bug → an issue/plan in the host repo;
third-party gap → an upstream issue. A lesson that stays in one session's
memory is a lesson the product didn't learn.
