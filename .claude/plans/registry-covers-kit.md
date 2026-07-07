# Registry covers kit components — argo-plugin implementation plan

Grounded against the current state of `/Users/milad/Developer/argo-plugin`
(packages/kit@0.13.0). Makes `design/registry.json` the **complete**
component inventory of the design file after a sync — kit components (from
the duplicated starter file) as well as project-owned ("custom") ones — via
a **deterministic CLI command**, not an agent-driven MCP walk.

## Owner mandate (repeated so every slice is graded against it)

Very simple, effective setup. Dead/redundant code is deleted, not
deprecated. No speculative features, no config sprawl (page identification
is by-exclusion, not a name list Milad has to maintain), no new gates beyond
what's named here.

## Decision: deterministic CLI, not an MCP walk (revision, this turn)

Milad's verbatim ask, relayed by the coordinator: "Can we not have a script
that extract all components from figma via api isn't this a deterministic
code that runs after we run sync or designers touch the files?" — followed
by explicit sign-off to proceed with a REST-backed `@argohq/kit` CLI command
(`GET /v1/files/:key`, env token, pure-function core, invoked by figma-sync
and runnable standalone). This supersedes the first draft's MCP-walk design
for the **enumeration** step specifically. Grounded against existing prior
art rather than inventing new conventions:

- **Token handling reuses the existing convention**, not a new one. This
  repo already has exactly one Figma REST client:
  `skills/resolve-comments/scripts/figma-comments.ts`. Its `token()`
  function (lines 89-100) reads `process.env.FIGMA_TOKEN` first, falls back
  to a gitignored `<cwd>/.argo/figma-token` file, and fails loud with a
  clear message if neither is set. This plan reuses that exact convention —
  **`FIGMA_TOKEN`, not `FIGMA_ACCESS_TOKEN`** — for a new REST consumer to
  agree with the one that already exists, not fork a second env-var name for
  the same secret. The request header is `X-Figma-Token` (confirmed at
  `figma-comments.ts:111`), API base `https://api.figma.com/v1`.
