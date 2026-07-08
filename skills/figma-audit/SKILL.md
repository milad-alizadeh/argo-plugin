---
name: figma-audit
description: Run the canonical tier-0 Figma hygiene audit against named components (hard gate) or the whole file (advisory sweep). Use when the user asks to audit, check, or lint the Figma file for design-pack hygiene, before figma-sync/figma-create hand off to it internally, or after any Figma-side generation to confirm it's clean.
---

# figma-audit

Owns the **canonical** tier-0 Figma hygiene audit (design-pack plan, X3:
"figma-audit owns the canonical audit script; sync/create call it" — there is
exactly one copy of this logic, never a second divergent one). That one copy
lives in `@argohq/kit` — `design-kit/tier0-audit`'s `runTier0Audit` — and is
never assembled or committed into a host project (kit-extraction restructure:
killed the old splice-into-`design/tier0-audit.js` model, the exact source of
a real drift bug where a kit-side fix didn't reach a project's already-
assembled copy). `bundle-tier0-audit` bundles it fresh, on demand, for every
run; the installed recipe's own check functions (e.g. shadcn-tailwind's
`design-kit/shadcn-tailwind/tier0-walker`) are baked into that SAME bundle by
import, never a second separately-executed script. Project-specific DATA
(the Semantic collection name, the registry's composite names) flows through
the `options` object `prepare-tier0-audit-options` derives, never through a
committed/assembled copy.

**Mandatory prerequisite:** load `figma:figma-use` first — this skill's every
check runs by executing a **bundled** script inside Figma's Plugin API
sandbox via `use_figma`; skipping that skill causes the usual hard-to-debug
`use_figma` failures.

## What it checks (figma-to-code-pipeline.md §5 tier 0)

**Mechanism checks (every recipe):** unbound fills/strokes/radii/type,
missing Auto Layout, detached instances, non-semantic names, D18 variant
naming (`Size`→`size`, Title-Case→lowercase), explicit line-height
(D20), node-scoped story URLs (`?node-id=`, D1/C13), unbound Auto Layout
gap/padding (D24, revised 2026-07-05: every non-zero `itemSpacing`/padding
field must be bound to a Primitives or Semantic spacing variable — unbound
literals, on-scale or not, are violations; a binding to a variable outside
those two collections is also a violation).

**Composite-naming check (Option B, design-first-council-ruling.md Gate
ruling, advisory).** In a composed screen, a plain FRAME named after a
registered composite (`design/registry.json`'s component keys) rather than an
INSTANCE of it is under-decomposition — a traced screen, not one composed
from built components. Always advisory, never the hard authoritative
decomposition gate (Option C, deferred until its brief/story-map schema
lands) — never wire it as a hard-fail.

**Geometry checks (Layer A, fidelity-geometry-verifier.md, opt-in via
`design.<app>.geometryCategories`, hard gate).** Subtree-scoped checks over
role-tagged nodes (`#row`/`#content-start`/`#rail`/`#anchor`/`#hit-target`
layer-name suffixes a component author adds): rows are DECLARED via `#row`,
never inferred from DOM shape (an internal frame that merely has children is
not a row); depth is derived by clustering rows on their own `#content-start`
x (no DOM-nesting inference, no variant-property read) — rows sharing a
content-start x are one depth. Then: rows within a depth cluster share one
content-start x, distinct depths are evenly spaced by one derived indent unit,
a `#rail` spans exactly from the parent `#anchor` to the last row's `#anchor`
center, consecutive rows don't gap past `itemSpacing` + `geometryTolerancePx`,
a role-tagged node isn't hidden/transparent/clipped (a coordinate-only cheat),
same-depth `#anchor`s share one y-offset from their row top, a HUG-sized node's
children don't overflow it, and a `#hit-target` node is at least 24x24px
(configurable). Row HEIGHT is NOT required to be uniform (kind-varying height,
e.g. a 28px phase row next to a 36px agent row, is legitimate).
`missing-role-tags` fires once, at the audited root, when the target's
category is in `geometryCategories` but it carries zero role-tagged
descendants — the "arm the geometry pass" precondition. Runs once per
named-audit target (never the file-wide sweep, never per-node) — a target
whose category isn't in `geometryCategories` never pays the marshal cost
AND never runs any geometry rule, `missing-role-tags` included: this is
decided PER TARGET, from that target's OWN resolved category
(`prepare-tier0-audit-options`'s `componentCategories` input, name -> category,
threaded through as `targetCategories`), never by whether `geometryCategories`
is merely configured non-empty somewhere in the call — a call auditing a
`tree`-category component alongside a plain `Button` must geometry-check only
the former. Omit `componentCategories` (or a target's entry in it) and that
target gets zero geometry checks, same as an unconfigured project.

**Recipe checks (installed recipe only):** for `shadcn-tailwind`
(`@argohq/kit/design-kit/shadcn-tailwind/tier0-walker`)
— the non-Semantic-binding check: every color binding must resolve to a
LOCAL variable in the project's configured Semantic collection (all
variables live in the project's design file — the duplicated starter — so a
remote binding is itself a violation, not something to fail open on), or the
recipe's declared `tw/*` collection family (`tw/gap`, `tw/padding`, `tw/font`,
`tw/stroke-width`, `tw/border-radius`, `tw/border-width`, `tw/margin`,
`tw/space` — a stock kit duplicate deliberately splits non-color tokens
across these instead of folding them into Semantic); gap/padding (D24)
accepts the configured Primitives/Semantic collections or that same `tw/*`
family. No collection name is hardcoded — the Semantic collection name comes
from `argo.json`'s `semanticCollectionName` (a stock kit duplicate never
renames it from `mode`). A different recipe supplies its own check set, or
none at all.

