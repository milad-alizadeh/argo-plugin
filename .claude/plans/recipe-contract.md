# Recipe contract: framework-modular figma-to-code

Status: queued — run `argo:planner` on this AFTER kit-extraction-restructure lands
(it must ground in the post-extraction kit layout). Do before first npm publish
(no-legacy window makes the reshuffle free).

Design authority: decision 16 in
`argo-v2/.claude/plans/argo-npm-package-and-docs-consolidation.md`.

## Goal

Make the design pack recipe-pluggable so future targets (react-native/expo/tamagui,
etc.) are one new module each, zero core changes.

## Shape (settled)

- Core `@argohq/kit/design-kit` = target-agnostic only: comparator, region-contract,
  waivers, schemas, audit protocol, kit-inventory. Nothing CSS/Storybook/DOM-aware.
- Recipe = `@argohq/kit/recipes/<name>`, uniform interface:
  `tier0Checks`, `conversionTable` (move today's CSS-specific conversion-table out of
  core behind this), `tokenWriter` strategy, walker adapters, setup manifest consumed
  by `/argo:setup-design`.
- Selection: `argo.json` `design.<app>.recipe` → CLI resolves
  `@argohq/kit/recipes/${recipe}` dynamically.
- Interface is a package boundary: a recipe may later graduate to its own package
  (`@argohq/recipe-<name>`) without consumer changes.

## Planner must cover

- Inventory every framework leak in "core" (conversion-table's CSS assumptions,
  token-writer's base.css/@theme coupling, walkers' Storybook/composeStories/Playwright
  web assumptions, eslint lint spec, setup-design's shadcn/Storybook steps).
- Define the recipe interface as a checked schema (shape-validated at load).
- Refactor shadcn-tailwind into the first conforming recipe; acid test asserts a second
  dummy recipe loads through the same seam.
- Keep zod-free tier0-rules subpath guarantee per-recipe.
