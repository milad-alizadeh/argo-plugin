# Design-system-reset overhaul — argo-plugin implementation plan

Grounded against `.claude/plans/design-system-reset.md` (argo-v2, settled +
council-reviewed 2026-07-07) and the current state of this repo
(`/Users/milad/Developer/argo-plugin`). Builds the plugin/kit side of the
reset in the 5-step build order the council settled on. Consumer-side
(argo-v2) touches are a small final slice.

## Owner mandate (repeated so every slice is graded against it)

Very simple, effective setup. Dead/redundant code is **deleted**, not
deprecated. No speculative features, no gates beyond the ones the design doc
names. Keep the same-file/external-library recipe branch point as-is — do
not tear out a working abstraction the plan doesn't contradict.

## What's already done vs still open (read this before touching anything)

Inspection of the working tree found more already landed than the design doc
assumed. Do not re-do these:

1. **`modeCopyViolations` ID-vs-name fix (build-order step 1, part A) — DONE.**
   `packages/kit/src/design-kit/tier0-audit.ts:422-429`
   (`collectSemanticModeNames`) now returns `{ id, modes }` keyed by the
   Semantic collection's real `VariableCollectionId:X:Y`, and
   `modeCopyViolations` (`packages/kit/src/design-kit/tier0-rules.ts:255-269`)
   compares `copy.explicitVariableModes?.[semanticCollectionId]` by that ID,
   not by collection name. `tier0-rules.test.ts:278-335` covers the exact
   regression case (`'flags a mode copy keyed by the collection NAME instead
   of its ID'`). **Nothing left to do here.**
2. **kit-subscription machinery (kit.lock/KitLockSchema, kit-inventory,
   kit-patches) — ALREADY DELETED from the kit package**, predating this
   plan. `packages/kit/src/design-kit/index.test.ts:19-22` asserts
   `KitPatchSchema`/`KitLockSchema` are `undefined` on the exported surface;
   `packages/kit/src/skill-scripts/prepare-tier0-audit-options.test.ts:61-69`
   asserts the options-deriver never reads `design/kit-patches.json` or
   `design/kit.lock`. `packages/kit/src/design-kit/component-names.ts:1-7`'s
   own header says these two checks were "relocated from the deleted
   kit-inventory module, 2026-07-07." **No kit.lock/KitLockSchema/
   kit-inventory/kit-patches module exists anywhere in `packages/kit/src` to
   delete.** The design doc's dead-list item for these is already satisfied
   in the plugin; only the *consumer* still had stray files
   (`apps/desktop/design/kit-inventory.json`, `kit-patches.json`, `kit.lock`)
   — those are already `D` (deleted) in argo-v2's working tree per the task's
   git status, and Slice 5 folds committing that into the reset.
3. **`kit-name-collision` gate / Library Swap — no trace in this repo.**
   Grepped the whole tree (source + templates + skills): zero matches for
   `kit-name-collision`, `Library Swap`, `LibrarySwap`. This gate does not
   exist in the current plugin to delete. The council's dead-list item is
   already void; Slice 1 removes the one live reference to it
   (`skills/figma-create/SKILL.md`'s figma-audit dispatch table doesn't
   mention it either — confirmed clean).
4. **The "same-file recipe" is already the only recipe and already the
   default.** `templates/design/recipes/shadcn-tailwind/README.md:3-9` and
   `skills/setup-design/SKILL.md §0c` describe and install exactly the
   duplicate-the-starter model today; there is no "external-library" recipe
   option in `setup-design`'s wizard to make non-default. **What's still
   live and needs killing per the council's actual finding** (design doc
   line 29: "which already no-ops most external-library machinery") is the
   **tier-1b base-congruence residue** that recipe still installs/references
   (Slice 1) — that's the real remainder of build-order step 1's second half.
5. **`waivers.js`/`WaiverSchema`, `component-aliases.json`, and the
   base-congruence walker template are all still live** — genuinely dead
   code per the council's list, not yet removed. Slice 1 covers these.

So the real remaining work starts at build-order step 1's second half
(tier-1b/base-congruence residue in `setup-design`) and step 2 (the actually-
live dead modules above), not step 1's first half or the kit.lock family.

## Slices (build order, each independently verifiable)

---

### Slice 1 — Delete confirmed-dead modules + close out step 1

**testable: false** (deletions + doc edits, no new behavior) · **requiresLaunch: false**

Deletes what's genuinely live-and-dead per the council's table, and closes
the still-open half of build-order step 1 (drop tier-1b installation from
`setup-design`, since the same-file recipe already no-ops the rest of it).

**Context:** `waivers.ts`/`WaiverSchema` and the base-congruence walker exist
solely to gate the retired code→Figma congruence direction (design doc
decision 1). `component-aliases.json` + `findNewNameAliasCollision` exist
solely for the alias-map anti-recreation check the council's dead-list names
explicitly ("alias maps"). Both are single-purpose and safe to delete outright
— nothing else imports them except each other's tests and the skills below.

**Files to change:**
- DELETE `packages/kit/src/design-kit/waivers.ts` + `waivers.test.ts`
- DELETE from `packages/kit/src/design-kit/schemas.ts:1-15`: `WaiverSchema`
  (keep `StoryMapEntrySchema`, `RegistryEntrySchema`, `RegistryHeaderSchema`
  — reworked in Slice 4, not deleted here)
- EDIT `packages/kit/src/design-kit/index.ts:3-4`: drop the `WaiverSchema`
  export from the schemas re-export line and the whole
  `export { checkWaiver, invalidateWaivers } from './waivers.js'` line
- DELETE `templates/design/recipes/shadcn-tailwind/design-source/base-congruence.walker.spec-diff.js`
- EDIT `templates/design/gate-wiring.md:9-19`: drop the "1b — base-congruence"
  table row (line 17) and its "Tiers 1, 1b, and 5" → "Tiers 1 and 5" wording
  (lines 9-11)
