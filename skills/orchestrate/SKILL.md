---
name: orchestrate
description: Supervise hands-off background builds (build-plan runs and other long-lived agents) from the main session, spawn them correctly, monitor for stalls and guard-block churn, intervene without derailing, recover from rate limits, and score each run. Use when kicking off or babysitting one or more background builds, or when the user asks to monitor/supervise agents.
---

# Orchestrate background builds

A hands-off build is only hands-off for the USER, someone must still watch it.
This skill is that someone's job description: everything below was learned by
supervising real gated builds (stalls, evidence races, account-wide throttles)
and is written so any main session can play the role.

## 1. Spawn correctly, most later pain is created here

- **Root the builder session in its worktree.** Use true worktree isolation at
  spawn (the Agent tool's worktree isolation, or `claude -w` / EnterWorktree).
  NEVER "create a worktree and tell the builder to cd into it": cd does not
  move the session root, so hooks (tdd-guard's evidence reads, commit gates)
  resolve against the parent checkout, and two such builds clobber each
  other's evidence and false-block (observed repeatedly).
- **Spawn the builder agent directly** (the builder agent invoking the
  build-plan skill). Do not wrap it in a generic agent that forks a worker:
  the relay layer idles, emits false "completed" notifications, and swallows
  messages.
- **One build per parent root at a time** if worktree-rooting is unavailable;
  the degraded evidence-bridge in build-plan §1 is single-build-only.

## 2. Monitor, proactively, not on request

Arm a watcher the moment the build starts. Signals worth emitting, and only
these (silence must be distinguishable from "still working"):

- **Slice commits** on the build branch (`git -C <worktree> log -1`), the
  heartbeat of progress.
- **Guard blocks** (count occurrences in the builder's transcript/log), a
  rising count inside ONE slice is a protocol problem worth reading; spread
  across slices it's normal enforcement.
- **True stalls**, no transcript growth AND no worktree file writes for
  ~10 minutes while the progress doc has pending rows. Either signal alone is
  a false positive: long e2e batches write files but no transcript; long
  thinking writes transcript but no files.
- **Close-out**, worktree removal / final report.

Cross-check the progress doc against commits when something looks off, a
stale progress doc usually means bookkeeping slipped, not work lost.

## 3. Intervene without derailing

- Every mid-build message MUST carry: "do not end your turn to acknowledge
  this, act on it and continue." Without the rider, builders stop to reply
  and the build silently stalls until someone notices.
- On a stall: first check the worktree passively (recent files, last commit).
  If genuinely idle, resume with a message that restates: where its state
  lives (worktree/branch), that committed work is safe, what remains, and any
  protocol it must re-establish (tdd-guard evidence clears on session start -
  it must re-run the current test directly before its next guarded edit).
- On guard-block churn (3+ blocks on one edit): read the actual block text
  from the transcript before intervening, blocks are usually legitimate; the
  fix is protocol coaching (see build-plan's tdd-guard rules), not loosening.

## 4. Recover from rate limits, work on disk survives

All concurrent agents plus any eval/`claude --print` spawns share ONE
subscription. A parallel burst trips a server-side throttle that kills EVERY
running agent with "Rate limited", it is not a usage limit and not fatal:

- Never run parallel model-spawning tasks (evals, fleets) while builds are in
  flight; serialize eval spawns (concurrency 1, sequential repeats).
- On a throttle kill: wait minutes (schedule a wakeup rather than hammering),
  then resume each agent from its worktree/branch state, commits and working
  trees are intact; only the session context is gone. Include the tdd-guard
  re-establish step in the resume message.
- Tell resumed builders: "if rate-limited again, wait 120s between retries
  rather than dying."

## 5. Design fan-out (NEW-A)

Supervising a fleet of `designer` agents (figma-create/figma-audit
runs) follows the same "someone must watch it" contract as a
build, with design-specific mechanics, the main session improvised this
once and produced real defects (a spawned sub-fleet, a token-burning
idle-wait on a gate false positive, a rejected component patch); these three
mechanisms close those gaps without new tooling.

- **Brief before screen, component before screen (ordering the supervisor
  enforces).** A screen's product brief (`design/briefs/<screen>.md`,
  `templates/design/screen-brief.md`) is authored and settled BEFORE any
  design run for that screen is spawned. Then, for hi-fi:
  every `composite` a screen's brief names is built + registered as its own
  audited component BEFORE the screen that consumes it is assembled. Sequence
  the fan-out that way, component runs first, the screen-composition run last,
  reading the now-existing components as instances. A screen run spawned before
  its components exist will inline loose structure (the reskin-the-wireframe
  failure); don't spawn it early.
- **Bank the canonical shell before the compose fan-out (build-order step).**
  For a wave of screens that share layout chrome, the supervisor enforces
  `design-screen`'s step 1b: after the shared composites exist and before the
  parallel screen fan-out, ONE serial run assembles + audits a shell-only
  template, and its `nodeId`, frame dimensions, and content-region slot map
  are recorded once in the wave's BUILD-ORDER doc. Every fan-out screen then
  `.clone()`s that banked nodeId and patches only its content region — none
  re-reads the shell's (~101KB) metadata dump to rediscover structure. Do not
  spawn the compose fan-out until the shell template is banked and recorded;
  a screen spawned before it will hand-reconstruct the shell and re-pay the
  scaffold cost (and re-open the stale-copy/backdrop-bleed defect classes) per
  screen.
- **Pre-fill Component Bindings into spawn prompts (hint layer).** When the
  supervisor already knows which existing component realizes a region (from
  the PRD's optional `Component Bindings` section, the registry, or a prior
  run in the batch), it SHOULD pre-fill those bindings into the designer's
  spawn prompt. This is a hint layer only: the designer still verifies each
  entry once and falls back to its own lookup + stop-and-ask per its
  standalone contract (`agents/designer.md`), so an unfilled or wrong hint
  never breaks the run. When a screen's binding manifest already exists and
  is validate-manifest-clean, pre-seed THAT into the spawn prompt instead —
  it is the checked decision artifact, not a hint — and never spawn a screen
  compose whose manifest hasn't passed `argo design validate-manifest`.
- **Flat fan-out.** Spawn each `designer` directly from the main session, one
  per component, never route a designer's output through another designer
  (mirrors the builder no-wrapper rule in §1). The leaf rule itself lives in
  `agents/designer.md` (R1) and is backstopped by a hook there; this section
  only states the supervisor's obligation.
- **Independent screen verification (blind, supervisor-spawned) — the
  draft → verify → fix loop.** A screen build is NOT done when the designer
  reports: the designer reports **DRAFT** and requests verification
  (design-screen §4c), and the supervisor **holds that designer session
  open** — designer-done is the end of the loop, not the trigger for it.
  The supervisor must never perform the fidelity comparison itself: it has already read the
  builder's report and cannot un-read it (the same contamination
  `agents/design-verifier.md` bars for completeness). Instead the supervisor
  spawns `argo:fidelity-verifier`, a blind fidelity check given ONLY the
  reference (brief/PRD ASCII wireframe/original screenshot), the built screenshot
  at IDENTICAL frame size, and a structural fact sheet (frame dimensions,
  per-region node metrics) — never the transcript, never the self-report.
  The measurable subset is a tier-0 gate concern, not the verifier's job:
  frame dimensions vs the configured viewport (a designer growing the
  canvas to fit content is a defect, not a layout choice), text truncation
  (labels rendering "Runnin" for "Running"), child overflow, edge anchoring
  of full-bleed regions. The verifier owns what survives the gate: does the
  composition actually read like the reference (spacing rhythm, crowding,
  material) at a glance. **Narrow both verifier spawn prompts to the
  manifest (design-phase-quality-plan.md W5 — the token offset that keeps
  the W1 decision pass net-neutral).** Completeness (`design-verifier`):
  give it the screen's binding-manifest rows + the mechanical checklist and
  ask "does the canvas match the manifest" — per row, is the named component
  present as a real instance in the named variant/states — never an
  open-ended re-derivation of intent from the screenshot. Fidelity
  (`fidelity-verifier`): per-region rulings against the brief's reference
  image at identical frame size, per its own contract. Both stay **blind**
  (never the transcript, never the self-report), **mandatory**, and at
  their **full model tier** — narrow the scope, never the capability;
  open-ended blind detection is the only reliable catch. **Route the
  verifier's findings back to the SAME designer session** (hot context —
  never a fresh session that re-pays the cold-start) via SendMessage, through
  the R9 lanes as **ONE numbered fix list** with the act-and-continue rider;
  the designer applies the fixes, re-runs its single tier-0 re-audit, and
  only then reports done. **EXACTLY ONE verify→fix round is budgeted per
  screen: if the second blind check still fails, escalate to the human with
  both verifier reports — never loop unbounded.** The building agent's
  self-audit and montage are inputs, never the acceptance. A live screen
  shipped with four such defects past its own clean self-report.
- **Two feedback lanes (R9).** Classify every ruling into exactly one lane
  the moment it's known:
  - **Stop-the-line**, a gate bug (a violation tagged
    `possible-gate-false-positive`) or icon mutilation (a detach, an edited
    kit internal). Fires immediately: pause that component's work, do not
    let the designer idle-wait for a fix (R1/R8), redirect it to other
    scoped work instead.
  - **Refinement**, spacing/mood/material critique with no gate
    implication. Queues to the NEXT montage checkpoint (R3) rather than
    interrupting mid-build; deliver the queued set as **one numbered list**
    with the standing "act and continue, don't acknowledge" rider, medium
    agents drop items from prose paragraphs but apply numbered lists.
- **Pending-rulings buffer (R10).** Every ruling, from either lane, is a
  candidate for `aesthetic-profile.md` (a DO/DON'T entry, mandatory,
  auto-discovered) and, where a measurable proxy exists (a px gap, a ratio,
  an alignment delta), a tier-0-rule task. The **orchestrator** writes the
  ruling into the profile (and opens the tier-0 task where checkable)
  **before spawning the next dependent designer**, a chat-only ruling that
  hasn't been drained into the profile does not authorize that spawn. Any
  minted gate rule must pass the R7 fixture suite before shipping.
- **Design-run scorecard.** Alongside the build scorecard (§6 below), report
  per design run: round-trips per component, wasted rounds (a fix that
  re-triggered the same violation), and gate false positives hit (count of
  `possible-gate-false-positive`-tagged violations reported). For a screen built
  through `/argo:design-screen`, ALSO report its completeness scorecard: regions
  covered / deferred / **UNACCOUNTED (must be 0 to land)** / MISSING, PRD
  requirements present / **absent (must be 0)**, dishonest deferrals, and
  anti-recreation collisions, a screen with UNACCOUNTED>0 or absent>0 is FAILED
  regardless of tier-0. The supervisor MUST also track the **clean after ≤1 fix
  round rate** — the fraction of screens whose supervisor-spawned blind
  verification was clean either first-pass or after the single budgeted
  verify→fix round — as the batch success metric (first-pass perfection is
  measured-unreachable; cheapest-loop-to-clean is what is optimized).
- **Dropped:** seed-injection of a node-id context pack at spawn time -
  deferred until a companion artifact for it is designed; the near-term
  cold-start cost is covered by the registry read-order in
  `agents/designer.md` and `skills/figma-create/SKILL.md`.

## 6. Score every run, dogfooding is the point

After each build, report a short scorecard, not a metrics wall: spec adherence
(red-first honored, reviews run, gates never bypassed, progress doc current),
efficiency (wall-clock, tokens, guard blocks per slice, stalls), and defects.
Route every defect to its owner: agent/skill wording → the plugin repo (fix +
version bump so every user gets it); app bug → an issue/plan in the host repo;
third-party gap → an upstream issue. A lesson that stays in one session's
memory is a lesson the product didn't learn.
