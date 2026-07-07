# setup-design — template instantiation reference

How to instantiate each template under `${CLAUDE_PLUGIN_ROOT}/templates/design/`
into the host project. For each template: fill every explicit `{{…}}` slot
from the app's `design.<app>` block in `.claude/argo.json` (see
`templates/design/config.example.json` for the block shape), and confirm
consent before overwriting anything already installed by `init` (the
testing.md amendment, in particular — never silently edit a file another
skill already owns).

**The tier-0 audit is NOT a template installed into the host project**
(kit-extraction restructure). `figma-audit` bundles it on demand from
`@argohq/kit/design-kit/tier0-audit` (+ the installed recipe's own
`design-kit/<recipe>/tier0-walker` subpath) via `argo design
bundle-tier0-audit` — see figma-audit/SKILL.md. Nothing audit-related is ever
written to `design/` here; `config.semanticCollectionName` (below) and
`design/registry.json` still live in the project as DATA the bundled audit
reads at call time, never as source it imports.

| Template | Install when | Substitute / scope with |
|---|---|---|
| `vrt-walker/vrt.walker.vrt.js` | prefer `argo design emit-shims` (generates it from the block's `componentsPath`/`walkers`); manual fill only when a project needs a bespoke shim | a THIN shim calling `runVrtWalker` from `@argohq/kit/walkers` — the factory owns the walk. Slots: `{{STORYBOOK_TEST_PACKAGE}}` ← the project's Storybook test-package name (`walkers.storybookTestPackage`); `{{STORIES_GLOB}}` ← story glob relative to the shim dir (`walkers.storiesGlob`); `{{BASELINES_GLOB}}` ← relative glob to the committed baselines (`walkers.baselinesGlob`, e.g. `../../design/screenshots/**/*.png`) |
| `vrt-walker/vitest.vrt.config.js` | always (copied/filled manually — emit-shims does not generate it) | `{{VRT_WALKER_DIR}}` ← the project's chosen path (e.g. `test/vrt/`); `{{EXT}}` ← `ts` or `js` per project; `{{PINNED_CHROMIUM_BUILD}}` ← block `vrtEnvironment.browser`; `{{VIEWPORT_WIDTH}}`/`{{VIEWPORT_HEIGHT}}` ← split block `vrtEnvironment.viewport` (`"WxH"`) on `x`; `{{SOURCE_ALIASES}}` ← the host app's source aliases as `'@alias': resolve(__dirname, '<path>')` entries (SKILL §7b); `{{CSS_PLUGIN_IMPORT}}`/`{{CSS_PLUGIN_CALL}}` ← the host app's real CSS pipeline plugin (e.g. `@tailwindcss/vite`'s `tailwindcss()`), mirrored the same way into `.storybook/main.ts`'s `viteFinal` — without this every VRT render is unstyled and no assertion here catches it by default (SKILL §7b/§8) |
| `spec-diff-walker/spec-diff.walker.spec-diff.js` | prefer `argo design emit-shims`; manual fill only for a bespoke shim | a THIN shim calling `runSpecDiffWalker` from `@argohq/kit/walkers`. Slots: `{{STORYBOOK_TEST_PACKAGE}}`/`{{STORIES_GLOB}}` as above; `{{DESIGN_SPECS_GLOB}}` ← glob of `design/specs/*.json` relative to the shim dir (`walkers.specsGlob`) — specs pair with stories by basename |
| `gate-wiring.md` | always | `{{TEST_CMD}}`/`{{TYPECHECK_CMD}}`/`{{LINT_CMD}}` ← the project's real scripts; `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{TOKEN_DRIFT_SCRIPT}}` ← paths chosen above — copy the resulting wiring into the project's own docs/README, this file itself is not committed verbatim |
| `testing-rule-amendment.md` | a `.claude/rules/testing.md` already exists (installed by `init`) | `{{SPEC_DIFF_WALKER_DIR}}`/`{{VRT_WALKER_DIR}}`/`{{EXT}}` as above — **append** to the existing file, with consent; never silently edit |
| `config.example.json` | always (first install) — NOT copied to its own file: it is the shape reference for the app's `design.<app>` block in `.claude/argo.json` | merge its keys into the app's existing block (init's `root`/`componentsPath` are preserved), filling every `{{…}}` slot from setup-design's detection/AskUserQuestion wizard, including the `recipe` field (the chosen recipe's id, `shadcn-tailwind`) — this block is the ONE place every other template's substitutions are sourced from. `figma.projectFileKey` (§0c-i) ← the bare file key of the project's design file, the duplicate of the starter file the user creates manually (parse it out of the pasted `figma.com/file/<KEY>/…` or `figma.com/design/<KEY>/…` URL). `figma.starterFileKey` (§0c-i, optional) ← the starter file the duplicate came from — provenance for `design-upgrade`'s starter refresh only. `figma.wireframeKitFileKey` (§0c-i) ← the bare file key of a lo-fi wireframe component library `figma-wireframe` instances from (optional — omit/leave placeholder to fall back to hand-drawn greyboxes). `componentsPath` ← the project's real generated-component output directory (a plain path prefix relative to the app root, e.g. `src/components`, not a glob — distinct from `{{COMPONENTS_GLOB}}` used by the lint template) — the kit's design-commit gate reads it to decide whether a commit touches generated component code and needs a fresh spec-diff receipt, and `argo design emit-shims` derives the default stories glob from it. `walkers.*` ← optional per-app overrides for emit-shims. There is no `_meta` lifecycle block — the files this pack writes are static suggestions, never reconciled against a plugin version |

**tdd-guard `ignorePatterns` (not a template — see §3a):** if the host
project has tdd-guard installed, `setup-design` adds `design/**` to
`.claude/tdd-guard/data/config.json`'s `ignorePatterns`, with consent,
BEFORE copying any template into `design/`. Without this, tdd-guard blocks
every design-pack template file as "premature implementation" (they're
Figma Plugin-API scripts, never exercised by this project's own test
runner) — `ignorePatterns` is a deterministic glob skip, not an
LLM-judged instruction, so it's the correct mechanism here rather than
tdd-guard's free-text custom-instructions file.

### Recipe templates — `templates/design/recipes/<recipe-dir>/`

Everything below installs from the chosen recipe's mapped directory. Recipe
IDs match their kit subpath and map explicitly to physical template dirs —
today the only recipe is `shadcn-tailwind` → dir
`templates/design/recipes/shadcn-tailwind/`. Install-when conditions are
keyed off that recipe's declared design source/`codeTarget` (its
`README.md`), not unconditionally.

| Template | Install when | Substitute / scope with |
|---|---|---|
| `code-target/lint/design-lint.md` | a lint config + component dir exist | `{{COMPONENTS_GLOB}}` ← the project's real components dir glob; `{{PRIMITIVE_TOKEN_PREFIX}}` ← the project's Primitive naming convention |
| `code-target/token-writer.md` | always (for this recipe) | `{{TOKEN_FILE_PATH}}` ← `config.tokenFilePath` — `figma-sync`'s step 7 delegates to this doc instead of narrating the token-writer inline |
| `code-target/css-pipeline.md` | always (for this recipe) | reference only, not filled with slots — states this recipe's `codeTarget` (Tailwind v4, `@tailwindcss/vite`) CSS-plugin detection/wiring detail that SKILL §7b delegates to instead of hardcoding a CSS tool into the generic skill; fills the `{{CSS_PLUGIN_IMPORT}}`/`{{CSS_PLUGIN_CALL}}` slots in `vrt-walker/vitest.vrt.config.js` and the equivalent plugin entry in `.storybook/main.ts`'s `viteFinal` |
| `README.md` | reference only, not copied into the host project | states this recipe's design source (the single-file starter) and `codeTarget` for setup-design's own recipe-selection bookkeeping |

**Package dependencies (see §5):** nothing to vendor — the design-kit modules
ship inside `@argohq/kit` (the dep `/argo:init` placed), imported via its
subpath exports (`@argohq/kit/design-kit`, `…/design-kit/tier0-rules`,
`…/design-kit/shadcn-tailwind/tier0-rules`); the tdd-guard Playwright reporter
is `@argohq/kit/reporters/playwright` the same way. Never an absolute
`${CLAUDE_PLUGIN_ROOT}`/plugin-cache path (machine-specific, version-pinned,
breaks for other clones and on the next plugin update), and never a vendored
copy.

### Re-run strategy (§5a)

There is no version-driven update mode. When `setup-design` re-runs (§0d) it
re-derives its files exactly as first-run does, category by category, never
overwriting a hand-edit:

| Category | Examples | Re-run strategy |
|---|---|---|
| (a) Regenerated template | `vrt-walker/*`, `spec-diff` walker, `testing.md` amendment | Re-derive current content, diff vs disk, ask per batch (≤4/AskUserQuestion). A file whose on-disk content ≠ last-derived is hand-edited → conflict prompt (keep/overwrite/merge), never auto-overwrite. |
| (b) Structured user-config | the `design.<app>` block in `.claude/argo.json` | `mergeConfigShape` (from `@argohq/kit`) against the app's block: add missing shape keys, preserve every existing value, never delete on-disk-only keys; write `merged` via `JSON.stringify`, report `addedKeys`. |
| (d) Foreign-file managed edit | `package.json` deps, tdd-guard `config.json` `ignorePatterns` | Idempotent re-apply of only the managed portion. |
| (e) External Figma state | Semantic-layer seeding | Out of scope — handled by §4a / `design-upgrade`; printed as a pointer, not silently skipped. |

**No migrations** (owner no-legacy ruling): nothing detects or converts
prior-version shapes — a project carrying pre-kit state (vendored dirs,
absolute `file:` deps) rips and re-inits via `/argo:init` +
`/argo:setup-design` fresh.

**Brownfield conflicts:** if a template contradicts observed reality (e.g. a
component dir already binds Primitives directly in several places), say so
and offer aspirational-for-new-code or skip — never auto-impose, matching
`init`'s own rule for this.