- **Where it lives.** `figma-comments.ts`'s own header comment explains it's
  deliberately kept *outside* `@argohq/kit` ("stays kit-independent... until
  the kit's TS migration lands"), written in erasable TS run via `node
  --experimental-strip-types` as a stopgap. That migration is now done —
  `packages/kit/package.json` confirms `packages/kit/src` is 100% real
  TypeScript, built by `tsc`, with every other skill-script (`generate-token-manifest.ts`,
  `record-audit-receipt.ts`, etc.) living in `packages/kit/src/skill-scripts/`
  and dispatched via `bin/argo.js`'s `DESIGN_VERBS` map. This new command
  belongs there directly, as real TS with a real build step — not a second
  skill-local erasable-TS script. (Migrating `figma-comments.ts` itself into
  the kit is a separate, unrelated refactor of a different skill and is
  explicitly **out of scope** here — no scope creep.)
- **fileKey source.** `design.<app>.figma.projectFileKey` in `.claude/argo.json`
  — confirmed field path, read the same way `design-guard-record.ts:64-68`
  already reads it (`block?.figma as { projectFileKey?: unknown }`) and the
  same way `findDesignBlock` (`prepare-tier0-audit-options.ts:75-84`, already
  used by `generate-token-manifest.ts`) resolves the app's `design.<app>`
  block from `.claude/argo.json` by `cwd`.
- **What I could not verify locally:** the exact JSON shape `GET
  /v1/files/:key` returns for component/component-set nodes and their
  `componentPropertyDefinitions` field (whether the REST document tree
  mirrors the Plugin API's node shape exactly). There's no live Figma file
  or token available to this planning session to confirm against a real
  response — `figma-comments.ts`'s own Verification section states the same
  limitation for its endpoints. Slice 3 below makes fetching and committing
  a real trimmed fixture the FIRST implementation step, before the marshal
  function's field assumptions are locked in by a test.

## Context — what exists today (unchanged findings from the first draft)

- `packages/kit/src/design-kit/registry-reconcile.ts` — `reconcileRegistrySweep`
  diffs a live component list against `design/registry.json` entries,
  reporting `registry-orphan` / `registry-unregistered` / advisory, plus
  `isPascalCaseComponentName` (with `PASCAL_EXEMPT_PREFIXES = ['lucide/',
  'demo/']`) and `isScratchPageName`.
- `packages/kit/src/design-kit/tier0-rules.ts:125-127` — `isWireframePageName`
  already classifies `Cover` and `W\d{2}` pages; reused, not reimplemented.
- `packages/kit/src/design-kit/schemas.ts:28-34` — `RegistryEntrySchema`
  already has `kind: z.enum(['kit', 'custom'])` and `status: z.enum(['draft',
  'audit-clean', 'out-of-sync', 'orphaned'])` (Figma-lifecycle ONLY —
  `synced`/`coded` are explicitly documented as derived, never stored,
  `schemas.ts:17-19`). Nothing about the schema changes.
- `templates/design/file-structure.md` — the project's own canonical page
  set: `Cover`, divider pages (literal `────` padding), `W\d{2} <group>`,
  `D\d{2} <group>`, `Custom Components`, `Foundations`. Kit component pages
  are NOT named here — they arrive wholesale by duplicating an externally
  maintained starter file (`skills/setup-design/SKILL.md:70-77`), and this
  repo has no record of the starter's internal page names.
- `design/registry.json`'s shape (`component-names.ts:28-31`,
  `registryComponentNames`): `{ header, components: { <Name>: RegistryEntry } }`,
  name-keyed.
- `skills/figma-create/SKILL.md:263-276` — the existing registry upsert
  procedure: bootstrap-if-absent, then a single-key read-modify-write, always
  re-reading immediately before writing (concurrent-session safety) — the
  new CLI's write step follows the same read-modify-write shape, just
  automated instead of agent-performed.
- `packages/kit/src/design-kit/staleness.ts` — `classifyStaleness` (decision
  8) is the existing lifecycle-stamping mechanism; it keeps running over
  every registry entry regardless of `kind` — unaffected by this plan.
- `tier0-rules.ts:233-243` (`variantNamingViolations`) confirms the Plugin
  API's `componentPropertyDefinitions` shape (`{ [propName]: { type,
  variantOptions, ... } }`) that `extractVariantMatrix` mirrors — the REST
  document tree is assumed (Figma convention) to expose the same field name
  on COMPONENT_SET nodes; Slice 3 verifies this against a real fixture
  before relying on it.

## Approach

No architect panel for the pure functions (Slices 1-2, additive to an
existing mechanism). The CLI (Slice 3) is a new external integration with a
secret, planned deliberately: thin REST fetch, pure marshal/classify/build
functions (fully unit-testable with a fixture, no network in tests),
fail-loud on a missing token, one write via the existing atomic
`writeDesignJson`.

## Files to change

- `packages/kit/src/design-kit/registry-reconcile.ts` — add `isKitPageName`,
  `extractVariantMatrix`, `buildKitRegistryEntries`.
- `packages/kit/src/design-kit/registry-reconcile.test.ts` — tests for all
  three, plus a Pascal-case regression case for a kit-style name.
- `packages/kit/src/skill-scripts/pull-registry.ts` (new) — the CLI: REST
  fetch, marshal, classify, upsert lean kit entries, write.
- `packages/kit/src/skill-scripts/pull-registry.test.ts` (new) — unit tests
  against a committed fixture, no network.
- `test/fixtures/figma-file-response.json` (new) — trimmed real `GET
  /v1/files/:key` response, fetched live during Slice 3's build (needs a
  real token + real file; not something this planning pass can produce).
- `packages/kit/bin/argo.js` — register `pull-registry` in `DESIGN_VERBS`.
- `skills/figma-sync/SKILL.md` — step 2b: enumeration moves to `argo design
  pull-registry`; the MCP staleness walk stays scoped to what needs the live
  session (nodeId healing for moved/restructured entries, orphan detection
  against a genuinely live tree, screenshot capture).

## Step-by-step work items

### Slice 1 — `isKitPageName` classifier (by-exclusion, zero-config)

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.

1. In `packages/kit/src/design-kit/registry-reconcile.ts`, import
   `isWireframePageName` from `./tier0-rules.js` (already covers `Cover` and
   `W\d{2}`). Add:
   ```ts
   /**
    * By-exclusion, not a name list: the starter file's own internal page
    * names aren't recorded anywhere in this repo and are deliberately not
    * turned into project config (owner ruling: no config sprawl, no version
    * handshake). A page counts as "kit" unless it's one of this project's
    * own canonical pages (file-structure.md's page order) or a divider/
    * sandbox page. Fragile by design — see Risks.
    */
   export function isKitPageName(pageName: string): boolean {
     if (pageName === 'Custom Components' || pageName === 'Foundations') return false
     if (isWireframePageName(pageName)) return false // Cover + W\d{2}
     if (/^D\d{2}(\b|\s)/.test(pageName)) return false // D\d{2} hi-fi groups
     if (isScratchPageName(pageName)) return false
     if (/^[─-]{2,}/.test(pageName)) return false // divider pages (──── Wireframes ────, etc.)
     return true
   }
   ```
2. Tests in `registry-reconcile.test.ts`: each of the 6 exclusion branches
   (`Custom Components`, `Foundations`, `Cover`, `W03 Onboarding`, `D03
   Onboarding`, `Scratch - wip`, `──── Designs ────`) returns `false`; an
   arbitrary starter-owned name (`'Buttons'`, `'Overlays'`) returns `true`.
3. Verify: `cd packages/kit && bun test src/design-kit/registry-reconcile.test.ts`

### Slice 2 — variant matrix extraction + lean kit entry builder + Pascal-case lock

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.

1. Add to `registry-reconcile.ts`:
   ```ts
   type VariantPropertyDefinition = { type: string; variantOptions?: string[] }

   /** Mirrors tier0-rules.ts's variantNamingViolations' read of the same node shape. */
   export function extractVariantMatrix(
     componentPropertyDefinitions: Record<string, VariantPropertyDefinition> = {}
   ): Record<string, string[]> {
     const matrix: Record<string, string[]> = {}
     for (const [propName, def] of Object.entries(componentPropertyDefinitions)) {
       if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) matrix[propName] = def.variantOptions
     }
     return matrix
   }
   ```
2. Add the lean entry builder, reusing `PASCAL_EXEMPT_PREFIXES` (already
   `['lucide/', 'demo/']`) so icons/demo furniture are excluded from being
   registered at all, not just exempted from the naming rule:
   ```ts
   type LiveKitComponent = {
     name: string
     nodeId: string
     componentPropertyDefinitions?: Record<string, VariantPropertyDefinition>
   }
   type LeanKitEntry = {
     nodeId: string
     kind: 'kit'
     status: 'draft'
     lastSyncedAt: string
     variantMatrix: Record<string, string[]>
   }

   /**
    * Entries for kit components the registry has never seen — never
    * overwrites an EXISTING kit entry's status/lastSyncedAt (that stays the
    * pre-existing decision-8 staleness sweep's job, which already runs
    * file-wide over every registry entry regardless of kind); this only
    * fills the gap for a component with no entry at all. status: 'draft'
    * (never audited, never synced before) — figma-create's own upsert is
    * the only writer of 'audit-clean', and only after its own self-audit.
    */
   export function buildKitRegistryEntries(
     { liveKitComponents, existingNames }: { liveKitComponents: LiveKitComponent[]; existingNames: Set<string> },
     now: string
   ): Record<string, LeanKitEntry> {
     const entries: Record<string, LeanKitEntry> = {}
     for (const c of liveKitComponents) {
       if (existingNames.has(c.name)) continue
       if (PASCAL_EXEMPT_PREFIXES.some((p) => c.name.startsWith(p))) continue
       entries[c.name] = {
         nodeId: c.nodeId,
         kind: 'kit',
         status: 'draft',
         lastSyncedAt: now,
         variantMatrix: extractVariantMatrix(c.componentPropertyDefinitions)
       }
     }
     return entries
   }
   ```
3. Tests: `extractVariantMatrix` on a representative shape (`{ size: {
   type: 'VARIANT', variantOptions: ['sm','md','lg'] }, disabled: { type:
   'BOOLEAN' } }`) returns `{ size: ['sm','md','lg'] }`. `buildKitRegistryEntries`:
   a live kit component with no existing entry produces the lean shape
   above; an existing entry is untouched (absent from the output); a
   `lucide/arrow-right` or `demo/Playground` live component is excluded
   entirely.
4. Pascal-case regression lock: add a case confirming
   `isPascalCaseComponentName('Buttons')` (a plausible kit top-level
   component/page name) passes — it already does under the existing
   `/^[A-Z][A-Za-z0-9]*$/` regex; this locks it in now that kit names are a
   live consumer of the same predicate, not just custom ones. No code
   change expected — a regression test recording that kit component names
   must already be PascalCase-authored in the starter file, same
   requirement already imposed on custom components.
5. Verify: `cd packages/kit && bun test src/design-kit/registry-reconcile.test.ts`

### Slice 3 — `argo design pull-registry` CLI (REST fetch + marshal + upsert)

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.

1. **Fetch and commit a real fixture first** (a live step, needs a real
   `FIGMA_TOKEN` and a real `figma.projectFileKey` — do this once against
   the actual project/starter file): `curl -H "X-Figma-Token: $FIGMA_TOKEN"
   https://api.figma.com/v1/files/<key>`, trim it down to a representative
   slice (a couple of pages: one project-owned like `Custom Components`,
   one kit page, one with a `COMPONENT_SET` carrying real
   `componentPropertyDefinitions`, one divider/`Scratch` page for the
   classifier), save as `test/fixtures/figma-file-response.json`. This is
   the step that confirms or corrects the `componentPropertyDefinitions`
   shape assumption flagged in the Decision section above — if the REST
   shape differs from the Plugin API's, fix `extractVariantMatrix`'s input
   type before writing the marshal function against it, not after.
