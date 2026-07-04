# Reconciling an already-initialized project against a newer argo pack

**Scope:** give the design pack a state-aware update mode (mirroring
`setup-claude`'s already-shipped one), add a versioned `migrations/`
mechanism for changes that aren't "re-derive a template," and a thin
umbrella entry point that runs both in sequence. Plugin is at v0.11.0
(`.claude-plugin/plugin.json:3`, `.claude-plugin/marketplace.json:11`,
confirmed matching) as this plan is written.

**Authoritative reference (read before building):** `skills/setup-claude/SKILL.md`
§1 (`:29-43`) and §9 (`:307-327`) — the proven template this plan extends to
`setup-design`. `skills/setup-design/SKILL.md` (full skill, `:1-263`) and
`skills/setup-design/templates-reference.md` (full file, `:1-62`) — the
surface being made update-aware. `hooks/session-context.mjs:51-73` and
`test/sessionContext.test.mjs` — the SessionStart nudge this plan extends to
cover the design surface too.

---

## 1. Current-state findings

- `skills/setup-claude/SKILL.md:29-43` already implements update mode for its
  own surface: reads `.claude/argo-config.json`, compares `setupVersion`
  against the plugin's, and if older, diff-driven re-derives each
  `managedFiles` entry, asks per batch, touches only `managedFiles`, and
  refuses to auto-update a hand-edited file. §9 (`:307-327`) writes
  `{ landing, setupVersion, managedFiles: [...] }` into
  `.claude/argo-config.json` at the end of a run.
- `skills/setup-design/SKILL.md` has **no** equivalent — confirmed by reading
  the whole file (`:1-263`). It is a linear first-run wizard (§0-§9) with no
  `setupVersion`, no `managedFiles` list, and no branch on prior state. It
  writes/owns a heterogeneous surface, confirmed file-by-file:
  - **Regenerated templates** (re-derivable byte-for-byte from
    `templates/design/` + `design/config.json` + the chosen recipe):
    the assembled `design/tier0-audit.js` (§4, `:136-160`, spliced with the
    recipe's `tier0-recipe-checks.js` at the `// {{RECIPE_TIER0_CHECKS}}`
    marker), `vrt-walker/`, `spec-diff-walker/spec-diff.walker.spec-diff.js`,
    the `testing.md` amendment (§6, `:228-235`).
  - **Structured user-config**: `design/config.json`, copied from
    `templates/design/config.example.json` (confirmed shape,
    `:1-23`: `recipe`, `semanticCollectionName`, `tokenFilePath`,
    `knownGoodTriad`, `vrtEnvironment`, `figma.projectFileKey`,
    `recipeConfig.figma.kitLibraryFileKey`) — carries user-specific values a
    reconcile must never clobber.
  - **Vendored dirs** (§5, `:191-226`): `design/vendor/figma-design-kit` and
    `design/vendor/figma-design-kit-shadcn-tailwind`, copied from
    `packages/figma-design-kit/package.json`'s own `files` array
    (confirmed, `:12-20`) — a real shipped bug this plan's first migration
    fixes (§2d below) was exactly a stale/absolute version of this dependency.
  - **Managed edits inside FOREIGN files**: `package.json`'s `dependencies`
    (the `file:./design/vendor/...` entries, §5), and
    `.claude/tdd-guard/data/config.json`'s `ignorePatterns` array (§3a,
    `:102-134` — appends `design/**`, preserving every other field, never
    regenerating the file).
  - **External Figma state**: §4a's Semantic-layer seeding
    (`derive-semantic-seed.js` / `seed-semantic.js`, idempotent,
    create-only) — lives in the Figma file, not in any reconcilable local
    file.
  - **Scaffolding**: `design/waivers.json`, `design/kit-patches.json` (§7,
    `:237-247`) — created once, then owned by `figma-audit`/`figma-sync`
    from then on, not by `setup-design` on re-run.
- `hooks/session-context.mjs:51-73` (`setupNudge`) reads
  `.claude/argo-config.json`, compares its `setupVersion` to
  `.claude-plugin/plugin.json`'s version, and nudges `/argo:setup-claude` on
  mismatch or absence — confirmed by `test/sessionContext.test.mjs:58-119`
  (four cases: missing config, stale version, pre-versioning, current).
  **It has no equivalent check for the design surface** — a project that ran
  `setup-design` gets no nudge when the design pack itself falls behind.