- EDIT `skills/setup-design/SKILL.md`: remove the
  `design-source/base-congruence.walker.spec-diff.js` install instruction in
  §4 (lines 236-238: "Install the chosen recipe's remaining templates...
  `design-source/base-congruence.walker.spec-diff.js` (always for
  `shadcn-tailwind`...)")
- EDIT `skills/setup-design/templates-reference.md`: delete the
  `design-source/base-congruence.walker.spec-diff.js` row (lines 50) from the
  recipe-templates table
- EDIT `templates/design/recipes/shadcn-tailwind/README.md:7-9`: drop "the
  file's component mirrors are held honest by the tier-1b base-congruence
  gate" from the Design source bullet
- DELETE `packages/kit/src/skill-scripts/check-anti-recreation.ts` +
  `check-anti-recreation.test.ts`
- EDIT `packages/kit/src/design-kit/component-names.ts`: delete
  `findNewNameAliasCollision` (lines 20-51) and its `AliasMap` type (line 10);
  keep `normalizeComponentName` (still used by the P4a rework in Slice 4) and
  `registryComponentNames` (still used by `compositeRegionNamingViolation`'s
  feed and `prepare-tier0-audit-options.ts:54`)
- EDIT `packages/kit/src/design-kit/component-names.ts`'s test file if one
  exists at that path with alias-collision cases — check for a co-located
  `component-names.test.ts` and strip only the `findNewNameAliasCollision`
  describe block, keep the rest
- DELETE `templates/design/component-aliases.example.json`
- EDIT `packages/kit/bin/argo.js:66`: remove the
  `'check-anti-recreation': '../dist/skill-scripts/check-anti-recreation.js'`
  line from `DESIGN_VERBS`
- EDIT `skills/figma-create/SKILL.md`: remove the whole "Anti-recreation
  check, mechanically" paragraph (lines 232-243) and the "ONE hard check that
  ships now is **anti-recreation**" sentence in the paragraph above it (lines
  222-231) — replace with a one-line note that a NEW component name is
  checked against the flat registry directly (`design/registry.json`'s keys,
  via `registryComponentNames`), not a separate alias map; there is no
  separate collision CLI verb after this slice — the "check before you build"
  registry read in step 1 of "Check before you build" (lines 84-107) already
  covers this in prose, so this is a deletion, not a replacement build
