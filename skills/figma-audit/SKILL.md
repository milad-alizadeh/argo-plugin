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
naming (`Size`→`size`, Title-Case→lowercase), missing or incorrect mode copy
for **components only** (D11, generalized to mode copies, 2026-07-05: one
copy per Semantic-collection mode beyond the default; a single-mode
collection passes vacuously, zero copies required), explicit line-height
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

**Recipe checks (installed recipe only):** for `shadcn-tailwind`
(`@argohq/kit/design-kit/shadcn-tailwind/tier0-walker`)
— the non-Semantic-binding check: every color binding must resolve to a
LOCAL variable in the project's Semantic collection (all variables live in
the project's design file — the duplicated starter — so a remote binding is
itself a violation, not something to fail open on); gap/padding (D24)
accepts Primitives or Semantic spacing variables. A different recipe
supplies its own check set, or none at all.

## Two modes

1. **Named-component audit (hard gate, D8)** — when called with specific
   names (by `figma-sync`, `figma-create`, or the user), any violation on
   those nodes **fails loud**. Matches by name against COMPONENT,
   COMPONENT_SET, FRAME, and SECTION nodes — not components only, so a
   SCREEN or foundation frame (e.g. `foundations/sticker-sheet`) can be
   named-audited too, which `figma-create`'s own flow requires as a hard
   gate. This is the mode other skills depend on — never soften it to
   advisory.
2. **File-wide sweep (advisory)** — when run standalone with no component
   names, walks every top-level frame on every page and reports violations
   as **advisory** findings (un-synced frames, stray hygiene issues) — it
   informs, it doesn't block anything on its own. Also reports
   `unsectioned-component` (a component not a child of any category shelf
   frame on `Custom Components`) and `missing-component-description`.

   **Registry-reconcile ride-along (design-memory-placement.md A3).** The
   sweep already traverses every top-level COMPONENT/COMPONENT_SET — diff
   that same live list against `design/registry.json` via
   `reconcileRegistrySweep` (import from `@argohq/kit/design-kit`)
   to catch drift a per-task incremental upsert can't see on its own:
   `registry-orphan` (entry whose nodeId no longer resolves AND whose name
   isn't found live), `registry-unregistered` (live component absent from
   the registry — an agent that crashed before its final upsert), and
   `registry-miscategorized` (live category disagrees with the entry). All
   three are advisory, never blocking. Because the sweep already holds the
   full node list, also re-resolve + persist any entry whose `nodeId` moved
   (a `combineAsVariants`/variant restructure minted a new id — far more
   common than deletion) via `getNodeByIdAsync`/`findAll`, and stamp
   `syncedAtWriteCount`/`figmaFileVersion` on the registry header — this is
   a live-Figma-only concern the pure `reconcileRegistrySweep` function
   can't perform itself; the walker marshals `nodeIdResolves` per entry
   before calling it.

## Procedure

1. Load `figma:figma-use`.
2. **Derive the full options object first — Node-side, before any
   `use_figma` call.** Run `argo design prepare-tier0-audit-options` (wraps
   `deriveTier0AuditOptions`) with `{ cwd: <host project root>,
   componentNames: [...] }` (or `[]` for a file-wide sweep). It reads
   `.claude/argo.json`'s `design.<app>` block and `design/registry.json`
   Node-side (the sandbox can't read a committed file itself) and returns
   `{ componentNames, compositeNames, semanticCollectionName, recipe }`.
   Keep the whole object — every DATA field the bundled script's completion
   value needs; never hand-author a trimmed `{ componentNames: [...] }`.
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
   the completion value with the FULL options object from step 2.
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
