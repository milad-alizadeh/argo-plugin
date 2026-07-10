---
derived: 2026-07-10
head: 5159b7c3801bf27795d7aa84de6f9d3cf3d92f63
---

# Argo Docs Facts Inventory

The grounded single source of truth for docs prose. Every fact carries a
source reference. Docs claims must trace to a line here; lines here must
trace to the repo.

## 1. Supported matrix (implemented vs not)

**Design-pack recipes — exactly ONE implemented: `shadcn-tailwind`.**
- Only recipe directory: `packages/toolkit/src/packs/design/recipes/shadcn-tailwind/`
  (`index.ts`, `design-rules.ts`, `design-rules-walker.ts`, `design-rules.test.ts`).
  No other recipe dir exists; no stubs, no "planned" recipe files.
- `skills/setup-design/SKILL.md:49-59` (§0c): "Today there is exactly one option,
  `shadcn-tailwind` (label it recommended/only choice)." Recipe ID matches kit
  subpath `@argohq/toolkit/design-kit/shadcn-tailwind`; template dir
  `templates/design/recipes/shadcn-tailwind/`.
- Recipe extension points (`skills/setup-design/SKILL.md:56-68`): (a) recipe audit
  checks (`design-rules-walker`), (b) token writer (`code-target/token-writer.md`,
  consumed by figma-sync step 7), (c) upgrade flow (recipe `README.md` states
  design source + `codeTarget`, read by `design-upgrade`). CSS pipeline dispatch
  (`skills/setup-design/SKILL.md:298-308`): recipe's own `code-target/css-pipeline.md`;
  shadcn-tailwind targets Tailwind's Vite plugin; "a future non-Tailwind recipe
  supplies its own doc."
- Recipe rule content (`recipes/shadcn-tailwind/design-rules.ts:18`):
  `TW_COLLECTION_FAMILY` allowlist `['tw/gap','tw/padding','tw/font',
  'tw/stroke-width','tw/border-radius','tw/border-width','tw/margin','tw/space']`.
  `nonSemanticBindingViolation()` (line 32) enforces color bindings resolve to a
  local Semantic collection or the `tw/*` family.

**Playbooks registered — exactly SIX, all in the DESIGN pack.**
- `packages/toolkit/src/packs/design/playbooks/index.ts:6-11`: `screen-create`,
  `component-create`, `component-edit`, `screen-edit`, `design-to-code`,
  `code-to-design`.
- Each spec calls `registerPlaybook(spec, 'design')` at import time
  (e.g. `component-create.ts:54`); pack attribution core-owned
  (`register-installed-packs.ts:13-16`).
- **The code pack has NO playbook specs.** `packages/toolkit/src/packs/code/` holds
  only gates + reporters (`red-proof-gate.ts`, `trust-gate.ts`, `test-smell.ts`,
  `format-on-write.ts`, `reporters/`). Composition root imports only
  `packs/design/gates/register-cli-gates` and `packs/design/playbooks/index`.
- Registered CLI gates (`packs/design/gates/register-cli-gates.ts`):
  `design-rules-check` (receipt-backed), `brief-check`, `fresh-eyes-review`.

**Stacks / package managers init supports/detects** (`skills/init/SKILL.md`):
- §2 (63-70): language (TS vs JS), UI framework + components dir, styling system +
  real token source, test runner + e2e tool + real lint/test commands, observed
  naming convention, monorepo layout (`workspaces` / `pnpm-workspace.yaml` /
  `turbo.json` / multiple `apps/*`|`packages/*`), `graphify` CLI presence.
- Package managers: bun/pnpm/npm (`skills/scaffold/SKILL.md:19`). Monorepo detected
  via root `package.json` `workspaces` (init §6d line 263).

**Config modes** (`packages/toolkit/src/core/cli/config-schema.ts` — single source of truth):
- `landing`: `"merge" | "pr"` (default `"pr"`; init §6a).
- `noPlaybook`: `"allow" | "coach" | "deny-edits"`; missing key reads `"allow"`
  (schema line 18; init §6a2 lines 144-159; `coach` recommended).
- `docs`: `{ mode: "starlight" | "markdown" | "none"; path?: string }` (schema
  line 26; init §6f).
- `design`: object; inert keys owned by `/argo:setup-design` (schema line 22).

**LSP curated table** (`packages/toolkit/src/core/lsp-table.ts:13-28`) — 14 language
keys → plugin ids on `claude-plugins-official`: typescript/tsx→`typescript-lsp`,
go→`gopls-lsp`, python→`pyright-lsp`, rust→`rust-analyzer-lsp`, c/cpp→`clangd-lsp`,
csharp→`csharp-lsp`, java→`jdtls-lsp`, kotlin→`kotlin-lsp`, lua→`lua-lsp`,
php→`php-lsp`, ruby→`ruby-lsp`, swift→`swift-lsp`. Values are plugin ids, not
binary names. Absent language → WebSearch fallback, flagged unverified.

## 2. Requirements & prerequisites

