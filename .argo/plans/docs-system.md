---
status: queued
updated: 2026-07-10
---

# Plan: docs-system

Source design: `.argo/design/docs-system.md` (agreed, ready for planner — read
first, not re-litigated here; includes §1b marketing landing page and §1c
theme sync, added after the first pass of this plan).

## Context (grounded in the real repo)

- **Repo shape today:** root `package.json` (`/Users/milad/Developer/argo-plugin/package.json`)
  has `"workspaces": ["packages/*"]` only — **no `apps/*` yet, no `turbo.json`,
  no `.github/workflows/`, no `.argo/plans/` directory, no `.argo/config.json`**.
  This is the plugin repo's first plan and first apps-workspace member. All of
  those are new.
- **Playbook CLI** — `argo playbook diagram <name>`:
  `packages/toolkit/src/core/cli/playbook-diagram.ts:7` (`playbookDiagram`)
  resolves `getPlaybook(name)` from `packages/toolkit/src/core/spec.ts:103`
  and renders via `renderPlaybookDiagram` (`packages/toolkit/src/core/diagram.ts:25`),
  which emits a `flowchart TD` mermaid string (stage nodes labeled
  `[FRESH]`/`[WARM]`, gate labels on edges, retry/fix-round self-loops — never
  a runtime-decision diamond, per `diagram.ts:9-13`). Invoked via
  `packages/toolkit/bin/argo.js:236-238`:
  `argo playbook diagram --name <name>` prints the mermaid text to stdout.
- **Playbook registry coverage — confirmed narrow.** `registerPlaybook` is
  called only from `packages/toolkit/src/packs/design/playbooks/*.ts`
  (`screen-create`, `screen-edit`, `component-create`, `component-edit`,
  `design-to-code`, `code-to-design` — six specs, all in the `design` pack,
  wired through `packages/toolkit/src/register-installed-packs.ts:19-23`).
  `argo playbook list --json` (`packages/toolkit/src/core/cli/playbook-list.ts`)
  enumerates exactly these six. **No code-pack playbooks are registered** —
  `grill-me`, `write-prd`, `test-first`, `build-plan`, `session-handoff`,
  `root-cause`, `finish-branch`, `author-skill`, `scaffold`, `spike`,
  `orchestrate`, `resolve-comments`, `figma-audit`, `figma-sync`,
  `setup-design`, `init` (16 of the 21 skills under `skills/*/SKILL.md`) have
  **no spec in the registry and cannot render via `argo playbook diagram`.**
  This settles the design doc's first open risk (§ Open risks below).
- **Skills** — 21 `skills/*/SKILL.md` files (confirmed via Grep), each with
  YAML frontmatter `name:` + `description:` (e.g.
  `skills/session-handoff/SKILL.md:1-4`, `skills/spike/SKILL.md:3`). The
  `description` field doubles as the "when to use" trigger text — reference
  pages generate directly from this frontmatter.
- **Agents** — 12 files under `agents/*.md` (`scaffolder.md`, `reviewer.md`,
  `product.md`, `planner.md`, `integrator.md`, `designer.md`, `debugger.md`,
  `builder.md`, `auditor.md`, `_operator-protocol.md`,
  `fidelity-verifier.md`, `design-verifier.md`). `_operator-protocol.md` is a
  shared include block (`<!-- INCLUDE: agents/_operator-protocol.md -->` in
  `agents/integrator.md:12`), not a standalone role — exclude it from the
  agent reference generator.
- **Existing mermaid** — only two files carry diagrams today:
  `README.md:20-74` (pipeline overview) and `README.md:178-187` +
  `PIPELINE.md:13-31,88-97` (change-management flow, stage table, seam
  narrative). These are hand-maintained prose+diagram, not generated — they
  stay in repo-root README/PIPELINE (contributor-facing, off the new site
  per the design doc), but their *content* (the pipeline stages, the gate
  table) is exactly what the new site's hand-shaped "Explanation" bucket
  should draw from, not duplicate.
- **`templates/rules/`** — 7 files today (`testing.md`, `typescript-style.md`,
  `file-structure.md`, `ui-components.md`, `engineering-principles.md`,
  `dependencies.md`, `design-system.md`), each an inert template instantiated
  by `/argo:init` with `{{…}}` placeholders (`skills/init/SKILL.md:98-101`).
  `documentation-style.md` is a **new sibling file** in this same directory,
  following the same inert-template contract.
- **`skills/init/SKILL.md`** is the wizard skill (1075→ lines read in full).
  Relevant seams for the docs opt-in:
  - §0 "Wizard UX": AskUserQuestion, batched screens, recommended-first —
    the docs opt-in questions follow this exact pattern.
  - §2 "Detect the stack": where existing-docs detection belongs (alongside
    the other stack-evidence gathering).
  - §5 "Install adapted rules": where `documentation-style.md` gets
    instantiated + `argo rules record` called, identical to the six existing
    rules.
  - §6d "Run `argo init`": the deterministic CLI call
    (`node "${CLAUDE_PLUGIN_ROOT}/packages/toolkit/bin/argo.js" init --host-root <root>`)
    that seeds `.argo/config.json`'s skeleton — the `"docs"` field's
    machine-write path is the CLI (kit), matching how `landing`/`noPlaybook`
    are seeded then finalized by the skill in §9.
  - §9 "Finalize `.argo/config.json`": where `"docs": {...}` gets written by
    the skill after the CLI seeds the skeleton — same pattern as `landing`
    and `noPlaybook`.
- **`.argo/config.json` schema** — confirmed **does not exist yet** in
  argo-plugin (`Glob .argo/config.json` → no match; `Glob .argo/*` → no
  match at all beyond `audit-pending/`). The shape is documented in
  `skills/init/SKILL.md:450-456` (`landing`, `noPlaybook`, `design`) — the
  `"docs"` field is a new sibling key on the same object, written the same
  way.
- **Integrator's existing doc-sync claim** — `agents/integrator.md:75-89`
  (STEPS item 1, "Docs sync"): today it's a **prose instruction** ("update the
  existing doc surfaces in place... treat those pages as part of this sync
  too... diagrams are curated abstractions, not auto-generated from source,
  so update them by hand"). This plan's manifest mechanism (§5 below)
  augments — not replaces — that instruction: prose pages stay hand-curated
  by the integrator exactly as today; the manifest only changes *how* the
  integrator decides whether to touch a given AI-owned prose page.
- **argo-v2's `apps/docs`** (reference implementation, different repo —
  copied from, not modified): `astro.config.mjs` — Starlight + `rehype-mermaid`
  (`strategy: 'inline-svg'`, dark theme, `flowchart.htmlLabels: false` to
  avoid clipped labels), 5-section sidebar each `autogenerate`d from a content
  folder (`start-here`, `guides`, `how-it-works`, `reference`, `releases`).
  `package.json` scripts: `dev`, `build` (`astro check && astro build`),
  `typecheck` (`astro check`), `lint` (`eslint --cache .`), `format`
  (`prettier --write .`), **`check-links`**
  (`astro build && linkinator ./dist --recurse`) — uses `linkinator`, not a
  hand-rolled crawler. Deps: `@astrojs/starlight`, `astro`, `playwright`
  (headless browser for mermaid SSR), `rehype-mermaid`, `sharp`; devDeps:
  `@astrojs/check`, `eslint`, `eslint-plugin-astro`, `linkinator`, `prettier`,
  `prettier-plugin-astro`, `typescript`. No GitHub Pages CI workflow exists
  in argo-v2 either (`Glob .github/workflows/*.yml` → no match in either
  repo) — the deploy workflow in this plan has no in-repo precedent to copy
  and is written from scratch against the standard
  `actions/deploy-pages`/`actions/upload-pages-artifact` pattern.
