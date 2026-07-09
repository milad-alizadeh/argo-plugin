---
name: grill-me
description: Interview the user relentlessly about a plan, design, or blank-slate idea until you reach shared understanding, co-creating a design doc where none exists, before any code is written. Use when the user wants to stress-test or pressure-test a plan, asks to "grill" their design, wants to design something from scratch, or before a non-trivial change where misalignment is likely.
---

# Stress-Test a Plan (or co-create one from nothing)

The most common failure is misalignment: you build the wrong thing because you
guessed at an unstated decision. Fix it up front by interrogating the plan.

**Hard gate:** for non-trivial work, no implementation before a design/plan doc
exists. "This is too simple to need a design" is itself a claim — grill it
(what makes it simple? what breaks if that's wrong?) before accepting it.

## Two entry modes

- **Existing plan/design** → interrogate it (the rules below).
- **Blank slate** (an idea, no doc) → explore what exists in the codebase first,
  then fork on altitude: if the idea is **feature-level** (a coherent unit of
  user value spanning more than a trivial change), stop and hand off to
  `argo:product` / `write-prd` — that owns product-bet divergence and the PRD
  (including the per-screen ASCII wireframe + flow agreed with the user in that
  hand-off, so this interview never re-derives layout);
  don't sketch competing product options or write a rival design doc here.
  Otherwise (a technical/design decision below feature altitude) co-create the
  design: questions one at a time (rules below) → sketch 2-3 approaches with
  trade-offs and a recommendation → write a sectioned design doc (problem, chosen
  approach, rejected alternatives + why, open risks) → self-review against the
  answers → user reviews → hand off to `argo:planner` for the implementation plan.

Interview the user relentlessly about every aspect of this plan until you reach
a shared understanding. Walk down each branch of the design tree, resolving
dependencies between decisions one at a time. For each question, give your
**recommended answer** so the user can just confirm.

## Rules

- **One question at a time.** Wait for the answer before the next. Never batch.
- **If the codebase can answer it, go look** — read the relevant code (or a
  knowledge map, if the project has one) instead of asking. Only ask what the
  user alone can decide.
- **Resolve dependencies in order.** A decision that gates others comes first.
- Stop when every branch is resolved and you could write the plan with no
  remaining guesses.

Grilling *is* the confirm step for anything bigger than an atomic change.

## Optional: sharpen language + record decisions (inline, as they land)

When the plan's terminology is fuzzy or a choice a future reader will question,
add these two side effects — **never batched at the end**:

- **Sharpen the language.** When the user uses a vague or overloaded term,
  propose a precise canonical one and pin it down ("you said 'session' — the idle
  thread or the live process? those are different things"). When a term resolves,
  record it on the **closest existing doc surface** (CLAUDE.md, a glossary, design
  notes) rather than starting a parallel glossary — one source of truth. Verify
  claims about how things work against the code; surface contradictions at once.
- **Record decisions sparingly.** Capture a decision as a durable record only when
  **all three** hold: (1) hard to reverse, (2) surprising without context, (3) a
  real trade-off with genuine alternatives. If any is missing, skip it. Settled
  rationale belongs in design docs; buildable steps belong in the plan.

<!-- Adapted from mattpocock/skills (MIT). -->
