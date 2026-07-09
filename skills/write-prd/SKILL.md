---
name: write-prd
description: Author a lightweight, grounded PRD (product requirements doc) for one feature — the durable WHAT and WHY at the top of the loop. Use when starting a new feature or capability, when the user asks to "write a PRD / product brief / product spec", or before wireframing/planning/designing so downstream stages share one source of intent. Produces checkable requirements + a feature→screen matrix that design and code completeness gates consume.
---

# Write a PRD (product requirements doc)

A PRD is the **durable statement of what a feature is and why it exists** —
authored once, at the top of the loop, and cited by every stage after it
(wireframe → hi-fi design → implementation plan). It is not a design (no
layouts, no components) and not a plan (no code steps, no data models). It is
the product intent, grounded in what the product already does, written so a
verifier who never saw the reasoning can check whether the built thing delivers
it.

This skill is the PRD-authoring engine for the `argo:product` role. It owns the
lens vocabulary and boundary rules referenced from `product.md`. Keep the output
tight — a PRD nobody reads because it's 20 pages is worse than a one-page north
star.

## Why the PRD exists (the problem it solves here)

Downstream completeness gates need an **independent** source of "what should be
here". Diffing a built screen against its own brief is circular — the brief and
the screen narrow together. The PRD breaks the circle: its requirements are the
*semantic* completeness contract (does the built feature do what it must). The
design-verifier is intended to check them adversarially — this depends on
design-screen P5 ingesting the PRD's REQ-ID column (tracked in
`build-design-workflow.md`); until that wiring lands, the reviewer carries the
semantic check. Either way the PRD is load-bearing infrastructure, not
documentation.

## When NOT to write one

An atomic change, a bug fix, a pure refactor, a one-component tweak — no PRD.
The bar is a coherent unit of user value spanning more than a trivial change. If
unsure, it's probably a feature — but don't manufacture ceremony for a checkbox.

## Step 0 — Exploration mode (only when the direction is still open)

Mutually exclusive with the mainline. If the ask is "spec this" (direction
chosen), skip to Step 1. If it's "what could this be", diverge ONCE here before
converging:

- Sketch 2-4 genuinely distinct product options through opposed lenses —
  **smallest-useful**, **most-ambitious**, **riskiest-assumption-first** — each
  with its core bet and cost.
- Recommend one with the reason; let the user pick. Pair with `spike` when a
  throwaway prototype answers the question faster than argument.
- Only after a direction is chosen do you proceed to Step 1. Do not silently
  collapse to the first idea. (Product-bet divergence lives here and nowhere
  else — grill-me forks feature-level ideas up to this skill; planner's architect
  panel is code-structure divergence, a different altitude.)

## Steps

1. **Frame the feature (one sentence).** The user, their problem, the outcome.
   Then decide **grouping**: one PRD per *feature* (a coherent job spanning
   possibly several screens), never per screen. If the ask bundles two unrelated
   jobs, split into two PRDs; if two "features" are one job, merge. State the
   grouping decision explicitly — it's the first product call. Re-run this check
   whenever the requirements table outgrows one sentence of "Why now" (that's the
   length trigger — split, don't pad).

2. **Ground it in what exists.** Before writing a single requirement, read the
   real product: `ARCHITECTURE.md`, existing PRDs (`.claude/prds/`), the design
   inventory/reconciliation docs, the relevant surfaces/code. Query the graphify
   graph if present. Populate the template's **Reuse ledger** (existing capability
   → source → composes/extends/n-a) and the **Net-new** list from those same
   Read/Grep/Glob-able sources — product altitude only, never Figma/code
   component names. This ledger is grounding evidence, not the anti-recreation
   enforcement mechanism (that hard gate lives in design-screen against the live
   component inventory). A requirement that ignores an existing capability is a
   defect.

