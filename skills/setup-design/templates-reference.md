# setup-design — template instantiation reference

How to instantiate each template under `${CLAUDE_PLUGIN_ROOT}/templates/design/`
into the host project. For each template: fill every explicit `{{…}}` slot
from `design/config.json` (see `templates/design/config.example.json` for the
shape), and confirm consent before overwriting anything already installed by
`setup-claude` (the testing.md amendment, in particular — never silently edit
a file another skill already owns).

| Template | Install when | Substitute / scope with |
|---|---|---|
| `tier0-audit.js` | always | `{{SEMANTIC_COLLECTION_NAME}}` ← `config.semanticCollectionName`. Assembled with the installed recipe's `tier0-recipe-checks.js` spliced into the marked injection region (F12/X3) — the host project runs ONE canonical script, never two |
| `vrt-walker/` | always | `{{VRT_WALKER_DIR}}` ← the project's chosen path (e.g. `test/vrt/`); `{{EXT}}` ← `ts` or `js` per project; `{{PINNED_CHROMIUM_BUILD}}` ← `config.vrtEnvironment.browser`; `{{VIEWPORT_WIDTH}}`/`{{VIEWPORT_HEIGHT}}` ← split `config.vrtEnvironment.viewport` (`"WxH"`) on `x`; `{{STORYBOOK_TEST_PACKAGE}}`/`{{STORIES_GLOB_OR_INDEX}}` ← the project's real Storybook test-package name and story glob; `{{BASELINES_GLOB}}` ← relative glob from the walker file to the committed baselines (e.g. `../../design/screenshots/**/*.png`); `{{SOURCE_ALIASES}}` (in `vitest.vrt.config.js`) ← the host app's source aliases as `'@alias': resolve(__dirname, '<path>')` entries (SKILL §7b) |
| `spec-diff-walker/spec-diff.walker.spec-diff.js` | always | `{{SPEC_DIFF_WALKER_DIR}}` ← the project's chosen path; `{{EXT}}`, `{{STORYBOOK_TEST_PACKAGE}}`, `{{STORIES_GLOB_OR_INDEX}}` as above; `{{DESIGN_SPECS_GLOB_OR_INDEX}}` ← `design/specs/*.json` loader for this project's bundler |
| `gate-wiring.md` | always | `{{TEST_CMD}}`/`{{TYPECHECK_CMD}}`/`{{LINT_CMD}}` ← the project's real scripts; `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{TOKEN_DRIFT_SCRIPT}}` ← paths chosen above — copy the resulting wiring into the project's own docs/README, this file itself is not committed verbatim |
| `testing-rule-amendment.md` | a `.claude/rules/testing.md` already exists (installed by `setup-claude`) | `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{EXT}}` as above — **append** to the existing file, with consent; never silently edit |
| `config.example.json` | always (first install) | copy to `design/config.json`, fill every `{{…}}` slot from setup-design's detection/AskUserQuestion wizard, including the new `recipe` field (the chosen recipe's name, e.g. `shadcn-tailwind-external-kit`) and `recipeConfig.*` (recipe-specific fields, e.g. `figma.kitLibraryFileKey`) — this is the ONE file every other template's substitutions are sourced from. `componentsPath` ← the project's real generated-component output directory (a plain path prefix, e.g. `src/components`, not a glob — distinct from `{{COMPONENTS_GLOB}}` used by the lint template) — `hooks/design-commit-gate.mjs` reads it to decide whether a commit touches generated component code and needs a fresh spec-diff receipt. The `_meta` block (`setupVersion`, `managedFiles`) is design-pack lifecycle state (§2a Option B): it is filled at the END of a run (setup-design §9 equivalent), NOT at initial copy — `setupVersion` ← the plugin's current version, `managedFiles` ← every path the run wrote. Update mode reads `_meta.setupVersion` to decide first-run vs reconcile |

**tdd-guard `ignorePatterns` (not a template — see §3a):** if the host
project has tdd-guard installed, `setup-design` adds `design/**` to
`.claude/tdd-guard/data/config.json`'s `ignorePatterns`, with consent,
BEFORE copying any template into `design/`. Without this, tdd-guard blocks
every design-pack template file as "premature implementation" (they're
Figma Plugin-API scripts, never exercised by this project's own test
runner) — `ignorePatterns` is a deterministic glob skip, not an
LLM-judged instruction, so it's the correct mechanism here rather than
tdd-guard's free-text custom-instructions file.

### Recipe templates — `templates/design/recipes/<recipe-name>/`

Everything below installs from the chosen recipe's directory (today, only
`shadcn-tailwind-external-kit` exists) — install-when conditions are keyed
off that recipe's declared `baseSource`/`codeTarget` (its `README.md`), not
unconditionally.

