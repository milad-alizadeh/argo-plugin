---
name: write-prd
description: Author a lightweight, grounded PRD (product requirements doc) for one feature — the durable WHAT and WHY at the top of the loop. Use when starting a new feature or capability, when the user asks to "write a PRD / product brief / product spec", or before wireframing/planning/designing so downstream stages share one source of intent. Produces checkable requirements + a feature→screen matrix that design and code completeness gates consume.
---

# Write a PRD (product requirements doc)

A PRD is the **durable statement of what a feature is and why it exists** —
authored once, at the top of the loop, and cited by every stage after it
(wireframe → hi-fi design → implementation plan). It is not a design (no
layouts, no components) and not a plan (no code steps, no data models). It is
the product intent, grounded in what the product already does, written so that a
verifier who never saw the reasoning can check whether the built thing delivers
it.

This skill is the PRD-authoring engine for the `argo:product` role. It leans on
`grill-me` for the interview and stays deliberately lightweight — a PRD nobody
reads because it's 20 pages is worse than a tight one that's the shared north
star.

## Why the PRD exists (the problem it solves here)

Downstream completeness gates need an **independent** source of "what should be
here". Diffing a built screen against its own brief is circular — the brief and
the screen narrow together. The PRD breaks the circle: its requirements are the
*semantic* completeness contract (does the built feature do what it must),
checked by the design-verifier and the reviewer, independent of any one screen's
brief or wireframe. A wireframe, when it exists, adds an optional *structural*
check on top. So the PRD is load-bearing infrastructure, not documentation.

## When NOT to write one

An atomic change, a bug fix, a pure refactor, a one-component tweak — no PRD.
The bar is the same as `grill-me`'s: a coherent unit of user value spanning more
than a trivial change. If unsure, it's probably a feature — but don't
manufacture ceremony for a checkbox.

## Steps

1. **Frame the feature (one sentence).** The user, their problem, the outcome.
   Then decide **grouping**: one PRD per *feature* (a coherent job spanning
   possibly several screens), never per screen. If the ask bundles two unrelated
   jobs, split into two PRDs; if two "features" are one job, merge. State the
   grouping decision explicitly — it's the first product call.

2. **Ground it in what exists.** Before writing a single requirement, read the
   real product: `ARCHITECTURE.md`, existing PRDs (`.claude/prds/`), the design
   inventory/reconciliation docs, the relevant surfaces/code. Query the graphify
   graph if present. Note the existing capabilities the feature builds on or
   changes — a requirement that ignores them is a defect.

3. **Interview for the gaps.** Invoke `grill-me` (blank-slate mode) for the
   product decisions the codebase can't answer — the WHY, the scope boundary,
   the states that matter. One question at a time, each with a recommended
   answer. Do not batch a questionnaire; do not ask what the repo already tells
   you.

4. **Write checkable requirements.** Each requirement is a capability the feature
   MUST deliver: a stable id (`R1`…), a one-line statement, and an **acceptance**
   line — the observable condition that proves it done. A verifier must be able
   to rule each present/absent without your reasoning. Ban vague requirements
   ("feels responsive", "handle edge cases"): either make them observable or drop
   them. These are the completeness contract — treat them as such.

5. **Build the feature→screen matrix.** One row per requirement id → the
   surface(s) that realize it. A requirement mapped to no surface is out of scope
   or a missing screen — resolve it, don't leave it dangling. This matrix is what
   lets each per-screen brief later cover exactly its column, and what makes the
   PRD's granularity (per-feature) compatible with per-screen briefs.

6. **Bound the scope.** Explicit IN (this version) and OUT (deferred + one-line
   reason). Put cardinality and the states design must cover (empty / loading /
   error / edge counts) into requirements — these are completeness the downstream
   gate cannot invent.

7. **Write the doc** to `.claude/prds/<feature>.md` using the template
   (`templates/product/prd.md`). Keep it tight. Then self-review against the
   grill answers: every decided branch reflected, no requirement without
   acceptance, no requirement off the matrix.

## Exploration / brainstorming mode

When the ask is "what could this be" rather than "spec this", switch to divergent
mode before converging on a PRD: sketch 2-4 genuinely distinct product options
through opposed lenses (smallest-useful, most-ambitious, riskiest-assumption-
first), each with its core bet and cost. Recommend one with the reason; let the
user pick. Pair with `spike` when a throwaway prototype answers the question
faster than argument. Only after a direction is chosen do you write the PRD. Do
not silently collapse to the first idea.

## Boundaries (don't recreate neighboring roles)

- **`grill-me`** is the interview *technique* this skill invokes — not a
  competitor. Use it; don't hand-roll questions.
- **`argo:planner`** owns the implementation HOW (files, steps, data model). The
  PRD stays WHAT/WHY and hands off to it — pinning implementation early removes
  options the planner should weigh.
- **The screen brief** (`templates/design/screen-brief.md`) is a *projection* of
  the PRD onto one surface, authored later by the design stage. The PRD is the
  source; the brief derives from its matrix column. Don't duplicate the PRD's
  requirements into the brief — cite them.

## Handoff

When the PRD is settled, it feeds both branches of the loop: the design branch
(wireframe → `figma-create`, whose completeness gate checks the PRD's
requirements as the semantic contract) and the code branch (`argo:planner` →
`build-plan`). Summarise the feature's core bet, its scope line, and the two or
three requirements most likely to be contested.