## Two modes

1. **Named-component audit (hard gate, D8)** — when called with specific
   names (by `figma-sync`, `figma-create`, or the user), any violation on
   those nodes **fails loud**. Targets by the registry's `nodeId` whenever
   the name resolves there (authoritative — never a name-based sweep, which
   used to match every same-named node in the file). A name with no registry
   entry — a SCREEN or foundation frame (e.g. `foundations/sticker-sheet`),
   which `figma-create`'s own flow requires as a hard gate — falls back to a
   name lookup against COMPONENT, COMPONENT_SET, FRAME, and SECTION nodes,
   but only when it resolves to EXACTLY one node; an ambiguous name reports
   `ambiguous-audit-target-name` instead of silently auditing every match.
   This is the mode other skills depend on — never soften it to advisory.
2. **File-wide sweep (advisory)** — when run standalone with no component
   names, walks every top-level frame on every page and reports violations
   as **advisory** findings (un-synced frames, stray hygiene issues) — it
   informs, it doesn't block anything on its own. Also reports
   `unsectioned-component` (a component not a child of any category shelf
   frame on `Custom Components`) and `missing-component-description`.
   Registry-reconcile is NOT part of this sweep — it moved to `figma-sync`'s
   staleness step (design-system-reset-overhaul.md Slice 4), since both walk
   the live component list against the registry in the same pass.

## Procedure

1. Load `figma:figma-use`.
2. **Derive the full options object first — Node-side, before any
   `use_figma` call.** Run `argo design prepare-tier0-audit-options` (wraps
   `deriveTier0AuditOptions`) with `{ cwd: <host project root>,
   componentNames: [...], componentCategories: { <name>: <category>, ... } }`
   (`componentCategories` optional, `{}` for a file-wide sweep or when the
   caller doesn't know a target's category — see below) (or `[]`/`{}` for a
   file-wide sweep). It reads `.claude/argo.json`'s `design.<app>` block and
   `design/registry.json` Node-side (the sandbox can't read a committed file
   itself), resolves each requested name to its registry `nodeId`
   (authoritative targeting — a name-based sweep used to match every
   same-named node in the file, e.g. auditing "Card" also swept a container
   frame literally named "Card"), and returns `{ componentNodeIds,
   componentNames, compositeNames, semanticCollectionName,
   additionalAllowedCollectionNames, recipe, viewport, geometryTolerancePx,
   geometryCategories, targetCategories }` — `componentNodeIds` is the
   resolved authoritative target list; `componentNames` on the way OUT holds
   only names that had no registry entry (a fallback resolved sandbox-side by
   an unambiguous single-match name lookup, never a blind multi-node sweep);
   `viewport` is `{ width, height }` from `design.<app>.viewport` when
   configured (undefined otherwise — opt-in, gates the
   `screen-viewport-mismatch` check; not the unrelated
   `design.<app>.vrtEnvironment.viewport` STRING, a different concept and
   owner: the Storybook/Playwright VRT capture viewport). `geometryTolerancePx`
   is a single px tolerance for every geometry (Layer A) check, from
   `design.<app>.geometryTolerancePx`, defaulting to `1`. `geometryCategories`
   is the project's FIXED enum of component categories (a subset of
   `componentCategories` that structurally have rows — list/tree/table/nav),
   from `design.<app>.geometryCategories`, defaulting to `[]`. `targetCategories`
   is derived from the `componentCategories` INPUT you passed in step 2 (name
   -> category, and mirrored under the resolved nodeId once known) — this is
   the PER-TARGET signal the walker checks against `geometryCategories`: a
   target whose own category isn't in `geometryCategories` (or that has no
   entry in `componentCategories` at all) gets ZERO geometry checks —
   `missing-role-tags` included — never a call-wide switch. **The caller
   (`figma-create` step 4) already knows each component's category from
   placing it under that category's shelf (design-memory-placement.md
   Mechanism 1) — pass it here, don't omit it and expect the gate to infer
   it.** Keep the whole returned object — every DATA field the bundled
   script's completion value needs; never hand-author a trimmed
   `{ componentNames: [...] }`.