**Figma plan tier — HARD requirement** (`skills/setup-design/SKILL.md:32-46`, §0b):
- Wizard asks: "Is this Figma file on a Professional plan or higher?"
- Why (F10): below Professional, variable collections are capped at ONE mode. The
  starter theming model IS modes on the file's local Semantic collection → a
  multi-theme project cannot work below Professional (hard stop, D23).
- A deliberately single-theme project MAY proceed on a lower plan with the
  limitation stated (single-mode Semantic collection is a legal shape).
- Non-workarounds (do not suggest): the Variables REST API (Enterprise-gated;
  nothing in the pack depends on it); consuming the starter as a subscribed team
  library (Figma cannot theme a subscribed library below Enterprise — the reason
  the model is a duplicated single file with local variables).

**Figma starter file** (`skills/setup-design/SKILL.md:70-95`, §0c-i):
- Recipe design source = single maintained Figma starter file (all shadcn-mirror
  components, Lucide icons, ALL variables LOCAL). Each project DUPLICATES it.
- Figma API cannot duplicate a file → duplication is a manual UI step; the wizard
  waits for the duplicate's URL. Stored as `figma.projectFileKey`; optional
  `figma.starterFileKey` (provenance only).

**Figma MCP / comment access:**
- Pack uses the Figma Plugin API via `use_figma` + Figma MCP tools (classifier
  `packages/toolkit/src/adapter-claude/classifier.ts:210-225`).
- Comments: Figma MCP and the Plugin API sandbox have no comment access
  (`skills/resolve-comments/scripts/figma-comments.ts:13`) — comments pulled via
  Figma REST (`packs/design/figma-rest/client.ts`); token via `FIGMA_TOKEN` env →
  fallback `.argo/figma-token` (`registry/index.ts:102`).
- Code Connect is NOT a pack requirement (no grep hits in setup-design /
  figma-* skills / packs/design).

**shadcn MCP** (`skills/setup-design/SKILL.md:124-141`, §2): requires shadcn CLI
3.0+; default-on where installable; unsupported → skips shadcn init (never
installs an inert fallback). `--no-shadcn` skips.

**Required binaries/tools** (from `skills/init/SKILL.md`):
- **Claude Code ≥ 2.1.200** for project-scoped plugins in worktrees (§1b 54-61);
  older → build-plan/worktree sessions won't fire project-scoped hooks.
- **bun** — primary package manager for argo's own wiring (`bun install`,
  `bun add -d`, `bun link`, `bunx`); node invokes the CLI first run (§6d 257).
- **git** — required (worktrees, gates).
- **`@argohq/toolkit`** — `link:@argohq/toolkit` dev-phase dep (§6d); published
  release swaps to `^version`.
- **probity** (`@nizos/probity`) — devDependency, default-ON TDD PreToolUse guard
  (§6c). HARD auth pre-check (230-233): `ANTHROPIC_API_KEY` must NOT be set —
  probity must run on Claude Code subscription auth, not a metered key; if only
  API-key auth is available, STOP, do not adopt. `probity.config.ts` is a
  protected path; fails closed when no config resolves. Opt-out `--no-tdd`.
- **lefthook** — pre-commit (fast lint+typecheck only); `lefthook install` must
  run from the main checkout, never a worktree (§6b 182-193).
- **gh CLI** — used by the integrator for PRs (landing mode `pr`).
- **graphify** — OPTIONAL; wired only if present (§7); absent → skipped silently.
- **rtk** — OPTIONAL, global, default-OFF (§6e).
- **LSP server binaries** — optional; consent before any global install (§8c).

**Before `/argo:setup-design` works:** `@argohq/toolkit` resolves (run
`/argo:init` or `bun install` first — §5 236-247); a Figma file on Professional+
(or stated single-theme exception); a duplicated starter file key.

## 3. Real workflows (journey traces)

**Day-to-day TDD under probity:**
- Skill: `skills/test-first/SKILL.md` — vertical slices, RED→GREEN per behavior
  (30-45); refactor only on green.
- Probity PreToolUse guard (`.claude/rules/testing.md:11-38`, init §6c): ONE new
  test per edit; run the exact failing test immediately before the impl edit
  (cached runs produce nothing to validate — invoke the runner directly); match
  failure stage (import fail → stub; assertion fail → minimal logic); map every
  impl edit 1:1 to the NEWEST failing assertion; never batch/rename around a
  block. `fastPath: true` = minimal-fix lane for a small coordinated cluster
  driven by ONE public-interface assertion (init §6c 242-250).
- Commit block (`packs/code/red-proof-gate.ts`): inert unless
  `.argo/evidence/build-mode.json` exists; armed → fail-closed. Requires
  `.argo/evidence/red-proof.json` matching the current slice with `redExit != 0`,
  `greenExit == 0`, `recordedAt` postdating HEAD (30s skew tolerance), and the
  red test staged in the same commit. `testable: false` slices bypass (line 97).
  Block = exit 2, "Red-proof gate: BLOCKED" + reason.
- Trust gate (`packs/code/trust-gate.ts`): inert unless armed AND
  `requiresLaunch: true`. Requires a launch receipt with `exercised: true`,
  `exitCode == 0`, 10-min freshness. Argo-runtime-specific; stays inert on
  `requiresLaunch: false` slices in other host projects (init §6 122-124).