| Template | Install when | Substitute / scope with |
|---|---|---|
| `design-source/base-congruence.walker.spec-diff.js` | recipe's `baseSource == "external-library"` (or `same-file` with vendored base code) | same substitutions as `spec-diff.walker.spec-diff.js`, plus `{{BASE_SMOKE_STORIES_GLOB_OR_INDEX}}` and `{{KIT_SPECS_GLOB_OR_INDEX}}` |
| `design-source/kit-patches.example.json` | recipe's `baseSource == "external-library"` | copy to `design/kit-patches.json` verbatim (`{}`) |
| `design-source/kit.lock.example.json` | recipe's `baseSource == "external-library"` | copy to `design/kit.lock`, fill `{{KIT_VERSION}}`/`{{DATE}}`/`{{KIT_FILE_KEY}}`/`{{FILE_VERSION}}`/`{{ISO_TIMESTAMP}}` from the current kit import — normally superseded by `figma-sync`'s first real sync run |
| `design-source/tier0-recipe-checks.js` | recipe's `baseSource == "external-library"` | `{{KIT_VARIABLE_KEYS_JSON}}` ← JSON array of the kit's variable keys from `design/kit.lock` (`[]` before the first sync — remote bindings then count as kit-sourced); `{{RETIRED_KIT_VARIABLE_KEYS_JSON}}` ← JSON array of variable keys retired by Library Swaps (`[]` if none; design-upgrade records them from the outgoing kit.lock); spliced into `tier0-audit.js`'s injection region, never installed/run standalone |
| `code-target/lint/design-lint.md` | a lint config + component dir exist | `{{COMPONENTS_GLOB}}` ← the project's real components dir glob; `{{PRIMITIVE_TOKEN_PREFIX}}` ← the project's Primitive naming convention |
| `code-target/token-writer.md` | always (for this recipe) | `{{TOKEN_FILE_PATH}}` ← `config.tokenFilePath` — `figma-sync`'s step 7 delegates to this doc instead of narrating the token-writer inline |
| `README.md` | reference only, not copied into the host project | states this recipe's `baseSource`/`codeTarget` for setup-design's own recipe-selection bookkeeping |
| `design-source/derive-semantic-seed.js` | recipe's `baseSource == "external-library"` (installed alongside the seeder — §4a runs it against the kit file on EVERY seeding, and `design-upgrade` can rerun it after a Library Swap) | `{{DERIVE_CONFIG_JSON}}` ← the co-installed `semantic-seed.json`'s `derive` section (`excludeNames`/`roleScopes`), injected fresh on every invocation, not just at initial install |
| `design-source/semantic-seed.json` | recipe's `baseSource == "external-library"` | none — copied byte-for-byte; project-owned starter data + derivation config only, NO kit-derived keys (edit the data to change the project's starter scale or role-scope table) |
| `design-source/seed-semantic.js` | recipe's `baseSource == "external-library"` AND both Figma file keys configured (`config.figma.projectFileKey`, `config.recipeConfig.figma.kitLibraryFileKey`) — mirrors the §4a gate | reads the co-installed `semantic-seed.json` for its project-owned sections; `{{DERIVED_SEED_JSON}}` ← the `derive-semantic-seed.js` call's return value from the same §4a pipeline run |

**Package dependencies (see §5):** **vendor** `figma-design-kit` into a
committed `design/vendor/figma-design-kit` and depend on it via a **relative**
`file:./design/vendor/figma-design-kit` path — **never** an absolute
`${CLAUDE_PLUGIN_ROOT}`/plugin-cache path (machine-specific, version-pinned,
breaks for other clones and on the next plugin update). Do the same for
`figma-design-kit-shadcn-tailwind` when the chosen recipe is
`shadcn-tailwind-external-kit`. Not a template — a vendored copy plus a real
`package.json` dependency edit. `skills/setup-claude/SKILL.md` §6c's
`tdd-guard-playwright` uses the identical `resolveVendorPlan`-driven pattern
(`workspace:*` on a monorepo host, relative `file:` otherwise).

### Update mode — per-category reconcile strategy (§5a)

When `setup-design` re-runs against a project whose `design/config.json`
`_meta.setupVersion` is older than the plugin (§0d), it reconciles by category
rather than re-running the wizard. This table mirrors the skill's §5a so the
two don't drift:

| Category | Examples | Reconcile strategy |
|---|---|---|
| (a) Regenerated template | `tier0-audit.js`, `vrt-walker/*`, `spec-diff` walker, `testing.md` amendment | Re-derive current content, diff vs disk, ask per batch (≤4/AskUserQuestion). A file whose on-disk content ≠ last-derived is hand-edited → conflict prompt (keep/overwrite/merge), never auto-overwrite. |
| (b) Structured user-config | `design/config.json` | `mergeConfigShape` (design-config-merge): add missing shape keys, preserve every existing value, never delete on-disk-only keys; write `merged` via `JSON.stringify`, report `addedKeys`. |
| (c) Vendored dirs | `packages/<pkg>` or `design/vendor/<pkg>` | Compare vendored copy's `version` vs plugin's `packages/<pkg>`; on a bump, full-dir re-copy to the `resolveVendorPlan` location. |
| (d) Foreign-file managed edit | `package.json` deps, tdd-guard `config.json` `ignorePatterns` | Idempotent re-apply of only the managed portion; dep rewrites go through migrations (below). |
| (e) External Figma state | Semantic-layer seeding | Out of scope for file reconcile — handled by §4a / `design-upgrade`; printed as a pointer, not silently skipped. |

**Migrations (§5a step 1):** `pendingMigrations(_meta.setupVersion)` from
`setup-migrations` runs first (a stale absolute `file:` dep can break
`bun install` before diffs run). Migration #1
(`vendor-figma-design-kit-absolute-path`) rewrites an absolute plugin-cache
`file:` dep — and, on a workspace host, an off-convention relative
`design/vendor` dep — to the host's correct vendored form.

**Brownfield conflicts:** if a template contradicts observed reality (e.g. a
component dir already binds Primitives directly in several places), say so
and offer aspirational-for-new-code or skip — never auto-impose, matching
`setup-claude`'s own rule for this.
