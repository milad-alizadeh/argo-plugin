---
name: figma-sync
description: Dump the Figma design source of truth into committed artifacts — tokens, specs, story-map, reference screenshots, freshness metadata — regenerate the generated CSS region, and commit. Use when the user asks to sync/pull/import the latest Figma changes, before figma-to-code generation needs fresh design context, or on a schedule after Figma edits.
---

# figma-sync

Pulls the Figma design source of truth into the **committed artifacts** every
deterministic gate compares against (design-pack plan §4) — no gate ever
talks to Figma directly, including during hands-off `build-plan` runs (C6).
Builds on `figma:figma-use`.

## Procedure

1. **Audit first (hard gate, D8).** Call `figma-audit` on the components
   being synced. Any `hard` violation fails the whole sync loud — fix in
   Figma before syncing, never sync a dirty file.
2. **Dump tokens.** Full variable dump (collections, modes, values,
   descriptions) into `design/tokens.json`, plus freshness metadata: file
   version, `lastModified`, and this sync's timestamp (D4). Validate the
   result against `figma-design-kit`'s `KitLockSchema`-shaped fields before
   writing.
3. **Dump specs.** Per-variant×**state**×mode node metrics — including
   `layoutSizing` (D14/D20) — into `design/specs/<Component>.json`, for
   **both** project components and used base components. Validate each
   entry against `StoryMapEntrySchema`'s sibling shape where applicable.
4. **Capture reference screenshots.** Per variant×mode, into
   `design/screenshots/<Component>/<variant>.<mode>.png` — so tier 2 and
   headless rebuilds never need live MCP access (C6). For the dark side:
   **do not** duplicate the frame — temporarily flip
   `explicitVariableModes` on the light frame to Dark, capture, then
   **revert** (D11); screens never get a hand-maintained dark duplicate,
   only components do.
5. **Export assets.** Icons/images via MCP asset tools (SVG optimized,
   `currentColor` where tokenized), committed alongside.
6. **Build `story-map.json`.** Component key + node id → story id → import
   path → prop mapping (D1), validated against `figma-design-kit`'s
   `StoryMapEntrySchema`.
7. **Regenerate the generated `@theme` region** in the project's
   `tokenFilePath` (from `design/config.json`) from the freshly dumped
   `tokens.json` — this is the ONE writer for that region (D19); never hand-edit it.
8. **Refresh fixtures** the spec-diff/VRT walkers read (`design/specs/*`,
   `design/screenshots/*`) so the next gated-build slice sees fresh data.
9. **Commit** every artifact above as one commit (or a small, clearly-scoped
   set) — this is what makes downstream gates deterministic (§4's artifact
   discipline: gates only ever compare committed artifacts).

## Fail loud, never silently skip

If the tier-0 audit reports any `hard` violation on a synced component, stop
— do not write partial artifacts for that component. Report which
components synced cleanly and which were blocked, with the audit's
violation detail.

## Verification

Manual dry-run only during authoring — no Figma file or host project lives
in this repo to exercise this against. Real verification happens at argo-v2
Phase B's first live sync.