- **Design doc §1b (marketing landing page) — grounded against Starlight's
  own `template: splash` frontmatter option**, which the argo-v2 site does
  NOT currently use (its `index.mdx` is a normal docs-style page, not a
  splash template) — this is new usage in this plan, not a copy of an
  existing pattern. Starlight's splash template is a documented frontmatter
  value (`template: splash`) on a page's frontmatter, not a separate Astro
  route — confirming the design doc's "one Astro build, one Pages deploy"
  claim is mechanically correct: the landing page is `src/content/docs/index.mdx`
  with `template: splash` in its frontmatter, and the guide nav
  (`start-here`/`guides`/`how-it-works`/`reference`) sits alongside it in the
  same `astro build`.
- **Design doc §1c (theme sync) — grounded against the actual argo-v2 source
  file**: `/Users/milad/Developer/argo-v2/apps/desktop/src/renderer/src/assets/base.css`.
  Confirmed structure:
  - Line 1-2 file header: `/* shadcn base-nova style seed (one-time — D19):
    the generated Semantic @theme region from figma-sync supersedes these
    vars once seeded. */` — an explicit signal that this file carries TWO
    generations of tokens.
  - **`@theme static { ... }` block, lines 25-135** — the argo brand
    vocabulary (`--color-slate`, `--color-graphite`, `--color-border-ui`,
    `--color-cloud`/`--color-mist`/`--color-steel`, the status-color ramp,
    glass-surface tokens, the micro type scale, terminal theme vars). This
    is **the correct extraction target** — it is the "argo-v2 palette" the
    design doc names (slate `#151c2b` at line 27, confirmed literal match;
    cloud/mist/steel blues at lines 32-34; status accents at lines 43-49).
  - **NOT the target: lines 162-224 and 352-415** — two `BEGIN GENERATED —
    figma-sync (D19), Semantic ("mode") collection` regions (light mode
    inside a bare `:root {}` at lines 162-224, dark mode inside `.dark {}`
    at lines 352-415). These are shadcn/Figma semantic tokens
    (`--background`, `--card`, `--sidebar-primary`, etc.) generated by
    argo-v2's own `figma-sync` pipeline for its shadcn component layer —
    unrelated to the "argo-v2 palette" the design doc describes, and mixing
    them in would pull shadcn-generic tokens into the plugin docs site's
    theme, plus create false coupling to a completely different generator.
    The extractor must slice out lines 25-135 (the `@theme static` block
    only) and stop there.
  - Also NOT the target: the `:root { --ev-c-* }` electron-vite boilerplate
    (137-160) and the plain `:root { --color-background: var(--ev-c-black)
    ... }` remap (227-233) — Electron/Vite scaffold leftovers, not design
    tokens.
