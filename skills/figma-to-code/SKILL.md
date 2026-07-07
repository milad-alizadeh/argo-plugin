---
name: figma-to-code
description: Generate component code from a synced Figma design — reads story-map.json and committed design context, generates through the normal test-first loop, then runs the tiered acceptance gates in D22's order (spec-diff -> gestalt -> baseline commit). Use when the user asks to generate/build/implement a component from a Figma design that's already been synced.
---

# figma-to-code

Generates working component code from a **synced** Figma design, then proves
it via the tiered acceptance gates — in the specific order D22 requires,
never baseline-then-review.

**LLM self-checks are advisory only — deterministic gate receipts are the
only accepted proof.** Reading the spec-diff walker's output and concluding
"it passed" is a self-check, not proof; the same trust boundary the
red-proof/trust gates apply to test runs applies here to design gates. Every
tier below that can write a machine-checkable receipt does so, and
`hooks/design-commit-gate.mjs` enforces it at commit time — a commit
touching the `componentsPath` named in the app's `design.<app>` block in
`.claude/argo.json` with no fresh, passing
`design/spec-diff-receipt.json` is blocked (exit 2), independent of any
build-mode gating, whether this skill runs inside a gated build or
interactively.

## Preconditions

- `design/story-map.json` must have an entry for the target component. If
  not: either the component doesn't exist in Figma yet (build it first via
  `figma-create`, then sync via `figma-sync`) or it was never synced (run
  `figma-sync`) — don't invent a mapping here.
- **Never uses live MCP access during a hands-off `build-plan` run** (C6):
  all design context — tokens, specs, screenshots per variant×mode — comes
  from the **committed** artifacts `figma-sync` already wrote. If a needed
  artifact is missing, stop and say so; don't reach for live Figma.

## Procedure

1. **Read committed context.** `design/story-map.json` for the
   component→story→import/prop mapping, `design/specs/<Component>.json`
   for per-variant×mode metrics, `design/screenshots/<Component>/*` for the
   reference screenshots. If the project has an `aesthetic-profile.md` in
   its `design/` directory, read it too — it carries the non-tokenizable
   design intent (material logic, light logic, motion feel) the generated
   code must honor with the token names it cites.
2. **Generate through the normal test-first loop** (this project's existing
   `test-first` skill) — the component's *behavior* (props, state,
   interactions) gets ordinary red/green tests same as any other code; the
   design pack does not replace that loop, it adds a *visual* acceptance
   layer on top.
3. **Tier 1 — spec-diff.** Run the mechanism spec-diff walker
   (`templates/design/spec-diff-walker/spec-diff.walker.spec-diff.js`,
   already installed by `setup-design`) against the new component's
   stories, always. Fix any drift the comparator reports before moving on.
   **Then record the receipt** — the walker's exit code is the only accepted
   proof this tier passed, never your own reading of its output: run
   `argo design record-spec-diff-receipt --
   <the project's spec-diff test command>` (e.g. `npx vitest run
   design/spec-diff-walker`), which executes the command, writes
   `design/spec-diff-receipt.json` (`{ recordedAt, exitCode }`) from its REAL
   exit code, and re-exits with that same code. The kit's design-commit-gate
   requires this receipt to be fresh (within 10 minutes) and `exitCode: 0`
   before it will let a commit touching `componentsPath` land — re-run it
   immediately before committing, not once at the start of the session.
3a. **Presentation-regen seam.** Every generated component splits into a
   GENERATED presentation module (co-located, suffix convention e.g.
   `Button.presentation.tsx` holding the cva/variant classes) and a
   hand-owned behavior file (`Button.tsx`) that imports it; regen ever only
   rewrites the `.presentation.tsx` file. Before regenerating, run
   `diffVariantShape` (kit's `design-kit/variant-shape-diff`) against the
   component's last-synced `variantMatrix` (`design/registry.json`'s entry)
   vs. the freshly synced shape. A `changed: true` result STOPS and reports
   to the owner — never silent regen. An unchanged shape proceeds to
   regenerate the presentation file only.
4. **Tier 2 — gestalt acceptance, D22 ordering.** Compare each story's
   rendered screenshot against the **committed** reference screenshot
   (light↔light, dark↔dark) and record a **structured PASS/FAIL verdict
   artifact** — checkable by build-plan's receipt hooks — BEFORE any
   baseline commit. During a hands-off Phase E build this verdict is owned
   by the supervising on-device session, not this skill in isolation.
5. **Tier 3 — baseline commit, only after a recorded PASS.** Once tier 2
   records PASS, commit the VRT baseline screenshots
   (`vrt-walker/`'s `toMatchScreenshot` reference). **Never** commit a
   baseline before the verdict is recorded — that's exactly the ordering
   bug D22 exists to prevent (a wrong baseline could otherwise ride many
   commits before a human reads it).

## Verification

Manual dry-run only during authoring — this skill's true test is argo-v2
Phase B/C actually generating a real component from a real synced design;
no such fixture exists in this repo.
