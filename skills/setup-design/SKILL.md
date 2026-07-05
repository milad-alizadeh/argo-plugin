---
name: setup-design
description: Install/adapt the Figma-to-code design pack into a host project — shadcn init, Storybook + Vitest addon, VRT/spec-diff walkers, gate wiring, lint rule, design/config.json, figma-design-kit path dependency. Use when the user says "set up design", "install the design pack", "wire up Figma-to-code", or when setup-claude's recommendations pass mentions it.
---

# Set Up the Design Pack

Installs/adapts the whole Figma-to-code design pack, mirroring `setup-claude`'s
wizard shape: AskUserQuestion batches, propose-don't-impose, per-item consent.
See `skills/setup-design/templates-reference.md` for the exact `{{…}}` slot ↔
`design/config.json` field mapping for every template this skill copies.

## 0. Wizard UX

Same rules as `setup-claude` §0: batch related decisions into one
AskUserQuestion call (up to 4 per screen), recommended option first and
labeled, free-form via "Other", prose only for the opening one-liner and the
final report.

## 0a. Are you using Figma?

AskUserQuestion, single question: "Does this project use Figma as its design
source of truth?" If no: **stop** — explain in one paragraph that this pack
is a Figma-to-code pipeline (tier-0 hygiene audit, spec-diff/VRT gates, kit
sync) and doesn't apply without Figma. Never force Figma onto a project that
doesn't use it.

## 0b. Professional plan or higher?

AskUserQuestion, single question: "Is this Figma file on a Professional plan
or higher?" **Why this gate exists (F10):** below Professional, variable
collections are capped at **one mode**, which today's only recipe
(`shadcn-tailwind-external-kit`) needs library publishing for regardless — a
separate Professional-plan-gated feature, so this gate applies to every
project run through this skill. Note (D11, generalized to mode copies,
2026-07-05): a single-mode Semantic collection is a legal project shape on
its own — it just means the project has zero mode copies to maintain — so
this gate's mode cap is no longer, by itself, a hard blocker for D10/D11; it
remains a hard prerequisite here only because of the library-publishing
requirement above. Do **not** cite the Variables REST API as a workaround —
the pipeline explicitly rejected it as Enterprise-gated; nothing in this pack
depends on it. If no: **stop** with the same clear-explanation pattern as
§0a — this is a hard prerequisite, checked early (D23).

## 0c. Recipe selection

AskUserQuestion: which recipe to install. Today there is exactly one option,
`shadcn-tailwind-external-kit` (label it recommended/only choice, per this
skill's existing "recommended option first and labeled" convention below).
Store the choice into `design/config.json`'s new `recipe` field. Each recipe
supplies named extension points that skills dispatch to, resolving to files
installed from `templates/design/recipes/<name>/`:

- **recipe audit checks** — `design-source/tier0-recipe-checks.js`, spliced
  into `tier0-audit.js`'s injection region (Slice 2's F12 assembly)
- **recipe sync steps** — `design-source/kit.lock.example.json`/
  `kit-patches.example.json` (external-library-only), consumed by
  `figma-sync`
- **Semantic seeding** — the recipe's `README.md` states its
  `baseSource`/`codeTarget`, which downstream skills branch on
- **token writer** — `code-target/token-writer.md`, consumed by
  `figma-sync` step 7
- **upgrade flow** — `design-upgrade`'s guard clause reads `recipe`'s
  `baseSource` to decide whether the paired-upgrade flow applies at all

## 0d. Entry mode — first run, update, or re-run

Mirrors `setup-claude` §1. Read `design/config.json` first; its `_meta`
decides the mode (the design pack owns its own lifecycle state — §2a Option B
of `project-reconcile.md` — separate from `.claude/argo-config.json`, which
`setup-claude` owns):