- **No existing cross-repo sync script precedent** in either repo — but
  `argo graph refresh` (`packages/toolkit/src/cli/graph-refresh.ts`, wired
  as `argo graph refresh` in `packages/toolkit/bin/argo.js`) is the
  **directly analogous existing pattern** the design doc names ("the
  graphify-refresh pattern"): single-writer, on-device only, checks
  preconditions and returns a `{ skipped: reason }` shape rather than
  throwing when a precondition isn't met (e.g. `{ skipped:
  'graphify-not-installed' }`, `{ skipped: 'not-on-main' }`), shells out to
  `git`/other CLIs via `spawnSync`, and is unit-tested
  (`graph-refresh.test.ts` exists alongside it). This is the concrete
  precedent Slice B's CLI-subcommand recommendation follows.

## Approach

No architect panel needed — this is a mechanical build-out of an already-agreed
design (numbered decisions, no open module-boundary choice left for the
planner). Three ambiguities are load-bearing enough to resolve explicitly
before sequencing (all below); none changes slice ordering, so no user gate
is needed to proceed.

**Vale vs JS word-list — recommendation: start with a JS word-list lint,
defer Vale.** Vale is a separate Go binary with no npm packaging; every CI
runner needs it installed via a GitHub Action step (`errata-ai/vale-action`)
and every contributor who wants local pre-commit parity needs the binary on
PATH — a second toolchain for a project whose forbidden-list (§4 of the
design doc) is ~10 literal phrases plus "em dash" and "uniform bullet
structure" (the last one Vale can't check well anyway — it's a style
regex tool, not a structure linter). A ~40-line Node script
(`apps/docs/scripts/lint-docs-style.mjs`) that greps committed markdown for
the literal forbidden phrases is: (a) zero new toolchain, (b) trivially
run in the same CI job as `check-links`, (c) trivially run locally via
`bun run lint:docs-style`, (d) easy to extend as the forbidden-list grows.
Vale's value (weighted style scoring, existing style packages) doesn't pay
for its ops cost at this list's current size. Revisit Vale only if the
forbidden-list grows past what a flat word match usefully catches (e.g.
sentence-structure heuristics) — note this as a follow-up, not blocking.

**Doc-sync prompt viability in hands-off integrator context — recommendation:
auto-update AI-owned pages, skip (never prompt) human-owned/edited ones in
the integrator; build the interactive prompt as a separate, explicitly
human-invoked command.** The integrator already runs non-interactively in
`/argo:build-plan`'s worktree and in bare-terminal invocations — it has no
reliable channel to block on a yes/no from a human mid-run (unlike
`/argo:init`'s AskUserQuestion wizard, which is always interactive by
construction). So: hash matches → the integrator regenerates silently (safe,
no human input lost). Hash differs → the integrator does NOT prompt; it
treats the page as human-owned, skips it silently, and names every skipped
page in its final report so a human sees "these pages weren't touched,
edited elsewhere." The interactive "refresh this page with AI?" flow the
design doc's §5 describes is real and IS built in this plan (Slice 5b,
promoted from a deferred note to a full slice per the coordinator's
direction) — as a separate, explicitly-invoked command
(`/argo:docs-refresh`, recommended below), never smuggled into the
integrator's automatic per-landing step. This keeps the integrator's
existing contract (never blocks on a human mid-run) intact while still
shipping the interactive flow the design calls for.

**Interactive refresh command — skill (`/argo:docs-refresh`) vs `argo` CLI
subcommand — recommendation: a thin skill that calls into the SAME manifest
module the integrator uses, not a new CLI verb.** The manifest
read/write/compare logic (`docs-manifest.mjs`, Slice 5) is plain
project-local Node — it has no cross-repo auth, no git-commit orchestration,
and no reuse case outside a single project's own `apps/docs` (unlike Slice
B's theme sync, which is genuinely cross-repo and machine-global — the
`argo graph refresh` precedent). What the interactive step needs beyond the
manifold module is **the yes/no prompt itself and the "regenerate this ONE
page under the style rule" LLM call** — both of which are natural Claude
Code skill primitives (AskUserQuestion, an LLM completion against the style
rule), not shell/CLI primitives. A CLI subcommand would have to either skip
the interactive part (defeating the point) or reimplement a prompt loop in
Node, duplicating what AskUserQuestion already does natively. So: build
`skills/docs-refresh/SKILL.md` (new skill, `/argo:docs-refresh`), which
imports/`node -e`-calls `docs-manifest.mjs`'s pure functions for the
diffing, then drives the human-facing yes/no loop and the regeneration
itself as an ordinary skill turn. This mirrors how `/argo:init` already
combines a deterministic CLI half (`argo init`) with a skill-owned
interactive half — same split, applied here.

**Diátaxis seed-prose depth — recommendation: full first-draft prose, not
stubs, generated once at `/argo:init`'s docs opt-in (or at this plugin's own
`apps/docs` initial build), scoped to what the design doc's tutorials/how-tos/
explanations enumerate exactly** (§2 of the design doc: "get argo running,
first gated build end to end" / "the pipeline, the gates, the trust model" /
"set up design, resolve Figma comments, hand off a branch") — no more, no
fewer pages. Stubs would ship a site nobody trusts (bunch of "TODO" pages);
full first-draft prose, immediately editable, matches "generated once, then
owned" from the design (§3). Cost is bounded because the page count is
enumerated, not open-ended.

**Theme sync — plain node script in `apps/docs` vs `argo` CLI subcommand in
`@argohq/toolkit` — recommendation: an `argo` CLI subcommand
(`argo docs sync-theme`), following the exact `argo graph refresh` pattern.**
Reasons:
- **Precedent match is exact.** `argo graph refresh` is already "an
  on-device, single-writer, cross-tool sync script gated by preconditions,
  shelling out via `spawnSync`, unit-tested" — theme sync is the same shape
  (single writer, on-device `gh`/git auth, precondition-gated, writes one
  committed generated file). Two near-identical scripts living in different
  places (one a kit CLI verb, one a bare `apps/docs/scripts/*.mjs`) would
  violate this repo's own "one source of truth for a pattern" principle —
  a future maintainer looking for "how does argo do on-device sync scripts"
  should find one answer, not two.
- **Reusable beyond this plugin's own docs.** The design doc's theme-mirror
  problem is not unique to `apps/docs` — any future argo surface that wants
  the argo-v2 palette (another docs site, a generated Figma library preview,
  a CLI-rendered terminal theme) benefits from a stable, testable
  `argo docs sync-theme` verb rather than a script duplicated per consumer.
- **Testability matches the kit's own convention.** `graph-refresh.ts`
  separates pure logic (`discoverWorkspaces`, `pruneDatedBackups`) from the
  `spawnSync` shell-outs, and is unit-tested via `graph-refresh.test.ts`.
  The theme extractor (`@theme static { ... }` slice-out, CSS-block
  parsing) is exactly the kind of pure, easily-misgrounded logic (see the
  "NOT the target" note above) that benefits from the same
  test-the-pure-function-directly structure — a bare script in `apps/docs`
  would have no natural test harness (no `vitest` wired there today; adding
  one just for this script duplicates what `packages/toolkit` already has).
- **Cost is low.** It is a thin new file
  (`packages/toolkit/src/cli/docs-sync-theme.ts` + a `case 'docs':` /
  `sync-theme` verb in `bin/argo.js`, mirroring the existing `case 'graph':`
  wiring) — not a new subsystem.
- Rejected: a plain `apps/docs/scripts/sync-theme.mjs` — cheaper to write
  today, but duplicates the graph-refresh pattern in a second location with
  no test harness, and stops being reusable the moment a second consumer
  wants the same tokens.

## File layout

```
apps/docs/                                  # NEW workspace (argo-plugin's own docs site)
  package.json
  astro.config.mjs
  tsconfig.json
  eslint.config.mjs
  .prettierrc.yaml
  .gitignore
  public/
    favicon.svg
  src/
    content.config.ts
    content/docs/
      index.mdx                             # NEW — marketing landing page, `template: splash` frontmatter (Slice A)
      start-here/
        what-is-argo.md                     # tutorial (hand-shaped prose)
        install-and-first-run.md            # tutorial
        your-first-gated-build.md           # tutorial
      how-it-works/
        the-pipeline.md                     # explanation
        the-gates.md                        # explanation
        the-trust-model.md                  # explanation
      guides/
        set-up-design.md                    # how-to
        resolve-figma-comments.md           # how-to
        hand-off-a-branch.md                # how-to
      reference/
        playbooks/                          # GENERATED — one page per registered playbook
          <slug>.md
        skills/                             # GENERATED — one page per skills/*/SKILL.md
          <slug>.md
        agents/                             # GENERATED — one page per agents/*.md (excl. _operator-protocol.md)
          <slug>.md
        cli.md                              # GENERATED — argo CLI command reference
        config-schema.md                    # GENERATED — .argo/config.json field reference
    components/
      Hero.astro                            # NEW (Slice A) — landing hero, frontend-design-skill-authored
      FeatureBlock.astro                    # NEW (Slice A) — one of the 4 "batteries" blocks
    styles/
      mermaid-zoom.css                      # copied from argo-v2 apps/docs/src/styles
      argo-theme.generated.css              # NEW (Slice B) — generated, "do not edit" header, argo-v2 palette
  scripts/
    generate-reference.mjs                  # build-time generator, runs pre-build
    lint-docs-style.mjs                     # forbidden-word-list CI lint
    docs-manifest.mjs                       # NEW (Slice 5) — hash-manifest read/write/compare, shared by integrator instructions and docs-refresh skill
  README.md

.github/workflows/
  docs-deploy.yml                           # NEW — GitHub Pages CI for apps/docs

templates/rules/
  documentation-style.md                    # NEW — inert template, installed by /argo:init

skills/
  docs-refresh/
    SKILL.md                                # NEW (Slice 5b) — /argo:docs-refresh, interactive edited-page refresh

.argo/
  docs-manifest.json                        # NEW — hash manifest for AI-owned prose pages (this repo's own docs)

packages/toolkit/src/core/cli/
  config-schema.ts                          # NEW — single source of truth for .argo/config.json's documented shape (reference/config-schema.md generates from this, not from hand-copied prose)
  config-schema.test.ts                     # NEW

packages/toolkit/src/cli/
  docs-sync-theme.ts                        # NEW (Slice B) — `argo docs sync-theme`, mirrors graph-refresh.ts's shape
  docs-sync-theme.test.ts                   # NEW (Slice B)

packages/toolkit/bin/argo.js                # MODIFIED (Slice B) — new `case 'docs':` verb dispatch, mirrors existing `case 'graph':`