3. **Interview for the gaps — borrow grill-me's discipline, don't invoke it.**
   For the product decisions the codebase can't answer (the WHY, the scope
   boundary, which states matter): ground in the codebase first, then ask one
   question at a time, each with a recommended answer, resolving dependencies in
   order. This is grill-me's interview technique inlined (the way planner inlines
   its architect-panel technique) — do NOT call `grill-me` as a subroutine: its
   blank-slate flow writes a competing design doc and hands to planner, which
   would skip the PRD.

4. **Write checkable requirements — the load-bearing output.** Each requirement
   is a capability the feature MUST deliver: a slug-prefixed stable id
   (`<feature>-R1`…), a one-line statement, an **acceptance** line (the observable
   condition that proves it done), and a **Visible in build?** value (yes/no/
   partial — routes it to the design-verifier vs the reviewer). A verifier must be
   able to rule each present/absent without your reasoning; ban vague requirements.
   - **Enumerate every non-happy-path state** (empty / loading / error /
     permission / edge / zero-and-many) as its own requirement row with an
     acceptance condition. States are completeness the downstream gate can't
     invent — they belong in this table, NOT as a Scope bullet.
   - **Prefer one verifiable condition per requirement.** If it bundles
     independently-failable checks, split into `R3a`/`R3b` so a verifier can cite
     which failed.

5. **Build the feature→screen matrix as a checkable disposition.** One row per
   requirement id → exactly one non-empty disposition: `covered-by: <surfaces>`,
   `deferred: <reason>`, or `open: <question>`. A requirement with no disposition
   is a defect (distinguishes "intentionally N/A" from "author forgot"). This
   projects the per-feature PRD onto surfaces so each per-screen brief later
   covers exactly its column.
   - **Component Bindings (optional).** If you already know which existing
     design-system component realizes a region or repeated pattern, fill the
     template's optional `Component Bindings` table (region/pattern →
     component, plus an optional "do not hand-assemble" note). It's a hint
     layer for the designer, never a requirement — omit it when unknown; the
     designer self-derives via registry lookup.

5b. **Author the wave-scoped copy deck.** Fill the template's `Copy deck`
   section: a **shared terms** block (any string used in >1 region/screen is
   authored once here and referenced by key, never retyped) plus one
   `region → field-key → canonical string` row per rendered field. Wave-scoped,
   not per-screen, so the same entity is named identically across screens. This
   is the single upstream source of authored copy: downstream, design-screen /
   figma-create source ALL canvas text from it (missing entry → the designer
   stops and asks), and the tier-0 `untraced-copy` rule hard-checks every TEXT
   node against it on named audits. Data slots (live counts/timestamps) are not
   deck entries.

6. **Bound the scope — IN/OUT only.** Explicit IN (this version) and OUT
   (deferred + one-line reason). Nothing else lives here — states are
   requirements (step 4), not scope bullets.

7. **Write the doc** to `.claude/prds/<feature>.md` using the template
   (`templates/product/prd.md`). Set `Status: draft` while open questions remain,
   `ready` once resolved. Keep it tight. Then self-review: every decided branch
   reflected, no requirement without acceptance, every REQ-ID with exactly one
   matrix disposition, no states hiding in Scope.

## Boundaries (don't recreate neighboring roles)

- **`grill-me`** — borrow its interview discipline (inlined in step 3), don't
  invoke it as a subroutine. grill-me's blank-slate flow now forks feature-level
  ideas up to `argo:product` rather than sketching product options itself.
- **`argo:planner`** owns the implementation HOW (files, steps, data model). The
  PRD stays WHAT/WHY and hands off — pinning implementation early removes options
  the planner should weigh. Its architect panel (code-structure lenses) is not
  unified with Step 0 (product-bet lenses); different trigger, different domain.
- **The screen brief** (`templates/design/screen-brief.md`) is a *projection* of
  the PRD onto one surface, authored later by the design stage. Cite the PRD's
  requirements from it — don't duplicate them.

## Handoff

When the PRD is settled it feeds both branches: the design branch (wireframe →
`figma-create`, whose completeness gate is intended to check the PRD's
requirements once P5 ingests them) and the code branch (`argo:planner` →
`build-plan`). Summarise the feature's core bet, its scope line, and the two or
three requirements most likely to be contested.