- No `packages/` code today backs `setup-claude` or `setup-design` at all —
  both are 100%-narrated wizards (confirmed: no test file references either
  skill's logic; only `figma-design-kit`/`figma-design-kit-shadcn-tailwind`
  have pure-function packages with unit tests, per `test/figmaTier0Rules.test.mjs`
  and `test/figmaDesignKitShadcnTailwindTier0Rules.test.mjs`). Introducing a
  small tested `packages/setup-migrations/` for the new migrations mechanism
  is new infrastructure, but follows the exact established split (pure
  predicate/transform, tested; thin skill-narrated glue, untested) rather
  than inventing a new pattern.
- No semver package is a dependency (`package.json:11-15` — only `evalite`,
  `tdd-guard-vitest`, `vitest`); a plain three-part version comparator is
  small enough to write and unit-test directly rather than adding a
  dependency for it.
- `design-upgrade` (`skills/design-upgrade/SKILL.md`) is a different axis
  entirely — it upgrades the **Figma kit + shadcn version** inside an
  already-set-up project (D15 paired upgrade). It is orthogonal to this
  plan (which reconciles the **plugin's own** setup surface against a newer
  **plugin** version) and needs no changes here; the plan notes where the
  two surfaces touch (kit.lock/vendor dirs) so a future reader isn't
  surprised they don't overlap.

---

## 2. Design decisions

### 2a. Where design-pack lifecycle state lives — `.claude/argo-config.json` vs `design/config.json`

Two real options, both grounded in what already exists:

| | **A — extend `argo-config.json`** | **B — self-contained in `design/config.json`** |
|---|---|---|
| Shape | add a `design: { setupVersion, managedFiles }` key to the existing shared file | add a `_meta: { setupVersion, managedFiles }` key to `design/config.json` |
| Pro | one canonical lifecycle file; `session-context.mjs` keeps reading a single source | `design/config.json` is already documented as "the ONE file every other template's substitutions are sourced from" (`templates-reference.md:17`) — lifecycle state about that exact surface belongs with it |
| Con | requires teaching `setup-claude`'s already-shipped, tested §9 write to **merge** rather than overwrite (else it silently drops the `design` key the next time it writes the file) — a behavior change to a shipped skill for a concern it doesn't own | `session-context.mjs` needs a second, optional file read |
| Future-fit | every future pack (a third `setup-X` skill) keeps adding keys to one shared, ever-growing file it doesn't own | every pack owns its own state file — no shared file grows unbounded, no cross-skill coordination needed |

**Recommendation: B.** Cheaper (no behavior change to a shipped, tested
skill), matches the existing "config.json is design-pack's one file"
precedent, and scales better as more packs are added — each owns its own
lifecycle state instead of every pack learning to merge-write a shared
blob. The cost is a second optional file read in `session-context.mjs`,
which is small and isolated (same tmpdir-fixture test pattern already used
for the `argo-config.json` read). **This is the one call in this plan
worth a human veto** — flagging it plainly rather than silently building on
it.

### 2b. Reconcile strategy per surface category

| Category | Example | Strategy |
|---|---|---|
| (a) Regenerated template | `tier0-audit.js`, `vrt-walker/*`, `testing.md` amendment | Re-derive current content from `templates/design/` + `design/config.json` + recipe, diff against on-disk, ask per file (batches of ≤4 via AskUserQuestion, mirroring `setup-claude` §0). Hand-edit protection below. |
| (b) Structured user-config | `design/config.json` | **Shape-merge, never content-diff**: add any top-level/nested key present in the current `config.example.json` shape but missing on disk (e.g. a future `recipeConfig.newField`), with its template placeholder or a detected default; **never touch a key that already has a value**. Pure function, unit-tested (§4, Slice 3). |
| (c) Vendored dirs | `packages/<pkg>` (workspace host) or `design/vendor/<pkg>` (non-workspace) — location per §2f | Compare the vendored copy's own `package.json` `version` field against the plugin's current `packages/*/package.json` version; if newer upstream, offer to re-copy the whole dir (full-directory replace with consent — there is no "hand-edit" concept for a vendored dependency, so no diff-per-file needed, just a version-bump notice). The vendored *location* and the dependency *specifier* are resolved by §2f's workspace-aware helper, not hardcoded. |
| (d) Managed edit inside a foreign file | `package.json` deps, `.claude/tdd-guard/data/config.json`'s `ignorePatterns` | **Idempotent re-apply of only the managed portion.** For `package.json`: check the recorded dependency line still matches the expected `file:./design/vendor/<pkg>` shape; if a migration changed what "expected" means (§2d), patch just that dependency entry. For tdd-guard config: re-run the existing "append `design/**` if missing" check (already idempotent by construction, `SKILL.md:127-130`) — reconcile mode just re-runs it, no new logic needed. |
| (e) External Figma state | Semantic-layer seeding | **Out of scope for file reconcile** — nothing to diff locally. The update flow prints a one-line pointer: "Semantic-layer seeding and kit/shadcn version are reconciled by `setup-design` §4a and `design-upgrade` respectively, not by this flow" so the residual is stated, not silently dropped. |