skills/init/SKILL.md                        # MODIFIED — add docs opt-in step (§6 of design doc)
```

## Files to change

- `package.json` (repo root) — add `"apps/*"` to `workspaces`.
- `apps/docs/*` — new Starlight site (see layout above), copied-and-adapted
  from `/Users/milad/Developer/argo-v2/apps/docs` (astro.config.mjs,
  package.json script names, mermaid-zoom styling) — never edit the argo-v2
  copy, this is a fresh instance in this repo.
- `apps/docs/src/content/docs/index.mdx` — new, `template: splash` landing
  page (Slice A).
- `apps/docs/src/components/Hero.astro`, `FeatureBlock.astro` — new,
  frontend-design-skill-authored (Slice A).
- `apps/docs/src/styles/argo-theme.generated.css` — new, machine-written by
  `argo docs sync-theme` (Slice B); never hand-edited (enforced by a header
  comment, same convention as `base.css`'s own `BEGIN/END GENERATED`
  markers).
- `.github/workflows/docs-deploy.yml` — new GitHub Pages deploy workflow,
  triggered on push to `main` touching `apps/docs/**`.
- `templates/rules/documentation-style.md` — new inert rule template.
- `packages/toolkit/src/core/cli/config-schema.ts` (+ `.test.ts`) — small
  exported const describing every `.argo/config.json` field
  (`landing`/`noPlaybook`/`design`/`docs`) with a one-line description each;
  `reference/config-schema.md`'s generator imports this, so the schema page
  can never drift from what the CLI itself understands the config to be.
- `packages/toolkit/src/cli/docs-sync-theme.ts` (+ `.test.ts`) — new `argo
  docs sync-theme` implementation (Slice B).
- `packages/toolkit/bin/argo.js` — add `case 'docs':` → `sync-theme` verb
  dispatch (Slice B), mirroring the existing `case 'graph':` wiring pattern.
- `apps/docs/scripts/docs-manifest.mjs` — new manifest read/write/compare
  module (Slice 5), the single implementation both the integrator's
  instructions (Slice 5) and the new `/argo:docs-refresh` skill (Slice 5b)
  drive.
- `skills/docs-refresh/SKILL.md` — new skill (Slice 5b): interactive
  edited-page refresh.
- `skills/init/SKILL.md` — add a new numbered section (docs opt-in, placed
  after §6 "Gated builds" and before §7 "graphify", matching the doc's own
  ordering of concerns) covering: existing-docs detection, the
  Starlight/markdown/none AskUserQuestion, the config write, the pointer
  stub. Update §9's `.argo/config.json` example JSON to include `"docs"`.
- `apps/docs/scripts/generate-reference.mjs` — new build-time generator
  (playbooks, skills, agents, CLI, config schema pages).
- `apps/docs/scripts/lint-docs-style.mjs` — new forbidden-word-list lint.
- `.argo/docs-manifest.json` — new, written by the prose generator the first
  time it runs against this repo's own `apps/docs`.
- `README.md` — add one line pointing at the new docs site once it's live
  (mirrors argo-v2's pattern of pointing outward).

## Step-by-step work items

Ordered as vertical slices. Slice A folds into Slice 1 (same Astro build,
same Pages deploy — no separate build/deploy step). Slice B is independent
of the docs content slices and can run any time after Slice 1 exists (it
only needs `apps/docs/src/styles/` to write into) — placed after Slice 1 so
the site has somewhere to consume the generated theme file, and before
Slice 3 (prose) so the landing page and docs share the real palette from
day one rather than a placeholder. Slice 5b (interactive refresh) depends on
Slice 5's manifest module and is sequenced directly after it. A natural
checkpoint still sits after Slice 2 (mechanical reference exists and is
provably regenerable) since Slices 3-6 build on top of a working site + a
real manifest concept.

### Slice 1 — the Starlight site itself
`argo:build-plan` metadata: `testable: false` (scaffolding/config, no
behavior to red-green — verified by `astro build` succeeding, not a test
assertion), `requiresLaunch: false` (a static site build, no app launch
surface).

1. Add `"apps/*"` to root `package.json` `workspaces`.
2. Scaffold `apps/docs` via `bunx create-astro@latest --template starlight`
   (or manual copy from argo-v2's `apps/docs/package.json` +
   `astro.config.mjs`, adapting `title: 'Argo Docs'` → a plugin-appropriate
   title, e.g. `'Argo — the way of working'`, and dropping the
   private-repo social-link comment since this plugin repo's docs site is
   meant to be public per the design doc's "usable by any Claude Code
   project"). Copy `rehype-mermaid` config verbatim (same dark theme, same
   `flowchart.htmlLabels: false` fix) — it is proven working in argo-v2.
   Copy `public/mermaid-zoom.js` + `src/styles/mermaid-zoom.css` verbatim.
3. Set the sidebar to the four guide-nav sections from the file layout above
   (`start-here`, `guides`, `how-it-works`, `reference` — drop `releases`;
   the design doc's Diátaxis section (§2) does not list releases as a
   required bucket for the plugin site, so omit it — smaller sidebar, no
   dead section). The landing page (`index.mdx`, Slice A) sits outside the
   sidebar entirely, as Starlight's `template: splash` convention expects.
4. Add `apps/docs/package.json` scripts identical in shape to argo-v2's:
   `dev`, `build` (`astro check && astro build`), `typecheck`, `lint`,
   `format`, `check-links` (`astro build && linkinator ./dist --recurse`).
5. Write `.github/workflows/docs-deploy.yml`: on push to `main` with a
   `paths: ['apps/docs/**']` filter, `actions/checkout`, install bun, `bun
   install` at repo root, `bun run build` inside `apps/docs`, then
   `actions/upload-pages-artifact` + `actions/deploy-pages` (standard GitHub
   Pages Actions flow — `permissions: pages: write, id-token: write`,
   `environment: github-pages`). Enable Pages in repo settings is a one-time
   manual step outside this plan (document it in the workflow's header
   comment). One build, one deploy — Slice A's landing page and the guide
   nav both come out of this same `bun run build`; there is no separate
   marketing-site pipeline.

**Verify:** `cd apps/docs && bun install && bun run build` succeeds and
produces `dist/index.html`; `bun run check-links` reports zero broken links
on the placeholder content; the workflow YAML is valid (`actionlint
.github/workflows/docs-deploy.yml` if available, else a dry read for syntax).

### Slice A — marketing landing page
`argo:build-plan` metadata: `testable: false` — this is a design/content
slice (hero copy, layout, visual treatment), not runtime logic; there is no
behavior to red-green (no state machine, no conditional rendering logic
beyond static Astro markup). Verify by looking at the built page, not by an
assertion. `requiresLaunch: false` (static build, no app to launch — verify
via `astro preview` + a screenshot/visual check, not a launch-evidence
receipt).

6. Invoke the **frontend-design** skill to drive the hero's visual design —
   this is the explicit design lever the design doc names (§1b: "Build the
   hero with the frontend-design skill for a distinctive, non-templated
   look"). Brief it with: hero line *"Claude Code, batteries included"*,
   the trust/PRD-to-shipped-code subhead framing, dark-theme-only, edgy
   (matching the argo-v2 cockpit's aesthetic — informed by Slice B's
   palette once it lands, or the argo-v2 palette values already visible in
   `base.css:27-49` if Slice B hasn't landed yet in build order).
7. Build `src/content/docs/index.mdx` with `template: splash` frontmatter
   (Starlight's documented splash-page convention) plus the hero's headline,
   subhead, and the two CTAs: primary **"Get started"** linking to the
   tutorial entry point (`start-here/what-is-argo.md`, from Slice 3's file
   layout), secondary **"GitHub"** linking to the repo
   (`https://github.com/milad-alizadeh/argo-plugin`).
8. Build `src/components/Hero.astro` (hero layout/copy, driven by step 6's
   output) and `src/components/FeatureBlock.astro` (a single reusable
   "battery" block: icon/label + one-line description), then instantiate
   `FeatureBlock` four times on the landing page for the design doc's exact
   four blocks: **the canonical loop** (PRD → grill → plan → test-first
   build → review → land), **gates that make it trustworthy** (probity
   red-first TDD, receipt-based commit gates, deterministic design-rules
   audits), **Figma-to-code, both directions** (design system as source of
   truth, spec-diff/gestalt acceptance gates), **works with any Claude Code
   project** (project-scoped install, adapts via init, no lock-in). Source
   each block's one-line description from the same real surfaces the prose
   pages draw from (README.md's pipeline table, PIPELINE.md's gate table) —
   never invented claims.
9. Style dark-theme-only: no light/dark toggle wiring in `astro.config.mjs`
   (Starlight defaults to supporting both; explicitly disable the toggle —
   confirm the exact Starlight config key, e.g. `starlight({ ...,
   defaultLocale/... })`'s theme option, when implementing — dark-only is a
   one-line integration config, not custom CSS work).

**Verify:** `bun run build && bun run preview`, visually confirm the splash
hero renders (headline, subhead, two CTAs, four feature blocks), both CTAs
resolve to the correct targets (`Get started` → the tutorial page, `GitHub`
→ the repo URL), and no light-mode toggle appears anywhere on the page.
`bun run check-links` (Slice 1) covers the CTA link validity mechanically.

### Slice B — theme sync from argo-v2
`argo:build-plan` metadata: `testable: true` (the CSS-slice extraction logic
is pure, input→output behavior — directly unit-testable against a fixture
string shaped like `base.css`), `requiresLaunch: false`.

10. Write `packages/toolkit/src/cli/docs-sync-theme.ts`, structured like
    `graph-refresh.ts`: a precondition-gated `runDocsSyncTheme({ cwd, env })`
    that:
    - Confirms `gh` (or plain `git`) auth can reach
      `milad-alizadeh/argo-v2` (private repo) — returns
      `{ skipped: 'argo-v2-unreachable' }` rather than throwing, matching
      `graph-refresh.ts`'s `{ skipped: reason }` shape, so a machine without
      access degrades safely instead of crashing a build.
    - Fetches `apps/desktop/src/renderer/src/assets/base.css` from
      argo-v2's `main` branch (via `gh api` reading the raw file, or a
      shallow `git show origin/main:<path>` against a local clone/cache —
      implementation detail to confirm against whichever `gh`/`git`
      invocation the environment already uses for private-repo reads
      elsewhere in the kit, if any precedent exists at implementation time;
      none was found in this plan's research, so this is new plumbing,
      confirmed no simpler existing helper to reuse).
    - **Extracts exactly the `@theme static { ... }` block** — confirmed
      lines 25-135 of the current `base.css`, but the extractor must find
      the block by parsing for the `@theme static {` opener and its
      matching closing brace (never a hardcoded line range — the source
      file will drift), and must explicitly NOT match `@theme inline` or
      any `:root`/`.dark` block, per the grounding above.
    - Writes `apps/docs/src/styles/argo-theme.generated.css` with a
      "GENERATED — do not edit; regenerate via `argo docs sync-theme`"
      header comment (mirroring `base.css`'s own `BEGIN/END GENERATED`
      convention for the figma-sync region — the same visual signal this
      repo already uses).
    - Commits the generated file with a scoped pathspec commit (same
      pattern as `graph-refresh.ts`'s pathspec-scoped `git add` +
      `git commit`), only when content actually changed (diff the new
      output against the existing file first — no-op commits are noise).
11. Add `docs-sync-theme.test.ts`: unit-test the pure extraction function
    (`extractThemeStaticBlock(cssSource: string): string`) directly against
    a fixture string shaped like the real `base.css` (opener +
    representative token lines + closer, plus a decoy `@theme inline`
    block and a decoy `.dark { ... }` block in the fixture to prove the
    extractor doesn't over-match) — red-first: write the test against the
    not-yet-written function, watch it fail to import, then implement.
12. Wire `case 'docs':` → `sync-theme` verb dispatch in
    `packages/toolkit/bin/argo.js`, mirroring the existing `case 'graph':`
    block's structure (read the existing `graph` case as the shape to
    copy, confirmed present in `bin/argo.js` since `argo graph refresh` is
    real and documented in README.md's kit surface table).
13. Import `apps/docs/src/styles/argo-theme.generated.css` into
    `astro.config.mjs`'s `customCss` array (alongside `mermaid-zoom.css`,
    matching argo-v2's `customCss: ['./src/styles/mermaid-zoom.css']`
    pattern at `astro.config.mjs:81`) so the site's Tailwind-free Starlight
    theme picks up the argo-v2 palette as plain CSS custom properties (this
    docs site is Astro/Starlight, not Tailwind-driven, so the generated
    file is consumed as raw CSS custom-property definitions referenced from
    Starlight's own CSS-variable theming hooks, not as Tailwind `@theme`
    utilities — confirm the exact Starlight CSS-variable names to map onto
    at implementation time, e.g. `--sl-color-*`, by reading
    `@astrojs/starlight/style/props.css`, the same file
    `astro.config.mjs`'s inline comment at line 16 already references for
    argo-v2's dark-theme mermaid work).
14. Run `argo docs sync-theme` once for real (on-device, manual) to produce
    the initial committed `argo-theme.generated.css`, and commit it.

**Verify:** `docs-sync-theme.test.ts` green (extraction correctness against
the fixture, including the two decoy-block negative cases); running `node
packages/toolkit/bin/argo.js docs sync-theme` against this machine's real
`gh` auth produces a non-empty `argo-theme.generated.css` containing
`--color-slate: #151c2b` (a literal token confirmed present in the real
source at `base.css:27`) and NOT containing `--sidebar-primary` (a literal
token confirmed present only in the excluded figma-sync region at
`base.css:190`); `bun run build` in `apps/docs` succeeds with the generated
file imported.

### Slice 2 — mechanical reference generation
`testable: true` (the generator's output is behavior — a page must exist per
source item, content must trace to source — verified by an assertion-bearing
script, red-first), `requiresLaunch: false`.

15. Write `packages/toolkit/src/core/cli/config-schema.ts`: export a const
    array of `{ field: string; type: string; description: string }` covering
    `landing`, `noPlaybook`, `design`, `docs` (the last two fields this plan
    and setup-design already establish). Write `config-schema.test.ts`
    asserting every field the skill's §9 example JSON documents has a
    matching entry (red first: write the test against the *current*
    `skills/init/SKILL.md` §9 fields before the const exists, watch it fail,
    then add the const).
16. Write `apps/docs/scripts/generate-reference.mjs` (a Node script run
    pre-`astro build`, wired as a `bun run generate-reference && astro build`
    pipeline in `package.json`'s `build` script — update Slice 1 step 4's
    script to this two-step form). It:
    - Playbooks: shells out to `node
      <repo>/packages/toolkit/bin/argo.js playbook list --json` to enumerate
      registered specs (confirmed CLI verb, `design-verbs.js:34` lists
      `diagram` alongside `list`/`start`/`claim`/`status`/`advance`/`adopt`),
      then for each entry calls `argo playbook diagram --name <slug>`
      (`playbook-diagram.ts:7`, invoked per `bin/argo.js:236-238`) and writes
      `reference/playbooks/<slug>.md` with the mermaid fenced in a
      ```` ```mermaid ```` block plus the stage table already available from
      the `--json` output (gate/session/retries/repeat per stage).
    - Skills: globs `skills/*/SKILL.md`, parses YAML frontmatter (`name`,
      `description`), writes `reference/skills/<name>.md` with the
      description as the page's lead paragraph and a body noting whether the
      skill has a matching playbook page (cross-link when
      `getPlaybookPack`/`playbook list` shows a spec whose driving skill
      matches — see step 17's coverage note below for exactly which skills
      qualify).
    - Agents: globs `agents/*.md`, excludes `_operator-protocol.md`
      (confirmed shared-include, not a role — `agents/integrator.md:12`),
      parses the YAML frontmatter (`name`, `description`, `model`, `tools`),
      writes `reference/agents/<name>.md`.
    - CLI reference: parses `packages/toolkit/bin/argo.js`'s `case` statements
      (the same file already lists every verb per subcommand, e.g.
      `design-verbs.js:34`'s `PLAYBOOK_VERBS` array, and Slice B's new
      `docs`/`sync-theme` case) into `reference/cli.md` — one section per
      top-level command (`init`/`playbook`/`rules`/`design`/`graph`/`docs`),
      one row per verb.
    - Config schema: imports `config-schema.ts`'s const (step 15) and renders
      `reference/config-schema.md` as a table.
17. **Coverage fix for the confirmed gap** (the design doc's first open
    risk): for the 15 non-playbook-pack skills, `generate-reference.mjs`
    still emits a `reference/skills/<name>.md` page from frontmatter alone
    (no diagram) — this alone satisfies "every skill maps to *some* generated
    page." Document this explicitly on each generated skill page ("no
    playbook diagram — this skill runs as a single session, not a staged
    playbook") so the absence reads as intentional, not broken generation.
    No registry change needed; this is a generator-side distinction (has
    playbook vs frontmatter-only), not a gap to close in the kit.

**Verify:** run `generate-reference.mjs` directly (`node
apps/docs/scripts/generate-reference.mjs`) and assert (in a companion
Vitest/Node test under `apps/docs/scripts/generate-reference.test.mjs`, or a
plain assertion block the script itself runs in `--check` mode): the number
of `reference/skills/*.md` files equals the number of `skills/*/SKILL.md`
files (21); the number of `reference/agents/*.md` files equals
`agents/*.md` minus `_operator-protocol.md` (11); the number of
`reference/playbooks/*.md` files equals `argo playbook list --json`'s
entry count (6, from the design pack). Red-first: write this count-assertion
test before the generator exists (it fails — no `reference/` dir), then
build the generator to green.

**Checkpoint review here** — mechanical reference is real and self-checking
before Slices 3-6 (prose, style rule, manifest, refresh command, init
wiring) build on it.

### Slice 3 — hand-shaped prose (generated once, then owned)
`testable: false` (prose content — no assertion beyond "the file exists and
is non-empty," which the manifest step below already covers structurally),
`requiresLaunch: false`.

18. Write the 9 prose pages enumerated in the file layout's `start-here/`,
    `how-it-works/`, `guides/` folders (3+3+3 — matching the design doc's
    §2 "Diátaxis, weighted for users" scope exactly: tutorials =
    "get argo running on a real project, first gated build end to end";
    explanation = "the pipeline, the gates, the trust model"; how-to =
    "set up design, resolve Figma comments, hand off a branch"). Source
    content from README.md's pipeline section, PIPELINE.md's stage table and
    gate table, and the relevant skill/agent files — never invent behavior
    not already true of the shipped pipeline. Write under the
    `documentation-style.md` rule (Slice 4 defines it — sequence these two
    steps together in practice, the rule should exist before or alongside
    the first prose draft).
19. Record each prose page's content hash into `.argo/docs-manifest.json`
    (`{ "<path>": "<sha256-of-content>" }`) — this establishes "AI-owned as
    of now" for all 9 pages at once, the baseline the hash-comparison in
    Slice 5 diffs against.

**Verify:** `bun run check-links` (Slice 1's script) passes against the full
site including these pages; a human read-through confirms no forbidden-list
phrase appears (manual for this slice; Slice 4's lint automates it going
forward).

### Slice 4 — documentation-style.md rule + lint backstop
`testable: true` (the lint script's pass/fail on a fixture file is a real
behavioral assertion), `requiresLaunch: false`.

20. Write `templates/rules/documentation-style.md`: adopt-the-Google-style
    prose (second person, present tense, active voice, lead with the point)
    plus the exact forbidden-list from the design doc §4 (em dash — already
    covered by the existing `no-em-dashes` project convention, "delve",
    "seamless", "robust", "leverage", "ever-evolving", "it's important to
    note", "in today's world", plus the two structural notes: uniform
    bullet-and-heading structure where prose is clearer, restating the
    question). Follow the same forbidden-list authoring convention as
    `templates/rules/engineering-principles.md` (stated as a checkable
    forbidden-list, not an aspiration) — confirmed pattern, this repo's own
    rule.
21. Write `apps/docs/scripts/lint-docs-style.mjs`: reads the forbidden
    phrase list from `templates/rules/documentation-style.md` itself (parse
    a fenced list block, not a hand-duplicated array — single source of
    truth per the engineering-principles rule this repo enforces on
    itself), globs `apps/docs/src/content/docs/**/*.{md,mdx}`, and exits
    non-zero listing every `file:line` match. Add
    `"lint:docs-style": "node scripts/lint-docs-style.mjs"` to
    `apps/docs/package.json`, and add it as a step in
    `.github/workflows/docs-deploy.yml` before the build step (fails the
    workflow on a hit).
22. **Red-first for the lint:** write a fixture markdown file containing
    "delve into" and assert the script flags it (red), then confirm the
    script's real implementation makes that assertion pass (green) while
    also passing against the Slice 3 prose (no false positives).

**Verify:** `node apps/docs/scripts/lint-docs-style.mjs` exits 0 against
`apps/docs/src/content/docs/`; exits 1 with a clear message against a
fixture containing a banned phrase.

### Slice 5 — hash-manifest ownership + integrator hook
`testable: true` (the hash-compare logic is pure behavior — matches/differs
branching — directly unit-testable), `requiresLaunch: false`.

23. Write the manifest read/write/compare logic as a small exported module
    — `apps/docs/scripts/docs-manifest.mjs` (`readManifest`,
    `hashOf(content)`, `isAiOwned(path, currentContent, manifest)`,
    `recordGenerated(path, content, manifest)`, and a new
    `listEditedPages(manifest, contentDir)` that returns every manifest
    entry whose recorded hash no longer matches the on-disk file's current
    hash — the exact diff Slice 5b's interactive command needs) — pure
    functions, unit tested directly. This module is shared: the
    integrator's instructions (step 24 below) reference it conceptually,
    and Slice 5b's skill drives it directly (`node -e` or an imported
    helper) for the interactive flow.
24. Update `agents/integrator.md` STEP 1 ("Docs sync") with one additional
    paragraph: when a project's `.argo/config.json` has a `"docs"` block
    (this plan's new field) AND `.argo/docs-manifest.json` exists, the
    integrator's doc-sync **for the prose pages the manifest tracks**
    follows the auto-update/skip split from this plan's "Doc-sync prompt
    viability" recommendation above — never an interactive prompt from this
    agent. Mechanical reference pages (Slice 2's generated output) are
    always regenerated as part of doc-sync regardless of the manifest (they
    have no ownership state — they're never hand-edited by design). State
    both counts (auto-updated / skipped-as-human-owned) in the integrator's
    final report, per its existing OUTPUT contract
    (`agents/integrator.md:127-129`). Point the reader at
    `/argo:docs-refresh` (Slice 5b) as the human-invoked path to resolve
    the skipped set.

**Verify:** unit tests for `docs-manifest.mjs`'s five functions (hash
stability across identical content, `isAiOwned` true when hash matches,
false when it doesn't, manifest-missing treated as human-owned per the
design doc's safe default, `listEditedPages` returns exactly the entries
whose current on-disk hash diverges from the recorded one) — written
red-first against the function signatures before the implementation.

### Slice 5b — interactive refresh command (`/argo:docs-refresh`)
`argo:build-plan` metadata: mixed — the manifest-diffing/branch logic is
`testable: true` (pure, directly unit-testable: given a manifest + a set of
edited/unedited files, the skill's decision of what to prompt for is
assertable), the AskUserQuestion prompt flow and the LLM regeneration call
themselves are `testable: false` (interactive/generative, no deterministic
assertion — verified by exercising the skill, not a red-green test).
`requiresLaunch: false`.

25. Write `skills/docs-refresh/SKILL.md` (new skill, frontmatter `name:
    docs-refresh`, `description:` naming the trigger — "refresh AI-owned
    docs pages that a human may have edited since the last generation; use
    when the user says 'refresh the docs' / 'sync docs with AI' /
    `/argo:docs-refresh`"). Behavior:
    - Reads `.argo/docs-manifest.json` via `docs-manifest.mjs`'s
      `listEditedPages` (Slice 5, step 23) — every prose page whose current
      content hash no longer matches its recorded hash.
    - AI-owned (hash-matching) pages are explicitly OUT of scope for this
      command — they're already handled by the integrator's automatic
      auto-update (Slice 5); re-touching them here would be redundant work
      against the same manifest. State this plainly at the top of the
      skill so it's clear this command is specifically for the edited set.
    - For each edited page, one **AskUserQuestion** prompt: "`<page path>`
      was edited since it was last AI-generated. Refresh it with AI? (it
      will be regenerated under `templates/rules/documentation-style.md` /
      the project's adapted copy of it, and your edits will be
      overwritten)" — Yes / No, per-page (not a single batch confirmation,
      per the design doc's §5 "prompt-not-force" being about **which**
      pages get touched, not a blanket approve-all).
    - **Yes** → regenerate that one page's prose under the style rule
      (same generation path Slice 3 used for the initial draft — sourced
      from the same real surfaces, README/PIPELINE/skill files, never
      inventing new claims), write it, call `recordGenerated` to re-hash
      and re-record it as AI-owned in the manifest.
    - **No** → leave the file untouched; call a new `markHumanOwned(path,
      manifest)` function (add alongside Slice 5's module) that removes the
      page's entry from the manifest's "tracked as AI-owned" set (or flips
      an explicit `humanOwned: true` marker — implementation detail, either
      satisfies "stops flagging it," confirm the simpler of the two at
      implementation time) so routine doc-sync (the integrator, and this
      command's own next run) stops surfacing it.
    - Reports a final summary: pages refreshed, pages marked human-owned,
      pages left untouched pending a future run (none, by construction —
      every edited page gets a yes/no this run).
26. **Test-first for the real logic** (the diffing/branch decisions, not
    the prompt UI itself): write `docs-manifest.mjs`'s `markHumanOwned`
    function's unit test red-first (given a manifest entry and a "no"
    decision, asserts the entry is no longer reported by a future
    `listEditedPages`/`isAiOwned` call), then implement. Separately,
    exercise the skill's page-selection logic (which pages it proposes to
    prompt for) against a fixture manifest + fixture edited/unedited files
    via a small script-level test
    (`apps/docs/scripts/docs-manifest.test.mjs` extended, or a dedicated
    fixture-driven check) asserting the proposed prompt set matches
    `listEditedPages`'s output exactly — red-first against the not-yet-wired
    skill logic.
27. Cross-reference from `agents/integrator.md`'s updated STEP 1 (Slice 5,
    step 24) and from the new `templates/rules/documentation-style.md`
    (Slice 4) so both surfaces point a human at
    `/argo:docs-refresh` as the resolution path for human-edited pages —
    no dangling "a future command" language anywhere once this slice lands.

**Verify:** `docs-manifest.mjs`'s `markHumanOwned` + `listEditedPages` unit
tests green; a fixture-driven exercise of the skill's page-selection logic
matches `listEditedPages`'s output; a live manual run of
`/argo:docs-refresh` against a fixture project with one edited page and one
untouched page confirms exactly one AskUserQuestion prompt fires (for the
edited page only), and both the "yes" and "no" branches leave the manifest
in the expected state afterward (re-hashed/AI-owned vs marked human-owned).

### Slice 6 — init opt-in for consuming apps
`testable: true` (the detection + config-write behavior is directly
assertable — given a fixture project tree, the skill's decision and the
resulting `.argo/config.json` content are checkable), `requiresLaunch: false`.

28. Add a new numbered section to `skills/init/SKILL.md` (between §6
    "Gated builds" and §7 "graphify" — matching the doc's existing
    ordering, docs is a project-facing setup concern like the gated-build
    wiring, not a code-intelligence tool like graphify/context-mode which
    follow it): "**6f. Human-facing docs opt-in**":
    - **Detect first:** an existing docs site (`astro.config.*` +
      `@astrojs/starlight` dependency) or a `docs/` directory tree with
      markdown content → offer **keep-up-to-date mode**: write
      `.argo/config.json`'s `"docs"` field pointing at what's there
      (`{ "mode": "starlight" | "markdown", "path": "<detected-path>" }`),
      do not scaffold anything, do not seed a manifest against content this
      skill didn't generate (manifest starts empty; nothing gets flagged as
      AI-owned until a future doc-generation pass explicitly writes to it).
    - **Otherwise, one AskUserQuestion** (batched per §0's UX rules,
      recommended-first): "Human-facing docs for this project? Starlight
      site (recommended for a UI-facing product) / plain markdown / none."
    - Starlight choice → scaffold via the same canonical generator as
      Slice 1 (`create-astro@latest --template starlight`) into `apps/docs`
      (monorepo — reuse this project's own §2 monorepo-detection) or
      `docs/` (single package).
    - Markdown choice → seed a `docs/` tree with four empty Diátaxis
      folders (`tutorials/`, `how-to/`, `explanation/`, `reference/`) plus
      one placeholder `docs/README.md` explaining the structure — no prose
      generation in this path (out of scope: the design doc's "prose
      generated once" applies to the *plugin's own* docs and to a
      Starlight-mode consuming app choosing to run the generator later, not
      to markdown-mode's initial scaffold).
    - None choice → no scaffold, `"docs": { "mode": "none" }` recorded so
      later stages skip silently.
    - **Always**, regardless of mode chosen (except "none"): drop a
      "Working with argo" pointer stub — one short markdown file (in the
      chosen docs tree's most visible entry point — `index.mdx`/`index.md`
      for Starlight, `docs/README.md` for markdown) linking to this
      plugin's own `apps/docs` site (Slice 1's site) for argo concepts,
      confirming §6 of the design doc's "argo concepts never get copied in."
    - Mention `/argo:docs-refresh` (Slice 5b) in the wizard's closing report
      whenever Starlight or markdown mode is chosen — it's the command a
      human runs later when they've hand-edited a generated prose page.
29. Write the `"docs"` field into `.argo/config.json` in §9's finalize step
    (`skills/init/SKILL.md:446-465`) — add it to the example JSON block
    alongside `landing`/`noPlaybook`/`design`, following the exact same
    "CLI seeds skeleton, skill finalizes" split already documented there.
30. Update `README.md`'s `/argo:init` bullet list
    (`README.md:120-134`, "with per-rule consent, writes what a project
    actually keeps") to add the docs opt-in as one more bullet, matching
    the existing terse one-line-per-artifact style.

**Verify:** a scripted fixture run (three fixture dirs: one with an existing
Starlight site, one with no docs, one mid-run declining) exercises the
detection branch and asserts the resulting `.argo/config.json`'s `"docs"`
field matches the expected mode/path for each — written red-first against
the not-yet-added section's expected behavior.

### Slice 7 — slim the plugin's own README to a docs pointer
`testable: false` (content/docs work, no runtime logic to red-green),
`requiresLaunch: false`. Depends on Slice 1 (the docs site must exist and its
Pages URL be known before README can link to it).

31. Replace the bulk of `README.md` (currently ~15KB duplicating pipeline
    prose the docs site now owns) with a minimal top-level README: a
    one-paragraph description of what the argo plugin is (an engineering way
    of working for Claude Code) and a prominent link to the published docs
    site (Slice 1's GitHub Pages URL) as the canonical entry point. Keep only
    what a GitHub repo landing genuinely needs at a glance — install line,
    the docs link, license/repo pointers — and let the docs site carry the
    pipeline explanation, per the same "one source of truth, don't duplicate"
    principle driving the rest of this plan.
32. Preserve nothing that now lives in the docs site as narrative; the README
    is a signpost, not a mirror. The pipeline mermaid diagrams currently in
    `README.md`/`PIPELINE.md` are already reproduced on the site (Slice 1/2),
    so they leave the README.

**Verify:** the built README renders on GitHub with a working link to the live
docs site and no orphaned internal anchors to the removed sections — checked
by looking at the rendered file and running the repo's existing link check if
one covers README.

## Risks & assumptions

- **Assumption:** `bunx create-astro@latest --template starlight` remains
  the correct scaffold invocation (matches how argo-v2's `apps/docs` was
  almost certainly created, though its own scaffold plan is not read here —
  only its resulting config/package.json, which is what this plan copies
  from). If the exact original scaffold command differs, the resulting
  file shape (astro.config.mjs + Starlight integration + content.config.ts)
  is what actually matters and is fully specified in Slice 1.
- **Risk — GitHub Pages requires a one-time manual repo-settings step**
  (enable Pages, set source to "GitHub Actions") that no CLI in this
  toolchain can perform. Documented as a manual precondition in the
  workflow file's header comment (Slice 1, step 5); the plan cannot
  "verify" this step by tool call — flag it to the human at PR time.
- **Risk — `generate-reference.mjs`'s CLI shell-outs assume `bun install`
  has already resolved `@argohq/toolkit`** (the kit's `dist/` must exist,
  per `README.md:243-253`'s note that a cold install has no `dist/` until
  the published-kit switch lands). The docs build workflow must run `bun
  install` (which triggers the kit's `prepare` script building `dist/`)
  before invoking `generate-reference.mjs` — already sequenced correctly in
  Slice 1 step 5's workflow ordering (`bun install` before `bun run build`).
- **Risk — `argo playbook list --json` and `argo playbook diagram` are
  process-level CLI calls from a Node script**, not an in-process import
  (the toolkit's pack registration is composition-root-scoped per
  `register-installed-packs.ts`'s own doc comment — importing pack internals
  directly from `apps/docs` would violate the dependency-cruiser boundary
  the repo already enforces). Shelling out to `bin/argo.js` (as planned) is
  the correct, sanctioned integration point — confirmed by
  `skills/init/SKILL.md:270`'s own precedent of invoking
  `bin/argo.js` directly via `node`.
- **Assumption — no `apps/*` workspace precedent exists in this repo yet.**
  Adding `"apps/*"` to root `package.json` workspaces is new territory here
  (unlike argo-v2, which already has it) — Slice 1 step 1 must run
  `bun install` at the repo root afterward to confirm the workspace
  resolves cleanly before scaffolding proceeds.
- **Risk (Slice A) — the frontend-design skill's output is subjective and
  cannot be tool-verified for "distinctive/edgy."** Verification is
  necessarily a human visual check (`bun run preview` + look at it), stated
  explicitly as `testable: false` — do not force a red-green cycle onto
  content/visual-design work that has no behavioral contract to assert
  against.
- **Risk (Slice B) — cross-repo private-repo read has no existing kit
  precedent** (unlike `argo graph refresh`, which never reads another
  repo). The exact `gh`/`git` invocation for a one-shot single-file
  cross-repo read needs to be nailed down at implementation time (e.g. `gh
  api repos/milad-alizadeh/argo-v2/contents/<path> --jq
  .content | base64 -d`, or a cached shallow clone) — flagged as new
  plumbing in step 10, not assumed to exist. Auth failure must degrade to
  `{ skipped: 'argo-v2-unreachable' }`, never block the docs build (the
  committed `argo-theme.generated.css` is the offline-safe fallback per
  the design doc's own §1c rationale — a stale committed file beats a
  build that can't run without network + cross-repo auth).
- **Risk (Slice B) — the extraction line range (25-135) will drift** as
  `base.css` changes; the extractor must find the block by brace-matching
  on the `@theme static {` marker text, not a hardcoded line range (stated
  explicitly in step 10's implementation note) — a hardcoded range would
  silently truncate or overrun the moment argo-v2 adds a token.
- **Risk (Slice 5b) — the regeneration call must stay grounded, same as
  Slice 3's original prose.** Re-running generation on an "AI, refresh
  this" instruction risks drifting away from the real pipeline (inventing
  behavior) the same way a from-scratch draft would — the skill's
  regeneration step must re-source from README/PIPELINE/skill files each
  time, never regenerate purely from the previous (possibly now-stale)
  version of the page. State this explicitly in `skills/docs-refresh/SKILL.md`
  itself, not just here.
- **Assumption (Slice 5b) — per-page prompting, not a single batch
  approval.** The design doc's §5 describes the prompt at page granularity
  ("prompt 'refresh this page with AI?'" — singular "this page"); a batch
  "refresh all edited pages?" would be cheaper to build but loses the
  ability to keep one page human-owned while refreshing another in the
  same run. This plan follows the design doc's page-granularity reading.

## Verification (end-to-end)

- `cd apps/docs && bun install && bun run build` — succeeds, `dist/`
  contains one HTML page per content file (prose + generated reference),
  plus the splash landing page at `dist/index.html`.
- `bun run check-links` — zero broken internal links across the built site,
  including the landing page's two CTAs.
- `node apps/docs/scripts/lint-docs-style.mjs` — exits 0 on real content,
  exits 1 with file:line detail against a forbidden-phrase fixture.
- `node apps/docs/scripts/generate-reference.mjs` then a page-count
  assertion: `reference/skills/*.md` count == 21, `reference/agents/*.md`
  count == 11, `reference/playbooks/*.md` count == 6.
- Manifest unit tests (`docs-manifest.mjs`) — hash stability, ownership
  branching, missing-manifest-safe-default, `listEditedPages` correctness,
  `markHumanOwned` correctness, all green.
- `/argo:docs-refresh` (Slice 5b) — fixture-run confirms exactly one prompt
  per edited page, correct manifest state after both the "yes" and "no"
  branches.
- `skills/init/SKILL.md`'s new §6f — fixture-run assertions on
  `.argo/config.json`'s `"docs"` field for the three detection branches
  (existing site / greenfield choice / declined).
- `docs-sync-theme.test.ts` — extraction correctness (positive: real
  `--color-slate` token captured; negative: figma-sync `--sidebar-primary`
  token excluded), green.
- Visual check (Slice A, cannot be tool-asserted): the built landing page
  shows the hero headline, subhead, two working CTAs, four feature blocks,
  dark-theme only, no light-mode toggle.
- Manual (cannot be tool-verified): GitHub Pages enabled in repo settings,
  first `docs-deploy.yml` run green, site reachable at its `github.io` URL;
  `argo docs sync-theme` run once on-device with real `gh` auth to produce
  the initial committed theme file.
