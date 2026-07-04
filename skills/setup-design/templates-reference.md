# setup-design — template instantiation reference

How to instantiate each template under `${CLAUDE_PLUGIN_ROOT}/templates/design/`
into the host project. For each template: fill every explicit `{{…}}` slot
from `design/config.json` (see `templates/design/config.example.json` for the
shape), and confirm consent before overwriting anything already installed by
`setup-claude` (the testing.md amendment, in particular — never silently edit
a file another skill already owns).

| Template | Install when | Substitute / scope with |
|---|---|---|
| `tier0-audit.js` | always | `{{SEMANTIC_COLLECTION_NAME}}` ← `config.semanticCollectionName`; `{{KIT_LIBRARY_FILE_KEY}}` ← `config.figma.kitLibraryFileKey` |
| `vrt-walker/` | always | `{{VRT_WALKER_DIR}}` ← the project's chosen path (e.g. `test/vrt/`); `{{EXT}}` ← `ts` or `js` per project; `{{PINNED_CHROMIUM_BUILD}}` ← `config.vrtEnvironment.browser`; `{{VIEWPORT_WIDTH}}`/`{{VIEWPORT_HEIGHT}}` ← split `config.vrtEnvironment.viewport` (`"WxH"`) on `x`; `{{STORYBOOK_TEST_PACKAGE}}`/`{{STORIES_GLOB_OR_INDEX}}` ← the project's real Storybook test-package name and story glob |
| `spec-diff-walker/` | always | `{{SPEC_DIFF_WALKER_DIR}}` ← the project's chosen path; `{{EXT}}`, `{{STORYBOOK_TEST_PACKAGE}}`, `{{STORIES_GLOB_OR_INDEX}}` as above; `{{DESIGN_SPECS_GLOB_OR_INDEX}}` ← `design/specs/*.json` loader for this project's bundler; `base-congruence.walker.spec-diff.js` additionally needs `{{BASE_SMOKE_STORIES_GLOB_OR_INDEX}}` and `{{KIT_SPECS_GLOB_OR_INDEX}}` |
| `gate-wiring.md` | always | `{{TEST_CMD}}`/`{{TYPECHECK_CMD}}`/`{{LINT_CMD}}` ← the project's real scripts; `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{TOKEN_DRIFT_SCRIPT}}` ← paths chosen above — copy the resulting wiring into the project's own docs/README, this file itself is not committed verbatim |
| `testing-rule-amendment.md` | a `.claude/rules/testing.md` already exists (installed by `setup-claude`) | `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{EXT}}` as above — **append** to the existing file, with consent; never silently edit |
| `lint/design-lint.md` | a lint config + component dir exist | `{{COMPONENTS_GLOB}}` ← the project's real components dir glob; `{{PRIMITIVE_TOKEN_PREFIX}}` ← the project's Primitive naming convention |
| `config.example.json` | always (first install) | copy to `design/config.json`, fill every `{{…}}` slot from setup-design's detection/AskUserQuestion wizard — this is the ONE file every other template's substitutions are sourced from |

**Package dependency:** add `figma-design-kit` as a path dependency (mirrors
`skills/setup-claude/SKILL.md`'s `tdd-guard-playwright` instructions
verbatim) — not a template, a real `package.json` dependency edit.

**Brownfield conflicts:** if a template contradicts observed reality (e.g. a
component dir already binds Primitives directly in several places), say so
and offer aspirational-for-new-code or skip — never auto-impose, matching
`setup-claude`'s own rule for this.