- Cosmetic/styling edits are refactor-class: allowed on green, no failing test,
  never pixel-geometry tests (`.claude/rules/testing.md:61-92`; init §6c 236-241).

**Hands-off gated build** (`skills/build-plan/SKILL.md`): ONE long-lived builder
session in its own git worktree, slice by slice. Preconditions (§1): plan doc
reachable from default branch; `argo plans check` requires `status: queued`;
`argo:reviewer` available; real verify commands known; every runner proven
executable before slice 1; session rooted in the worktree (EnterWorktree, not
cd); base-path config for non-root static deploys. Flow: sequential slices →
red-proof+trust gates per commit → checkpoint review at the plan seam → final
reviewer pass → integrator lands. Gates live in hooks, not agent narration.

**Design pack + first figma-sync + first figma-to-code:**
1. `/argo:setup-design` (§0a-§9): Figma? → Professional+? → recipe
   (shadcn-tailwind) → duplicate starter, paste key → detect stack → shadcn init
   via MCP → latest Storybook+Vitest addon (record triad) → keep `design/**` out
   of probity globs → copy templates + fill `design.<app>` block → alias+CSS
   pipeline parity → create `design/` scaffolding (`waivers.json` → `[]`) →
   smoke story rendered in a real browser (Playwright, computed-style assertion)
   → report.
2. `/argo:figma-sync`: one-way Figma→code, artifact-mediated; dumps tokens,
   semantic-manifest (~60 names via `argo design generate-token-manifest`),
   specs, story-map, screenshots, freshness; regenerates the generated CSS
   region; presentation module vs hand-owned behavior file split; fail-loud on
   outstanding hard hygiene violations.
3. `/argo:figma-to-code`: reads committed synced artifacts (never live Figma),
   generates through the test-first loop, tiered acceptance gates in D22 order:
   spec-diff → gestalt → baseline commit; code-owned components never generated;
   regen only rewrites the presentation module.

**Brand-new project:** `/argo:scaffold` (canonical generator into empty dir →
scaffolder agent → initial commit) → chains into `/argo:init` (scaffold §4) →
first feature via `/argo:write-prd` → `/argo:grill-me` → plan →
`/argo:test-first` or `/argo:build-plan`. Canonical loop (init §8): scaffold →
grill → plan → test-first/build-plan → review → debug → handoff.

## 4. Boundary declarations (out of docs scope)

- **The Argo cockpit app is a SEPARATE product; plugin docs must not mention
  it.** Current docs mention it once:
  `apps/docs/src/content/docs/start-here/what-is-argo.md:17` ("works with or
  without the Argo cockpit app") — remove. Non-docs references (init §1b
  worktree note, audit-receipt/session-guard internals, test fixtures) are fine
  to leave.
- **Retired: the Figma lo-fi wireframe stage.** The lo-fi HTML wireframe is a
  `write-prd` artifact (`skills/write-prd/SKILL.md:3,131`), not a Figma stage.
  Docs prose implying a Figma lo-fi/wireframe stage is stale.

## 5. Corrections to current docs

1. **Recipes unmentioned.** No docs page mentions the recipe concept or that
   `shadcn-tailwind` is the ONE implemented recipe. `guides/set-up-design.md`
   and the setup-design reference omit recipe selection (§0c) and pluggability.
2. **Figma Professional requirement missing entirely** — the biggest gap.
   `guides/set-up-design.md` never states the plan requirement, the one-mode
   variable cap, the single-theme exception, or the non-workarounds (§0b).
3. **Starter-file duplication step missing** — manual duplication,
   `figma.projectFileKey`/`starterFileKey`, API-can't-duplicate fact (§0c-i).
4. **Cockpit mention must be removed** — `what-is-argo.md:17`.
5. **"What it installs" list vague/incomplete** (`guides/set-up-design.md:18-22`):
   omits recipe selection, shadcn MCP (CLI 3.0+), latest-Storybook triad
   recording, probity-glob narrowing, CSS-pipeline parity, and the mandatory
   real-browser smoke-story render (§8) gating "install done."
6. **probity auth requirement undocumented** — subscription auth required,
   `ANTHROPIC_API_KEY` must be unset (init §6c); a hard adoption blocker.
7. **Claude Code ≥ 2.1.200 prerequisite undocumented** (init §1b).
8. **Config modes** — verify `reference/config-schema.md` matches
   `config-schema.ts` exactly; state missing-noPlaybook-key = `allow`.
9. **LSP wiring + 14-language table not surfaced**; cite the exact table and
   the upstream packaging-bug caveat (anthropics/claude-code#15544, #15359).
10. **Design-verifier naming** — map `what-is-argo.md:26` claims to the real
    gates (`fresh-eyes-review`, `design-rules-check`) and the `design-verifier`
    agent; the design-rules audit is bundled fresh on demand
    (`argo design bundle-design-rules-audit`), never installed into the host
    project (setup-design §4 206-216).
