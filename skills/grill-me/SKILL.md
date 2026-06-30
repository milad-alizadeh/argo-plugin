---
name: grill-me
description: Interview the user relentlessly about a plan or design until you reach shared understanding, resolving each decision before any code is written. Use when the user wants to stress-test or pressure-test a plan, asks to "grill" their design, or before a non-trivial change where misalignment is likely.
---

# Stress-Test a Plan

The most common failure is misalignment: you build the wrong thing because you
guessed at an unstated decision. Fix it up front by interrogating the plan.

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
