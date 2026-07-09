# Phase 2 (first items): playbook rename + naming sweep + structure + PRD wireframes

Status: planned. Runs AFTER the phase-1 build (`workflow-engine-phase1.md`)
lands and merges — never concurrently with it. Items:

1. Rename "workflow" → "playbook" across the engine (mechanical pass).
2. HTML wireframes replace ASCII in write-prd step 5c.
3. Naming sweep: package renames (`kit` → `toolkit`,
   `adapter-claude` → `claude-adapter-plugin`) + finish the tier0 →
   design-rules rename that stalled at the gate surface.
4. Folder hierarchy restructure (kill the flat-file sprawl) + make the
   file-structure rule reach builders working in THIS repo.

Items 1 and 3 touch the same files — run them as one commit train.

## Item 1: rename "workflow" → "playbook"

Phase 1 builds with the old name as written; this rename is a single
mechanical pass on top.

### Decision

The engine concept currently called a "workflow" is renamed to **playbook**;
one execution of a playbook is a **run** (state = "run state", stored
`attempts[]` etc. unchanged in shape).

Why: "workflow" collides with Claude Code's dynamic workflows (the Workflow
tool), which argo-v2's cockpit displays in the same timeline — one word,
two semantics. "Pipeline" was considered and rejected on two grounds: it
sounds like CI, and it blurs definition vs execution (people say "the
pipeline" for both). "Loop" was rejected: the shape is a linear spine with
budgeted retry back-edges and a defined end (`done`), so a loop name would
advertise the exception as the identity. "Playbook" is plain English for a
named, repeatable, staged procedure a pack ships; "run" names one
execution of it.

UI corollary (for argo-v2, recorded here so the rename and the rendering
stay one story): a run renders as a linear stage rail; retries render as
an attempt counter on the stage (`attempts[]`/`maxRounds` already model
this), never as backward arrows in a cyclic graph.

Terminology after the rename:

- **playbook** — the named, staged, gated definition a pack ships
  (was: workflow / workflow definition).
- **run** — one execution of a playbook against the state store
  (was: workflow state / workflow run).
- **Claude's dynamic workflows** — always called exactly that; never
  shortened to "workflow" in argo docs or UI once this lands.

### Scope (enumerate at build time, don't trust this list blindly)

Grep for `workflow` case-insensitively across the plugin repo after phase 1
merges; expected surfaces:

- `@argohq/core` — type names, module/file names, the CLI verb
  (`argo workflow …` → `argo playbook …`), diagram-generator input naming,
  state-store keys. **State keys and any on-disk JSON field names minted by
  phase 1 rename too** — phase 2 ships before any real user state exists,
  so no migration shim; if real runs exist by then, add a read-time key
  mapper instead.
- `@argohq/pack-design` — playbook definition files and their exports.
- Design docs: `.claude/design/workflow-engine.md` and
  `workflow-engine-audit.md` get renamed content-wise (and file-wise:
  `playbook-engine.md`, `playbook-engine-audit.md`) with a one-line
  tombstone-free note in the commit message, not the files.
- Plugin skills/agents that reference "workflow" for the engine concept
  (not ones referencing Claude's Workflow tool — leave those).
- argo-v2 side (separate repo, separate commit): any cockpit label or
  event naming referencing the engine concept. Claude's
  `workflow_started` ActivityEvent variants refer to Claude's dynamic
  workflows and are NOT renamed.

### Non-goals

- No behavior change of any kind; rename only.
- No renaming of Claude Code concepts (Workflow tool, dynamic workflows,
  `workflow_started` events in argo-v2).
- No new abstraction smuggled in under the rename.

### Verification

`grep -ri workflow` over `packages/` after the pass returns only (a)
references to Claude's dynamic workflows, each in a context that says so,
and (b) nothing in exported type names, CLI verbs, file names, or state
keys. Full `bun run typecheck && bun run test` green.

## Item 2: HTML wireframes replace ASCII (write-prd step 5c)

One medium, not two: the layout sign-off contract becomes a lo-fi HTML
wireframe file, and Claude Code's Artifact publishing is how the human
looks at it while exploring. ASCII wireframes in the PRD are deleted, not
kept alongside — two wireframe formats would be the complicated outcome.

### What it does

During write-prd's layout step, the agent writes
`design/wireframes/<feature>.html` (committed next to the PRD) and
publishes it as an Artifact, then iterates it live with the user — edit
the file, redeploy to the same URL — until layout and flow are signed
off. The PRD carries a one-line pointer to the wireframe file; the PRD
stays the completeness oracle, the wireframe file is the layout
sign-off.

Rules:

- **Lo-fi by constraint, stated once:** grayscale boxes and labels only —
  no color, no typography choices, no component styling, no CSS
  frameworks. Judging layout and flow on a real spatial canvas is the
  point; fidelity belongs to the Figma stage.
- **The file is the contract.** Committed, diffable, and text — labeled
  divs are as readable to downstream agents (design-screen, verifiers) as
  ASCII boxes were. The artifact URL is a view, never a source of truth.
- **Publishing is the Claude-only part.** Artifact publish sends content
  to claude.ai; mention that once at first publish per project. Where the
  Artifact tool is unavailable (headless/non-Claude harness), the file is
  still written and reviewed by opening it locally — the contract doesn't
  depend on the viewer.

### Where it lives

write-prd's SKILL.md step 5c is rewritten from "ASCII wireframe + flow"
to "HTML wireframe file + artifact publish + live iteration". No kit
code, no gate, no registry entry — instructions only.

### Verification

Run write-prd on a fixture idea: wireframe HTML lands committed with the
PRD pointing at it; the file is pure grayscale lo-fi (spot-check: no
color values, no font declarations beyond defaults); every screen and
flow edge the PRD names appears in the wireframe; artifact publish
succeeds and a file edit + republish updates the same URL.

## Item 3: naming sweep — packages + tier0 residue

### Decision (owner, 2026-07-09)

The plugin repo's packages carry one consistent naming scheme, all under
the existing turborepo/bun-workspaces monorepo:

- `@argohq/core` — engine (already named right; `packages/core/`).
- `@argohq/kit` → **`@argohq/toolkit`** (`packages/kit/` → `packages/toolkit/`,
  bin/CLI references, workspace deps, the `link:` dep in argo-v2's root
  package.json, docs).
- `packages/adapter-claude/` → **`packages/claude-adapter-plugin`**
  (`@argohq/claude-adapter-plugin`).

If these later split into three separate git repos, that's a distinct
decision; this item is the naming, not the split.

### tier0 → design-rules (finish the stalled rename)

The `meaningful-names-no-jargon` decision renamed only the gate surface
(`pack-design/src/gates/design-rules-check.ts`); 47 files still say
tier0/tier-0. Sweep it fully:

- File renames: `design-kit/tier0-audit.ts` → `design-rules-audit.ts`,
  `tier0-rules.ts` → `design-rules.ts`,
  `skill-scripts/bundle-tier0-audit.ts`, `prepare-tier0-audit-options.ts`,
  `recipes/shadcn-tailwind/tier0-walker.ts` + `tier0-rules.ts`, tests.
- Exports, hook names, receipt fields, skill/agent prose, templates.
- The bundle cache key (see `bundle-cache-stale-after-kit-rebuild`
  memory): rm the tmp bundle after the rename or the audit runs stale.
- "Tier-0" as a concept in docs → "design rules" (deterministic checks) —
  no tiers, no jargon.

### Verification

`grep -ri "tier0\|tier-0\|@argohq/kit\b" packages/ skills/ agents/ hooks/
templates/` returns nothing (except historical plan docs under
`.claude/plans/done/`). `bun run typecheck && bun run test` green; a
smoke run of the design-rules check against the fixture suite passes.

## Item 4: folder hierarchy restructure

Kill the flat-file sprawl; group by domain, not type (per
`templates/rules/file-structure.md`: 5+ peer files → domain subfolder,
kebab-case folders, index.ts orchestrator barrels, max 2 levels).

- `packages/toolkit/src/design-kit/` (~30 flat files) → subfolders:
  `audit/` (rules, walker, comparator, conversion-table), `registry/`
  (reconcile, pull), `manifest/` (binding-manifest, schemas, validate),
  plus `completeness/`, `copy-deck/`, `staleness/` as they group.
- `packages/toolkit/src/skill-scripts/` (~30 flat scripts) → grouped by
  the skill/domain they serve.
- `packages/toolkit/bin/argo.js` (single 7.4K file) → `cli/` with one
  module per subcommand (pack-design's `cli/` already models this).
- `packages/core/src/` (8 flat modules) → group as the engine's domains
  settle post-phase-1.

Root causes fixed in the same item so it doesn't regress:

- Install `.claude/rules/` into the argo-plugin repo itself (it ships
  the templates but never ran /argo:init on itself — builders here never
  see the file-structure rule).
- Planner prompt/plan template gains a required "File layout" section
  (target folder tree) so builders stop minting flat paths ad hoc.

### Verification

No source folder with 10+ flat peer files mixing domains; imports go
through domain barrels; `bun run typecheck && bun run test` green;
`.claude/rules/file-structure.md` present in the plugin repo; planner
template contains the File layout section.

## Item 5: consolidate into `.argo/` + plan lifecycle (owner, 2026-07-09)

Runs AFTER items 1–4 land (touches the same skills/templates). No legacy:
one-time migration, no dual-path reading, no compat shims.

### `.argo/` is argo's only per-project directory

- `.argo/config.json` ← `.claude/argo.json`. Before renaming, centralize
  the path into ONE resolver (today it is inlined at `emit-shims.ts:91`,
  `argo-json.ts:31`, `init.ts:82`) so the rename is a single edit. If
  schedule pressure forces a cut, this rename is the droppable half —
  the plans/design move carries the real ownership benefit.
- `.argo/plans/` ← `.claude/plans/` (including former `done/` contents;
  the `done/` folder is deleted — see lifecycle below)
- `.argo/design/` ← `.claude/design/`
- `.argo/evidence/` — the worktree-local gate plumbing
  (`build-mode.json`, `red-proof.json`, `launch-receipt.json`).
  Deliberately NOT named "state": it is evidence about one worktree's
  uncommitted files, read only by that worktree's own gates, dead when
  the worktree is removed — the opposite lifetime of `~/.argo/state/`,
  which is the only thing called state.
- **Gitignore is deny-by-default with explicit re-includes — NEVER a
  blanket narrow.** `.argo/` also holds secrets and session-local files
  (argo-v2 has a live `figma-token` PAT, `design-guard.json`,
  `audit-receipts/`); narrowing the ignore to one subdir would stage the
  token on the next `git add -A`. Required form:

  ```gitignore
  /.argo/*
  !/.argo/config.json
  !/.argo/plans/
  !/.argo/design/
  ```

- Repoint every skill/agent/template/hook reference in one pass.

### Plan lifecycle — status in the file, ownership split by who can know

Folder-as-status (`done/`) is deleted. Every plan carries frontmatter:

```yaml
---
status: draft | queued   # NOTE: intentionally not live — a build in
                         # progress does not touch this; see `argo plans`
updated: <date>
---
```

There is NO `landed` status or SHA in the file. A commit cannot embed
its own SHA, so "stamped atomically with the merge" is physically
impossible; and git already records the answer. "Landed" is DERIVED:
a plan reachable from `origin/main` whose content is fully merged
(`git merge-base --is-ancestor` on its last-touching commit) with no
active run in the home store. `argo plans` computes and displays it.

Ownership model (the worktree problem is the design driver):

- **draft** — being written; `queued` — cleared for build. This enum is
  ENFORCED: build-plan refuses a plan whose `status` is `draft` (that is
  what `queued` earns its keep for). Authored on main, committed.
- **building/blocked — NEVER in the file.** Live state belongs to the
  engine's run-state store at `~/.argo/state/<project-id>/` (already
  built, `packages/core/src/state.ts`; project-id derives from the git
  common dir, so ALL worktrees of a repo share one store — the Claude
  Code `~/.claude/projects/` pattern). A worktree build never edits plan
  status: a worktree-side flip is invisible on main and a lie if the
  branch is discarded. Abandoning a run = deleting its run record; the
  plan truthfully reads `queued` again.
- `argo plans` (CLI) merges the sources: frontmatter for draft/queued,
  git for landed, run store overlaid for "building on branch X /
  blocked". This mirrors the playbook engine's definition/run split —
  plan doc = definition, run record = execution.
- **Plan↔run join key is a contract:** a run's `target` MUST equal the
  plan's basename, validated at `workflow-start` — without it the
  overlay cannot attribute a live run to its plan.

State-writing invariant: run state lives in the HOME store
(`~/.argo/state/<project-id>/`), shared by all worktrees via the git
common dir — no state ever crosses a worktree boundary because live
state is never in the repo at all. The only in-repo files are the
worktree-local gate EVIDENCE (`.argo/evidence/`), deliberately scoped to
the worktree whose gates consume it, gitignored, dead when the worktree
is removed. `argo plans` reads plan frontmatter, derives landed from
git, and overlays live runs from the home store; a manual run in any
worktree lands in the same store, so nothing is invisible.

Home-store hardening (required by this design leaning on the store):

- **Writes become atomic**: temp file + `renameSync` (same fs), replacing
  the bare `writeFileSync` in `writeInstance` (`state.ts:127-131`) and the
  read-append-write in `recordAttempt`/`recordHistory`; a torn write
  currently reads as "no instance" and silently erases a run. Advisory
  lockfile for same-key concurrent writers.
- **The active-workflow pointer gets worktree affinity.**
  `active-workflow.json` is today a single per-project pointer
  (`state.ts:163-165`); two concurrent gated builds overwrite it and
  worktree A's permission gate reads worktree B's run. Scope it
  per-worktree (keyed by the session cwd's worktree path) or make it a
  keyed set. Concurrent gated builds are unsupported until this lands.
- **Known limit, stated not fixed**: project-id is path-identity-bound
  (realpath of the git common dir) — moving/renaming the repo orphans
  in-flight run records; the plan reads `queued` again. Acceptable;
  document it in state.ts and the design doc.

### Migration

One migration pass in each consuming repo (argo-v2 first), as ONE
atomic, ORDERED commit — file moves before the gitignore rewrite
silently no-op (`git add` on a still-ignored path does not error):

1. Rewrite `.gitignore` to the deny-by-default form above.
2. Verify with `git check-ignore`: `config.json`/`plans/`/`design/`
   paths NOT ignored; `figma-token`, `evidence/`, receipts, and every
   other `.argo/` entry STILL ignored.
3. Move the three surfaces into `.argo/`; rename in-repo gate plumbing
   dir to `.argo/evidence/`.
4. Add frontmatter to every existing plan (former `done/` contents need
   none of the old `landed` bookkeeping — landed is derived from git);
   delete `done/`; repoint local references.
5. Assert with `git status --porcelain` that every moved file is
   actually tracked, then commit.

Plans stay in git forever; history is the archive.

### Verification

- No references to `.claude/plans`, `.claude/design`, or
  `.claude/argo.json` remain in the PLUGIN (grep) — AND a second,
  consumer-scoped sweep per consuming repo (argo-v2: 20+ plan docs,
  6 design files, scaffolded files from old templates, and live eval
  fixtures — `eval/card-routing.eval.ts:84` references
  `.claude/plans/foo.md`). Stale doc-comments in already-scaffolded
  consumer files: fix in argo-v2, acknowledged-cosmetic elsewhere.
- Grep-assert no secret/receipt path (`figma-token`, `build-mode`,
  `red-proof`, `launch-receipt`, `audit-receipts`) resolves outside the
  ignored set (`git check-ignore` fixture).
- `argo plans` lists by status, derives landed from git, and shows a
  live overlay for an in-flight run; overlay join validated
  (`target === plan basename`).
- build-plan refuses a `status: draft` plan (fixture).
- Two concurrent runs in separate worktrees keep distinct active
  pointers (fixture).
- `.argo/evidence/` gitignored, `figma-token` still ignored, everything
  re-included in `.argo/` committed.