- **Missing `design/config.json`, or present but with no `_meta` — first-run**:
  the full wizard below (§0a onward). (A `design/config.json` that predates
  `_meta` tracking is treated as `setupVersion: "0.0.0"` and falls into update
  mode below, which re-derives every managed file from what's on disk — no
  separate adoption pass.)
- **`_meta.setupVersion` older than the plugin's version — update mode**:
  diff-driven reconcile, touching ONLY files this pack manages
  (`_meta.managedFiles`), per the per-category strategy in §5a below. Never
  auto-overwrite a file whose on-disk content no longer matches what setup
  last derived (the user hand-edited it) — surface the conflict and let them
  choose keep / overwrite / merge-manually. Also run any **pending
  migrations** first (see §5a) — a stale absolute `file:` dep can break
  `bun install` before diff-derivation runs cleanly.
- **Current version — offer**: "design pack setup is current (vX.Y.Z) — re-run
  detection anyway, or exit?" via AskUserQuestion.

Never overwrite a hand-authored file in any mode. The plugin's current version
is read from its own manifest, never hardcoded.

## 1. Detect the stack

Confirm (or ask if undetectable): UI framework, components dir, existing
Storybook install (version, builder), existing Vitest install, package
manager, whether `shadcn` is already initialized (a `components.json` at
root is the tell). This mirrors `setup-claude` §2 — reuse its detection if
this project already ran that skill.

## 2. shadcn init via the shadcn MCP (D16) — default-on where possible

Mirrors the tdd-guard default-on pattern (`skills/setup-claude/SKILL.md`
§6c: detect → install default-on with a stated skip path, never silently
required):

- Detect whether the shadcn MCP can be installed (CLI 3.0+, per the design
  doc). **Confirm the live install/registration command against current
  shadcn docs before running it** — do not invent flags (anti-spiral: this
  mirrors `skills/scaffold/SKILL.md`'s own "always confirm the current
  command against docs" rule, and the design-pack plan flags this exact gap
  as unverified, see plan §6 risk 4).
- Supported → install default-on, run `shadcn init` (CSS vars as a one-time
  seed, D19 — the generated `@theme` region supersedes them on first
  `figma-sync`, one writer thereafter).
- Unsupported → print `shadcn MCP unavailable — skipping shadcn init` and
  move on. Never install an inert fallback.
- `--no-shadcn` (or the user saying so) skips this step.

## 3. Storybook + Vitest addon — latest, triad recorded observed-good

Install the **latest** Storybook (Vite builder) and its Vitest addon —
**never hardcode a version** in this skill's own text (design doc D9/C20:
"known-good triad, not hardcoded" vs the task's own latest-tools policy).
After install, record the ACTUAL resulting versions
(`storybook`/`vitestAddon`/`vitest`) into `design/config.json`'s
`knownGoodTriad` — this is a recorded observation of what worked, not a
pinned recommendation. If a later bump on this host project breaks the
triad, that's a `design-upgrade`-style gated bump in the HOST project, not a
plugin-repo change (this skill does not build upgrade detection, see plan
§6 risk 2).

## 3a. Ignore `design/` in tdd-guard's config — with consent, before copying templates

If the host project has `.claude/tdd-guard/data/` (tdd-guard installed by
`setup-claude`), add `design/**` to tdd-guard's `ignorePatterns` in
`.claude/tdd-guard/data/config.json` — with consent, showing the diff, never
silently editing a file another skill already owns. Do this BEFORE §4's
template copy: without it, tdd-guard blocks every design-pack template file
this skill (and `figma-sync`/`figma-create`/`design-upgrade`) copies or
assembles into `design/` as "premature implementation" — those files are
Figma Plugin-API scripts that run only inside Figma via `use_figma` and can
never be exercised by this project's own test runner, so no failing test can
ever precede them (observed: this blocked template installation entirely in
a real host project run).

