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
   version, `lastModified`, and this sync's timestamp (D4). When the
   installed recipe's `baseSource == "external-library"`, also validate the
   kit-lock-relevant fields against `figma-design-kit`'s
   `recipes/external-kit`-subpath `KitLockSchema` and write `design/kit.lock`
   from them — for any other `baseSource` there is no separate kit file, so
   this freshness metadata is just recorded, not schema-checked against a
   kit lock.
3. **Dump specs.** Per-variant×**state**×mode node metrics — including
   `layoutSizing` (D14/D20) — into `design/specs/<Component>.json`, for
   project components always, and for **used base components** only when
   the installed recipe's `baseSource` calls for a separate base-component
   spec dump (`external-library`, or `same-file` with vendored base code) —
   a no-op sub-step under `baseSource: none`. Validate each entry against
   `StoryMapEntrySchema`'s sibling shape where applicable.
4. **Capture reference screenshots.** Per variant×mode, into
   `design/screenshots/<Component>/<variant>.<mode>.png` — so tier 2 and
   headless rebuilds never need live MCP access (C6). For every non-default
   Semantic mode: **do not** duplicate the frame — temporarily flip
   `explicitVariableModes` on the default-mode frame to that mode, capture,
   then **revert** (D11, generalized to mode copies, 2026-07-05); a
   single-mode Semantic collection has no non-default mode to capture, so
   this degenerates to today's single-capture behavior. Screens never get a
   hand-maintained mode duplicate, only components do.
5. **Export assets.** Icons/images via MCP asset tools (SVG optimized,
   `currentColor` where tokenized), committed alongside.
6. **Build `story-map.json`.** Component key + node id → story id → import
   path → prop mapping (D1), validated against `figma-design-kit`'s
   `StoryMapEntrySchema`.
7. **Follow the installed recipe's code-target token-writer doc**
   (`design/config.json`'s `recipe` field selects which
   `templates/design/recipes/<recipe>/code-target/token-writer.md` applies —
   today that's `token-writer.md` for `shadcn-tailwind-external-kit`) to
   regenerate the generated token region in the project's `tokenFilePath`
   from the freshly dumped `tokens.json` — that doc names the ONE writer for
   that region (D19); never hand-edit it. A future non-Tailwind code-target
   ships its own sibling doc; this step never needs to change to support it.
8. **Refresh fixtures** the spec-diff/VRT walkers read (`design/specs/*`,
   `design/screenshots/*`) so the next gated-build slice sees fresh data.
9. **Commit** every artifact above as one commit (or a small, clearly-scoped
   set) — this is what makes downstream gates deterministic (§4's artifact
   discipline: gates only ever compare committed artifacts).
10. **Kit-inventory staleness check (read-only, never a write).**
    `design/kit-inventory.json` is owned by `design-upgrade` (whole-file
    recapture on kit swap) and seeded by `setup-design` — this skill syncs
    the PROJECT file, not the kit library, and has no trigger to mutate the
    roster. If it exists, compare the live kit library's version against its
    `kitSourceVersion` and **warn** on drift (advisory only — the
    kit-name-collision gate already fails open on a stale/absent inventory).
    Never re-dump or otherwise write `kit-inventory.json` from this skill.

## Fail loud, never silently skip

If the tier-0 audit reports any `hard` violation on a synced component, stop
— do not write partial artifacts for that component. Report which
components synced cleanly and which were blocked, with the audit's
violation detail.

## Verification

Manual dry-run only during authoring — no Figma file or host project lives
in this repo to exercise this against. Real verification happens at argo-v2
Phase B's first live sync.
