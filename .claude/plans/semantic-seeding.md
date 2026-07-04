# Semantic-seeding extension point (D19/D23-F3) + D24 spacing audit rule

**Scope:** close the "zero Figma-side bootstrap" gap in the landed
mechanism/recipe pack (v0.9.0, `design-pack-recipes.md`, all slices built).
Today `figma-create` and the tier-0 audit assume a correctly-shaped Semantic
variable collection already exists in the project's Figma file — nothing in
the plugin creates one. This plan authors the `shadcn-tailwind-external-kit`
recipe's **Semantic-seeding extension point** (seed data + a `use_figma`
Plugin API script that bootstraps `Primitives` + `Semantic` in a project
file, proven live 2026-07-04 against the real argo-v2 file pair) and adds
**D24's spacing rule as the 12th tier-0 mechanism rule**.

**Authoritative specs (read before building):**
- `/Users/milad/Developer/argo-v2/.claude/plans/figma-to-code-pipeline.md` —
  decisions D10 (`:58`), D19 (`:67`), D23 (`:71`), D24 (`:72`); Phase B item 3
  in §7 (`:172-213`), which carries the full deliverable spec and the live
  spike results this plan treats as established fact.
- `/Users/milad/Developer/argo-plugin/.claude/plans/design-pack-recipes.md` —
  the architecture that shipped (mechanism/recipe split, tier-0 rule
  extraction into pure functions, the `// {{RECIPE_TIER0_CHECKS}}` splice
  convention). This plan follows its shape exactly: pure predicate + unit
  test for logic, thin Plugin-API walker for anything that needs live
  `figma.*` calls, a live-file verification checkpoint (mirrors its Slice 14)
  for anything provable only inside Figma's sandbox.

---

## 1. Current-state findings (grounded in the actual v0.9.0 tree)

- `packages/figma-design-kit/tier0-rules.js:1-114` — eleven mechanism tier-0
  rules as pure predicates, each exported from `index.js:5-17` and unit-tested
  in `test/figmaTier0Rules.test.mjs`. No spacing/gap rule exists today
  (confirmed by reading the full file — the eleven are: unbound fill/stroke/
  radius/type, missing Auto Layout, detached instance, non-semantic name,
  variant naming, dark-copy presence/correctness, implicit line-height,
  story-URL scope).
- `templates/design/tier0-audit.js:1-156` — the canonical assembled script.
  `auditNode` (`:49-99`) calls each of the eleven pure functions in turn, then
  splices in the recipe's per-node checks via `runRecipeTier0Checks`
  (`:94-96`); `runTier0Audit` (`:113-136`) calls the recipe's one file-wide
  check (`kit-patches-conformance`) via `runKitPatchesConformance` (`:130-133`).
  There is exactly one marked injection region
  (`// {{RECIPE_TIER0_CHECKS}}`, `:47`) for recipe-owned checks — a
  MECHANISM rule does not go through that marker, it's called directly from
  `auditNode`/`runTier0Audit` alongside the existing eleven.
- `packages/figma-design-kit-shadcn-tailwind/tier0-rules.js:1-65` — the three
  recipe-owned rules (`nonSemanticBindingViolation`,
  `retiredFileKeyBindingViolation`, `kitPatchesConformanceViolations`), same
  pure-predicate-over-plain-object-shapes pattern, unit-tested in
  `test/figmaDesignKitShadcnTailwindTier0Rules.test.mjs`. The
  `tier0-recipe-checks.js` walker (`templates/design/recipes/
  shadcn-tailwind-external-kit/design-source/tier0-recipe-checks.js:1-83`)
  shows the exact marshaling convention this plan's D24 walker code must
  copy: **variable fields must be named explicitly** — a live Variable
  object's `remote`/`key`/`variableCollectionId` are prototype getters, not
  own enumerable properties, so `{ ...variable }` silently drops them
  (confirmed live, Slice 14 of the landed plan, `:48-51`).
- `templates/design/recipes/shadcn-tailwind-external-kit/design-source/`
  today holds exactly four files: `base-congruence.walker.spec-diff.js`,
  `kit-patches.example.json`, `kit.lock.example.json`,
  `tier0-recipe-checks.js` (confirmed via Glob). **No `semantic-seed.json`,
  `seed-semantic.js`, or `derive-semantic-seed.js` exists** — this plan adds
  all three.