`ignorePatterns` is a deterministic glob skip evaluated before tdd-guard's
LLM validation call — not an instruction the guard's model could
misjudge or override — so it is the correct mechanism here, not tdd-guard's
free-text custom-instructions file (that file shapes *how* the model judges
a change; this is a hard bypass for files that were never meant to be judged
at all). **Custom `ignorePatterns` REPLACE tdd-guard's defaults entirely**
(per tdd-guard's own docs) — so:
- If `config.json` doesn't exist yet: create it with tdd-guard's documented
  defaults (`*.md`, `*.txt`, `*.log`, `*.json`, `*.yml`, `*.yaml`, `*.xml`,
  `*.html`, `*.css`, `*.erb`, `*.rst`) plus `design/**` appended, and
  `guardEnabled: true`.
- If `config.json` already exists: read it, and if `design/**` (or an
  equivalent pattern already covering it, e.g. `design/**/*`) isn't already
  in `ignorePatterns`, append it — preserve every other field and pattern
  verbatim, never regenerate the file from scratch.

If tdd-guard isn't installed yet, or the user declines, skip silently —
there's nothing to gate yet; the same offer recurs harmlessly on a future
`setup-design` run once tdd-guard exists.

## 4. Copy and fill design-pack templates

Copy from `${CLAUDE_PLUGIN_ROOT}/templates/design/` into the host project,
filling every `{{…}}` slot per `skills/setup-design/templates-reference.md`:
`vrt-walker/`, `spec-diff-walker/spec-diff.walker.spec-diff.js`,
`gate-wiring.md`, `config.example.json` → `design/config.json` — always.
Then assemble `tier0-audit.js` (into `design/`, so
`figma-audit`/`figma-sync`/`figma-create` read the project's own assembled
copy rather than the plugin template): replace its
`// {{RECIPE_TIER0_CHECKS}}` marker line verbatim with the chosen recipe's
`design-source/tier0-recipe-checks.js` file content (the splice point is at
module top level, so the recipe file's own `import`s survive intact) —
`design/tier0-audit.js` is the ONE assembled canonical **module** (F12/X3),
with no unresolved marker left behind. For a `baseSource: none` recipe with no
checks file, delete the marker line instead of leaving it unresolved.

**This assembled module still can't run in `use_figma`** — Figma's Plugin
API sandbox takes one self-contained script with NO module resolution, and
the assembled module's `import`s (from the vendored `figma-design-kit`/
`figma-design-kit-shadcn-tailwind` packages and the recipe's own
`./kit-patches.json`) can never resolve there. Two installed artifacts, not
one: `design/tier0-audit.js` stays the readable/diffable assembled module
(re-derived by this step and by `design-upgrade`, importable by tooling
outside the sandbox); a second, **transient, generated** file,
`design/tier0-audit.bundle.js`, is what actually gets pasted into
`use_figma` — regenerate it any time via `bundleTier0Audit` from
`${CLAUDE_PLUGIN_ROOT}/scripts/assemble-tier0-audit.mjs`, never hand-edit it.
That function shells out to `bun build --bundle --format=esm` from a temp
file inside `design/` (so the recipe's relative `./kit-patches.json` import
resolves exactly as it does from the real installed location), then
verifies the result is actually sandbox-runnable: zero `import`/`export`
statements left, and under `use_figma`'s 50,000-char cap. Bundling via the
barrel `figma-design-kit`/`figma-design-kit-shadcn-tailwind` entrypoints
pulls in `zod` (~120KB, unused by the tier-0 rules) and blows that cap —
this is why `tier0-audit.js` and `tier0-recipe-checks.js` import from the
`/tier0-rules` subpath directly, not the package root; keep it that way.
Install the
chosen recipe's remaining templates per their `templates-reference.md`
install-when conditions: `design-source/base-congruence.walker.spec-diff.js`
+ `kit-patches.example.json` + `kit.lock.example.json` (only when the
recipe's `baseSource == "external-library"`), `code-target/lint/design-lint.md`
(only when a lint config and a components dir already exist), and
`code-target/token-writer.md` (always, for whichever recipe is chosen). Ask
where each walker directory should live (offer a sane default, e.g.
`test/vrt/`, `test/spec-diff/`) if the host project has no obvious
convention.

## 4a. Seed the Semantic layer

Gated on: the chosen recipe (§0c) is `shadcn-tailwind-external-kit` (i.e.
`baseSource == "external-library"`) AND `design/config.json`'s
`figma.projectFileKey` and `recipeConfig.figma.kitLibraryFileKey` are both
filled (not still `{{…}}` placeholders). If either is unfilled: skip with a
printed note — "Semantic seeding needs both file keys configured — run
`/argo:setup-design` again once they're set, or seed manually later."

If gated in: load `figma:figma-use`, then run this **two-call pipeline**
(nothing kit-derived is ever committed — Figma variable keys are per-copy,
so a static snapshot would break on the first kit re-import):

1. Run `design-source/derive-semantic-seed.js` via `use_figma` against the
   KIT file (`recipeConfig.figma.kitLibraryFileKey`), injecting its
   `{{DERIVE_CONFIG_JSON}}` slot with the co-installed
   `design-source/semantic-seed.json`'s `derive` section verbatim. Capture
   its returned `{ colors, floats }` — this is fresh, current-copy data,
   resolved live every run.
2. Run `design-source/seed-semantic.js` via `use_figma` against the PROJECT
   file (`figma.projectFileKey`), injecting its `{{DERIVED_SEED_JSON}}` slot
   with step 1's return value verbatim (the seed's project-owned
   `primitives`/`semanticSpacing` sections are read by the script itself via
   its own `./semantic-seed.json` import, no injection needed for those).

Report the created/skipped summary verbatim to the user. This step only ever
CREATES/imports — it never deletes or renames an existing variable, so
re-running `setup-design` on an already-seeded file is always safe.

## 5. Vendor the figma-design-kit package(s) — relative dep, never an absolute plugin-cache path

`figma-design-kit` is imported **by bare name** from the spec-diff/VRT walker
test files (`spec-diff.walker.spec-diff.js`, `base-congruence.walker.spec-diff.js`,
and the assembled `tier0-audit.js`), so the host project needs it resolvable
by its own package manager — but it is **not published to a registry**
("published later if ever"). Do **NOT** add it as a `file:` dependency
pointing at `${CLAUDE_PLUGIN_ROOT}/packages/figma-design-kit`: that expands
to an **absolute, version-stamped plugin-cache path**
(`~/.claude/plugins/cache/argo/argo/<version>/packages/…`) that leaks the
local machine, is pinned to one plugin version and breaks the moment the
plugin updates and the old cache dir is garbage-collected, and does not
resolve for any other clone, machine, or contributor. This was a real
shipped bug (observed: a committed `package.json` with
`file:/Users/<name>/.claude/plugins/cache/argo/argo/0.10.1/packages/…`).

Instead **vendor** it (both packages are pure ESM, no build step) — and let
the host's shape decide WHERE and HOW, via `resolveVendorPlan` from the
`setup-migrations` package (§2f of `project-reconcile.md`). Read the host's
ROOT `package.json` (and check for a `pnpm-workspace.yaml`), then for each
package (`figma-design-kit`; plus `figma-design-kit-shadcn-tailwind` when the
recipe is `shadcn-tailwind-external-kit`, whose `tier0-recipe-checks.js`
imports from it):

- Compute `plan = resolveVendorPlan(rootPkg, pkgName, { pnpmWorkspace })`.
- **Workspace / monorepo host** (`plan.mode === 'workspace'`): copy the files
  in the package's `files` array into `<plan.packageDir>/<pkgName>` (e.g.
  `packages/figma-design-kit`, alongside any existing vendored workspace
  package like `tdd-guard-playwright`), and set the dependency to
  `plan.depSpecifier` (`"workspace:*"`) — matching the host's existing
  convention.
