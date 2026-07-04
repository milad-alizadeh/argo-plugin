# Design Pack — Mechanism/Recipe Split (argo-plugin repo)

**Scope:** restructure the already-shipped Figma→Code design pack (v0.8.0,
built per `.claude/plans/design-pack.md`, all 17 slices done — see
`.claude/plans/design-pack-progress.md`) around the mechanism/recipe seam
specified by decision **D23** in
`/Users/milad/Developer/argo-v2/.claude/plans/figma-to-code-pipeline.md:67`.
Must land **before** `/argo:setup-design` is ever run in a host project —
zero installations exist, so this is a pure restructure, not a migration.

**Status:** ready to build after one architect-panel decision below (§2) is
confirmed, and one genuinely-ambiguous boundary (§3, item B2) is resolved or
accepted as flagged. **Amended 2026-07-04 per the D21/D23 council review**
(`F*` IDs; chair report in the argo-v2 session): F1 — waiver pin generalized
to `sourceVersion` + kit schemas become recipe exports (Slice 1a, NEW —
supersedes this plan's original "no package code changes" stance); F12 — the
tier-0 audit ships as ONE assembled file, not two separately-run scripts
(Slice 2/8 reworked); F10 — the Professional-gate rationale in Slice 7 §0b
corrected; plus a live-file audit verification slice (Slice 14, chair's
aggregate finding).

---

## 1. Current-state findings (grounded in the actual v0.8.0 tree)

Note on tooling: `Glob` returned empty results against this repo throughout
this investigation (a tool-environment quirk, not an empty repo) — every
path below was confirmed via `Grep`/`Read` instead, and every file cited was
opened directly.

- **`packages/figma-design-kit/`** (`package.json:1-26`) is already
  provider-neutral. `index.js:1-4` re-exports `comparator.js` (D20 color/px/
  HUG comparators + oklch↔sRGB, `comparator.js:1-133`), `conversion-table.js`
  (D20 Figma→CSS table, `conversion-table.js:1-33`), `schemas.js` (D1/D15/D4
  zod schemas, `schemas.js:1-41`), `waivers.js` (D15 waiver re-fail +
  `kitLockVersion` invalidation, `waivers.js:1-24`). None of these five files
  mention shadcn or Tailwind by name — but the council (F1) established the
  package is NOT recipe-clean: `WaiverSchema` requires `kitLockVersion`, and
  `KitLockSchema`/`KitPatchSchema` export from the mechanism entrypoint while
  D23 declares kit.lock recipe-owned and keeps waivers alive for `same-file`.
  The original "no code change" stance is superseded — see Slice 1a.
- **`templates/design/tier0-audit.js:1-156`** is the canonical tier-0 script
  (owned by `figma-audit`). It is **mixed**: eleven of its twelve checks are
  provider-neutral (unbound fill/stroke/radius/type `:33-52`, missing Auto
  Layout `:71-73`, detached instance `:76-79`, non-semantic name `:82-84`,
  D18 variant naming `:88-94`, D11 dark-copy presence/correctness `:98-107`,
  D20 implicit line-height `:110-112`, D1 node-scoped story URL `:115-120`).
  Exactly one check is recipe-specific: **`non-semantic-binding`**
  (`:56-68`) — it uses a `KIT_LIBRARY_FILE_KEY` constant (`:22`) to
  distinguish kit-sourced variables from project-local ones, which only
  makes sense for the `external-library` `baseSource`.
- **Finding (doc/code mismatch):** `skills/figma-audit/SKILL.md:24` claims
  the audit checks "edits to the kit copy not present in
  `design/kit-patches.json`" — but no such check exists in
  `tier0-audit.js`. There is also no "retired-file-key binding" check in the
  script, despite `skills/design-upgrade/SKILL.md:23-29` describing it as
  something `figma-audit` performs post-swap. D23 explicitly names both
  ("retired-file-key bindings, kit-patches conformance,
  library-source-of-binding") as checks that "become recipe-parameterized"
  — this refactor is the right place to actually implement the two missing
  ones as recipe-owned checks, not just relocate what exists.
- **`templates/design/spec-diff-walker/`** has two files.
  `spec-diff.walker.spec-diff.js:1-65` (tier 1) imports only
  `figma-design-kit` — provider-neutral, stays mechanism.
  `base-congruence.walker.spec-diff.js:1-78` (tier 1b, D14) is
  kit-specific throughout: it imports `../../design/kit-patches.json`
  (`:8`), reads "kit-copy spec"/`kitSpecsByComponent`, and its entire reason
  for existing (comparing the *kit copy's* dumped specs against vendored
  code) is meaningless for `same-file` (no separate kit copy) or `none`
  (tier 1b off, D23). This is recipe-owned, design-source half.
- **`templates/design/vrt-walker/`** (`vrt.walker.vrt.js:1-29`,
  `vitest.vrt.config.js:1-37`) — tier 3, pixel-diff via `composeStories` +
  `toMatchScreenshot`. No kit/shadcn/Tailwind references. Stays mechanism.
- **`templates/design/gate-wiring.md:1-53`** — D21 wiring instructions.
  Provider-neutral (tiers as test-command citizens vs the serialized tier-3
  script), but its tier-1b row (`:17`) states "same mechanism over
  base-component smoke stories" without noting that row doesn't apply when
  the installed recipe's `baseSource` is `same-file`-without-vendored-base
  or `none`. Needs a conditional note, not a move.
- **`templates/design/testing-rule-amendment.md:1-21`** — C17 scoped
  exception for generated fixtures. Provider-neutral (references
  `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}` placeholders only). Stays
  mechanism.
- **`templates/design/lint/design-lint.md:1-51`** — ships exactly one rule:
  "no direct Primitive-variable references in components," enforced via an
  ESLint `no-restricted-syntax` selector matching a `{{PRIMITIVE_TOKEN_PREFIX}}`
  CSS custom-property pattern (`:30-46`). This is **not** the same rule D23's
  own illustrative example names ("no raw hex is mechanism" — that rule
  already lives in the HOST project's own `design-system.md`, confirmed by
  this file's own text at `:8-9`: "this project's own design-system rule
  already forbids raw hex... stands unchanged"; "no arbitrary `[…]` values is
  Tailwind recipe" — **no such rule exists anywhere in this pack today**,
  confirmed by grep — it is a gap, not a file to relocate). See §3 boundary
  B1/B2 below — this file's actual content (Semantic/Primitive binding
  enforcement) sits closer to the boundary than D23's example implies.
- **`templates/design/config.example.json:1-18`** — flat shape: `figma.
  kitLibraryFileKey`/`figma.projectFileKey`, `semanticCollectionName`,
  `tokenFilePath`, `knownGoodTriad`, `vrtEnvironment`. No `recipe` field
  exists yet — this is the field D23 requires ("a `recipe` field in
  `design/config.json`").
- **No `kit.lock` example template exists anywhere** (confirmed: grep for
  `kit.lock`/`kit-patches` across `templates/` only hits
  `base-congruence.walker.spec-diff.js`'s import line) — only `KitLockSchema`
  in `schemas.js` describes its shape. `setup-design` creates `kit-patches.json`
  as `{}` (`skills/setup-design/SKILL.md:91-94`) but never scaffolds
  `kit.lock` itself (left for `figma-sync`'s first run, per the same lines) —
  consistent with existing design, no bug, just confirms there's no static
  template to move for `kit.lock`.
- **Skills with hardcoded recipe knowledge, unconditionally narrated:**
  - `skills/figma-sync/SKILL.md` — step 7 (`:39-41`) IS the Tailwind
    token-writer ("regenerate the generated `@theme` region... in the
    project's `tokenFilePath`") with no branch for a different code-target;
    steps 2-4 (tokens/specs/screenshots dump) are baseSource-blind
    (mentions "used base components" at `:25` unconditionally, which is
    meaningless for `baseSource: none`).
  - `skills/design-upgrade/SKILL.md` — the **entire skill** (all seven
    procedure steps, `:12-47`) is the `external-library` paired upgrade
    (shadcn merge + kit re-import + Library Swap + retired-file-key audit).
    D23 explicitly names this skill's paired-upgrade flow as
    `external-library`-only and requires stating "what it means, if
    anything, for same-file."
  - `skills/figma-create/SKILL.md:15-16` — "Compose from the shadcn kit's
    base component instances" is hardcoded; D23 doesn't name this skill
    explicitly, but its own principle (mechanism skill *flows* must not
    embed recipe knowledge) applies equally here — flagged as a scope
    extension in §3 B3, not silently done.
  - `skills/figma-audit/SKILL.md` and `skills/figma-to-code/SKILL.md` need
    smaller amendments (audit: load the recipe's check module too;
    to-code: note tier-1b's conditional applicability) — neither hardcodes
    kit mechanics as heavily as the two above.
  - `skills/setup-design/SKILL.md` has **no Figma-usage gate and no
    Professional-plan gate at all today** (confirmed by reading the full
    file: §1 "Detect the stack" jumps straight to shadcn/Storybook
    detection) and **no recipe-selection step** — both are new
    requirements from D23.
- **Manifest state:** `.claude-plugin/plugin.json:3` and
  `.claude-plugin/marketplace.json:11` are both `0.8.0` today (confirmed by
  reading both files) — this refactor is a version bump candidate (§7).
- **Test suite (confirmed green baseline):** `test/figmaComparator.test.mjs`,
  `test/figmaConversionTable.test.mjs`, `test/figmaSchemas.test.mjs`,
  `test/figmaWaivers.test.mjs`, `test/figmaDesignKitIndex.test.mjs` — all
  import `packages/figma-design-kit/*` directly by relative path (e.g.
  `figmaComparator.test.mjs:2`), run via root `vitest.config.ts:9-13`'s
  default Vitest discovery (no `include` narrowing in `package.json:8-16`).
  Since this plan makes **no code changes** inside `packages/figma-design-kit/`
  (see §2 recommendation), none of these five files need edits — `bun run
  test` must simply stay green throughout.

---

## 2. Architect panel — how deep to push the tier-0 audit split

This is the one architecturally load-bearing call in this plan: given that
D23 requires splitting `tier0-audit.js`'s one recipe-specific check out, and
this repo's own prior plan (`design-pack.md` §1) already used exactly this
kind of "pure logic → tested package, host-specific text → template" split
for the comparator, should the SAME split now happen one level down, inside
tier-0's rule logic?

| | **A — minimal-change** | **B — clean-architecture** | **C — pragmatic (recommended)** |
|---|---|---|---|
| What | Cut-paste the one existing kit check + the two newly-implemented kit checks (retired-file-key, kit-patches conformance) into a new recipe-owned script file. `tier0-audit.js` stays exactly the Plugin-API-sandbox-only script shape it is today (still zero automated test coverage — an accepted, pre-existing, unchanged gap). | Extract EVERY tier-0 rule (mechanism's eleven + the recipe's three) into pure predicate functions operating on plain-object node/variable shapes (not live `figma.*` calls): mechanism rules into a new `packages/figma-design-kit/tier0-rules.js` (unit-tested); recipe rules into a new sibling package `packages/figma-design-kit-shadcn-tailwind/` (unit-tested). `tier0-audit.js` and the recipe's check file become thin Plugin-API walkers that call these pure functions. | Same physical split as A (recipe checks relocate + get implemented), but scoped explicitly as "close the D23 letter, not open a new testability project." |
| Pro | Smallest diff; matches D23's own anti-speculative-generality instinct (no new package for a single recipe) | Closes the original `design-pack.md` risk #1 ("tier-0 audit has zero automated coverage") as a byproduct; the correctness-critical rule logic gets tested the same way the comparator already is | Ships exactly what D23 asked for; defers the testability investment to a future plan once a second recipe exists to prove the pure-function boundary is worth it — same reasoning D23 itself gives for not building a plugin-API abstraction for "hypothetical recipe #2" |
| Con | Tier-0 rule logic (including the two brand-new checks) stays untestable outside live Figma — a real, if pre-existing, gap | A whole new package for logic that only ever runs for one recipe today is exactly the kind of speculative generality D23 tells recipes themselves to avoid — the risk here is doing to tier-0 rules what D23 explicitly forbade doing to recipes | None significant — this is A's diff, with the reasoning made explicit so it isn't mistaken for an oversight |

**Decision (2026-07-04, confirmed before build): B.** The deeper testability
investment is worth it now — the tier-0 rule logic is correctness-critical
and closing its zero-coverage gap outweighs the speculative-generality
concern, especially since the recipe package only needs to exist alongside
the mechanism package (no new abstraction layer, just a second pure-function
module). Slice 2 below is a two-package extraction with new `test/*.test.mjs`
files, and Slice 2a adds a same-file enforcement check for the "mechanism
never imports recipe knowledge" guarantee (see Open Question 1).

---

## 3. Boundaries flagged as genuinely ambiguous (not silently decided)

- **B1 — `lint/design-lint.md`'s actual rule vs. D23's illustrative example.**
  D23 says "no raw hex is mechanism; no arbitrary `[…]` values is Tailwind
  recipe" as an example of the mechanism/code-target split. But the ONE rule
  this pack currently ships (`lint/design-lint.md`) is neither of those — it's
  "components may only bind Semantic, never Primitive, directly"
  (`lint/design-lint.md:12-19`). The underlying two-tier Primitives/Semantic
  concept (D10) is provider-neutral design architecture; but the rule's
  *enforcement mechanism* — an ESLint selector matching a `--primitive-*`
  CSS-custom-property naming convention (`lint/design-lint.md:33-45`) — is
  Tailwind/CSS-custom-property specific (a Tamagui or MUI code-target would
  need a differently-shaped rule to express the same concept). **This plan's
  default:** move the file under the recipe's `code-target/` half (Slice 3),
  since the concrete rule text is CSS-custom-property-syntax-bound — but this
  is a call, not a fact; if you'd rather keep a *mechanism-level convention
  doc* ("components must not bind Primitives directly") with only the
  ESLint-snippet portion under the recipe, say so before Slice 3.
- **B2 — should the D23-named Tailwind-only rule (`no-arbitrary-[…]-values`)
  be authored now?** It doesn't exist in the pack today (confirmed by grep).
  D23 names it as an example of what a code-target owns; nothing requires
  building it as part of this restructure. **Decision (2026-07-04, confirmed
  before build): yes** — author it now, in the same slice as the move
  (Slice 3), since D23 uses it as the canonical example of "target-specific
  lint rules" and leaving it unauthored while writing a plan that discusses
  it by name would be inconsistent.
- **B3 — extending the branching requirement to `figma-create`.** D23
  explicitly names only `figma-sync`/`design-upgrade` as needing to branch
  on `baseSource`. `skills/figma-create/SKILL.md:15-16` hardcodes "the
  shadcn kit's base component instances" just as unconditionally. **This
  plan's default:** branch it too (Slice 10), for consistency with the
  mechanism principle D23 states generally ("skill *flows*" must not embed
  recipe knowledge) — flagged as a scope decision I'm making, not something
  D23 said in so many words.

If you disagree with any of B1-B3's default, stop before the slice named
above; nothing before it depends on the answer.

---

## 4. Complete disposition table

| File (v0.8.0 path) | Disposition | Notes |
|---|---|---|
| `packages/figma-design-kit/package.json` | **stays** (mechanism) | unchanged |
| `packages/figma-design-kit/index.js` | **stays** (mechanism) | unchanged |
| `packages/figma-design-kit/comparator.js` | **stays** (mechanism) | unchanged |
| `packages/figma-design-kit/conversion-table.js` | **stays** (mechanism) | unchanged |
| `packages/figma-design-kit/schemas.js` | **modified** (F1) | `WaiverSchema.kitLockVersion` → generic `sourceVersion`; `KitLockSchema`/`KitPatchSchema` move out of the mechanism entrypoint into a recipe subpath export (Slice 1a) |
| `packages/figma-design-kit/waivers.js` | **modified** (F1) | `invalidateWaivers` keys on `sourceVersion`; the caller supplies the current recipe source version (external-kit recipe passes the kit.lock version) |
| `templates/design/tier0-audit.js` | **modified** (F12, per B) | becomes a thin Plugin-API walker: remove `non-semantic-binding` check + `KIT_LIBRARY_FILE_KEY` constant; marshals live objects and calls `packages/figma-design-kit/tier0-rules.js`'s pure functions; gains a marked recipe-checks injection region. `setup-design` assembles ONE installed script (mechanism base + active recipe's checks spliced into the region) — the host project runs a single canonical file, preserving X3 |
| `packages/figma-design-kit/tier0-rules.js` | **new** (per B) | eleven mechanism tier-0 rules as pure, unit-tested predicate functions; exported from the mechanism entrypoint |
| `packages/figma-design-kit-shadcn-tailwind/` | **new package** (per B) | sibling package: three recipe tier-0 rules (`non-semantic-binding`, `retired-file-key-binding`, `kit-patches-conformance`) as pure, unit-tested predicate functions |
| `templates/design/gate-wiring.md` | **modified** | tier-1b row gets a `baseSource`-conditional note |
| `templates/design/testing-rule-amendment.md` | **stays** (mechanism) | unchanged |
| `templates/design/lint/design-lint.md` | **moved** → `templates/design/recipes/shadcn-tailwind-external-kit/code-target/lint/design-lint.md` | see B1 |
| `templates/design/config.example.json` | **modified** | add `"recipe"` field; nest `kitLibraryFileKey` under a new `recipeConfig` block |
| `templates/design/vrt-walker/*` | **stays** (mechanism) | unchanged |
| `templates/design/spec-diff-walker/spec-diff.walker.spec-diff.js` | **stays** (mechanism) | unchanged |
| `templates/design/spec-diff-walker/base-congruence.walker.spec-diff.js` | **moved** → `templates/design/recipes/shadcn-tailwind-external-kit/design-source/base-congruence.walker.spec-diff.js` | tier 1b is `external-library`-only per D23 |
| *(new)* | `templates/design/recipes/shadcn-tailwind-external-kit/design-source/tier0-recipe-checks.js` | thin Plugin-API walker calling `packages/figma-design-kit-shadcn-tailwind`'s three pure functions (non-semantic-binding relocated; retired-file-key + kit-patches-conformance newly implemented, closing the doc/code gap in §1) |
| *(new)* | `templates/design/recipes/shadcn-tailwind-external-kit/design-source/kit-patches.example.json` | `{}` — relocates the placeholder `setup-design` used to create unconditionally |
| *(new)* | `templates/design/recipes/shadcn-tailwind-external-kit/design-source/kit.lock.example.json` | fills the previously-nonexistent template, shaped per `KitLockSchema` |
| *(new)* | `templates/design/recipes/shadcn-tailwind-external-kit/code-target/token-writer.md` | extracted from `figma-sync/SKILL.md` step 7's inline prose |
| *(new)* | `templates/design/recipes/shadcn-tailwind-external-kit/README.md` | recipe manifest: `baseSource: external-library`, `codeTarget: tailwind` |
| `skills/setup-design/SKILL.md` | **modified** | Figma-usage gate + Professional-plan gate + recipe selection, ahead of the existing install flow |
| `skills/setup-design/templates-reference.md` | **modified** | new recipe paths, `recipe` config field row |
| `skills/figma-audit/SKILL.md` | **modified** | loads mechanism `tier0-audit.js` + the installed recipe's check module, merges violations |
| `skills/figma-sync/SKILL.md` | **modified** | branches on `baseSource` for kit-lock/kit-patches steps; token-writer step delegates to the recipe's `token-writer.md` |
| `skills/figma-create/SKILL.md` | **modified** | branches on `baseSource` for base-instance composition (B3) |
| `skills/figma-to-code/SKILL.md` | **modified (minor)** | notes tier-1b's conditional applicability |
| `skills/design-upgrade/SKILL.md` | **modified** | guard clause: only applies to `external-library`; states `same-file`/`none` semantics |
| `.claude-plugin/plugin.json` | **modified** | version bump, description update |
| `.claude-plugin/marketplace.json` | **modified** | version bump (kept in sync, per existing practice) |
| `README.md` | **modified** | one-paragraph mention of the mechanism/recipe split |
| `test/figmaSchemas.test.mjs`, `test/figmaWaivers.test.mjs`, `test/figmaDesignKitIndex.test.mjs` | **modified** (F1, red-green) | assert `sourceVersion` field, the recipe subpath export, and that the mechanism entrypoint no longer exports kit schemas |
| `test/figmaComparator.test.mjs`, `test/figmaConversionTable.test.mjs` | **unchanged** | comparator/conversion logic untouched |

---

## 5. Work items (dependency order, sized as buildable slices)

All slices `requiresLaunch: false` (plugin repo, no Argo runtime here, same
reasoning as `design-pack.md`'s slices). Verify command for every slice
unless stated otherwise: `bun run test` (root `vitest.config.ts`, must stay
green). Slices 1a, 2, and 2a touch `packages/figma-design-kit*` and are
red-green testable (per F1 and the B decision); every other slice is a
docs/template change where `bun run test` is a no-regression check, not new
coverage.

### Slice 0 — recipe directory scaffold + config shape (testable: false)
- **Files:** create `templates/design/recipes/shadcn-tailwind-external-kit/design-source/`
  and `.../code-target/` (empty dirs via a placeholder `.gitkeep` or the
  first real file from Slice 1); modify `templates/design/config.example.json`
  to:
  ```json
  {
    "recipe": "{{RECIPE_NAME}}",
    "semanticCollectionName": "{{SEMANTIC_COLLECTION_NAME}}",
    "tokenFilePath": "{{TOKEN_FILE_PATH}}",
    "knownGoodTriad": { "storybook": "{{VERSION}}", "vitestAddon": "{{VERSION}}", "vitest": "{{VERSION}}" },
    "vrtEnvironment": { "browser": "{{PINNED_CHROMIUM_BUILD}}", "viewport": "{{W}}x{{H}}", "dpr": 1 },
    "figma": { "projectFileKey": "{{PROJECT_FILE_KEY}}" },
    "recipeConfig": { "figma": { "kitLibraryFileKey": "{{KIT_FILE_KEY}}" } }
  }
  ```
  (`projectFileKey` stays mechanism-level — any Figma-using recipe needs to
  know which file is the project file; `kitLibraryFileKey` moves under
  `recipeConfig` since it's `external-library`-only.)
- **Verify:** `bun run test` (no logic touched — sanity check only).

### Slice 1 — move base-congruence walker + author kit.lock/kit-patches examples (testable: false)
- **Files:** move `templates/design/spec-diff-walker/base-congruence.walker.spec-diff.js`
  → `templates/design/recipes/shadcn-tailwind-external-kit/design-source/base-congruence.walker.spec-diff.js`
  (its `../../design/kit-patches.json` import path is unaffected — still two
  levels up from wherever `setup-design` installs it into a host project,
  since the recipe subdir doesn't change the install-time destination
  depth); add `.../design-source/kit-patches.example.json` (`{}`); add
  `.../design-source/kit.lock.example.json` shaped per `KitLockSchema`
  (`packages/figma-design-kit/schemas.js:24-31`): `{ "kitVersion": "{{KIT_VERSION}}", "importDate": "{{DATE}}", "libraryFileKey": "{{KIT_FILE_KEY}}", "fileVersion": "{{FILE_VERSION}}", "lastModified": "{{ISO_TIMESTAMP}}", "syncTimestamp": "{{ISO_TIMESTAMP}}" }`.
- **Verify:** `bun run test`.

### Slice 1a — waiver `sourceVersion` generalization + kit-schema export split (testable: true — F1)
- **Files:** `test/figmaSchemas.test.mjs` + `test/figmaWaivers.test.mjs` +
  `test/figmaDesignKitIndex.test.mjs` (red first), then
  `packages/figma-design-kit/schemas.js`, `waivers.js`, `index.js`,
  `package.json` (green).
- **Behavior:** `WaiverSchema`'s pin field renamed `kitLockVersion` →
  **`sourceVersion`** (generic design-source pin; the external-kit recipe maps
  it to the kit.lock version — D15/D23 as amended). `invalidateWaivers(waivers,
  currentSourceVersion)` keys on it. `KitLockSchema`/`KitPatchSchema` move out
  of the mechanism entrypoint into a **subpath export** (e.g.
  `figma-design-kit/recipes/external-kit` via the `exports` map) — physically
  co-located (no new package, §2's discipline), but no longer part of the
  mechanism's public surface; `index.js` stops re-exporting them.
- **Verify:** `bun run test` (red-green on the three test files, full suite
  green before commit).

### Slice 2 — extract tier-0 rules into pure, unit-tested predicate functions; split mechanism vs. recipe (testable: true — per B, execution model per F12)
- **Files (red first):** `test/figmaTier0Rules.test.mjs` (new) — one test
  per mechanism rule (unbound fill/stroke/radius/type, missing Auto Layout,
  detached instance, non-semantic name, D18 variant naming, D11 dark-copy
  presence/correctness, D20 implicit line-height, D1 node-scoped story URL —
  eleven rules total), each asserting pass/fail against a plain-object
  node/variable fixture (no live `figma.*` calls); `test/figmaDesignKitShadcnTailwindTier0Rules.test.mjs`
  (new) — one test per recipe rule (`non-semantic-binding`,
  `retired-file-key-binding`, `kit-patches-conformance`), same plain-object
  fixture style.
- **Files (green):** `packages/figma-design-kit/tier0-rules.js` (new) — the
  eleven mechanism rules as pure predicate functions
  `(nodeOrVariable) => Violation | null`, extracted verbatim from
  `templates/design/tier0-audit.js`'s live-Figma-API logic, translated to
  operate on plain-object shapes; exported from `packages/figma-design-kit/index.js`
  and `package.json`'s `exports` map alongside the existing mechanism
  surface. `packages/figma-design-kit-shadcn-tailwind/` (new sibling
  package — `package.json`, `index.js`, `tier0-rules.js`) containing the
  three recipe rules as the same kind of pure predicate functions: the
  relocated `non-semantic-binding` check (verbatim logic, now pure); a new
  `retired-file-key-binding` check (flags a bound variable whose
  `variable.key` resolves to a library file key present in a
  `retiredLibraryFileKeys` list, not the current `kitLibraryFileKey` — the
  check `design-upgrade/SKILL.md:23-29` already narrates as happening but
  that doesn't exist in code); a new `kit-patches-conformance` check (flags
  a modified node inside the kit copy whose `nodeId`/component name isn't
  present in `design/kit-patches.json`, per D13/D15's "audit blocks edits to
  the kit copy — except patches recorded in kit-patches.json"). Modify
  `templates/design/tier0-audit.js` to become a thin Plugin-API walker:
  delete `:22`'s `KIT_LIBRARY_FILE_KEY` constant and the inline
  `non-semantic-binding` block (`:56-68`), marshal live `figma.*` node/
  variable objects into the plain-object shapes the pure functions expect,
  call `packages/figma-design-kit/tier0-rules.js`'s eleven functions, and
  add a **marked recipe-checks injection region** where `setup-design`
  splices in a call to the active recipe's walker at install time (per
  X3/F12 — the host project always runs ONE assembled canonical script,
  never two separately-executed scripts). Create
  `templates/design/recipes/shadcn-tailwind-external-kit/design-source/tier0-recipe-checks.js`
  as the thin walker counterpart: marshals live objects, calls
  `packages/figma-design-kit-shadcn-tailwind`'s three functions.
- **Verify:** `bun run test` (red-green on the two new test files; full
  suite green before commit). The walker-marshaling code in
  `tier0-audit.js`/`tier0-recipe-checks.js` itself stays untestable outside
  Figma's Plugin API sandbox (same accepted gap as the original plan's risk
  #1) — but the rule logic it delegates to is now fully covered, closing
  that gap for the first time.

### Slice 2a — enforce "mechanism never imports recipe knowledge" (testable: true)
- **Why:** choosing B (Slice 2) means `packages/figma-design-kit` now sits
  beside a real sibling recipe package for the first time — the guarantee
  that the mechanism package never imports recipe knowledge is no longer
  hypothetical and is cheap to check mechanically rather than left as a
  convention (Open Question 1).
- **Files (red first):** `test/figmaDesignKitNoRecipeImports.test.mjs` (new)
  — greps `packages/figma-design-kit/**/*.js` source text for any reference
  to `figma-design-kit-shadcn-tailwind` or a relative path escaping into
  `templates/design/recipes/`; asserts zero matches. Red against a
  deliberately seeded violation line, then removed; green against the real
  package tree.
- **Files (green):** none expected — this slice should pass against Slice
  2's actual output with no source changes; if it doesn't, fix the leak in
  `packages/figma-design-kit/tier0-rules.js` before proceeding.
- **Verify:** `bun run test` (red-green on the new guard test; full suite
  green before commit).

### Slice 3 — move + author the lint rule (testable: false) — resolves B1/B2 per this plan's stated defaults
- **Files:** move `templates/design/lint/design-lint.md` →
  `templates/design/recipes/shadcn-tailwind-external-kit/code-target/lint/design-lint.md`
  (content unchanged — still the Semantic/Primitive-only rule); add a new
  rule section to that same file: "No arbitrary `[…]` Tailwind values in
  components" — an ESLint snippet forbidding `className`/`class` string
  literals matching `/\[[^\]]+\]/` inside the `{{COMPONENTS_GLOB}}` scope,
  with the rationale that arbitrary values bypass the token system the same
  way a raw hex would, but are syntactically Tailwind-specific so they can't
  live in the host's generic design-system rule.
- **Verify:** `bun run test` (docs/template only).

### Slice 4 — extract the Tailwind token-writer doc (testable: false)
- **Files:** create
  `templates/design/recipes/shadcn-tailwind-external-kit/code-target/token-writer.md`
  containing the token-writer spec currently embedded as inline prose in
  `skills/figma-sync/SKILL.md:39-41` ("regenerate the generated `@theme`
  region... from the freshly dumped `tokens.json`... the ONE writer for that
  region"), generalized into a standalone doc with its own `{{TOKEN_FILE_PATH}}`
  slot so a future non-Tailwind code-target could ship a sibling doc without
  touching `figma-sync/SKILL.md`'s flow text (Slice 9 wires the skill to
  reference this doc instead of narrating it inline).
- **Verify:** `bun run test` (docs/template only).

### Slice 5 — gate-wiring.md conditional note (testable: false)
- **Files:** modify `templates/design/gate-wiring.md` — tier-1b's table row
  (`:17`) gains a parenthetical: "(only applies when the installed recipe's
  `baseSource` is `external-library`, or `same-file` with vendored base code
  present; off entirely for `baseSource: none`, per D23)".
- **Verify:** `bun run test` (docs only).

### Slice 6 — setup-design/templates-reference.md update (testable: false)
- **Files:** modify `skills/setup-design/templates-reference.md` — update
  every row whose template moved (Slices 1/3) to its new
  `recipes/shadcn-tailwind-external-kit/...` path; add a `recipe` row to the
  `config.example.json` entry describing which recipe name populates it;
  note that `kit-patches.example.json`/`kit.lock.example.json` are now
  install-when: `recipe.baseSource == "external-library"`, not "always."
- **Verify:** `bun run test` (docs only).

### Slice 7 — rewrite `setup-design/SKILL.md`: gating + recipe selection (testable: false)
**Checkpoint review here** — everything downstream (Slices 8-12) consumes
this skill's new gate/recipe-selection contract; nothing before it does.
- **Files:** modify `skills/setup-design/SKILL.md`. Insert, before the
  existing §1 "Detect the stack":
  - **§0a — "Are you using Figma?"** AskUserQuestion, single question. If
    no: stop, explain in one paragraph that this pack is a Figma-to-code
    pipeline and doesn't apply without Figma — never force Figma onto a
    project that doesn't use it (explicit product requirement from this
    task's scope).
  - **§0b — "Professional plan or higher?"** AskUserQuestion, with the
    corrected rationale (F10): below Professional, variable collections are
    capped at **one mode**, which blocks the Light+Dark Semantic collection
    (D10) — so the gate applies to **every** recipe, not just
    external-library; external-library additionally needs library publishing.
    (Do NOT cite the Variables REST API — the pipeline explicitly rejected it
    as Enterprise-gated; nothing in the pack depends on it.) If no: stop with
    the same clear-explanation pattern as §0a — hard prerequisite, checked
    early per D23.
  - **§0c — recipe selection.** AskUserQuestion, one option today:
    `shadcn-tailwind-external-kit` (labeled as the recommended/only choice,
    matching this skill's existing "recommended option first and labeled"
    convention, `SKILL.md:15`). Store the choice into `design/config.json`'s
    new `recipe` field. Document the **named extension points** (F3) the
    recipe supplies and skills dispatch to: recipe audit checks (Slice 2's
    injection region), recipe sync steps, Semantic seeding, token writer
    (Slice 4), upgrade flow — each resolving to files installed from
    `templates/design/recipes/<name>/`.
  - Existing §§1-9 (now renumbered §§1-9 after the new §§0a-0c) proceed
    unchanged EXCEPT: §7 "Create `design/` scaffolding" becomes conditional
    — only create `kit-patches.json`/`kit.lock` placeholders (now copied
    from the recipe's `design-source/` templates, Slice 1) when the chosen
    recipe's `baseSource` is `external-library`.
- **Verify:** `bun run test` (docs only) — then spawn `argo:reviewer` on the
  Slice 0-7 diff before continuing (this plan's stated checkpoint).

### Slice 8 — `figma-audit/SKILL.md` update (testable: false; per F12)
- **Files:** modify `skills/figma-audit/SKILL.md` — the skill runs the
  host's **single assembled** `tier0-audit.js` (mechanism base + recipe
  checks spliced in by `setup-design`, Slice 2) — one script, one
  severity-grouped report. When running from the plugin's own templates
  (pre-install), it assembles the same way ad hoc. Never two
  separately-executed audit scripts.
- **Verify:** `bun run test` (docs only).

### Slice 9 — `figma-sync/SKILL.md` update (testable: false)
- **Files:** modify `skills/figma-sync/SKILL.md` — step 7 (`:39-41`)
  replaced with "follow the installed recipe's code-target token-writer doc
  (`design-source`/`code-target` per `design/config.json`'s `recipe` field)
  — today that's `token-writer.md` (Slice 4)"; steps 2-4 gain one sentence
  each noting they're skipped/no-op when the relevant artifact doesn't apply
  to the installed recipe's `baseSource` (e.g. step 3's "used base
  components" spec dump is a no-op under `baseSource: none`).
- **Verify:** `bun run test` (docs only).

### Slice 10 — `figma-create/SKILL.md` update (testable: false, per B3)
- **Files:** modify `skills/figma-create/SKILL.md:15-16` — "Compose from the
  shadcn kit's base component instances" becomes conditional on the
  installed recipe's `baseSource`: `external-library`/`same-file` (with
  vendored base) compose from base instances as today; `none` composes from
  scratch with Semantic bindings only (no base instances to reference).
- **Verify:** `bun run test` (docs only).

### Slice 11 — `figma-to-code/SKILL.md` minor update (testable: false)
- **Files:** modify `skills/figma-to-code/SKILL.md` step 3 — add a
  parenthetical that tier 1b only runs when the installed recipe's
  `baseSource` makes it applicable (mirrors Slice 5's gate-wiring note).
- **Verify:** `bun run test` (docs only).

### Slice 12 — `design-upgrade/SKILL.md` update (testable: false)
- **Files:** modify `skills/design-upgrade/SKILL.md` — an interim
  applicability paragraph was already added (2026-07-04, council routing);
  this slice completes it: a guard clause before step 1 that reads
  `design/config.json`'s `recipe`; if its `baseSource`
  isn't `external-library`, stop and state the alternative explicitly per
  D23's own requirement ("state what it means, if anything, for
  same-file") — for `same-file`: "this is just a normal shadcn upgrade
  (`shadcn diff` + manual merge) plus editing the local Figma components
  directly; there is no separate kit file, no Library Swap, and no
  retired-file-key check to run" ; for `none`: "no design kit exists to
  upgrade under this recipe — this skill doesn't apply."
- **Verify:** `bun run test` (docs only).

### Slice 13 — manifest/doc sync (testable: false)
- **Files:** `.claude-plugin/plugin.json:3` (version `0.8.0` → `0.9.0`) and
  its `description` field (mention the mechanism/recipe split alongside the
  existing pack description); `.claude-plugin/marketplace.json:11` (matching
  version bump, keeping the two in sync per existing practice — confirmed
  both were `0.8.0` together before this plan); `README.md` (one short
  paragraph under "What ships active" noting the pack is now
  mechanism+recipe shaped, one recipe implemented).
- **Version rationale:** the pack is pre-1.0 (`0.8.0`); this is a breaking
  restructure of its internal shape but zero host installations exist to
  break (task constraint) — a **minor** bump (`0.9.0`) follows the same
  precedent as the original pack's own `0.7.10` → `0.8.0` minor bump for a
  new-shape addition (`design-pack-progress.md`'s final entry,
  `.claude-plugin/plugin.json` diff). If you consider this a `1.0.0`-forcing
  breaking change regardless of installation count, say so before this
  slice — it only changes two version strings.
- **Verify:** `bun run test` (docs/manifest only); grep the repo for any
  other file hardcoding "0.8.0" before editing (`grep -rn "0\.8\.0"` outside
  `node_modules`).

### Slice 14 — live-file audit verification (testable: false; manual, on-device — chair's aggregate finding)
- **What:** assemble the tier-0 script exactly as `setup-design` would
  (mechanism base + recipe checks) and run it via `use_figma` against the
  REAL Argo Figma files (project `CLEHEoqvJlRti3dCCfOytS`, kit copy
  `4lPUPl8OUan4i90Bc2ZMXe`). Two refuted-but-converging council findings
  suspect `isKitSourced`/`isSemantic` (v0.8.0 `tier0-audit.js:63-66`) are
  vacuous against the live Plugin API (`variable.key` prefix-matching may
  never match; the Semantic derivation may always pass). Prove each check
  can BOTH pass and fail: seed one deliberate violation per check (a raw-hex
  fill, a Primitive-bound component, a kit-copy edit not in kit-patches),
  confirm the script reports exactly those, then revert.
- **Why here and not Phase B:** if the D15 safety net is a no-op, every
  downstream phase inherits false confidence — cheaper to learn now, in the
  repo that owns the script.
- **Verify:** the seeded-violation report itself (attach to the progress
  doc); `bun run test` still green.

---

## 6. Test strategy

- **`packages/figma-design-kit`** — two code slices: 1a (per F1, red-green on
  `figmaSchemas`/`figmaWaivers`/`figmaDesignKitIndex` — `sourceVersion` rename,
  subpath export split) and 2 (per B, red-green on the new
  `tier0-rules.js` pure functions via `figmaTier0Rules.test.mjs`).
  Comparator/conversion-table files are untouched; the full suite must stay
  green after every slice. Run `bun run test` after every slice.
- **`packages/figma-design-kit-shadcn-tailwind`** (new, per B) — red-green
  on its three recipe pure functions via
  `figmaDesignKitShadcnTailwindTier0Rules.test.mjs` (Slice 2); guarded by
  Slice 2a's import-boundary test.
- **`templates/design/*` and `templates/design/recipes/*`** — no automated
  tests, matching the existing, unchallenged precedent from
  `design-pack.md` §5 ("templates are validated only once instantiated in a
  host project"). This now covers only the thin Plugin-API walker/marshaling
  code in `tier0-audit.js`/`tier0-recipe-checks.js` — the rule logic itself
  moved to the two unit-tested packages above (Slice 2, per B). The
  walker/marshaling layer's correctness is still provable only inside
  Figma's Plugin API sandbox, same accepted residual gap as the original
  plan's risk #1, now narrowed rather than fully closed.
- **Skills** — no eval harness exists for multi-step skill behavior (same
  precedent as `design-pack.md` §5); verified by manual dry-run during
  authoring, for real at the first live `argo-v2` install of the
  restructured pack.
- **Full-suite verify command for every slice:** `bun run test` (root,
  `package.json:8`) — identical to the original plan's verify command; no
  new lint/typecheck step is introduced by this plan.

---

## 7. Summary of build metadata (for `/argo:build-plan`)

| Slice | testable | requiresLaunch | seam |
|---|---|---|---|
| 0 | false | false | |
| 1 | false | false | |
| 1a | **true** | false | F1: red-green on schemas/waivers |
| 2 | **true** | false | per B: red-green, two-package pure-function extraction |
| 2a | **true** | false | per B: import-boundary enforcement guard |
| 3 | false | false | |
| 4 | false | false | |
| 5 | false | false | |
| 6 | false | false | |
| 7 | false | false | **checkpoint review here** |
| 8 | false | false | |
| 9 | false | false | |
| 10 | false | false | |
| 11 | false | false | |
| 12 | false | false | |
| 13 | false | false | |
| 14 | false | false (manual, on-device live-Figma verification) | final review before landing |

---

## 8. Open questions / risks carried into this plan

1. **§2's panel (A/B/C)** — **decided: B** (confirmed 2026-07-04, before
   build). Slice 2 is a two-package pure-function extraction with new
   `test/*.test.mjs` files; Slice 2a adds the import-boundary enforcement
   test for `packages/figma-design-kit`'s "never imports recipe knowledge"
   guarantee (a grep-based test rather than a new lint-rule layer — cheaper,
   and sufficient for one recipe package).
2. **§3 B1/B2/B3** — **decided** (confirmed 2026-07-04, before build): move
   `design-lint.md` under the recipe's code-target half (B1); author the
   `no-arbitrary-values` rule now, in Slice 3 (B2); extend baseSource-
   branching to `figma-create` (B3).
3. **Tier-0 rule logic's automated coverage** — per the B decision (Slice
   2), the eleven mechanism rules and three recipe rules (including the two
   newly-implemented checks: retired-file-key, kit-patches conformance) are
   now unit-tested as pure functions, closing the original plan's risk #1
   for the rule logic itself. The remaining gap narrows to the thin
   Plugin-API walker/marshaling code in `tier0-audit.js`/
   `tier0-recipe-checks.js`, which is still provable only inside Figma's
   Plugin API sandbox — first real proof is still Slice 14's live-file
   verification and argo-v2 Phase B's live sync spike.
4. **`kit.lock`/`kit-patches.json` template relocation changes the
   `setup-design` install-time condition** (Slice 7's §7 amendment) from
   "always create" to "only for `baseSource: external-library`" — this is a
   real behavior change for any *future* recipe with a different
   `baseSource`, but a no-op today since the one implemented recipe IS
   `external-library`. No regression for the only recipe that exists.
5. **Version bump size (Slice 13)** — this plan recommends `0.9.0` (minor),
   reasoning stated in Slice 13. Confirm before that slice if `1.0.0` is
   intended instead.