- `skills/setup-design/SKILL.md` — has the recipe-selection gate (§0a-0c,
  `:20-61`) and the template-copy step (§4, `:102-127`) that assembles
  `tier0-audit.js` and installs recipe files gated on `baseSource ==
  "external-library"`. **No seeding step exists** — §4/§7 (`:148-158`) create
  `design/` scaffolding (`waivers.json`, `kit-patches.json`) but never touch
  the Figma file itself. This plan inserts a new numbered step.
- `skills/setup-design/templates-reference.md:19-34` — the recipe-templates
  table this plan's new files must gain rows in, following the exact
  "Install when / Substitute or scope with" column convention already used
  for `tier0-recipe-checks.js` (`:31`).
- `packages/figma-design-kit/schemas.js`, `.../recipes/external-kit.js` —
  `KitLockSchema`/`KitPatchSchema` are recipe-owned exports (D23/F1), no
  relevant schema for seed data exists — `semantic-seed.json`'s shape is
  recipe-owned data, not schema-validated (matches D23's "kit.lock and
  kit-patches are recipe artifacts" precedent — no zod schema was authored
  for those examples either beyond the one moved schema).
- `test/` directory (Glob-confirmed list) — `figmaTier0Rules.test.mjs` and
  `figmaDesignKitShadcnTailwindTier0Rules.test.mjs` are the two files this
  plan's Slice 2 extends/mirrors. Root `package.json:8` — `"test": "vitest
  run"` is the verify command for every code slice.
- `.claude-plugin/plugin.json:3` and `.claude-plugin/marketplace.json:11` are
  both `0.9.0` today (confirmed) — version-bump candidate (final slice).

---

## 2. Design decisions (incidental ambiguities, resolved — not load-bearing)