- **Plain single-package host** (`plan.mode === 'file'`): copy into
  `design/vendor/<pkgName>` (under `design/`, so tdd-guard's `design/**`
  ignore from §3a already covers it) and set the dependency to
  `plan.depSpecifier` (a relative `"file:./design/vendor/<pkgName>"`).

Then run the project's package-manager install so the bare `figma-design-kit`
imports resolve (`figma-design-kit`'s own `zod` installs transitively). Commit
the vendored copies — they are what make the repo portable. Record each
vendored location in `_meta.managedFiles` (§9) so update mode (§5a category c)
knows where to look.

Re-running `setup-design` (or `design-upgrade` after a kit/plugin bump)
re-vendors the copy: the vendored package and the copied templates/walkers are
a matched set, refreshed together. If/when the packages are published to a
registry, replace the vendored deps with a normal `^version` and delete the
vendored dirs.

## 5a. Update mode — per-category reconcile + migrations

When §0d selects update mode, reconcile the pack's managed surface by category
(never a blind re-copy; never clobbering user values or hand-edits):

1. **Pending migrations first.** Run `pendingMigrations(_meta.setupVersion)`
   from `setup-migrations`; for each, show its `description`, ask consent, and
   apply — the migration's `detect(pkgJson, ctx)`/`computePatch(pkgJson,
   planFor, ctx)` are pure over the parsed `package.json` (with `ctx.isWorkspace`
   from `resolveVendorPlan`), and THIS skill performs the resulting file writes
   / vendor copy (passing `resolveVendorPlan`'s result as `planFor`). Migration #1
   (`vendor-figma-design-kit-absolute-path`) fixes a project still carrying an
   absolute plugin-cache `file:` dep, and — on a workspace host — an
   off-convention relative `design/vendor` dep, converting either to
   `workspace:*`.
2. **Regenerated templates** (category a: `tier0-audit.js`, walkers, the
   `testing.md` amendment) — re-derive current content and diff against disk;
   ask per batch (≤4 files/AskUserQuestion). Skip any file whose on-disk
   content ≠ what setup last derived (hand-edited) → conflict prompt.
3. **`design/config.json`** (category b) — run `mergeConfigShape(currentShape,
   onDiskConfig)` from `design-config-merge`; write the returned `merged`
   object via `JSON.stringify` (do NOT mutate its nested values in place — a
   freshly-added key may share a reference with the template shape) and report
   `addedKeys` to the user. Existing values are preserved verbatim.
4. **Vendored dirs** (category c) — compare each vendored copy's own
   `package.json` `version` against the plugin's current
   `packages/<pkg>/package.json`; on a bump, offer a full-directory re-copy to
   the location `resolveVendorPlan` resolves for this host.
5. **Foreign-file managed edits** (category d: `package.json` deps beyond the
   migration, `.claude/tdd-guard/data/config.json`'s `ignorePatterns`) — re-run
   the idempotent §3a/§5 checks; touch only the managed portion.
6. **External Figma state** (category e) — out of scope for file reconcile:
   Semantic-layer seeding is handled by §4a, and kit/shadcn version by
   `design-upgrade` — print that one-line pointer rather than silently skipping.

## 6. Append the testing.md amendment — with consent

If the host project has a `.claude/rules/testing.md` (installed by
`setup-claude`), show the diff and ask before appending
`templates/design/testing-rule-amendment.md`'s C17 scoped-exception text —
**never silently edit a file `setup-claude` already installed.** If no
`testing.md` exists yet, offer to run `setup-claude` first, or install the
amendment as a standalone note the user can fold in manually.

## 7. Create `design/` scaffolding

Create the `design/` dir with an empty `waivers.json` → `[]` placeholder
always. Only when the chosen recipe's `baseSource == "external-library"`:
also create `kit-patches.json` (copied from the recipe's
`design-source/kit-patches.example.json`, `{}`) — leave `kit.lock` for
`figma-sync`'s first sync to populate (per `templates-reference.md`'s
`kit.lock.example.json` row). For any other `baseSource`, there is no kit
copy to track edits against — skip both files entirely. Leave `tokens.json`,
`specs/`, `screenshots/`, `story-map.json` for `figma-sync` to populate on
first sync regardless of recipe.

## 7b. Alias parity — Storybook and every walker project must resolve app code

Story files import app components, and app components import through the
host's source aliases (vite `resolve.alias` / tsconfig `paths`, e.g.
`@renderer`, `@/`). Storybook's Vite server and each Vitest browser project
are SEPARATE Vite configs that inherit none of that. Detect the host app's
aliases and mirror them into ALL of: `.storybook/main.ts` (via `viteFinal` +
`mergeConfig`), the main vitest config's `resolve.alias` (the storybook and
spec-diff projects inherit it), and the vrt config's `{{SOURCE_ALIASES}}`
slot. Missing any one of these fails only at story-run time with
`Failed to resolve import "<alias>/..."` — catch it here, not in Phase D.

## 8. Prove the pipeline with a smoke story — run it, don't offer it

The install is not done until one real component story has rendered and all
three walker layers have run against it. This is what proves the pack is
ready for `figma-to-code` to start writing components and tests.

1. **Pick a smoke component**: the vendored base library's simplest component
   (e.g. shadcn `Button`) or, under `baseSource: none`, any existing small
   presentational component. Only if the project has zero renderable
   components, create a trivial one for this purpose.
2. **Write its `.stories.tsx`** next to it (2–3 variants, plain args). This
   story is a permanent installed artifact — record it in `_meta.managedFiles`;
   it later doubles as the base-congruence smoke story.
3. **Run all three layers and require these exact outcomes:**
   - storybook project (`vitest run --project storybook`): every story test
     PASSES — a real browser render of the component.
   - spec-diff project: dormant todo-pass (`N todo`), NOT `No test found in
     suite` failures — that error means the walkers predate the empty-suite
     guard; re-derive them from the current templates.
   - `test:vrt`: dormant todo-pass the same way.
4. **Known first-run flake:** immediately after a Storybook cache clear or
   config change, the storybook project can fail once with `Failed to fetch
   dynamically imported module … sb-vitest/deps/…` (Vite dep-optimizer race).
   Re-run once before diagnosing anything.

Separately, offer to run `/argo:figma-audit` as a Figma-side smoke check —
never run that one silently; the user may not have a Figma file connected
yet.

## 9. Report — and stamp `_meta`

**Before reporting**, write the design pack's lifecycle state into
`design/config.json`'s `_meta` (§2a Option B — mirrors `setup-claude` §9, but
in the design pack's own file, never `argo-config.json`):
- `_meta.setupVersion` ← the plugin's CURRENT version (read from the plugin's
  own `.claude-plugin/plugin.json`, never hardcoded).
- `_meta.managedFiles` ← every path this run wrote or updated: the assembled
  `design/tier0-audit.js`, the walker paths chosen in §4, `design/config.json`
  itself, the vendored package dirs at their resolved locations (`packages/<pkg>`
  or `design/vendor/<pkg>`, per §5), and `design/waivers.json`/`kit-patches.json`
  if created. Update mode (§5a) may touch only these.
  In **update mode**, merge this list with the existing `managedFiles` rather
  than replacing it, so a file installed by an earlier run under a different
  path isn't orphaned.

Then list exactly what was written/installed where (mirrors `setup-claude` §9):
shadcn init result, Storybook/Vitest versions recorded, every template
copied + its fill values, the vendored packages + their resolved locations and
dep specifier (`workspace:*` vs relative `file:`), whether the testing.md
amendment landed, whether tdd-guard's `ignorePatterns` was updated, the
`design/` scaffolding created, and (in update mode) the migrations applied +
`design/config.json` `addedKeys`. Verified by manual dry-run against a scratch
project only — no host project lives in this repo to install into for real.
