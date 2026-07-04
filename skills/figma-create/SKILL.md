---
name: figma-create
description: Create a new component or screen in Figma following the design pack's authoring conventions — base instances, Semantic bindings only, Auto Layout, semantic names, D18 variant naming, dark copy for components — then self-audit and fix violations before reporting done. Use when the user asks to design/create/mock up a new component or screen in Figma.
---

# figma-create

Creates a component or screen in Figma to the design-pack's authoring
conventions, then **self-audits and fixes before reporting done** (D8: never
hand back a component that would fail its own hard gate). Builds on
`figma:figma-use` and `figma:figma-generate-library` for the mechanics of
node creation, variable binding, and variant-set assembly.

## Authoring rules (what the self-audit checks)

- **Base instances + Semantic bindings only.** Compose from the shadcn kit's
  base component instances; every fill/stroke/radius/type binds the
  project's Semantic collection — never a Primitive directly (§8's
  library-source distinction), never a literal.
- **Auto Layout** on every frame-like container — no absolute positioning.
- **Semantic names** — never Figma's auto-generated `Frame 12`/`Rectangle 4`
  defaults.
- **D18 variant naming** — component property `Size` → prop `size`;
  Title-Case variant values → lowercase literal unions. Mechanical, not
  judgment: name it this way from the start.
- **Dark copy for components** (D11) — every component gets a visible
  dark-mode instance copy directly beneath it, Semantic collection's mode
  set to Dark via `explicitVariableModes`. **Screens do NOT get this** — a
  screen's dark rendering is a `figma-sync`-time capture artifact, never a
  hand-maintained duplicate frame.
- **Screens are composition, not generation** (design doc §6b): a screen
  frame may only contain instances of library/project components + layout
  containers — no loose rectangles/text with raw styles. If an instance
  needed for the screen doesn't exist yet as a component, stop and build
  the component first via this same flow — don't invent one-off styling
  inline in the screen.

## Procedure

1. Create the component/screen per the rules above.
2. Call `figma-audit` on the new component(s) — named-component mode, hard
   gate.
3. **Fix every violation it reports before reporting done.** This is the
   self-audit loop: create → audit → fix → re-audit until clean. Never
   report success with a known-outstanding violation.
4. Report what was created (node names/ids) and confirm the audit passed
   clean.

## Verification

Manual dry-run only — no Figma file lives in this repo to create anything
in. Real verification is argo-v2 Phase B/D actually invoking this against a
live Figma file.