3. **Bundle the audit for the returned `recipe` — never hand-assemble or
   paste raw source into `use_figma`.** Run `argo design bundle-tier0-audit
   --recipe <recipe>` (wraps `bundleTier0AuditForRecipe`), `cwd` set to the
   host project root (so `@argohq/kit` resolves from its `node_modules`).
   This generates a tiny entry module that imports `runTier0Audit` from
   `@argohq/kit/design-kit/tier0-audit` plus (for a recipe with tier-0
   checks) that recipe's own check functions, e.g.
   `@argohq/kit/design-kit/shadcn-tailwind/tier0-walker`, wires the DATA
   fields from step 2's options into them (functions can't cross the
   `use_figma` data boundary, so they're baked into the bundle by import —
   only the DATA options object crosses it), and shells out to `bun build
   --bundle --format=esm` — restoring the bare-completion-value ending (a
   naive tree-shake would otherwise discard the whole audit body as
   "unused") and verifying the result has zero `import`/`export` statements
   and is under `use_figma`'s 50,000-char cap. Nothing is written into the
   host project's `design/` dir — the bundle lands at a cached tmp path this
   command prints; read that file and paste ITS content into `use_figma`,
   never a hand-assembled source module. Execute it via `use_figma`, calling
   the completion value with the FULL options object from step 2. **Tag this
   call `figma-read-only` in `skillNames`** (fidelity-geometry-verifier.md
   Slice 13, same mechanism as figma-wireframe's `figma-wireframe` tag): the
   audit itself never mutates the file, so this call must not arm the
   design-guard write counter — omit the tag and every plain audit run (no
   actual fix) forces a spurious audit-owed nudge.
4. Report violations grouped by `severity`. For a named audit with any
   `hard` violation: **fail loud** — list every violation with its
   `nodeId`/`nodeName`/`rule`/`detail`, and do not report success. For an
   advisory sweep: summarize counts by rule, list the worst offenders.
5. **Record the receipt — mandatory for a named audit, the deterministic
   proof design-guard-stop.mjs checks before a session can end.** Immediately
   after `use_figma` returns the violations array, run
   `argo design record-audit-receipt --record
   '{"componentNames":[...],"violations":[...]}'`, passing the EXACT array
   `use_figma` returned (never hand-authored, never summarized) alongside the
   `componentNames` this run audited. This writes `design/audit-receipt.json`
   — `{ timestamp, componentNames, violationCount, writeCounterAtAudit }` —
   which only counts as clean when `violationCount` is 0 and
   `writeCounterAtAudit` matches `.argo/design-guard.json`'s current write
   count (no Figma writes happened after this audit ran). Never report the
   audit as "done" on your own narration — the receipt is the only accepted
   proof; `design-guard-stop.mjs` blocks the session end otherwise.

## Cannot be tested outside Figma

This skill's core logic is a stated, accepted gap in this repo's own test
suite (design-pack plan §6, risk 1) — `tier0-audit.js` only executes inside
Figma's Plugin API sandbox. First real proof is a live run against an actual
Figma file (argo-v2 Phase B). Do not invent a synthetic harness for it here.