### 2c. Adoption path for a project that predates design-pack version tracking

Mirror `setup-claude`'s own precedent exactly (`hooks/session-context.mjs:63-65`,
"predates setup versioning → adopt"): if `design/config.json` exists but has
no `_meta.setupVersion` field, treat it as version `"0.0.0"` and fall
straight into the normal diff-driven update-mode branch (§2b) — no separate
"adoption pass" is needed, because update mode already re-derives every
`managedFiles` entry from what's *actually on disk* (§4, Slice 5 derives the
managed-file list from the templates-reference.md install-when table rather
than trusting a possibly-absent list), so the first run against an unversioned
project naturally reconstructs `managedFiles` and stamps the current
`setupVersion` at the end. This avoids a second code path with its own bugs.

### 2d. Migrations mechanism — shape and location

`packages/setup-migrations/` (new package, pure logic + unit tests, mirrors
`packages/figma-design-kit`'s split):

- `semver.js` — `compareVersions(a, b)` pure function (three-part
  `major.minor.patch`, no dependency needed — confirmed no semver package in
  `package.json`).
- `migrations.js` — a plain data array, each entry:
  ```js
  {
    id: 'vendor-figma-design-kit-absolute-path',
    sinceVersion: '0.11.0',
    description: '...',
    detect(packageJsonObj) -> boolean,
    computePatch(packageJsonObj) -> patchedPackageJsonObj | null
  }
  ```
  `detect`/`computePatch` are **pure functions over already-read JSON
  objects** — not over a project path — mirroring the
  `figma-design-kit` tier0-rules.js convention ("pure over the marshaled
  shape"; the walker/skill does the fs reads). This keeps migrations
  testable with plain fixtures (no tmpdir, no fs mocking) and keeps the
  actual file copy/write (vendoring, package.json write-back) narrated in
  the skill step, same division of labor as every other skill in this repo.
- `runner.js` — `pendingMigrations(recordedVersion, migrations = migrations)`
  → filters `sinceVersion > recordedVersion` (inclusive-at-equal, see Slice 1)
  via `compareVersions`, sorted ascending. Pure, tested with the real
  `migrations.js` array plus a couple of synthetic fixtures for ordering.

First real migration — `vendor-figma-design-kit-absolute-path`
(`sinceVersion: '0.11.0'`, the version this fix actually landed in, per the
git log's "vendoring figma-design-kit instead of an absolute plugin-cache
`file:` dep"): `detect` returns true if any dependency value matches
`/^file:.*\/plugins\/cache\/argo\/argo\/[^/]+\/packages\//`. `computePatch`
is **workspace-aware** (§2f): it takes the host's resolved vendor plan
(`computePatch(packageJsonObj, vendorPlan)` where `vendorPlan` comes from
`resolveVendorPlan`) and rewrites the matched dependency to `vendorPlan.depSpecifier`
— `"workspace:*"` on a monorepo host, `"file:./design/vendor/<pkg-name>"` on a
plain host (pkg name taken from the matched path's last segment). It also
handles a host that was hand-fixed to a *relative* `file:` on a monorepo
(off-convention but functional, e.g. argo-v2 mid-remediation): `detect` for a
second, lower-priority sub-check can flag `file:./…/vendor/` deps on a
workspace host and offer to convert them to `workspace:*` — gated behind the
same consent, never forced. The skill step that runs this migration performs
the actual vendoring copy to `vendorPlan.packageDir` (`packages/<pkg>` or
`design/vendor/<pkg>`) — reusing the §2f helper and the §5 procedure, not a
new one. **Real-world note:** argo-v2 was hand-remediated to the workspace-
package layout during this plan's authoring, so it is the designated
before/after fixture for BOTH sub-cases (absolute→workspace, and the
file:→workspace conversion) at Slice 10.

### 2e. Umbrella entry point — `/argo:update`

New skill `skills/update/SKILL.md` (no existing skill named `update`,
confirmed via `Glob **/SKILL.md`). It is thin, and does not duplicate either
setup skill's wizard logic:

1. Read `.claude/argo-config.json` (setup-claude's version) and
   `design/config.json` if present (design pack's version, §2a Option B).
2. Run `packages/setup-migrations`' `pendingMigrations` against the lower of
   the two recorded versions (a migration might touch files either skill
   owns); for each pending migration, show its `description`, ask consent,
   apply, then re-run the vendoring/package.json steps it narrates.
3. Invoke `setup-claude` in its existing update mode (§1 of that skill —
   unchanged), then `setup-design` in its new update mode (this plan's
   Slice 5), in that order — migrations first, since a stale absolute
   `file:` path breaks `bun install` before either skill's diff-derivation
   would even run cleanly.
4. Individual skills remain independently runnable — `/argo:update` is a
   convenience umbrella, not a replacement; running `/argo:setup-design`
   directly still works unchanged (its own §0d entry-mode check handles it).

### 2f. Workspace-aware vendoring — `workspace:*` on a monorepo, relative `file:` otherwise

Vendoring an unpublished in-plugin package (`figma-design-kit`,
`figma-design-kit-shadcn-tailwind`, and `setup-claude`'s `tdd-guard-playwright`)
means committing a copy into the host repo — but **where** the copy goes and
**how** the dependency is wired depends on whether the host is a workspace/
monorepo. This was surfaced by a real host (argo-v2): its root is
`workspaces: ["apps/*","packages/*"]` and it already vendors
`tdd-guard-playwright` as `packages/tdd-guard-playwright` referenced
`workspace:*`. A `file:./design/vendor/…` dep works there but is off-convention
and app-local; the idiomatic monorepo placement is a first-class workspace
package. Conversely, a plain single-package host has no workspace to join, so
the relative `file:` vendor is correct there.

**Decision:** neither setup-design's first-run vendoring (§5 of that skill),
setup-claude's tdd-guard-playwright step (§6c), nor migration #1 (§2d) should
hardcode a strategy. A small pure helper — `resolveVendorPlan(hostRootPkgJson,
workspaceManifests)` in `packages/setup-migrations` — returns
`{ mode: 'workspace' | 'file', packageDir, depSpecifier }`:

- **Workspace host** (root `package.json` has a `workspaces` array, OR a
  `pnpm-workspace.yaml` / `[workspace]` manifest exists): `mode: 'workspace'`,
  `packageDir` = the first workspace glob that can hold a package (e.g.
  `packages/`), `depSpecifier: 'workspace:*'`. The vendored copy goes to
  `packages/<pkg>` and the dependency is `"<pkg>": "workspace:*"` — matching
  the host's existing convention (mirrors `tdd-guard-playwright`).
- **Non-workspace host**: `mode: 'file'`, `packageDir` = `design/vendor/`
  (design-kit) or the skill's chosen vendor dir (tdd-guard-playwright),
  `depSpecifier: 'file:./design/vendor/<pkg>'` (relative). Same as v0.11.0's
  shipped behaviour.

The helper is pure over already-read manifest objects (testable with fixtures,
no fs); the skill/migration does the actual copy to `packageDir` and the
`package.json` write. Both the **first-run** vendoring (a fix to the v0.11.0
shipped §5 text, which currently documents only the `file:` path) and the
**migration** (§2d) call this same helper, so first-run and reconcile always
produce the same shape for a given host. `setup-claude` §6c already carries a
lighter "or a workspace package if the host is a workspace" note; this plan
makes both skills reference the one helper so they can't drift.

---

## 3. Files to change/add

| File | Change |
|---|---|
| `packages/setup-migrations/package.json` | **new** — package manifest, pure ESM, no runtime deps |
| `packages/setup-migrations/semver.js` | **new** — `compareVersions(a, b)` |
| `packages/setup-migrations/migrations.js` | **new** — migration registry, first entry: vendor-path fix |
| `packages/setup-migrations/runner.js` | **new** — `pendingMigrations(recordedVersion, migrations)` |
| `packages/setup-migrations/resolve-vendor-plan.js` | **new** — `resolveVendorPlan(hostRootPkg, workspaceManifests)` → `{ mode, packageDir, depSpecifier }` (§2f), pure over manifest objects |
| `test/setupMigrationsSemver.test.mjs` | **new** — unit tests for `compareVersions` |
| `test/setupMigrationsRunner.test.mjs` | **new** — unit tests for `pendingMigrations` ordering/filtering |
| `test/setupMigrationsResolveVendorPlan.test.mjs` | **new** — red-first tests for workspace vs non-workspace vendor plans (§2f) |
| `test/setupMigrationsVendorPathFix.test.mjs` | **new** — red-first tests for the first migration's `detect`/`computePatch`, both `file:` and `workspace:*` targets |
| `templates/design/config.example.json` | **modified** — add `_meta: { "setupVersion": "{{SETUP_VERSION}}", "managedFiles": [] }` to the shape |
| `packages/design-config-merge/index.js` | **new** — `mergeConfigShape(currentTemplateShape, existingConfig)` pure shape-merge function (category b, §2b) |
| `test/designConfigMerge.test.mjs` | **new** — red-first tests for the shape-merge |
| `skills/setup-design/SKILL.md` | **modified** — new §0d "Entry mode" (mirrors `setup-claude` §1); update §9 to write `_meta.setupVersion`/`_meta.managedFiles` into `design/config.json`; **rewrite §5 first-run vendoring to be workspace-aware via `resolveVendorPlan` (§2f)** — the v0.11.0 shipped text documents only the `file:` path |
| `skills/setup-claude/SKILL.md` | **modified (§6c only)** — point the tdd-guard-playwright vendoring at the same `resolveVendorPlan` helper (§2f) so first-run vendoring is consistent across both setup skills; its §9 config-write shape is untouched (Option B, §2a) |
| `skills/setup-design/templates-reference.md` | **modified** — document the `_meta` field, and the per-category reconcile strategy table from §2b of this plan |
| `hooks/session-context.mjs` | **modified** — add a `designSetupNudge` sibling to `setupNudge` that reads `design/config.json`'s `_meta.setupVersion` and nudges `/argo:setup-design` on mismatch/absence, independent of the setup-claude nudge |
| `test/sessionContext.test.mjs` | **modified** — add cases mirroring the four existing setup-claude nudge cases, for the design-pack nudge |
| `skills/update/SKILL.md` | **new** — the `/argo:update` umbrella skill (§2e) |
| `.claude-plugin/plugin.json` | **modified** — version bump + description mention |
| `.claude-plugin/marketplace.json` | **modified** — matching version bump |
| `README.md` | **modified** — mention `/argo:update` alongside the existing setup-claude mention (`:36`, `:46-47`) |

No changes needed to: `skills/design-upgrade/SKILL.md` (orthogonal axis,
§1 finding); `packages/figma-design-kit*` (no tier0-rule changes here).
`setup-claude/SKILL.md`'s §9 config-write is untouched (Option B, §2a); its
only edit is the §6c vendoring reference above.

---

## 4. Work items (dependency order)

Verify command for every slice: `bun run test` (root `vitest run`,
`package.json:8`).

### Slice 1 — `setup-migrations` package: semver + registry + runner (testable: true, red-green)
- **Files (red first):** `test/setupMigrationsSemver.test.mjs` —
  `compareVersions('0.9.0', '0.11.0')` → negative, `compareVersions('0.11.0',
  '0.11.0')` → `0`, `compareVersions('0.11.1', '0.11.0')` → positive.
  `test/setupMigrationsRunner.test.mjs` — `pendingMigrations('0.9.0', [...])`
  returns entries with `sinceVersion > '0.9.0'` sorted ascending;
  `pendingMigrations('0.11.0', [...])` with a migration at exactly
  `sinceVersion: '0.11.0'` returns it (inclusive-of-current, since a project
  set up mid-version-bump should still see it — never silently skip a
  same-version migration); a migration below the recorded version is
  excluded.
- **Files (green):** `packages/setup-migrations/package.json` (new, `type:
  module`, no deps); `packages/setup-migrations/semver.js`;
  `packages/setup-migrations/runner.js`; `packages/setup-migrations/migrations.js`
  — starts as an empty array (Slice 2 adds the first real entry, kept
  separate so this slice is pure infrastructure).
- **Verify:** `bun run test`.
- `testable: true`, `requiresLaunch: false`.

### Slice 2 — `resolveVendorPlan` helper + first migration: vendor-path fix (testable: true, red-green)
- **Files (red first):**
  `test/setupMigrationsResolveVendorPlan.test.mjs` (§2f helper) — fixtures:
  (i) a root `package.json` with `workspaces: ["apps/*","packages/*"]` →
  `resolveVendorPlan` returns `{ mode: 'workspace', packageDir: 'packages',
  depSpecifier: 'workspace:*' }`; (ii) a root with no `workspaces` and no
  pnpm-workspace manifest → `{ mode: 'file', packageDir: 'design/vendor',
  depSpecifier: 'file:./design/vendor/<pkg>' }`; (iii) a pnpm-workspace.yaml
  present (passed in `workspaceManifests`) → `mode: 'workspace'`.
  `test/setupMigrationsVendorPathFix.test.mjs` (migration) — fixture: a
  `package.json`-shaped object with
  `"figma-design-kit": "file:/Users/someone/.claude/plugins/cache/argo/argo/0.10.1/packages/figma-design-kit"`.
  Cases: (a) `detect` → `true` on that fixture; (b) `detect` → `false` on a
  package.json already using `workspace:*`; (c) `computePatch(fixtureA,
  { mode:'file', depSpecifier:'file:./design/vendor/figma-design-kit' })`
  rewrites that one dependency to `"file:./design/vendor/figma-design-kit"`,
  every other field untouched (deep-equal on the rest); (d) `computePatch(fixtureA,
  { mode:'workspace', depSpecifier:'workspace:*' })` rewrites it to
  `"workspace:*"` (the monorepo case — this is the argo-v2 shape); (e) the
  `figma-design-kit-shadcn-tailwind` variant handled identically (pkg name from
  the matched path's final segment, not hardcoded); (f) the off-convention
  sub-check: a `"figma-design-kit": "file:./design/vendor/figma-design-kit"`
  dep on a **workspace** host → the secondary detect flags it for
  conversion to `workspace:*`; the SAME dep on a **non-workspace** host → not
  flagged (already correct there).
- **Files (green):** `packages/setup-migrations/resolve-vendor-plan.js`
  (`resolveVendorPlan`, pure over manifest objects); `packages/setup-migrations/migrations.js`
  — add the `vendor-figma-design-kit-absolute-path` entry (§2d),
  `detect`/`computePatch` as pure transforms over `(packageJsonObj,
  vendorPlan)`.
- **Verify:** `bun run test`.
- `testable: true`, `requiresLaunch: false`.

### Slice 3 — `design/config.json` shape-merge (testable: true, red-green)
- **Files (red first):** `test/designConfigMerge.test.mjs` — fixture: an
  existing config missing a hypothetical new nested field
  (`recipeConfig.figma.newField`) that the "current shape" (derived from
  `config.example.json`) has. Cases: (a) missing key gets added with the
  template's placeholder value; (b) an existing key's value is preserved
  verbatim even if it differs from the template's placeholder; (c) a key
  present on disk but absent from the current shape is left untouched (never
  deleted — forward-compat for recipe-specific fields); (d) nested objects
  merge per-key, not whole-object replace (e.g. adding a new
  `recipeConfig.figma.*` field doesn't touch `recipeConfig.figma.kitLibraryFileKey`
  if already set).
- **Files (green):** `packages/design-config-merge/package.json` (new);
  `packages/design-config-merge/index.js` — `mergeConfigShape(shape,
  existing)`, recursive per-key merge, returns `{ merged, addedKeys }` (the
  `addedKeys` list is what the update-mode skill step reports to the user).
- **Verify:** `bun run test`.
- `testable: true`, `requiresLaunch: false`.

### Slice 4 — `templates/design/config.example.json` grows `_meta` (testable: false — template/docs only)
- **Files:** `templates/design/config.example.json` — add
  ```json
  "_meta": { "setupVersion": "{{SETUP_VERSION}}", "managedFiles": [] }
  ```
  at the top level. `skills/setup-design/templates-reference.md` — update
  the `config.example.json` row to mention `_meta` is filled at the END of a
  run (§9 equivalent, not at initial copy — `managedFiles` isn't known until
  the rest of the wizard has run), same ordering `setup-claude` §9 uses.
- **Verify:** `bun run test` (no logic touched; confirms nothing else reads
  `config.example.json`'s shape in a way this breaks — grep for
  `config.example.json` consumers first).
- `testable: false`, `requiresLaunch: false`.

### Slice 5 — `setup-design/SKILL.md`: entry mode + update mode (testable: false — prose skill, mirrors setup-claude's own untested §1)
- **Files:** `skills/setup-design/SKILL.md` — insert a new **§0d "Entry mode
  — first run, update, or re-run"** immediately after §0c (recipe
  selection) and before §1 (stack detection), worded to mirror
  `setup-claude` §1 (`:29-43`) exactly, adapted per-category (§2b table of
  this plan):
  - Missing `design/config.json` (or missing `_meta`) → first-run wizard,
    §0a onward, unchanged.
  - `_meta.setupVersion` older than the plugin's (or absent — §2c, treated
    as `"0.0.0"`) → update mode: for category (a) files, re-derive and diff,
    ask per batch; for category (b) (`design/config.json` itself), run
    `mergeConfigShape` (Slice 3) and report `addedKeys`; for category (c)
    (vendored dirs), compare vendored `package.json` version against the
    plugin's own `packages/*/package.json` version and offer a full re-copy
    on mismatch; for category (d) (foreign-file edits), re-run the existing
    idempotent §3a/§5 checks; category (e) — print the one-line pointer
    from §2b of this plan (Figma state and kit/shadcn version are out of
    scope here). Never touch a file whose on-disk content doesn't match what
    this skill last derived at the recorded version — surface as a conflict
    (keep/overwrite/merge-manually), same as `setup-claude`.
  - Current version → offer "re-run detection anyway, or exit?" identical to
    `setup-claude`.
  Update §9 (report) to also write `_meta.setupVersion` (the plugin's
  current version) and `_meta.managedFiles` (every path this run wrote:
  `design/tier0-audit.js`, the walker paths chosen in §4, `design/config.json`
  itself, the vendored package dirs — at `packages/<pkg>` or `design/vendor/<pkg>`
  per §2f — `design/waivers.json`/`kit-patches.json` if created) into
  `design/config.json` before the final report.
  Also **rewrite §5's first-run vendoring to call `resolveVendorPlan` (§2f)**:
  detect the host's workspace shape, vendor to `packageDir`, and write the
  dependency as `vendorPlan.depSpecifier` (`workspace:*` on a monorepo,
  relative `file:` otherwise) — replacing the v0.11.0 `file:`-only text. Make
  the matching one-line edit to `setup-claude/SKILL.md` §6c so tdd-guard-playwright
  vendoring routes through the same helper. `managedFiles` records the resolved
  vendored location so update mode (category c) knows where to look.
- **Verify:** `bun run test` (docs/prose only; confirms the pure-logic
  slices it references — Slices 1-3 — are green).
- `testable: false`, `requiresLaunch: false`.

### Slice 6 — `templates-reference.md`: document `_meta` + reconcile table (testable: false)
- **Files:** `skills/setup-design/templates-reference.md` — add a new
  section "Update mode — per-category reconcile strategy" reproducing the
  §2b table of this plan (so the skill file and the reference file don't
  drift), and confirm every row in the existing template table states
  whether it's category (a)/(b)/(c)/(d)/(e).
- **Verify:** `bun run test` (docs only).
- `testable: false`, `requiresLaunch: false`.

### Slice 7 — SessionStart nudge for the design surface (testable: true, red-green)
- **Files (red first):** `test/sessionContext.test.mjs` — add cases
  mirroring the four existing setup-claude ones (`:58-119`), scoped to
  `design/config.json`: (a) no nudge when `design/config.json` doesn't exist
  (design pack was never installed — silence, not an error); (b) nudge
  `/argo:setup-design` when `design/config.json` exists with no `_meta`
  field (predates tracking); (c) nudge when `_meta.setupVersion` is older
  than the plugin's version, message includes the old version string; (d)
  silent when `_meta.setupVersion` matches. Independent of the existing
  setup-claude nudge cases (both can fire in the same session if both are
  stale).
- **Files (green):** `hooks/session-context.mjs` — add a
  `designSetupNudge(cwd)` sibling function to `setupNudge`, same read
  pattern (try/catch, fail-quiet on any parse error — never break a
  session), appended to the card's `additionalContext` alongside the
  existing nudge. Keep the 2400-char budget test (`:27-35`) green — if the
  combined nudges risk the budget, keep each nudge to one line, same length
  as the existing ones.
- **Verify:** `bun run test`.
- `testable: true`, `requiresLaunch: false`.

### Slice 8 — `/argo:update` umbrella skill (testable: false — prose skill)
- **Files:** `skills/update/SKILL.md` — new skill per §2e of this plan:
  frontmatter `name: update`, description triggers on "update argo", "sync
  the design pack", "/argo:update", "pick up the latest argo fixes". Body:
  read both config files, run pending migrations from
  `packages/setup-migrations` (consent per migration, reusing the vendoring
  procedure already narrated in `setup-design/SKILL.md` §5 rather than
  re-describing it), then invoke `setup-claude` update mode, then
  `setup-design` update mode (Slice 5), in that order (§2e point 3 — migrations
  first, since a broken `file:` path can break `bun install` before either
  skill's own diff-derivation runs cleanly). State plainly that this is a
  convenience umbrella — running either setup skill directly still works.
- **Verify:** `bun run test` (docs only; confirms Slices 1-2's migration
  package it references is green).
- `testable: false`, `requiresLaunch: false`.

### Slice 9 — manifest/version bump + README mention (testable: false)
- **Files:** `.claude-plugin/plugin.json:3` (bump; minor version — adds new
  capability without changing any existing installed project's behavior
  until they opt into running it) and its `description`; matching bump in
  `.claude-plugin/marketplace.json:11`; `README.md` — add `/argo:update`
  next to the existing `setup-claude` mentions (`:36`, `:46-47`).
- **Verify:** `bun run test`; `grep -rn "0\.11\.0"` outside `node_modules`
  first, to catch every place the old version string is hardcoded (same
  precaution `semantic-seeding.md` Slice 7 used).
- `testable: false`, `requiresLaunch: false`.

### Slice 10 — dry-run verification against a scratch project (testable: false, manual)
**Checkpoint / final review here.** Same disposition as
`semantic-seeding.md`'s Slice 8 and `setup-design/SKILL.md`'s own closing
line ("verified by manual dry-run against a scratch project only — no host
project lives in this repo to install into for real"):
- Create a scratch project, run `setup-design` first-run wizard against it
  (v-current), hand-edit one managed file, then simulate an older
  `_meta.setupVersion` and confirm: (a) the hand-edited file surfaces a
  conflict rather than being silently overwritten; (b) an untouched managed
  file re-derives and diffs cleanly; (c) `design/config.json` gains any new
  `_meta`/shape fields without losing existing values; (d) the vendor-path
  migration, on a **workspace** scratch host, rewrites the old absolute path
  to `workspace:*` and vendors to `packages/<pkg>`, and on a **non-workspace**
  scratch host rewrites to relative `file:./design/vendor/<pkg>` — and does NOT
  fire against an already-correct dep in either case; validate the workspace
  path against the real argo-v2 layout (hand-remediated to
  `packages/figma-design-kit*` + `workspace:*` during this plan's authoring),
  which is the designated live fixture; (e) the SessionStart card correctly
  nudges/stays silent per Slice 7's four cases, live.
- **Constraint:** needs a real host-project-shaped scratch dir, not just
  unit fixtures — same "no host project lives in this repo" caveat every
  prior design-pack plan has stated. If unavailable during a build-plan run,
  hand this slice to the user, same as `semantic-seeding.md` Slice 8.
- **Verify:** the dry-run report itself (attach to this plan or a progress
  note); `bun run test` still green.

---

## 5. Build metadata summary

| Slice | testable | requiresLaunch | seam |
|---|---|---|---|
| 1 | **true** (red-green) | false | |
| 2 | **true** (red-green) | false | |
| 3 | **true** (red-green) | false | |
| 4 | false | false | |
| 5 | false | false | |
| 6 | false | false | |
| 7 | **true** (red-green) | false | |
| 8 | false | false | |
| 9 | false | false | |
| 10 | false | false (manual, scratch-project dry run) | **checkpoint / final review** |

Natural seam: Slices 1-3 are pure, independently-testable infrastructure
(migrations + config-merge); Slices 4-9 wire that infrastructure into the
skill/hook surface and are individually low-risk but unverifiable by unit
test alone. Slice 10 is the one place this plan's core claim — "reconcile
without clobbering" — gets proven end-to-end; declare it the checkpoint/final
review seam, same reasoning `semantic-seeding.md` used for its own live-file
slice.

---

## 6. Risks / accepted trade-offs / open flags

- **§2a is a real architectural fork, decided here in favor of Option B**
  (design pack owns its own `_meta` in `design/config.json`, `setup-claude`
  untouched) rather than a shared `argo-config.json` key — flagged
  explicitly as the one call in this plan most worth a human veto before
  Slice 4 starts, since Slices 4-9 all build on it.
- **Hand-edit detection is heuristic, not cryptographic**, exactly like the
  `setup-claude` mechanism it mirrors — neither records a content hash at
  write time, so "does this look hand-edited" relies on the diff-and-ask
  flow rather than a deterministic check. A future hardening (recording a
  hash per `managedFiles` entry in both skills) is out of scope here — it
  would be a symmetric change to `setup-claude` too, and this plan
  deliberately avoids touching that shipped skill (§2a).
- **Category (c)'s vendored-dir reconcile trusts the vendored copy's own
  `package.json` `version` field** to detect staleness against the plugin's
  current `packages/*/package.json`. If a project's vendored copy was ever
  hand-edited without bumping that field, the comparison under-detects —
  same class of residual as the hand-edit gap above, not solved here.
- **The vendor-path migration is regex-matched on the plugin-cache path
  shape** (`/plugins/cache/argo/argo/<version>/packages/`) — if a future
  Claude Code version changes the plugin cache directory layout, the
  `detect` regex needs revisiting. Documented in the migration's own
  `description` field so it's discoverable, not silent.
- **Workspace detection (§2f) is heuristic** — it keys on a root
  `package.json` `workspaces` array or a `pnpm-workspace.yaml`/`[workspace]`
  manifest. Exotic monorepo setups (Nx/Turbo without a `workspaces` field,
  Bazel, custom tooling) would be classified `mode: 'file'` and get the
  relative-`file:` vendor — functional but off-convention there. The helper
  errs toward the always-works `file:` default when it can't prove a
  workspace, rather than emitting a `workspace:*` that a non-workspace host
  can't resolve. `resolveVendorPlan` is a pure function, so adding a detector
  for a new workspace flavour later is a one-line change plus a fixture.
- **`/argo:update`'s migrations-first ordering (§2e) is a judgment call**,
  not something either existing skill states — reasoned from "a broken
  `file:` dependency breaks `bun install` before any diff-derivation can run
  cleanly," but not proven by a test (Slice 10's scratch dry-run is the
  closest verification available).
- **Slice 10 cannot run inside this repo** (no host project lives here to
  install into for real) — same accepted gap every prior design-pack plan
  states about its own live-verification slice.