2. Create `packages/kit/src/skill-scripts/pull-registry.ts`, modeled on
   `generate-token-manifest.ts`'s pure-function-plus-CLI-wrapper pattern:
   - `token()`: reads `FIGMA_TOKEN` env, falls back to `.argo/figma-token`
     (gitignored, repo-root-relative via `resolveRepoRoot` — same helper
     `record-audit-receipt.ts:40` already uses for repo-root-relative reads
     in a monorepo), fails loud with the same message shape
     `figma-comments.ts:95-98` already uses if neither is set.
   - `fetchFile(fileKey, token)`: thin `fetch` wrapper, `X-Figma-Token`
     header, throws with `<status> <statusText>` + body on a non-OK
     response (mirrors `figma-comments.ts:107-121`'s `api()` helper).
   - `marshalRestDocument(doc)`: pure, unit-tested against the Slice-3-step-1
     fixture — walks `doc.document.children` (pages) × each page's
     `children` (top-level nodes), keeps `COMPONENT`/`COMPONENT_SET` nodes,
     returns `{ name, nodeId, pageName, componentPropertyDefinitions }[]`.
   - `buildPullRegistryResult({ liveComponents, registry, now })`: pure,
     composes `isKitPageName` (classify each live component's `kind` from
     its `pageName`) + `buildKitRegistryEntries` (upsert target for
     newly-seen kit components) — returns `{ newEntries, kitComponentCount,
     customComponentCount }` for the CLI wrapper to write and report.
   - CLI wrapper (`import.meta.url === file://argv[1]` guard, same as every
     sibling skill-script): resolve `cwd`, `findDesignBlock` for
     `figma.projectFileKey` (fail loud if absent — "no
     design.<app>.figma.projectFileKey configured, run setup-design first"),
     fetch the file, `readDesignJsonOrRebuild` the existing
     `design/registry.json` (schema-validated, per `write-design-json.ts`'s
     existing contract), merge `newEntries` into `components`, write via
     `writeDesignJson` (the same atomic temp-file+rename writer every other
     `design/*.json` writer already uses — no new writer).
3. Register `pull-registry` in `packages/kit/bin/argo.js`'s `DESIGN_VERBS`
   map (`'pull-registry': '../dist/skill-scripts/pull-registry.js'`),
   alongside the 10 existing verbs.
4. Tests in `pull-registry.test.ts`: `marshalRestDocument` against the
   committed fixture returns the expected flat list (page names correct,
   `COMPONENT`/`COMPONENT_SET` only, no `FRAME`/`GROUP` noise);
   `buildPullRegistryResult` composed end-to-end on that same marshaled list
   against an empty/partial registry produces the expected `newEntries`
   (kit-only, lucide/demo excluded, existing names untouched); `token()`
   throws the documented message with neither env nor file set (a real
   tmpdir, no network — same style as `record-audit-receipt.test.ts`'s
   monorepo-root tests).
5. Verify: `cd packages/kit && bun test src/skill-scripts/pull-registry.test.ts`

### Slice 4 — wire into figma-sync's registry-reconcile step

`argo:build-plan` metadata: `testable: false` (SKILL.md prose only),
`requiresLaunch: false`. Checkpoint: none needed — sequential, no seam.

1. Amend `skills/figma-sync/SKILL.md`'s step 2b ("Registry-reconcile
   ride-along") prose: replace "the live node-id walk above already holds
   every top-level COMPONENT/COMPONENT_SET on Custom Components" with
   running `argo design pull-registry` as its own deterministic step —
   runnable standalone (after designers touch the file directly, not only
   after a full sync) or as part of this procedure. It enumerates every
   page, classifies `kind` via `isKitPageName`, and upserts lean kit entries
   without needing an agent or a live MCP session at all.
2. Document the resulting division of labor explicitly: `pull-registry`
   owns **enumeration and kit-entry upsert** (deterministic, no live
   session); the existing MCP-based staleness walk (decision 8) stays
   scoped to what genuinely needs a live session — `registry-unregistered`/
   `registry-orphan` diffing against the now-complete registry, and the
   nodeId-heal step for an entry whose id moved (`combineAsVariants`/variant
   restructure minted a new id) via `getNodeByIdAsync`/`findAll`, both of
   which only run over entries `pull-registry` couldn't already resolve
   deterministically from a name+id snapshot.
3. `lucide/*`/`demo/*` stay excluded from both the CLI's upsert and the
   MCP-side Pascal-case/unregistered checks (same `PASCAL_EXEMPT_PREFIXES`
   check, now enforced in one more place).
4. Verify: `cd packages/kit && bun test src/ && bun run build` (whole-package
   sweep — SKILL.md prose has no test of its own, but this confirms nothing
   in Slices 1-3 regressed).

## Verification (whole-plan)

- `cd packages/kit && bun test src/ && bun run build` after each slice and
  once more at the end.
- Slice 3's fixture-fetch step is the one genuinely live-dependent step in
  this plan — everything downstream of the committed fixture (marshal,
  classify, build, write) is unit-tested with no network, same discipline
  `figma-comments.ts`'s own tests would need (that file currently has none
  committed either — out of scope to add here, noted only for parity
  awareness).

## Risks & assumptions

- **`isKitPageName` is fragile by design**, per the earlier ruling: a
  future project-owned page this classifier doesn't yet know about would
  have its components misclassified as `kind: 'kit'` — never blocking
  (advisory/additive only), self-corrects once the classifier is taught the
  new page name.
- **REST document shape is unverified until Slice 3 step 1 lands a real
  fixture.** Everything about `marshalRestDocument`'s field names
  (`componentPropertyDefinitions`, `document.children` nesting) is an
  assumption grounded in Figma's Plugin-API/REST-API field-naming
  convention, not a confirmed fact — flagged explicitly rather than stated
  as fact, per this plan's own grounding discipline. If the real response
  differs, only `marshalRestDocument` and its test need to change; the pure
  classify/build functions downstream of it are unaffected.
- **Token handling is duplicated, not shared**, between
  `figma-comments.ts` (resolve-comments skill, deliberately kit-independent
  pending a migration that hasn't happened) and `pull-registry.ts` (this
  plan, inside the kit). A few lines of near-identical `token()` logic in
  two places is an accepted, small duplication — extracting a shared
  `lib/figma-rest-token.ts` is a reasonable follow-up once a THIRD REST
  consumer exists, not before (YAGNI); noting it here so it isn't
  rediscovered as a surprise later.
- **`status: 'draft'` for first-seen kit entries** is this plan's own call
  (unchanged from the first draft), grounded in figma-create's documented
  convention that `'audit-clean'` is only ever written after that skill's
  own self-audit (`figma-create/SKILL.md:271-272`), which `pull-registry`
  never runs. A one-line change in `buildKitRegistryEntries` if a different
  initial status is wanted.

## Owner addendum: registry entries carry Figma component descriptions

`schemas.ts:20-22`'s comment records `description` as a field dropped by an
earlier ruling. That ruling is superseded for this plan: the owner wants
`pull-registry` to ALSO extract each component's native Figma description
(the `description` field on `COMPONENT`/`COMPONENT_SET` metadata, returned
by the REST API's `components`/`componentSets` maps at the document root,
not the document tree walk `marshalRestDocument` already does) into an
optional `description` field on registry entries, for both `kind: 'kit'`
and `kind: 'custom'` entries.

- `RegistryEntrySchema` (`schemas.ts:28-34`) gains `description:
  z.string().optional()`. Optional because not every entry passes through
  `pull-registry` (a `custom` entry authored by `figma-create` before a
  description was ever set on the component still needs to validate), and
  because the REST metadata maps only return a description at all when one
  was actually authored on the component in Figma.
- Rationale (owner's, recorded verbatim in intent): component descriptions
  should be available in the registry deterministically, authored once on
  the component in Figma, synced by code, never hand-maintained in
  `registry.json` itself. This is the same "deterministic CLI, not
  hand-maintained state" principle the rest of this plan already applies to
  enumeration and variant matrices — descriptions are just one more field
  `pull-registry` pulls from the same REST response, not a new mechanism.
- Scope note: this addendum only changes what `pull-registry`'s marshal step
  reads (add the `components`/`componentSets` metadata maps as a second
  source alongside the `document` tree walk) and what the schema accepts.
  It does not change `buildKitRegistryEntries`'s existing-entry-untouched
  behavior, `isKitPageName`, or any other slice's already-landed code —
  a future implementation pass wires `description` through
  `buildKitRegistryEntries`'s lean-entry shape and the custom-entry upsert
  path `figma-create` already owns, both additive.
