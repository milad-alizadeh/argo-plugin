---
name: setup-design
description: Install/adapt the Figma-to-code design pack into a host project — shadcn init, Storybook + Vitest addon, VRT/spec-diff walker shims, gate wiring, lint rule, the app's design.<app> block in .claude/argo.json (the kit design modules resolve via @argohq/kit). Use when the user says "set up design", "install the design pack", "wire up Figma-to-code", or when init's recommendations pass mentions it.
---

# Set Up the Design Pack

Installs/adapts the whole Figma-to-code design pack, mirroring `init`'s
wizard shape: AskUserQuestion batches, propose-don't-impose, per-item consent.
All design-pack config and lifecycle state lives in **`.claude/argo.json`'s
`design.<app>` block** (the block `init` seeded inert; single-repo apps use
the `"."` key, monorepo apps their app-dir key — this skill fills ONE app's
block per run and asks which app first in a monorepo). See
`skills/setup-design/templates-reference.md` for the exact `{{…}}` slot ↔
`design.<app>` field mapping for every template this skill copies.

## 0. Wizard UX

Same rules as `init` §0: batch related decisions into one
AskUserQuestion call (up to 4 per screen), recommended option first and
labeled, free-form via "Other", prose only for the opening one-liner and the
final report.

## 0a. Are you using Figma?

AskUserQuestion, single question: "Does this project use Figma as its design
source of truth?" If no: **stop** — explain in one paragraph that this pack
is a Figma-to-code pipeline (tier-0 hygiene audit, spec-diff/VRT gates,
figma-sync artifacts) and doesn't apply without Figma. Never force Figma onto a project that
doesn't use it.

## 0b. Professional plan or higher?

AskUserQuestion, single question: "Is this Figma file on a Professional plan
or higher?" **Why this gate exists (F10):** below Professional, variable
collections are capped at **one mode**, and the starter model's theming IS
modes on the design file's own local Semantic collection — a multi-theme
project cannot work below Professional. Note: a single-mode Semantic collection is a legal project shape on its
own, so a deliberately single-theme project may proceed on a lower plan
with that limitation stated plainly; for anything multi-theme this is a
hard stop (D23). Do **not** cite
the Variables REST API as a workaround — the pipeline explicitly rejected it
as Enterprise-gated; nothing in this pack depends on it. Do **not** propose
consuming the starter as a subscribed team library either — Figma cannot
theme a subscribed library below Enterprise, which is exactly why the model
is a duplicated single file with local variables.

## 0c. Recipe selection

AskUserQuestion: which recipe to install. Today there is exactly one option,
`shadcn-tailwind` (label it recommended/only choice, per this skill's
existing "recommended option first and labeled" convention below). The
recipe ID matches its kit subpath (`@argohq/kit/design-kit/shadcn-tailwind`);
its template directory is explicitly mapped:
`shadcn-tailwind` → `templates/design/recipes/shadcn-tailwind/`.
Store the choice into the app's `design.<app>.recipe` field in
`.claude/argo.json`. Each recipe supplies named extension points that skills
dispatch to, resolving to files installed from the mapped
`templates/design/recipes/<dir>/`:

- **recipe audit checks** — `@argohq/kit/design-kit/<recipe>/tier0-walker`
  (e.g. `shadcn-tailwind`'s), baked into the audit bundle by import at
  `bundle-tier0-audit` time (kit-extraction restructure — no longer a
  template installed/spliced into this project)
- **token writer** — `code-target/token-writer.md`, consumed by
  `figma-sync` step 7
- **upgrade flow** — the recipe's `README.md` states its design source and
  `codeTarget`, which `design-upgrade`'s starter-refresh flow reads

## 0c-i. The design file — duplicate the starter (manual)

The recipe's design source is the **single-file starter**: one maintained
Figma starter file carrying all shadcn-mirror components, the Lucide icon
set, and ALL variables LOCAL (theme = modes on the file's own Semantic
collection). Each project gets its own **duplicate** of that file — the
duplicate is the project's design file, where its design system and screens
live.

**The Figma API cannot duplicate a file**, so this is a manual step: tell
the user to duplicate the starter in the Figma UI (open the starter →
`⌘/Ctrl` file menu → Duplicate, or right-click → Duplicate from the file
browser), rename the duplicate for the project, and paste the new file's
URL back. **Wait for the key — do not proceed without it.**

AskUserQuestion (free-text via "Other" for each), capturing the file keys
that skills read from the app's `design.<app>` block:

- **Project file** → `figma.projectFileKey`. The duplicate created above —
  never the starter itself (projects must not edit the shared starter).
- **Starter file** → `figma.starterFileKey` (optional, provenance only). The
  starter the duplicate came from — recorded so `design-upgrade`'s starter
  refresh knows where deltas come from; no skill binds through it at
  runtime.
- **Wireframe kit** → `figma.wireframeKitFileKey` (optional). A lo-fi wireframe
  component library `figma-wireframe` instances from, so wireframes come out
  rough and consistent instead of hand-drawn hi-fi greyscale. Recommend a kit
  with real components + variants (an in-house one, or a community kit like
  IMPAKT / Wireframe Kit 2.1). Skip → `figma-wireframe` falls back to
  hand-drawn greyboxes on the fixed lo-fi palette.

Accept a full `figma.com/file/<KEY>/…` or `figma.com/design/<KEY>/…` URL and
parse the `<KEY>` segment out — store the bare key, never the whole URL. For
cross-file instancing to work, the wireframe kit must be **published as a team
library** (Professional plan); note this to the user if they add a kit key.

## 0d. Entry mode — first run or re-run

Mirrors `init` §1. Read the target app's `design.<app>` block in
`.claude/argo.json` first (`init` owns the file itself and seeds inert `{}`
blocks):

- **No `recipe` in the block (init-seeded inert `{}`, or block missing) —
  first-run**: the full wizard below (§0a onward). A legacy
  `design/config.json` is NOT read or migrated — no-legacy ruling: a pre-kit
  project rips and re-inits.
- **`recipe` already present — re-run offer**: "the design pack is already set
  up for this app — re-run detection anyway (re-derive the shims/config), or
  exit?" via AskUserQuestion. There is no version-comparison / migration mode:
  the deterministic logic lives in the versioned `@argohq/kit`, so the files
  this pack writes are static suggestions, never reconciled against a plugin
  version.

Never overwrite a hand-authored file in any mode.

## 1. Detect the stack

Confirm (or ask if undetectable): UI framework, components dir, existing
Storybook install (version, builder), existing Vitest install, package
manager, whether `shadcn` is already initialized (a `components.json` at
root is the tell). This mirrors `init` §2 — reuse its detection if
this project already ran that skill.

## 2. shadcn init via the shadcn MCP (D16) — default-on where possible

Mirrors the tdd-guard default-on pattern (`skills/init/SKILL.md`
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
(`storybook`/`vitestAddon`/`vitest`) into the app's
`design.<app>.knownGoodTriad` — this is a recorded observation of what worked, not a
pinned recommendation. If a later bump on this host project breaks the
triad, that's a `design-upgrade`-style gated bump in the HOST project, not a
plugin-repo change (this skill does not build upgrade detection, see plan
§6 risk 2).

## 3a. Ignore `design/` in tdd-guard's config — with consent, before copying templates

If the host project has `.claude/tdd-guard/data/` (tdd-guard installed by
`init`), add `design/**` to tdd-guard's `ignorePatterns` in
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

Fill the app's `design.<app>` block in `.claude/argo.json` from
`config.example.json` (the block-shape reference — merge its keys into the
existing block, never replace the block wholesale; `root`/`componentsPath`
may already be set by init). Then copy templates from
`${CLAUDE_PLUGIN_ROOT}/templates/design/` into the host project, filling
every `{{…}}` slot per `skills/setup-design/templates-reference.md`:
`gate-wiring.md` — always; the walker shims preferably by running
`argo design emit-shims` (generates `test/spec-diff/` + `test/vrt/` from the
block's `componentsPath`/`walkers` fields) rather than hand-filling the
`vrt-walker/`/`spec-diff-walker/` templates — the vrt vitest config
(`vrt-walker/vitest.vrt.config.js`) is still copied/filled manually.
The block seeds `componentCategories` with the thin default
`["primitive", "composite"]` (design-memory-placement.md A1) — a project with
real domain groupings (e.g. argo-v2's `rail`/`controls`/`status`/
`foundation-atoms`) sets its own list here instead. Validate it with
`validateComponentCategories` from `@argohq/kit/design-kit`
before writing: a non-empty array of unique, non-empty strings, or refuse to
proceed and report why. This is the enum `figma-create`'s placement step and
`figma-audit`'s reconcile sweep both validate a category against — see
`templates/design/file-structure.md`.

**The tier-0 audit is never installed into the host project** (kit-extraction
restructure — this killed the old assemble-into-`design/tier0-audit.js`
splice model, the exact source of the drift bug that motivated the rewrite:
a kit-side fix that never reached a project's already-assembled copy).
`figma-audit` bundles it fresh, on demand, straight from `@argohq/kit` via
`argo design bundle-tier0-audit --recipe <recipe>` (wraps
`bundleTier0AuditForRecipe`) — nothing for this skill to assemble or copy
here. `config.semanticCollectionName` (filled above) and the project's own
DATA (`design/registry.json`'s composite names) still flow through
`argo design prepare-tier0-audit-options` at call time —
see figma-audit/SKILL.md for the full procedure. Install the
chosen recipe's remaining templates per their `templates-reference.md`
install-when conditions: `code-target/lint/design-lint.md`
(only when a lint config and a components dir already exist), and
`code-target/token-writer.md` (always, for whichever recipe is chosen). Ask
where each walker directory should live (offer a sane default, e.g.
`test/vrt/`, `test/spec-diff/`) if the host project has no obvious
convention.

## 4a. Variables need no seeding — the duplicate carries them

There is no Semantic-layer seeding step. The starter file ships its full
variable set LOCAL (Primitives + the Semantic collection with its theme
modes), and duplicating a file duplicates its local variables — the project
file is born fully tokenized. The committed authoring vocabulary
(`design/semantic-manifest.md`, ~60 semantic token names + purposes) is
generated by `figma-sync`'s `argo design generate-token-manifest` step from
the first token dump — point the user at `/argo:figma-sync` for that; do not
generate it here from an unsynced file.

## 5. The design-kit dep is already resolvable — nothing to vendor

The design-kit modules ship inside `@argohq/kit` (`/argo:init` placed the
`"@argohq/kit": "link:@argohq/kit"` dependency, resolvable after
`bun install`). Walker test files and the assembled `tier0-audit.js` import
the subpaths directly — `@argohq/kit/design-kit`,
`@argohq/kit/design-kit/tier0-rules`, and (for the shadcn-tailwind recipe)
`@argohq/kit/design-kit/shadcn-tailwind/tier0-rules`. There is no vendoring
step, no `resolveVendorPlan`, no `design/vendor/` dir, and never a `file:`
dependency pointing at the plugin cache. If `@argohq/kit` does not resolve
here, stop and run `/argo:init` (or `bun install`) first — do not improvise
a path dependency.

## 5a. Re-run

On a re-run (§0d), re-derive the pack's files (walker shims, the `design.<app>`
block via `mergeConfigShape` from `@argohq/kit`, the idempotent §3a/§5 foreign-file
checks) exactly as first-run does, and never overwrite a file whose on-disk
content no longer matches what setup last wrote (hand-edited) — surface the
conflict and let the user choose keep / overwrite / merge. There is no
version-driven reconcile or migration: re-running is just first-run again,
idempotent. External Figma state is out of scope here (the design file's
variables came with the starter duplicate, §4a; shadcn/starter version is
`design-upgrade`).

## 6. Append the testing.md amendment — with consent

If the host project has a `.claude/rules/testing.md` (installed by
`/argo:init`), show the diff and ask before appending
`templates/design/testing-rule-amendment.md`'s C17 scoped-exception text —
**never silently edit a file `init` already installed.** If no
`testing.md` exists yet, offer to run `/argo:init` first, or install the
amendment as a standalone note the user can fold in manually.

## 7. Create `design/` scaffolding

Create the `design/` dir with an empty `waivers.json` → `[]` placeholder
always. Leave `tokens.json`, `semantic-manifest.md`, `specs/`,
`screenshots/`, `story-map.json` for `figma-sync` to populate on first sync.

## 7b. Alias + CSS pipeline parity — Storybook and every walker project must resolve AND style app code

Story files import app components, and app components import through the
host's source aliases (vite `resolve.alias` / tsconfig `paths`, e.g.
`@renderer`, `@/`). Storybook's Vite server and each Vitest browser project
are SEPARATE Vite configs that inherit none of that. Detect the host app's
aliases and mirror them into ALL of: `.storybook/main.ts` (via `viteFinal` +
`mergeConfig`), the main vitest config's `resolve.alias` (the storybook and
spec-diff projects inherit it), and the vrt config's `{{SOURCE_ALIASES}}`
slot. Missing any one of these fails only at story-run time with
`Failed to resolve import "<alias>/..."` — catch it here, not in Phase D.

**The CSS pipeline needs the identical treatment, and its failure mode is
worse: silent, not a thrown error.** Skip it and every component renders
completely unstyled — but every story test, spec-diff todo, and VRT todo
still PASSES, because none of them assert on computed styles by default; the
walkers only prove a component mounted without throwing, not that it looks
like anything (see §8 step 6, the check that actually catches this).

This skill stays codeTarget-agnostic: it does not itself know what CSS tool
a given recipe uses or how to wire it. **The chosen recipe's own
`code-target/css-pipeline.md`** (installed alongside its other
`code-target/` templates, same dispatch pattern as `token-writer.md`) states
the concrete tool for its `codeTarget` (e.g. this pack's only current recipe,
`shadcn-tailwind`, targets Tailwind's Vite plugin), how to
detect it in the host's own bundler config, and which docs to WebSearch
before wiring it into `.storybook/main.ts`'s `viteFinal`, the vrt config's
`{{CSS_PLUGIN_IMPORT}}`/`{{CSS_PLUGIN_CALL}}` slots, and any other separate
Vite config that renders app components directly. Follow that doc here — do
not invent the plugin/config shape from training-data memory (same
anti-spiral rule this skill already applies to shadcn's install command in
§2); a future non-Tailwind recipe supplies its own doc and this section does
not change.

## 8. Prove the pipeline with a smoke story — run it, don't offer it

The install is not done until one real component story has rendered and all
three walker layers have run against it, AND it has been visually confirmed
to actually look like something — not just "the test suite is green." A
green suite proves the component mounted; it does NOT prove it's styled (see
§7b's observed CSS-pipeline gap, which every one of these tests passed
straight through). This is what proves the pack is ready for
`figma-to-code` to start writing components and tests.

1. **Pick a smoke component**: the vendored base library's simplest component
   (e.g. shadcn `Button`). Only if the project has zero renderable
   components, create a trivial one for this purpose.
2. **Write its `.stories.tsx`** next to it (2–3 variants, plain args). This
   story is a permanent installed artifact.
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
5. **Actually boot `storybook dev`** (the real dev-server command the user
   will run day to day, e.g. `bun run storybook`), poll it (`curl` the port)
   until it answers 200, and confirm it stays up — a static
   `build-storybook` alone doesn't prove the dev server itself starts cleanly
   (different code path, same config).
6. **Render the smoke story in a REAL browser and screenshot it — this is
   the step that actually catches §7b's failure mode.** Story-test passes
   and todo-pass suites are necessary but not sufficient; only a rendered
   pixel check catches "mounted but invisible." Use Playwright directly
   (`bunx playwright screenshot` or a short throwaway script — the project
   already depends on `playwright` via the VRT walker) against either the
   running dev server or a `build-storybook` static serve, navigating to
   `<url>/iframe.html?id=<story-id>&viewMode=story`:
   - **Don't rely on the `claude-in-chrome` browser tool for this** — that
     extension drives a separate Chrome instance that may not share a
     network namespace with a locally-bound dev-server port (observed:
     `localhost`/`127.0.0.1` both resolved to `chrome-error://chromewebdata/`
     while `curl` on the same host succeeded). Playwright's own bundled
     Chromium runs in-process and doesn't have this gap.
   - Take the screenshot, then **assert on computed style, not just
     "a PNG exists"**: pull the smoke component's root element via
     `page.evaluate` and check `getComputedStyle` — background-color isn't
     `rgba(0, 0, 0, 0)` (or whatever the story's variant expects), width/height
     aren't `0`, and any color/token-driven property resolves to a real value
     rather than a CSS custom-property fallback or `initial`. This is exactly
     the check that would have failed against the unstyled build in §7b's
     observed bug, where every class was present on the element but resolved
     to nothing because the stylesheet never generated the rules.
   - Compare the screenshot to what the component's variant SHOULD look like
     (e.g. a filled button has a visible fill, an outline button has a visible
     border) — a blank or unstyled render fails this step even if every
     automated assertion above passed. If it fails, this is the point to
     re-open §7b (CSS pipeline parity) before declaring the install done —
     don't report success and leave the gap for `figma-to-code` to discover
     later.

Separately, offer to run `/argo:figma-audit` as a Figma-side smoke check —
never run that one silently; the user may not have a Figma file connected
yet.

## 9. Report

There is no `_meta` lifecycle state to stamp — the files this pack writes are
static suggestions, not artifacts reconciled against a plugin version.

List exactly what was written/installed where (mirrors `init` §9): shadcn init
result, Storybook/Vitest versions recorded, every template copied + its fill
values, whether the testing.md amendment landed, whether tdd-guard's
`ignorePatterns` was updated, the `design/` scaffolding created, and (on a
re-run) the design block's `addedKeys` from `mergeConfigShape`. Verified by
manual dry-run against a scratch project only — no host project lives in this
repo to install into for real.