- EDIT `packages/kit/src/design-kit/index.test.ts`: remove any assertion
  exercising `checkWaiver`/`invalidateWaivers`/`WaiverSchema` exports (only
  keep the "does not export the deleted kit-subscription schemas" test at
  lines 19-22, which already asserts the OTHER two schemas are gone — extend
  it, don't duplicate it, to also assert `WaiverSchema` is undefined)

**Step-by-step:**
1. Delete `waivers.ts`/`waivers.test.ts`; remove `WaiverSchema` from
   `schemas.ts` and its re-export from `index.ts`. Run
   `bun test packages/kit/src/design-kit/index.test.ts` — extend the existing
   "does not export the deleted kit-subscription schemas" test with a new
   assertion `expect((figmaDesignKit as any).WaiverSchema).toBeUndefined()`
   (red first, then the deletion above makes it green — since the export
   line is already gone by the time you add the assertion, write the
   assertion FIRST against the pre-deletion code to see it fail, per this
   plan's own build-metadata: assertion added before the deletion edit).
2. Delete the base-congruence walker template + its 3 doc references
   (`gate-wiring.md`, `setup-design/SKILL.md`, `templates-reference.md`,
   recipe `README.md`). No test harness exists for template-copy text (design
   pack plan's stated accepted gap) — verify by grep: `rg -l
   "base-congruence" templates/ skills/` returns zero hits afterward except
   `templates/design/memory-model.md`'s "derivable from the base-congruence
   walker" line under "What's deliberately absent" — leave that one (it's
   documenting why `kitDeps[]` was never added, not instructing an install;
   update its wording to say "no longer applicable" in the same edit for
   accuracy, since the walker no longer exists to derive from).
3. Delete `check-anti-recreation.ts`/test, the alias-collision function +
   type in `component-names.ts`, the CLI verb, the template, and the
   `figma-create/SKILL.md` section. Run
   `bun test packages/kit/src/design-kit` and
   `bun test packages/kit/src/skill-scripts` — both must stay green with the
   deleted test files gone (not skipped, removed) and no import errors from
   the now-missing `findNewNameAliasCollision`.
4. `bun run build` in `packages/kit` (tsc) — must compile clean with zero
   references to the deleted symbols anywhere in `dist`.

**Verification:** `cd packages/kit && bun test && bun run build`. Then
`rg -l "WaiverSchema|checkWaiver|invalidateWaivers|findNewNameAliasCollision|component-aliases|check-anti-recreation|base-congruence" packages/ skills/ templates/` — every remaining hit must be either this plan file itself, `.claude/plans/design-pack*.md` (historical planning docs, not live instructions), or the one intentionally-updated `memory-model.md` line.

**Risks:** `figma-create/SKILL.md`'s "check before you build" step 4 report
line format ("reusing base/X" / "extending base/X by composition" / "closest
base matches...") stays unchanged — only the alias-collision paragraph is
cut. Don't over-trim this section.

5. **Field bugs (found live 2026-07-07, first migration run — Card produced
   2103 audit violations, nearly all tooling false positives):**
   a. `gap-padding-foreign-binding` and `non-semantic-binding` hardcode the
      accepted collection names `"Primitives"`/`"Semantic"`. A stock kit
      duplicate names its semantic collection `mode` (never renamed — owner
      mandate forbids restructuring kit collections) and deliberately splits
      tokens across a `tw/*` collection family (`tw/gap`, `tw/padding`,
      `tw/font`, `tw/stroke-width`, `tw/border-radius`, `tw/border-width`,
      `tw/margin`, `tw/space`) — the kit's own untouched components fail the
      check as shipped. Fix: parameterize the accepted-collections list per
      recipe/config (`argo.json` `semanticCollectionName`, already `"mode"` in
      argo-v2, plus a recipe-declared allowlist for the `tw/*` family); no
      collection-name literals in tier0-rules. Regression tests: a
      non-"Semantic" semantic name AND a `tw/*`-bound property both pass.
   b. The audit's component targeting matches by NAME, so auditing "Card"
      also swept a container frame literally named "Card" (kit page furniture:
      demo composition, "View in Shadcn" links) — ~49 foreign violations from
      nodes outside the component set. Fix: target audits by node id
      (registry `nodeId`), never by name lookup; name lookup at most resolves
      TO a node id which the caller confirms.

---

### Slice 2 — Strip the three-class truth model from figma-sync / figma-to-code

**testable: false** (skill-doc rewrite, no kit code) · **requiresLaunch: false**

**Context:** `skills/figma-sync/SKILL.md:13-36` currently classifies every
region into 3 truth classes (base primitives = code-truth, product composites
= code-truth/RECONCILE, net-new = Figma-truth). Design doc decision 1 replaces
this with ONE rule: Figma owns ALL visuals, code owns ALL behavior, for every
component. `skills/figma-to-code/SKILL.md:30-37`'s "Never generate a
code-owned composite" precondition and its RECONCILE-verdict skip logic exist
solely to serve the retired 3-class model.

**Files to change:**
- EDIT `skills/figma-sync/SKILL.md`:
  - Replace the "Three-class source of truth" section (lines 13-36) with a
    single-rule statement: Figma owns visuals (tokens/variants/spacing/
    styling) for every component, base or custom, one-way Figma→code; code
    owns behavior (a11y, focus, state machines, base-ui/react wiring); sync
    regenerates the presentation module only, never the hand-owned behavior
    file (cite design doc decision 1's generated-presentation/hand-owned-
    behavior split — implemented as the presentation-regen seam in Slice 3).
  - Step 3 ("Dump specs") line 59's "for **used base components** (the
    starter's shadcn mirrors — their specs are the tier-1b base-congruence
    gate's fixtures)" — drop the tier-1b clause; specs are dumped for every
    synced component, base or custom, uniformly now.
- EDIT `skills/figma-to-code/SKILL.md`:
  - Delete the "Never generate a code-owned composite" precondition bullet
    (lines 30-37) entirely — there is no more RECONCILE-verdict skip; every
    Figma component (base or custom) flows through this skill.
  - §3 "Tier 1/1b — spec-diff + base-congruence" (lines 57-74): rename to
    "Tier 1 — spec-diff" and delete the "Also run tier 1b's base-congruence
    walker..." paragraph (lines 60-64); keep the spec-diff walker + receipt
    steps unchanged.
  - Add the presentation-regen seam step here as a stub pointing at Slice 3
    (don't duplicate the mechanism doc in two slices — Slice 3 owns the
    concrete text).

**Step-by-step:**
1. Rewrite `figma-sync/SKILL.md`'s truth-model section per the design doc's
   decision 1 wording. Grep afterward: `rg "RECONCILE|three-class|tier-1b|tier 1b" skills/figma-sync/SKILL.md skills/figma-to-code/SKILL.md` must return zero hits.
2. Rewrite `figma-to-code/SKILL.md`'s precondition + tier section per above.
3. Cross-check `skills/design-screen/SKILL.md` and `skills/figma-create/SKILL.md`
   for any remaining "RECONCILE" reference inherited from the old model —
   `figma-create/SKILL.md` line 202 ("Prefer base components...") and its
   registry entries elsewhere in argo-v2 (`session-rail`, `terminal-panel` in
   `apps/desktop/design/registry.json`) carry `RECONCILE:` prose in their
   `description` field — these are DATA in a consumer's registry, not this
   skill's instructions; leave the registry entries alone (Slice 5 handles
   consumer data), only strip the concept from the skill DOCS here.

**Verification:** `rg -n "RECONCILE|three-class truth|tier-1b|tier 1b" skills/figma-sync/SKILL.md skills/figma-to-code/SKILL.md` → no matches. Manual read-through: both skill docs describe one truth split (Figma=visuals, code=behavior) with no mention of a second code-truth class.

**Risk:** the design doc explicitly keeps "code retaining downstream veto" language (figma-to-code's own §"Preconditions" already has this framing) — don't delete the general precondition that a generated component still runs through the normal test-first loop; only the RECONCILE-specific skip logic is dead.

---

### Slice 3 — Net-new: staleness layer (figma-sync) + presentation-regen seam (figma-to-code)

**testable: true** for the kit-side pure logic (staleness diff, variant-shape
diff) · **testable: false** for the skill-doc prose · **requiresLaunch: false**

**Context:** Design doc decision 8 requires a layered staleness detector
(file version bump → variable-defs snapshot diff → node-tree walk vs
registry, flagging orphans) with `lastSyncedAt`/`out-of-sync` registry
fields and a review-prompt end-of-sync step — today `figma-sync` only
captures file version (`skills/figma-sync/SKILL.md:44-48`'s step 2, "file
version, `lastModified`, and this sync's timestamp"), no diffing, no registry
fields, no prompt. Decision 1's mechanism (generated presentation module +
hand-owned behavior file) needs a variant-shape diff that routes an API-
shape change (added/renamed/removed variant or prop) to owner review instead
of silent regen — nothing like this exists yet.

This is genuinely new code — write it test-first (red-green), not
speculative beyond what decisions 1 and 8 specify.

**Files to change:**
- NEW `packages/kit/src/design-kit/staleness.ts` — pure functions:
  - `diffVariableDefs(previous: Record<string, unknown>, current: Record<string, unknown>): { changed: string[] }`
    — shallow key/value diff of a variable-defs snapshot (the shape
    `design/tokens.json` already produces per `figma-sync` step 2/2a).
  - `classifyNodeDrift({ registryEntries, liveNodeIds }): { orphaned: string[] }`
    — registry entries whose `nodeId` isn't in the live node-id set (reuses
    the resolution shape already proven by `registry-reconcile.ts`'s
    `registry-orphan` rule, but as its own named staleness concern, not
    folded into that file — registry-reconcile stays about miscategorization/
    unregistered drift found by the sweep, staleness is about "did this
    change since last sync").
  - `classifyStaleness({ fileVersionChanged, variableDrift, nodeDrift }): 'in-sync' | 'presentation-drift' | 'api-drift' | 'orphaned'`
    — the layered classification decision 8 describes; `api-drift` is set
    only when `variant-shape diff` (below) reports a prop/variant add-remove-
    rename, everything else that changed is `presentation-drift`.
- NEW `packages/kit/src/design-kit/staleness.test.ts` — one test per branch
  above (in-sync no-op, variable-only change → presentation-drift, node
  missing → orphaned, variant-shape change → api-drift). Write each test
  red-first against the not-yet-written function.
- NEW `packages/kit/src/design-kit/variant-shape-diff.ts` — pure function
  `diffVariantShape(previous: VariantMatrix, current: VariantMatrix): { changed: boolean; added: string[]; removed: string[]; renamed: [string,string][] }`
  where `VariantMatrix = Record<string /* prop */, string[] /* enum values */>`
  (the same shape the slimmed `RegistryEntrySchema.variantMatrix` field from
  Slice 4 stores) — compares prop keys and each prop's value set.
- NEW `packages/kit/src/design-kit/variant-shape-diff.test.ts`.
- EDIT `packages/kit/src/design-kit/schemas.ts`: extend `RegistryEntrySchema`
  with the fields Slice 4 needs anyway (`lastSyncedAt: z.string().nullable()`,
  `status` enum gains `'out-of-sync'` and `'orphaned'` members) — coordinate
  with Slice 4 so the schema is edited exactly once; if Slice 4 lands first,
  skip this bullet.
- EDIT `packages/kit/src/design-kit/index.ts`: export the two new modules'
  public functions.
- EDIT `packages/kit/package.json` `exports`: add
  `"./design-kit/staleness"` and `"./design-kit/variant-shape-diff"` subpaths
  (mirroring the existing `./design-kit/tier0-rules` entry shape).
- EDIT `skills/figma-sync/SKILL.md`: add a new numbered step (after step 2a
  "Regenerate the semantic manifest", before step 3 "Dump specs") titled
  "Staleness sweep" — calls the new kit functions over the file's current
  `version`, a fresh variable-defs dump, and a live node-id set (via
  `use_figma`/`get_metadata`) against the committed registry, stamps each
  affected `design/registry.json` entry's `lastSyncedAt`/`status`, and ends
  with a **review-prompt printout** (not a gate) listing every entry that
  moved to `out-of-sync`/`orphaned` — auto-regen is explicitly out of scope
  (design doc "Rejected alternatives": "Auto-regen on sync").
- EDIT `skills/figma-to-code/SKILL.md`: add a step before the "Generate
  through the normal test-first loop" step — "Presentation-regen seam": every
  generated component splits into a GENERATED presentation module (co-located,
  suffix convention e.g. `Button.presentation.tsx` holding the cva/variant
  classes) and a hand-owned behavior file (`Button.tsx`) that imports it;
  regen ever only rewrites the `.presentation.tsx` file. Before regenerating,
  run `diffVariantShape` against the component's last-synced variant matrix —
  a `changed: true` result STOPS and reports to the owner (never silent
  regen); an unchanged shape proceeds to regen the presentation file only.

**Step-by-step (TDD, one function at a time):**
1. Write `staleness.test.ts`'s first case (`classifyStaleness` returns
   `'in-sync'` when nothing changed) — red. Implement the minimal
   `classifyStaleness` — green.
2. Add `diffVariableDefs` test (changed keys detected) — red → implement →
   green.
3. Add `classifyNodeDrift` test (orphan detection) — red → implement → green.
4. Wire the three into `classifyStaleness`'s remaining branches, one test at
   a time (`presentation-drift`, `api-drift`, `orphaned`).
5. Same red-green loop for `variant-shape-diff.ts` (added/removed/renamed
   prop cases, each its own test).
6. Update `schemas.ts`/`index.ts`/`package.json` exports; run
   `bun run build` in `packages/kit`.
7. Rewrite the two SKILL.md sections per above.

**Verification:** `cd packages/kit && bun test src/design-kit/staleness.test.ts src/design-kit/variant-shape-diff.test.ts` all green, each test file has a comment or commit history showing it was red before its implementation landed (tdd-guard evidence if run under a gated build). `bun run build` clean. Manual read-through of both SKILL.md edits confirms no gate gained beyond what decisions 1/8 specify (no new hard-fail, review-prompt only).

**Risks / assumptions:** Decision 8 says "per-component `updated_at` used
only where the REST surface actually exposes it" (published-library
components only) — since this project's components are local/unpublished,
`classifyStaleness` never reads a per-node `updated_at`; this plan does not
build that path (YAGNI until a published-library project exists) — state
this as an accepted gap in the module's own doc comment, not a silent
omission. The live-Figma node-tree walk and variable-defs dump are gathered
by the calling skill via `use_figma`/REST, never by the kit module itself
(same design as `tier0-audit.ts`'s Plugin-API/pure-function split) — the kit
functions here take plain-object snapshots, never call `figma.*` directly,
so they ARE unit-testable outside the sandbox (unlike tier-0's walker half).

---

### Slice 4 — Flip P4a to instance-tree-resolves-to-registry; relocate registry-reconcile; slim the registry schema

**testable: true** (all kit-side logic) · **requiresLaunch: false**

**Context:**
- `packages/kit/src/design-kit/screen-manifest.ts` currently implements P4a
  as "declared manifest (parsed from a Dev Mode annotation) vs built
  instances" (`parseScreenManifest`, `classifyInstancePresence`,
  `summarizeInstancePresence`). Design doc decision 9 replaces the annotation-
  driven declaration with "every instance in the screen's tree resolves to a
  registry entry" — no manifest to parse, no `argo-screen` fence syntax, no
  cardinality (`xN`) bookkeeping.
- `packages/kit/src/design-kit/registry-reconcile.ts`'s `reconcileRegistrySweep`
  currently takes `{ name, nodeId, category }` triples and reports
  `registry-miscategorized` when `entry.category !== live.category`. Council:
  "registry-reconcile (move into sync, drop category dependency)" — the flat
  registry (decision 4) drops `category` from the schema entirely, so this
  rule has nothing to compare.
- `packages/kit/src/design-kit/schemas.ts`'s `RegistryEntrySchema` is
  `{ nodeId, category, status: draft|audit-clean, description, provenance }`.
  Decision 4 + build-order step 4 specify the new shape verbatim: `{nodeId,
  kind, status, lastSyncedAt, variant matrix}`.
- `skills/design-screen/SKILL.md`'s §4(a) (lines 96-112) currently documents
  the annotation+manifest P4a flow and cites `check-instance-presence
  --manifest ... --built ...`.
- `skills/figma-audit/SKILL.md`'s "Registry-reconcile ride-along" section
  (lines 76-92) currently owns the sweep call.
- `packages/kit/src/skill-scripts/check-instance-presence.ts` is the Node
  wrapper wiring `parseScreenManifest`/`classifyInstancePresence` together;
  it needs to be rewritten around the new resolve-by-nodeId model.

**Files to change:**
- NEW `packages/kit/src/design-kit/instance-presence.ts` (replaces
  `screen-manifest.ts`'s manifest-driven logic; keep the file name change
  deliberate — nothing "manifest" survives): exports
  - `resolveInstancePresence(builtInstances: { nodeId: string; name: string; type: string }[], registryEntries: { nodeId: string; name: string }[]): PresenceResult[]`
    — for every INSTANCE node in `builtInstances`, resolve by `nodeId`
    against the registry first (authoritative), falling back to
    `normalizeComponentName` name match only when the nodeId lookup misses
    (mirrors the existing tolerant-name-match test case at
    `screen-manifest.test.ts:101-108`, kept as behavior, moved to the new
    module) — never the reverse (name-first) since a nodeId collision is
    impossible and a name collision (two components sharing a normalized
    name) is not.
  - `summarizeInstancePresence(results): { resolved: string[]; unresolved: string[]; clean: boolean }`
    — `clean` false when any instance is `unresolved`. No `MISSING`/`HOLLOW`/
    `UNREGISTERED`/`skipped`/cardinality distinction survives — there is no
    declared list to be missing FROM anymore; an instance is either resolved
    against the registry or it isn't. (A registry entry that no instance in
    the tree resolved to is NOT this check's concern — that's
    `registry-reconcile`'s `registry-unregistered`/orphan job in Slice-4's
    other half, run at sync time over the whole file, not per-screen.)
  - Keep `normalizeComponentName` imported from `component-names.ts`
    unchanged (Slice 1 already preserved it for this exact reuse).
- DELETE `packages/kit/src/design-kit/screen-manifest.ts` +
  `screen-manifest.test.ts` (fully superseded — `parseScreenManifest`,
  `ManifestEntry`, the `argo-screen` fence regex, and the cardinality/HOLLOW/
  MISSING/UNREGISTERED taxonomy are all dead per design doc decision 9).
- NEW `packages/kit/src/design-kit/instance-presence.test.ts` — port the
  still-relevant cases from `screen-manifest.test.ts` (populated instance
  resolves, nodeId-miss falls back to name match, an instance with no
  registry match is unresolved) minus every manifest/cardinality/annotation-
  parsing case (`parseScreenManifest` describe block, the `x0`/cardinality-
  warning cases, `HOLLOW`/`MISSING`/`UNREGISTERED` distinctions) — those
  behaviors no longer exist to test.
- EDIT `packages/kit/src/skill-scripts/check-instance-presence.ts`: replace
  the manifest+annotation flow with: read `design/registry.json`, take the
  screen frame's flat instance inventory (still captured via a single
  `use_figma` read per `design-screen/SKILL.md`'s existing cost-discipline
  rule — same call, different payload: no more annotation text needed, just
  `{ nodeId, name, type }[]`), call `resolveInstancePresence` +
  `summarizeInstancePresence`, print + exit non-zero when not clean (same
  advisory-loud contract, no hook consumes the exit code — unchanged from
  today). Drop the `--manifest` CLI flag entirely; keep `--built` (now a
  `{ nodeId, name, type }[]` JSON array instead of the old `BuiltNode` shape
  with `componentName`/`childCount`).
- EDIT `packages/kit/src/skill-scripts/check-instance-presence.test.ts`:
  rewrite its 3 cases for the new signature (no `annotationText` param, no
  manifest-block-absent case since there's no manifest to be absent).
- EDIT `packages/kit/src/design-kit/registry-reconcile.ts`: drop `category`
  from both `LiveComponent`/`RegistryEntry` types and delete the
  `registry-miscategorized` rule + its loop body (lines 41-47); keep
  `registry-orphan` and `registry-unregistered` unchanged (both are
  nodeId/name-only, not category-dependent).
- EDIT `packages/kit/src/design-kit/registry-reconcile.test.ts`: delete the
  miscategorization test case(s), keep the orphan/unregistered ones.
- EDIT `packages/kit/src/design-kit/schemas.ts`: replace `RegistryEntrySchema`
  with the slimmed shape:
  ```ts
  export const RegistryEntrySchema = z.object({
    nodeId: z.string(),
    kind: z.enum(['kit', 'custom']),
    status: z.enum(['draft', 'audit-clean', 'out-of-sync', 'orphaned']),
    lastSyncedAt: z.string().nullable(),
    variantMatrix: z.record(z.string(), z.array(z.string()))
  })
  ```
  Drop `category`, `description`, `provenance` entirely (not in the design
  doc's 5-field enumeration; `description` and audit provenance were cold-
  start conveniences, not part of the settled slim shape — cite build-order
  step 4's exact wording, "slim registry schema to {nodeId, kind, status,
  lastSyncedAt, variant matrix}", as the authority for the cut). Keep
  `RegistryHeaderSchema` unchanged (file-level freshness metadata is
  orthogonal to the per-entry shape). If Slice 3 already added
  `lastSyncedAt`/expanded `status` here, this edit becomes "also drop
  category/description/provenance, add kind/variantMatrix" instead of a
  fresh add — reconcile whichever slice lands second.
- EDIT `packages/kit/src/design-kit/index.ts`: swap the
  `screen-manifest.js` export line for `instance-presence.js`'s public
  functions; drop `parseScreenManifest` from the barrel.
- EDIT `packages/kit/package.json` `exports`: rename
  `"./design-kit/screen-manifest"` to `"./design-kit/instance-presence"`
  (breaking rename — this package has no external consumers outside this
  monorepo's own skills per its own `package.json` description, so this is
  safe; grep the whole repo for the old subpath string after the rename to
  confirm zero stragglers).
- EDIT `skills/design-screen/SKILL.md`:
  - Delete the "What the PRD owns vs the design layer" section's
    `argo-screen` manifest-block prose and fenced-example (lines 33-48) —
    there is no more Dev Mode annotation contract to author.
  - §2 "Build component-first (P1), then compose (P2)" (lines 64-76): drop
    "write the frame's Dev Mode annotation: the arrangement prose plus the
    `argo-screen` manifest block" and the `frame.annotations = [...]` call —
    a composed screen needs no annotation write at all now.
  - §4(a) (lines 96-112): rewrite to "every INSTANCE in the composed frame's
    metadata tree resolves to a `design/registry.json` entry by `nodeId`" —
    single `use_figma` read of the frame's flat instance inventory (`{
    nodeId, name, type }` per descendant — no `componentName`/`childCount`
    needed anymore since there's no HOLLOW/cardinality concept), pipe into
    `argo design check-instance-presence --built '<inventory JSON>'` (drop
    the `--manifest` flag from the documented command line).
  - Drop the `mark-screen-composed`/P4b tie-in's reference to the annotation
    ("Right after composing a screen, run `argo design mark-screen-composed`")
    — keep `mark-screen-composed` itself (P4b survives untouched per the
    council's table; it doesn't read the manifest), only the annotation-write
    instruction that preceded it in the same paragraph goes.
- EDIT `skills/figma-audit/SKILL.md`: delete the "Registry-reconcile
  ride-along" subsection (lines 76-92) from the file-wide sweep description —
  it moves to `figma-sync` per the council's table.
- EDIT `skills/figma-sync/SKILL.md`: add the registry-reconcile sweep as a
  new step (adjacent to Slice 3's staleness-sweep step, since both walk the
  live component list against the registry in the same `use_figma` pass —
  wire them as one combined read, not two separate `use_figma` round-trips,
  per this skill's own existing efficiency rule) — port the prose from the
  deleted `figma-audit` section verbatim except: (a) drop the
  `registry-miscategorized` bullet (category dependency dropped), (b) add
  the **Scratch-prefix page exclusion**: any top-level component whose
  owning page name starts with `Scratch` (case-sensitive prefix match, same
  style as `isWireframePageName`'s `W\d{2}` convention in
  `tier0-rules.ts:125-127`) is excluded from the unregistered-component sweep
  entirely — sandbox work never generates noise (design doc decision 4).
- NEW: add an `isScratchPageName` (or inline predicate) alongside
  `isWireframePageName` in `packages/kit/src/design-kit/tier0-rules.ts` —
  actually, since this predicate is consumed by the SYNC-side sweep, not the
  tier-0 audit walker, put it in `registry-reconcile.ts` instead (co-located
  with the function it filters for) as `isScratchPageName(pageName: string): boolean { return pageName.startsWith('Scratch') }`, and thread an optional
  `pageName` field through `LiveComponent` so `reconcileRegistrySweep` can
  filter before reporting `registry-unregistered`.
- EDIT `packages/kit/src/design-kit/registry-reconcile.test.ts`: add the
  Scratch-prefix exclusion test case.

**Step-by-step (TDD):**
1. Write `instance-presence.test.ts`'s first case (resolves by nodeId) red,
   implement `resolveInstancePresence` minimally, green.
2. Add the nodeId-miss-falls-back-to-name-match case, red → green.
3. Add the unresolved case, red → green. Add `summarizeInstancePresence`
   tests (clean/not-clean), red → green.
4. Delete `screen-manifest.ts`/test, `index.ts`/`package.json` export swap,
   `bun run build`.
5. Rewrite `check-instance-presence.ts`'s Node wrapper + its test file
   against the new functions, red-green per case.
6. Edit `registry-reconcile.ts`: remove `category`/`registry-miscategorized`
   (this is a pure deletion — no new red/green cycle needed, but re-run the
   existing tests to confirm the remaining two rules still pass with
   `category` stripped from the fixtures) then add `isScratchPageName` +
   the exclusion, red-green.
7. Edit `schemas.ts`'s `RegistryEntrySchema` to the slim shape. Grep the repo
   for `RegistryEntrySchema` consumers (`skills/figma-create/SKILL.md`'s
   "Registry upsert" section cites the OLD shape verbatim — update that
   prose in the same commit as the schema change, or the skill and the
   schema drift apart immediately) and update `figma-create/SKILL.md`'s
   registry-upsert entry-shape example (currently `{ nodeId, category,
   status: 'audit-clean', description, provenance: {...} }`) to the new
   5-field shape.
8. Rewrite `design-screen/SKILL.md` §"What the PRD owns" + §2 + §4(a) and
   `figma-audit/SKILL.md`'s sweep removal + `figma-sync/SKILL.md`'s sweep
   addition.

**Verification:** `cd packages/kit && bun test && bun run build`. `rg -n "parseScreenManifest|argo-screen|ManifestEntry" packages/ skills/` → zero hits. `rg -n "\.category\b" packages/kit/src/design-kit/registry-reconcile.ts` → zero hits. `rg -n "RegistryEntrySchema" skills/figma-create/SKILL.md` shows the updated 5-field example, not the old one.

**Risks / open call made here (state it, don't hide it):** the design doc's
decision 4 registry shape doesn't literally include the audit-provenance
bookkeeping (`lastAudit`, `createdBy`) that `figma-create/SKILL.md`'s
existing self-audit loop currently writes and that `memory-model.md`'s
ownership table cites as the registry's job ("Audit pass/fail |
`design/registry.json`'s `provenance.lastAudit`"). Dropping `provenance`
per the literal 5-field list means audit pass/fail has no committed home
after this slice. Per the owner's own "very simple, no overimplementation"
mandate and the build order's literal wording, this plan drops it rather
than inventing a 6th field the design doc never asked for — `status:
'audit-clean'` already carries the pass signal; only the timestamp/task-name
detail is lost. **Flag this explicitly in the PR/commit description** so the
owner can veto if they actually want provenance kept; don't silently
resolve it either way without saying so. Also update `memory-model.md`'s
ownership table row for "Audit pass/fail" to point at `status` instead of a
now-nonexistent `provenance.lastAudit` field, in the same commit.

---

### Slice 5 — Consumer-side reset (argo-v2)

**testable: false** (data reset + doc retirement, some config edits are
behavioral for the VRT/Storybook dark-mode pin — see per-item note) ·
**requiresLaunch: false** except the dark-mode-pin item, which needs a real
Storybook/VRT run to prove it renders dark by default (**requiresLaunch:
true** for that item only)

Small, final slice — do after Slices 1-4 land in `@argohq/kit` and argo-v2
bumps its dependency. Everything here is grounded against argo-v2's actual
files (read during planning), not assumed.

**Files to change (argo-v2 repo, not this one):**
- `apps/desktop/design/registry.json` — reset to the new empty shape (`{
  "header": { "figmaFileVersion": "unknown", "syncedAtWriteCount": 0,
  "syncedAt": "<reset-date>" }, "components": {} }`) against the new file key
  `OWc6OSSt0zOzOxJDmKjWeY` — **already the value in
  `.claude/argo.json`'s `figma.projectFileKey`** (confirmed: the repoint is
  already done, only the registry DATA still carries the old file's 25
  entries and needs emptying).
- `apps/desktop/design/waivers.json` — already `[]` (confirmed, no action
  needed) — but per Slice 1's deletion of `WaiverSchema`/`checkWaiver`, this
  file becomes fully inert; delete it outright rather than leaving a dead
  empty-array file (nothing reads it anymore once
  `base-congruence.spec-diff.ts`, below, is also deleted).
- `apps/desktop/design/component-aliases.json` — DELETE (Slice 1 deleted the
  mechanism that reads it).
- `apps/desktop/design/audit-receipt.json`, `coverage-receipt-D01.json` —
  reset/delete: `audit-receipt.json` resets to empty (next `figma-audit` run
  regenerates it against the new file); `coverage-receipt-D01.json` is the
  old region-coverage gate's receipt (retired per design-process-
  simplification.md, predates even this reset) — delete outright, nothing
  reads it.
- `apps/desktop/design/semantic-seed.json`, `wireframe-fix-ledger.md` —
  these are old-file artifacts (semantic seeding + a wireframe fix log); per
  the design doc's "nothing needs preserving," delete both — they describe
  the old file's history, not the new one's.
- `apps/desktop/test/spec-diff/base-congruence.spec-diff.ts` — DELETE (the
  consumer's copy of the now-deleted base-congruence walker template).
- `apps/desktop/vitest.config.ts:59-63` (the "Design-pack tiers 1 + 1b"
  comment block and its base-congruence project entry) — remove the 1b
  project registration, keep tier-1 (spec-diff) unchanged; update the
  comment to drop "+ 1b".
- `.claude/design/gate-wiring.md` — remove the "1b — base-congruence" row
  (line 17) and the "Tiers 1, 1b, and 5" wording (line 10), mirroring
  Slice 1's plugin-template edit; this is the consumer's OWN copy (per
  `templates-reference.md`'s note that `gate-wiring.md` is "copied into the
  project's own docs... not committed verbatim" from the plugin template, so
  it must be hand-edited here too, not regenerated).
- `.claude/design/COMPONENT-INVENTORY.md`, `.claude/design/COMPONENT-RECONCILIATION.md`
  — retire per the council's dead-list ("COMPONENT-INVENTORY/-RECONCILIATION
  consumption"). The design doc (line 63-64) already states these die with
  the old file. Move both to `.claude/design/archive/` (don't hard-delete
  institutional history) and remove every live skill-doc reference to them
  as a "reuse authority" — that reference lives in THIS plugin repo's
  `figma-create/SKILL.md` ("consult the host's reuse authority (its
  COMPONENT-INVENTORY / RECONCILIATION docs)", lines 85-87) and
  `design-screen/SKILL.md` ("INVENTORY / RECONCILIATION / BUILD-ORDER mounted
  READ-ONLY", line 57) — **fold these two doc edits into Slice 1 or Slice 4
  in this repo** (both already touch `figma-create/SKILL.md`), not here;
  this slice only moves the argo-v2 files. Cross-reference so the two repos'
  changes land together.
- `apps/desktop/.storybook/preview.tsx` — add a `globals: { theme: 'dark' }`
  (or the installed dark-mode addon's pinned-default equivalent — confirm
  against the actual addon installed, none is visible in the current
  `preview.tsx`; if no theme-switching addon exists, pin dark via a
  decorator that sets `document.documentElement.classList.add('dark')`,
  matching whatever class-based dark-mode strategy `base.css`'s Tailwind
  `@theme` block already uses — read `src/renderer/src/assets/base.css`
  before writing this to confirm the toggle mechanism; do not guess) — per
  design doc decision 6, "the Storybook decorator/VRT config pins dark mode
  explicitly — gates never rely on a story's default theme."
- `apps/desktop/test/vrt/vrt.walker.vrt.js` and/or its
  `vitest.vrt.config.ts` — same dark-mode pin, on the VRT render path. Check
  whether `runVrtWalker` (from `@argohq/kit/walkers`) exposes a hook for
  this or whether the pin belongs in the composed-story wrapper; this needs
  a `packages/kit/src/walkers/vrt.ts` read before committing to a mechanism
  — **flag as needing its own short investigation step inside this slice**,
  not a placeholder: read `packages/kit/src/walkers/vrt.ts` first, then pin
  via whatever composition point it already exposes (or file a matching kit
  change if it exposes none — do not invent an untested hook signature here).

**Step-by-step:**
1. Bump argo-v2's `@argohq/kit` dependency to the version containing Slices
   1-4 (or re-`bun install` if still `link:`-based per the dev-phase note in
   argo-v2's CLAUDE.md).
2. Delete/reset the `apps/desktop/design/*` files listed above in one commit.
3. Delete `test/spec-diff/base-congruence.spec-diff.ts`; edit
   `vitest.config.ts` to drop its project registration; run
   `bun run test` from repo root — must stay green with one fewer project.
4. Edit `.claude/design/gate-wiring.md` (tier-1b row removal).
5. Move `COMPONENT-INVENTORY.md`/`COMPONENT-RECONCILIATION.md` to
   `.claude/design/archive/`; grep argo-v2 for any live (non-historical)
   reference to their old path and fix it.
6. Read `base.css`'s dark-mode toggle mechanism and `packages/kit/src/walkers/vrt.ts`'s composition surface; pin dark mode in `preview.tsx` and the VRT path accordingly.
7. Run `bun run storybook` (or `build-storybook` + serve), screenshot the
   smoke story, confirm it renders in dark mode by default with no
   `?globals=theme:dark` query param needed — this is the
   `requiresLaunch: true` proof for this item.

**Verification:** `bun run lint && bun run typecheck && bun run test` clean from argo-v2's repo root. `bun run test:vrt` runs (dormant todo-pass is fine — no baselines exist yet against the new file). A screenshot of the smoke story with no explicit dark-mode query param shows dark styling.

**Risks:** this slice is the one most likely to surface a real ambiguity
(exact dark-mode pin mechanism) that this plan can't resolve without reading
argo-v2's `base.css` and the kit's `vrt.ts` walker at execution time — both
reads are called out above as mandatory before writing the pin, not
guessed here.

---

## Cross-cutting verification (run once, after Slices 1-4, before Slice 5)

```
cd packages/kit
bun test
bun run build
rg -n "kit\.lock|KitLockSchema|kit-inventory|kit-patches|kit-name-collision|Library Swap|WaiverSchema|checkWaiver|component-aliases|findNewNameAliasCollision|parseScreenManifest|argo-screen|tier-1b|tier 1b|base-congruence|RECONCILE|three-class" \
  packages/kit/src skills templates \
  --glob '!*.test.ts'
```
The grep should return **zero hits** outside this plan file and the
historical `.claude/plans/design-pack*.md`/`.claude/plans/done/*.md` planning
docs (which are records of past decisions, not live instructions skills
read).

## Seam / checkpoint

Checkpoint review after **Slice 2** (three-class model stripped) — Slices 3-4
build genuinely new mechanisms (staleness diff, variant-shape diff, instance-
presence resolution) on top of a clean truth model; a review here catches a
wrong truth-model read before two slices of new code are built on it. This is
earlier than the plan's natural halfway (Slice 2 of 5), a deliberate seam
given how much of Slices 3-4 depends on Slice 2's framing being right.

## Scoped verify commands (per slice, run from `packages/kit/`)

- Slices 1-4: `bun test` (vitest, this package's own suite), `bun run build`
  (tsc — the package has no separate lint script; typecheck IS the build).
- Slice 5 (argo-v2 repo root): `bun run lint`, `bun run typecheck`,
  `bun run test`, `bun run test:vrt` (per argo-v2's own `CLAUDE.md`-documented
  commands).

## Explicitly out of scope (per the design doc + task)

- Screen-build orchestrator machinery (design doc decision 9's "no new
  orchestrator machinery until... manual composition proves to be the
  bottleneck").
- Bidirectional sync (decision 10).
- Light-mode value authoring (decision 6).
- Any recipe other than `shadcn-tailwind` (recipe-pluggability is a separate,
  not-yet-started plan — `.claude/plans/recipe-contract.md`).
