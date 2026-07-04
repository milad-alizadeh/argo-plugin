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
| `vrt-walker/` | always | `{{VRT_WALKER_DIR}}` ← the project's chosen path (e.g. `test/vrt/`); `{{EXT}}` ← `ts` or `js` per project; `{{PINNED_CHROMIUM_BUILD}}` ← `config.vrtEnvironment.browser`; `{{VIEWPORT_WIDTH}}`/`{{VIEWPORT_HEIGHT}}` ← split `config.vrtEnvironment.viewport` (`"WxH"`) on `x`; `{{STORYBOOK_TEST_PACKAGE}}`/`{{STORIES_GLOB_OR_INDEX}}` ← the project's real Storybook test-package name and story glob |
| `spec-diff-walker/spec-diff.walker.spec-diff.js` | always | `{{SPEC_DIFF_WALKER_DIR}}` ← the project's chosen path; `{{EXT}}`, `{{STORYBOOK_TEST_PACKAGE}}`, `{{STORIES_GLOB_OR_INDEX}}` as above; `{{DESIGN_SPECS_GLOB_OR_INDEX}}` ← `design/specs/*.json` loader for this project's bundler |
| `gate-wiring.md` | always | `{{TEST_CMD}}`/`{{TYPECHECK_CMD}}`/`{{LINT_CMD}}` ← the project's real scripts; `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{TOKEN_DRIFT_SCRIPT}}` ← paths chosen above — copy the resulting wiring into the project's own docs/README, this file itself is not committed verbatim |
| `testing-rule-amendment.md` | a `.claude/rules/testing.md` already exists (installed by `setup-claude`) | `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{EXT}}` as above — **append** to the existing file, with consent; never silently edit |
| `tdd-guard-instructions-amendment.md` | a `.claude/tdd-guard/data/instructions.md` already exists (tdd-guard installed by `setup-claude`) | no `{{…}}` slots — **append** verbatim to the existing file, with consent, BEFORE §4's template copy; never silently edit. Without this, tdd-guard blocks every design-pack template file as "premature implementation" (they're Figma Plugin-API scripts, never exercised by this project's own test runner) |
| `config.example.json` | always (first install) | copy to `design/config.json`, fill every `{{…}}` slot from setup-design's detection/AskUserQuestion wizard, including the new `recipe` field (the chosen recipe's name, e.g. `shadcn-tailwind-external-kit`) and `recipeConfig.*` (recipe-specific fields, e.g. `figma.kitLibraryFileKey`) — this is the ONE file every other template's substitutions are sourced from |

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
| `design-source/tier0-recipe-checks.js` | recipe's `baseSource == "external-library"` | `{{KIT_LIBRARY_FILE_KEY}}` ← `config.recipeConfig.figma.kitLibraryFileKey`; `{{RETIRED_KIT_LIBRARY_FILE_KEYS_JSON}}` ← a JSON array literal of retired kit file keys (`[]` if none yet); spliced into `tier0-audit.js`'s injection region, never installed/run standalone |
| `code-target/lint/design-lint.md` | a lint config + component dir exist | `{{COMPONENTS_GLOB}}` ← the project's real components dir glob; `{{PRIMITIVE_TOKEN_PREFIX}}` ← the project's Primitive naming convention |
| `code-target/token-writer.md` | always (for this recipe) | `{{TOKEN_FILE_PATH}}` ← `config.tokenFilePath` — `figma-sync`'s step 7 delegates to this doc instead of narrating the token-writer inline |
| `README.md` | reference only, not copied into the host project | states this recipe's `baseSource`/`codeTarget` for setup-design's own recipe-selection bookkeeping |
| `design-source/derive-semantic-seed.js` | recipe's `baseSource == "external-library"` (installed alongside the seeder — §4a runs it against the kit file on EVERY seeding, and `design-upgrade` can rerun it after a Library Swap) | `{{DERIVE_CONFIG_JSON}}` ← the co-installed `semantic-seed.json`'s `derive` section (`excludeNames`/`roleScopes`), injected fresh on every invocation, not just at initial install |
| `design-source/semantic-seed.json` | recipe's `baseSource == "external-library"` | none — copied byte-for-byte; project-owned starter data + derivation config only, NO kit-derived keys (edit the data to change the project's starter scale or role-scope table) |
| `design-source/seed-semantic.js` | recipe's `baseSource == "external-library"` AND both Figma file keys configured (`config.figma.projectFileKey`, `config.recipeConfig.figma.kitLibraryFileKey`) — mirrors the §4a gate | reads the co-installed `semantic-seed.json` for its project-owned sections; `{{DERIVED_SEED_JSON}}` ← the `derive-semantic-seed.js` call's return value from the same §4a pipeline run |

**Package dependencies:** add `figma-design-kit` as a path dependency
(mirrors `skills/setup-claude/SKILL.md`'s `tdd-guard-playwright`
instructions verbatim); additionally add `figma-design-kit-shadcn-tailwind`
as a path dependency when the chosen recipe is
`shadcn-tailwind-external-kit` — not a template, a real `package.json`
dependency edit.

**Brownfield conflicts:** if a template contradicts observed reality (e.g. a
component dir already binds Primitives directly in several places), say so
and offer aspirational-for-new-code or skip — never auto-impose, matching
`setup-claude`'s own rule for this.
