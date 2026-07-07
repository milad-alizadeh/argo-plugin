---
name: figma-sync
description: Dump the Figma design source of truth into committed artifacts — tokens, the semantic token manifest, specs, story-map, reference screenshots, freshness metadata — regenerate the generated CSS region, and commit. Use when the user asks to sync/pull/import the latest Figma changes, before figma-to-code generation needs fresh design context, or on a schedule after Figma edits.
---

# figma-sync

Pulls the Figma design source of truth into the **committed artifacts** every
deterministic gate compares against (design-pack plan §4) — no gate ever
talks to Figma directly, including during hands-off `build-plan` runs (C6).
Builds on `figma:figma-use`.

**Three-class source of truth (design-first, corrected).** Not everything in the
product surface is Figma-authored — classify each region before you dump, using
the host project's reuse authority (its reconciliation doc); never infer the
class from the node alone:

1. **Base primitives** (shadcn — Button, Switch, Badge, Dialog, Sonner…):
   **code is the source of truth**, the design file's starter-derived mirrors
   track it, and the tier-1b base-congruence gate holds them honest. Step 3's
   base-component spec dump reads the mirror for gate fixtures — it is not a
   source-of-truth flip.
2. **Existing product composites** (e.g. `SessionTerminalView`/TerminalPanel,
   `RosterRow`/SessionCard, `RosterView`/Rail, the activity feed, settings,
   usage — anything already implemented in code): **code is the source of
   truth**. Design-reconcile refreshes the visual language ONLY; the component
   boundary and behavior stay code-owned and are **never regenerated from
   Figma**. A region carrying a `RECONCILE` verdict is a Figma mirror for design
   reference — `figma-to-code` **never queues it for generation**.
3. **Net-new composites + screen composition**: **Figma is the source of
   truth** — genuinely design-first. This skill dumps these into artifacts and
   `figma-to-code` implements them, with code retaining downstream veto (Figma
   has no compiler).

Never invert class 1 or 2 to Figma-truth — that discards the shadcn vendoring,
the congruence gate, and the code-owned behavior of components that already run.

## Procedure

1. **Audit first (hard gate, D8).** Call `figma-audit` on the components
   being synced. Any `hard` violation fails the whole sync loud — fix in
   Figma before syncing, never sync a dirty file.
2. **Dump tokens.** Full variable dump (collections, modes, values,
   descriptions) into `design/tokens.json`, plus freshness metadata: file
   version, `lastModified`, and this sync's timestamp (D4). All variables
   are LOCAL to the project's design file (the duplicated starter) — there
   is no separate kit file, no `kit.lock`, and no variable-key manifest to
   capture.
2a. **Regenerate the semantic manifest.** Run
   `argo design generate-token-manifest` — it derives
   `design/semantic-manifest.md` (~60 semantic token names + purposes) from
   the freshly dumped `design/tokens.json`. This is the authoring vocabulary
   LLM sessions bind against (instead of enumerating ~1800 local
   primitives); commit it with the other artifacts in step 9. Never
   hand-edit it — the CLI is its one writer.
3. **Dump specs.** Per-variant×**state**×mode node metrics — including
   `layoutSizing` (D14/D20) — into `design/specs/<Component>.json`, for
   project components always, and for **used base components** (the
   starter's shadcn mirrors — their specs are the tier-1b base-congruence
   gate's fixtures). Validate each entry against `StoryMapEntrySchema`'s
   sibling shape where applicable.
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
   (the `recipe` field in the app's `design.<app>` block in `.claude/argo.json`
   selects which recipe's `code-target/token-writer.md` applies —
   today that's `token-writer.md` for `shadcn-tailwind`, template dir
   `templates/design/recipes/shadcn-tailwind/`) to
   regenerate the generated token region in the project's `tokenFilePath`
   from the freshly dumped `tokens.json` — that doc names the ONE writer for
   that region (D19); never hand-edit it. A future non-Tailwind code-target
   ships its own sibling doc; this step never needs to change to support it.
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