1. **`semantic-seed.json`'s real content can't be authored blind.** Finding 1
   of the spike (task body) establishes the seed is a *dump* of the kit
   file's `mode` collection (per-mode color aliases) plus its single-mode
   `tokens` collection (radius/stroke/border-width floats) — derivation
   requires a live `use_figma` call **against the kit file**
   (`getLocalVariableCollectionsAsync` is local-file-only, so this cannot run
   from the project file — a second, separate `use_figma` call with the kit
   `fileKey` is required, confirmed by the task's own Finding 1). This repo
   has no committed Figma file to derive from. **Resolution (matches the
   task's own instruction to mirror Slice 14 of the landed plan):** author
   `derive-semantic-seed.js` (the script) and `seed-semantic.js` (the
   consumer) fully in early slices with a documented, precise expected
   shape; a dedicated **live verification slice** at the end runs
   `derive-semantic-seed.js` for real against kit copy `4lPUPl8OUan4i90Bc2ZMXe`
   and commits the actual resulting `semantic-seed.json` — that slice is the
   one that ships the real "default derived from the stock shadcn kit."
   Before that slice lands, `semantic-seed.json` does not exist in a
   buildable state; nothing in an earlier slice reads it as if it did.
2. **Where does the D24 rule's Primitives spacing scale come from at audit
   time?** The task says "the scale values come from the project file's
   local Primitives collection at audit time" — this requires a live lookup
   the walker performs once per audit (same shape as the existing
   `collectModifiedKitCopyNodes()` helper, `tier0-audit.js:151-153`), not a
   config-file constant. **Resolution:** add a sibling
   `collectPrimitivesSpacingScale()` helper to `tier0-audit.js`, called once
   in `runTier0Audit`, passed into every `auditNode` call. The Primitives
   collection name is hardcoded `'Primitives'` (matching D10's fixed naming —
   there is no `primitivesCollectionName` config field today, and D10 never
   makes that name project-configurable the way `semanticCollectionName` is,
   so no new config field is introduced; this mirrors the existing precedent
   of not over-configuring for a convention that's fixed by design).
3. **Which Figma-side properties does the D24 rule inspect?** Auto Layout's
   `itemSpacing` (the gap) and the four `paddingLeft/Right/Top/Bottom`
   properties — the properties D24's own text names ("gap/padding"). Counter-
   axis spacing (wrap) is out of scope — D24's text does not mention wrap,
   and this pack has no wrap-related authoring convention yet; adding it
   speculatively would be exactly the over-generality D23/D24 avoid
   elsewhere. Flagged here as an incidental scope choice, not silently made.
4. **Idempotency mechanism for `seed-semantic.js`.** "Skip-if-present per
   collection" (task body) is implemented as: look up
   `figma.variables.getLocalVariableCollectionsAsync()`, and skip creating
   `Primitives` if a collection named `Primitives` already exists (same for
   `Semantic`), skip creating a given semantic variable if a variable of that
   name already exists in the `Semantic` collection, skip adding the Dark
   mode if `Semantic` already has more than one mode. No new marker/flag file
   is introduced — the Figma file itself is the source of idempotency truth,
   consistent with D10's "Figma is truth" for the Semantic layer.

No load-bearing ambiguity was found — the task body and the two upstream
plans between them specify shapes, file locations, and behavior precisely
enough to proceed without a user check-in.

---

## 3. Files to change/add

| File | Change |
|---|---|
| `templates/design/recipes/shadcn-tailwind-external-kit/design-source/derive-semantic-seed.js` | **new** — `use_figma` script, runs in the KIT file, dumps `semantic-seed.json`'s shape |
| `templates/design/recipes/shadcn-tailwind-external-kit/design-source/semantic-seed.json` | **new** — seed data; placeholder shape in early slices, REAL derived content committed in the live-verification slice |
| `templates/design/recipes/shadcn-tailwind-external-kit/design-source/seed-semantic.js` | **new** — `use_figma` script, runs in the PROJECT file, idempotent |
| `packages/figma-design-kit/tier0-rules.js` | **modified** — 12th mechanism rule: `gapPaddingSpacingViolations` (D24) |
| `test/figmaTier0Rules.test.mjs` | **modified** — red-first tests for the new rule |
| `packages/figma-design-kit/index.js` | **modified** — export the new rule |
| `templates/design/tier0-audit.js` | **modified** — call the new rule per-node; add `collectPrimitivesSpacingScale()` helper, called once per audit |
| `skills/setup-design/SKILL.md` | **modified** — new seeding step, gated on recipe + Figma file keys |
| `skills/setup-design/templates-reference.md` | **modified** — three new rows for the seeding templates |
| `.claude-plugin/plugin.json` | **modified** — version bump + description |
| `.claude-plugin/marketplace.json` | **modified** — matching version bump |

No changes needed to: `packages/figma-design-kit-shadcn-tailwind/*` (D24 is
mechanism, not recipe — task is explicit: "this rule is MECHANISM, goes in
the universal section, not a recipe check"); `config.example.json` (no new
config field, per Decision 2 above); any zod schema (per §2 finding on
`schemas.js`).

---

## 4. Work items (dependency order, sized as buildable slices)

All slices `requiresLaunch: false` (plugin repo, no Argo runtime here, same
as every slice in the landed `design-pack-recipes.md`). Verify command for
every slice unless stated otherwise: `bun run test` (root `vitest run`, must
stay green — this repo's package.json has no separate typecheck/lint script
to run per-slice).

### Slice 1 — D24 rule: pure predicate + unit tests (testable: true, red-green)
- **Files (red first):** `test/figmaTier0Rules.test.mjs` — add a
  `describe('gapPaddingSpacingViolations (D24)', ...)` block mirroring the
  file's existing style. Fixture shape (document this exactly, no
  placeholder): the walker marshals each Auto Layout frame into
  ```js
  {
    layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE',
    gapAndPadding: [
      { field: 'itemSpacing', value: 8, bound: false },
      { field: 'paddingLeft', value: 24, bound: true, collectionName: 'Semantic' },
      { field: 'paddingRight', value: 24, bound: true, collectionName: 'Semantic' },
      { field: 'paddingTop', value: 6, bound: false },
      { field: 'paddingBottom', value: 6, bound: false }
    ]
  }
  ```
  Test cases: (a) unbound value that IS a member of the passed spacing scale
  → passes; (b) unbound value NOT in the scale → one violation per offending
  field, `{ rule: 'gap-padding-off-scale', detail: 'itemSpacing value 7 is not on the Primitives spacing scale and is not bound to a Semantic spacing variable (D24)' }`; (c) bound to
  `collectionName: 'Semantic'` → passes regardless of value; (d) bound to
  `collectionName: 'Primitives'` (a direct Primitive binding — not allowed,
  D24 only names two legal cases) → violation,
  `{ rule: 'gap-padding-non-semantic-binding', detail: 'paddingLeft is bound to a non-Semantic variable ("Primitives"); D24 requires a Semantic spacing variable or an on-scale literal' }`;
  (e) `layoutMode: 'NONE'` → `[]` regardless of `gapAndPadding` contents (Auto
  Layout absence is already `missing-auto-layout`'s job, not this rule's).
- **Files (green):** `packages/figma-design-kit/tier0-rules.js` — add
  `export function gapPaddingSpacingViolations(node, spacingScale) { ... }`
  after `storyUrlScopeViolation`, following the file's existing JSDoc-comment
  convention (note at the top of the function: "spacingScale values and
  collection membership are resolved by the walker; this function is pure
  over the marshaled shape"). `packages/figma-design-kit/index.js` — add
  `gapPaddingSpacingViolations` to the `tier0-rules.js` export block
  (`:5-17`).
- **Verify:** `bun run test` (red-green on the new `describe` block; full
  suite green before commit).

### Slice 2 — wire D24 into the assembled `tier0-audit.js` (testable: false — mechanism walker, same accepted gap as the existing eleven rules' marshaling code)
- **Files:** `templates/design/tier0-audit.js` —
  1. Import `gapPaddingSpacingViolations` alongside the existing ten imports
     from `figma-design-kit` (`:31-43`).
  2. Add `collectPrimitivesSpacingScale()` — an async function (placed next
     to `collectModifiedKitCopyNodes`, `:151-153`) that calls
     `figma.variables.getLocalVariableCollectionsAsync()`, finds the
     collection named `'Primitives'`, and for each variable scoped `GAP` or
     `WIDTH_HEIGHT` in that collection, resolves its value in the
     collection's single mode; returns the sorted array of numeric values.
     Returns `[]` if no `Primitives` collection exists (so the rule simply
     flags everything as off-scale rather than throwing — a project that
     hasn't run the seeding step yet gets a loud, honest audit failure, not
     a crash).
  3. In `runTier0Audit` (`:113-136`), call `collectPrimitivesSpacingScale()`
     once, before the walk, and thread the result into `walk`/`auditNode` as
     a third option field (`{ hard, spacingScale }`).
  4. In `auditNode` (`:49-99`), for nodes where `'layoutMode' in node`,
     marshal `gapAndPadding` per the Slice 1 fixture shape (`itemSpacing`
     only when `layoutMode !== 'NONE'`; padding fields always present when
     the property exists on the node) — for each field, look up
     `node.boundVariables?.[field]` (a single `{id}` object for number
     properties, not an array, per the Figma Plugin API — unlike
     `fills`/`strokes` which are arrays), resolve the bound variable's
     collection name the same explicit-field way `tier0-recipe-checks.js`
     does (`:52-59` — `remote`/`key`/`variableCollectionId` are getters, not
     own properties, so marshal each field by name, never spread). Call
     `gapPaddingSpacingViolations(marshaledNode, spacingScale)` and report
     each violation via the existing `report()` helper.
- **Verify:** `bun run test` (Slice 1's tests still green — this slice adds
  no new automated coverage, matching the file's accepted, pre-existing gap
  for all Plugin-API marshaling code, same reasoning as
  `design-pack-recipes.md` §6).

### Slice 3 — `derive-semantic-seed.js` (testable: false — Plugin API script, `use_figma`)
- **Files:** create
  `templates/design/recipes/shadcn-tailwind-external-kit/design-source/derive-semantic-seed.js`.
  Header comment states explicitly: **this script runs in the KIT file, not
  the project file** (`getLocalVariableCollectionsAsync` is local-file-only —
  the teamLibrary API visible from the project file exposes names/keys but
  not `valuesByMode`/alias targets, per the task's Finding 1; this is why
  derivation needs a separate `use_figma` call with the kit's `fileKey`).
  Procedure the script implements:
  1. Read local variable collections; find the two-mode collection
     (matching the spike's description: "shadcn's stock semantics as
     per-mode aliases to kit primitives" — name it by looking for a
     collection with exactly two modes named `Light`/`Dark` or `mode`,
     whichever the live kit exposes — **document this as a live-verified
     detail to confirm in the live-verification slice**, not asserted here
     as fact since this repo has no kit file to inspect directly).
  2. For each variable in that collection, EXCLUDE the four demo artifacts
     named exactly `background-color`, `semantic-background`,
     `semantic-border`, `semantic-foreground` (task's Finding 1, stated as
     established fact from the live spike).
  3. For each remaining variable, record `{ name, resolvedType,
     modes: { <modeName>: <targetPrimitiveVariableKey> } }` — the per-mode
     value is the KEY of the primitive variable it aliases (read via
     `variable.valuesByMode[modeId]`, which for an alias is
     `{ type: 'VARIABLE_ALIAS', id }` — resolve `id` to the target
     variable via `figma.variables.getVariableByIdAsync`, then read its
     `.key`, which is what `importVariableByKeyAsync` needs cross-file).
  4. The named float tokens (`radius-none`…`radius-full`, `stroke-width`,
     `border-width`) are the FLOAT-typed entries of the SAME two-mode
     collection — each mode aliases the same primitive in the kit's
     single-mode `tokens` collection (spike-confirmed). Bucket the dump by
     `resolvedType`: COLOR entries → `colors` (per-mode keys), FLOAT entries
     → `floats`, recorded as `{ name, resolvedType, key: <the single target
     primitive's key> }`. Do NOT dump the kit's `tokens` collection wholesale
     — it is an 89-variable generic number scale (`0`, `1`, `2`, … `9999`),
     not the named semantic floats.
  5. Attach the role-appropriate `scopes` array per variable, per the task's
     Finding 2 verbatim mapping: backgrounds→`['FRAME_FILL','SHAPE_FILL']`;
     foregrounds→`['TEXT_FILL','SHAPE_FILL']`; surfaces (primary/secondary/
     muted/accent/destructive)→`['FRAME_FILL','SHAPE_FILL','TEXT_FILL']`;
     border/ring→`['STROKE_COLOR']`; input→`['STROKE_COLOR','FRAME_FILL']`;
     chart→`['SHAPE_FILL','STROKE_COLOR']`; radius→`['CORNER_RADIUS']`;
     stroke/border-width→`['STROKE_FLOAT']`; spacing→`['GAP']`. Since a
     variable's *role* (background vs. foreground vs. surface, etc.) isn't
     mechanically derivable from the kit dump alone, the script authors a
     `{{ROLE_SCOPE_MAP}}`-style lookup table. **Match by suffix/exact name,
     not prefix** — the real kit names are suffixed (spike-confirmed list):
     exact `background`/`card`/`popover`/`sidebar` → backgrounds; suffix
     `-foreground` (or exact `foreground`) → foregrounds; exact `primary`/
     `secondary`/`muted`/`accent`/`destructive`/`sidebar-primary`/
     `sidebar-accent` → surfaces; exact `border`/`ring`/`sidebar-border`/
     `sidebar-ring` → border/ring; exact `input` → input; prefix `chart-` →
     chart; prefix `radius-` → radius; exact `stroke-width`/`border-width` →
     width. Confirm this table against the REAL variable name list in the
     live-verification slice; do not ship it unverified against real names.
  6. Write the resulting object to `semantic-seed.json`'s shape (§5 below).
- **Verify:** `bun run test` (no logic touched — docs/template-only sanity
  check; this script's actual correctness is provable only in the
  live-verification slice, same accepted gap as `tier0-audit.js`'s
  marshaling code).

### Slice 4 — `semantic-seed.json` placeholder shape (testable: false)
- **Files:** create
  `templates/design/recipes/shadcn-tailwind-external-kit/design-source/semantic-seed.json`
  with the documented SHAPE (not yet the real derived values — those land in
  the live-verification slice):
  ```json
  {
    "colors": [
      { "name": "background", "resolvedType": "COLOR", "scopes": ["FRAME_FILL", "SHAPE_FILL"], "modes": { "Light": "{{KIT_VARIABLE_KEY}}", "Dark": "{{KIT_VARIABLE_KEY}}" } }
    ],
    "floats": [
      { "name": "radius-md", "resolvedType": "FLOAT", "scopes": ["CORNER_RADIUS"], "key": "{{KIT_VARIABLE_KEY}}" }
    ]
  }
  ```
  A header comment (JSON doesn't support comments — put it in this file's
  entry in `templates-reference.md` instead, per Slice 6) states: "populated
  by running `derive-semantic-seed.js` against the published kit file; this
  checked-in copy is regenerated, not hand-edited — see the live-verification
  slice for the real derived content." Commit this placeholder now so
  `seed-semantic.js` (Slice 5) has something to import against during
  authoring; it is explicitly NOT the shipped default yet.
- **Verify:** `bun run test` (docs/template only).

### Slice 5 — `seed-semantic.js` (testable: false — Plugin API script, `use_figma`)
- **Files:** create
  `templates/design/recipes/shadcn-tailwind-external-kit/design-source/seed-semantic.js`.
  Header comment states this runs in the PROJECT file (companion to
  `derive-semantic-seed.js`, which runs in the kit file). Procedure:
  1. **Idempotent collection creation.** Read
     `figma.variables.getLocalVariableCollectionsAsync()`. If no collection
     named `Primitives` exists, create one (single mode) with the D24
     spacing scale: `0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 56,
     64, 80, 96, 128` (px), each as a `FLOAT` variable scoped
     `['GAP', 'WIDTH_HEIGHT']`, named `spacing/<value>` (e.g. `spacing/24`).
     If `Primitives` already exists, skip creating it — but still check for
     and create any individual scale-step variables that are missing by
     name (per-variable idempotency, not just per-collection — this is what
     "skip-if-present per collection" (task body) means at the finest
     grain: never assume an existing collection has every variable this
     script would otherwise add).
  2. **Idempotent Semantic collection + Dark mode.** If no collection named
     `Semantic` exists, create one with a `Light` mode (the collection's
     default mode, renamed) and add a `Dark` mode via
     `collection.addMode('Dark')`. If `Semantic` already exists with only
     one mode, add `Dark` if missing; if it already has 2+ modes, skip mode
     creation entirely (already seeded, per argo-v2's live reference file).
  3. **Import kit variables + create semantic vars + aliases.** Read
     `semantic-seed.json` (bundled at the splice point same convention as
     `tier0-recipe-checks.js`'s `./kit-patches.json` relative import,
     `:23`). For each entry in `colors`: if a variable of that `name`
     already exists in `Semantic`, skip it (per-variable idempotency); else
     create it (`resolvedType: 'COLOR'`, `scopes` from the seed), and for
     each mode (`Light`, `Dark`) call
     `figma.variables.importVariableByKeyAsync(seedEntry.modes[modeName])`
     then `variable.setValueForMode(modeId,
     figma.variables.createVariableAlias(importedVar))`. For each entry in
     `floats`: same skip-if-present check, create the variable
     (`resolvedType: 'FLOAT'`), import the single kit key once, and set the
     SAME alias for both `Light` and `Dark` modes (per the task's spike
     summary: "same alias both modes" for radius/stroke/border-width).
  4. **D24 starter layout tokens.** If `Semantic` doesn't already have a
     variable named `spacing/page-inline`, create it (`FLOAT`, scope
     `['GAP']`), aliasing the LOCAL `Primitives` collection's `spacing/24`
     variable (via `createVariableAlias`, no import needed — same file),
     same value both modes. Same for `spacing/section-gap` → local
     `Primitives` `spacing/32`. Skip either that already exists by name.
  5. Log a summary: collections created vs. already-present, variables
     created vs. skipped-as-present — so a re-run against an already-seeded
     file (like argo-v2's) reports "0 created, N skipped" rather than
     silently doing nothing with no feedback.
- **Verify:** `bun run test` (docs/template only — this script's actual
  correctness, including the idempotency guarantee, is provable only inside
  Figma's Plugin API sandbox; proven for real in the live-verification
  slice below, same accepted gap pattern as `tier0-audit.js`).

### Slice 6 — wire seeding into `setup-design` (testable: false)
- **Files:** modify `skills/setup-design/SKILL.md`. Insert a new numbered
  step **between the existing §4 (template copy/assembly) and §5 (path
  dependencies)** — call it **§4a, "Seed the Semantic layer"** — gated on:
  the chosen recipe (§0c) is `shadcn-tailwind-external-kit` (i.e.
  `baseSource == external-library`) AND `design/config.json`'s
  `figma.projectFileKey` and `recipeConfig.figma.kitLibraryFileKey` are both
  filled (not still `{{…}}` placeholders). If either is unfilled: skip with
  a printed note ("Semantic seeding needs both file keys configured — run
  `/argo:setup-design` again once they're set, or seed manually later").
  If gated in: load `figma:figma-use`, then run
  `design-source/seed-semantic.js` via `use_figma` against the project
  file, passing the (already-derived, committed)
  `design-source/semantic-seed.json` content. Report the created/skipped
  summary (Slice 5 point 5) verbatim to the user. Note explicitly: this step
  only ever CREATES/imports — it never deletes or renames an existing
  variable, so re-running `setup-design` on an already-seeded file (e.g.
  argo-v2's) is always safe.
  Also update `skills/setup-design/templates-reference.md` — add three rows
  to the "Recipe templates" table (`:19-34`), same column shape as the
  existing `tier0-recipe-checks.js` row (`:31`):
  - `design-source/derive-semantic-seed.js` — install when: reference only,
    run on-demand against the kit file to regenerate `semantic-seed.json`
    (not copied into the host project as a standing file — it's a
    plugin-repo maintenance script, same category as this recipe's own
    `README.md`).
  - `design-source/semantic-seed.json` — install when: `baseSource ==
    "external-library"`; substitute/scope: none — copied byte-for-byte, this
    is data, not a `{{…}}` template.
  - `design-source/seed-semantic.js` — install when: `baseSource ==
    "external-library"` AND both Figma file keys configured (mirrors the new
    §4a gate); substitute/scope: reads the co-installed
    `semantic-seed.json`, no `{{…}}` slots of its own.
- **Verify:** `bun run test` (docs only).

### Slice 7 — manifest/version bump (testable: false)
- **Files:** `.claude-plugin/plugin.json:3` (`0.9.0` → `0.10.0`) and its
  `description` field (mention Semantic seeding + the D24 spacing rule
  alongside the existing pack description); `.claude-plugin/marketplace.json:11`
  (matching bump, keeping the two in sync per existing practice — both
  confirmed `0.9.0` before this plan). Minor bump: this adds a new
  extension point and a new mechanism rule without breaking any existing
  installation (none exist yet, per the pack's own stated pre-1.0 policy).
- **Verify:** `bun run test`; grep the repo for other files hardcoding
  `0.9.0` before editing (`grep -rn "0\.9\.0"` outside `node_modules`).

### Slice 8 — live-file verification (testable: false; manual, on-device — mirrors design-pack-recipes.md's Slice 14)
**Checkpoint / final review here** — this is the slice that turns Slices 3-4
from documented-but-unproven scripts into a shipped, verified default.
- **What:**
  1. Run `derive-semantic-seed.js` (Slice 3) for real via `use_figma`
     against the kit copy `4lPUPl8OUan4i90Bc2ZMXe`. Confirm the two-mode
     collection is found by the name assumed in Slice 3's step 1 (fix the
     script if the real name differs — this is exactly the kind of detail
     flagged as "confirm live" in Slice 3). Confirm the four demo-artifact
     names match exactly. Confirm the role-scope pattern-matching table
     (Slice 3 point 5) against the REAL variable name list; adjust patterns
     if any real name doesn't match a rule. Commit the resulting REAL
     `semantic-seed.json` over Slice 4's placeholder — THIS is the shipped
     default the task asks for.
  2. Run `seed-semantic.js` (Slice 5) via `use_figma` against the argo-v2
     project file `CLEHEoqvJlRti3dCCfOytS` — which the pipeline plan states
     is **already seeded** by the original spike (45 Semantic vars, 19-step
     Primitives scale). Confirm the run reports "0 created, N skipped" for
     every collection/variable already present — this is the idempotency
     proof the task requires ("the script must not duplicate or clobber").
     If anything is reported as created against an already-seeded file,
     that's a bug in Slice 5's skip-if-present logic — fix before
     proceeding.
  3. Seed a scratch/throwaway project file (or a disposable frame in the
     same file, then delete it) to prove the CREATE path also works, not
     just the skip path — the spike only proved creation once, on a file
     that's now already seeded; this checkpoint proves re-running
     `setup-design`'s new §4a step is safe on both a fresh and an
     already-seeded file.
  4. Run the assembled tier-0 audit (Slice 2's D24 addition) against the
     argo-v2 project file: confirm it reports zero D24 violations on the
     already-seeded, on-scale layout (the `spacing/page-inline` /
     `spacing/section-gap` bindings and the 19-step Primitives scale).
     Then seed one deliberate off-scale violation (a frame with
     `itemSpacing: 7`, not a member of the scale and not bound) and confirm
     the audit reports exactly one `gap-padding-off-scale` violation; revert
     it.
- **Why here and not earlier:** every earlier slice's Plugin-API code is
  authored against a documented-but-unconfirmed shape (kit collection names,
  demo-artifact names, role-scope patterns) — this is the only slice that
  can confirm or correct those against the real file pair, same reasoning as
  `design-pack-recipes.md`'s Slice 14 ("if the D15 safety net is a no-op,
  every downstream phase inherits false confidence — cheaper to learn now").
- **Constraint:** this checkpoint needs a live, connected Figma MCP session
  — the plugin repo itself has no host project or Figma file to exercise
  against by default. If the build-plan session running this plan doesn't
  have Figma MCP connected, stop here and hand this slice to the user to run
  interactively (exactly the disposition the task specifies: "plan this as
  a checkpoint step the user can run, mirroring how Slice 14 was handled").
  Slices 1-7 do not depend on this slice's outcome to be individually
  correct and committed — only the "shipped real default" claim depends on
  it.
- **Verify:** the seeded-violation report itself (attach to this plan or a
  progress note); `bun run test` still green.

---

## 5. Build metadata summary (for `/argo:build-plan`)

| Slice | testable | requiresLaunch | seam |
|---|---|---|---|
| 1 | **true** (red-green) | false | |
| 2 | false | false | |
| 3 | false | false | |
| 4 | false | false | |
| 5 | false | false | |
| 6 | false | false | |
| 7 | false | false | |
| 8 | false | false (manual, on-device live-Figma verification) | **checkpoint / final review** |

No mid-plan checkpoint is declared beyond the natural halfway point (Slices
1-4 author the logic and data shape; Slices 5-7 wire it into the skill and
bump the manifest) — the one seam worth naming explicitly is Slice 8 itself,
since everything before it is individually buildable/testable/committable
but only Slice 8 turns the seed data from a documented shape into a proven
default.

---

## 6. Risks / accepted trade-offs

- **`semantic-seed.json` ships a placeholder until Slice 8.** If Slice 8
  can't run (no Figma MCP connection during the build), the plan lands with
  a documented-but-unverified seed shape — same residual risk profile as
  `tier0-audit.js`'s marshaling code before `design-pack-recipes.md`'s
  Slice 14 ran. Flagged, not hidden.
- **Role-scope inference (Slice 3 point 5) is a name-pattern heuristic**,
  not a mechanically-derived fact from the kit dump — it can only be
  confirmed against the real variable names in Slice 8. A future kit
  version with differently-named variables could need the pattern table
  updated; this is the same class of risk D15's paired-upgrade flow already
  exists to catch (a `design-upgrade` re-run would surface it via the
  congruence gate or a failed re-seed).
- **D24's rule assumes a fixed `'Primitives'` collection name** (Decision 2,
  §2) rather than a configurable one — consistent with today's convention
  (only `semanticCollectionName` is configurable) but a second
  `same-file`/`none` recipe with a differently-named Primitives-equivalent
  would need this hardcoding revisited; out of scope here (only one recipe
  exists, per D23's own anti-speculative-generality stance).
- **`itemSpacing`/padding-only scope** (Decision 3, §2) — counter-axis
  spacing (wrap) is not covered by this rule; if a future project uses wrap
  layouts, D24's text would need extending before this rule covers them.
