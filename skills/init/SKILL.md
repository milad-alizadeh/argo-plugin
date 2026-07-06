---
name: init
description: Detect the host project's stack and initialize argo — install ADAPTED argo rules into the project's own .claude/, place the @argohq/kit dependency, and write .claude/argo.json, tailored to what's there and never imposed. Use once when adding the argo pack to a project, or when the user says "set up argo" / "init argo" / "configure argo for this project" / "adapt the rules to my stack".
---

# Initialize Argo in This Project

The argo plugin ships opinionated rules as **inert templates** under
`${CLAUDE_PLUGIN_ROOT}/templates/` — never as active rules — so installing the pack
imposes nothing. This skill turns those templates into **adapted, correctly-scoped
rules in the host project's `.claude/`**, matched to the stack that's actually there,
and delegates every write that must be exact to the kit CLI (`argo init`).

**Core principle:** opinionated, never imposing. Detect what's real, propose with a
reason, ask before writing, never overwrite what the user hand-wrote.

**Division of labor:** this skill owns the wizard (detection, consent, adapted rule
text). The deterministic half — kit dep placement, `.claude/settings.json`
`enabledPlugins`/`extraKnownMarketplaces`, the `.claude/argo.json` skeleton — is
`argo init` (`@argohq/kit`'s CLI), invoked in §6d below. Never hand-write what the
CLI owns.

## 0. Wizard UX — forms, not walls of text
Every decision in this skill goes through the **AskUserQuestion tool** — native
multiple-choice prompts, never a paragraph ending in "shall I?". Rules:

- Batch related decisions into one call (up to 4 questions per screen): e.g. one
  screen for {landing mode, tdd-guard, rules-to-install (multiSelect)}.
- Put the recommended option FIRST, labeled `(Recommended)`, with the detected
  evidence in its description ("vitest found in package.json").
- Free-form input (custom commands, paths) rides the built-in "Other" option —
  don't ask open prose questions for things that have sane detected defaults.
- Prose is for two moments only: the opening one-liner ("detected X, Y, Z — a few
  questions") and the §9 report.

## 1. Entry mode — first run, update, or re-run
Read `.claude/argo.json` first; it decides the mode:

- **Missing → first-run wizard**: the full flow below (§1b–§9).
- **`setupVersion` older than the plugin's version → update mode**: diff-driven.
  Re-derive what each managed file WOULD contain now, then for each file in the
  config's `managedFiles` whose content would change, show the diff and ask
  (one AskUserQuestion per batch of files). Touch ONLY `managedFiles`. If a
  managed file's on-disk content no longer matches what setup last wrote (the
  user hand-edited it), NEVER auto-update it — surface the conflict and let them
  choose keep / overwrite / merge-manually.
- **Current version → offer**: "setup is current (vX.Y.Z) — re-run detection
  anyway, or exit?" via AskUserQuestion.

Never overwrite a hand-authored file in any mode.

## 1b. Check the plugin's install scope — worktrees don't see project scope
Sessions rooted in a **git worktree** (every `/argo:build-plan` run, and Argo
cockpit agent sessions) do NOT load project-scoped plugins — the worktree path has
no install record, and `enabledPlugins` in the worktree's checked-out settings is
not sufficient. If this plugin is installed at project scope, none of its hooks
(commit gates, guards, session card) fire inside those sessions.

Check `claude plugin list` for argo's scope. If project-scoped, tell the user
plainly what silently won't work in worktrees, and recommend reinstalling at
**user scope** (`/plugin install argo@argo` choosing user/global scope). Do not
reinstall for them — scope is a machine-level choice. If they decline, record the
limitation in CLAUDE.md stack-facts so builds don't assume armed gates.

## 2. Detect the stack (read-only, evidence-based)
From manifests/lockfiles/config, determine and cite evidence for: language(s) (TS vs
JS); UI framework + whether a components dir exists; styling system + the **real
token source file**; test runner + e2e tool + the real `lint`/`test` commands; the
**observed** file-naming/folder convention (sample real names — don't impose);
**monorepo layout** (workspaces in `package.json` / `pnpm-workspace.yaml` /
`turbo.json` / multiple `apps/*`|`packages/*`); whether the `graphify` CLI is present.

## 3. Classify greenfield vs brownfield
Empty/near-empty repo → greenfield: defaults ON. Substantial existing tree →
brownfield: defaults OFF, opinionation offered, never imposed.

## 4. Propose, don't impose
Present a table: each candidate rule → install? → the detected fact that justifies
it. Flag conflicts concretely and get **explicit per-rule consent**.

## 5. Install adapted rules
For each accepted template, instantiate it with detected values and a correct
`paths:` glob — see `templates-reference.md` for the per-template mapping. Optionally
install convention hooks into the project's own `.claude/` (also per the reference).

**Placeholders:** templates carry explicit `{{…}}` slots (`{{TYPECHECK_CMD}}`,
`{{LINT_CMD}}`, `{{TEST_CMD}}`, `{{LOCKFILE}}`, …) wherever a project-specific value
belongs. Fill every slot from the values detected in §2 — never leave a `{{…}}`
literal in an installed file.

## 6. Gated builds — `.argo/` receipts (no workflows to install)
The automated build stage (`/argo:build-plan`) is a **single long-lived builder
session**, not a workflow script — there is nothing to copy into `.claude/workflows/`.
Its commit gates (red-proof, trust — dispatched via `@argohq/kit`'s `argo-hook`) are
**inert by default**: they arm only while a build maintains `.argo/build-mode.json`,
so installing the pack never gates a host project's normal commits.

Setup here is small:
- Ensure **`.argo/` is in the project's `.gitignore`** (receipts are local evidence,
  never committed).
- Record the **detected** typecheck/lint/test commands in CLAUDE.md stack-facts (§8) —
  build-plan reads them from there, so it never fails a slice on guessed commands.
- If the project uses a caching task runner (turbo/nx/bazel), make sure its task
  `inputs` are declared so cache hits are trustworthy — a cached pass over undeclared
  inputs can mask tests that never ran (observed in dogfooding). Only reach for a force
  flag (e.g. `TURBO_FORCE=true` / `--force`) to bust a known-stale cache, never as the
  standing verify command.

The trust gate is Argo-runtime-specific (its launch receipt is written by the Argo app
itself when launched and exercised); in other host projects it stays inert on
`requiresLaunch: false` slices — document, don't wire.

### 6a. Landing mode — ask solo vs team; recorded in `.claude/argo.json`
Ask ONE question: "Solo maintainer, or does this project have reviewers?" The answer
becomes the `landing` field of `.claude/argo.json` (written by `argo init` in §6d —
set it after the CLI runs, don't hand-create the file first):

- `"merge"` (solo): `argo:integrator` lands finished branches straight onto the
  default branch — no PR to self-review. The gate is the work itself: gated
  builds run scoped verification per slice and the full suite (incl. e2e) at
  checkpoint and final review — the commit gates check receipts, they don't
  run tests — and the integrator verifies before pushing. No pre-push hook
  re-runs the suite. **Recommend CI for merge-mode projects unconditionally**:
  with no PR and no hook, work landed outside a gated build has no
  author-independent check at all.
- `"pr"` (team, and the skeleton default): the classic push-branch + open-PR flow.

The file is committed (it's team policy, not local state). Never infer the mode —
the skeleton default is `"pr"`.

## 6b. Install enforcement hooks (format-on-write + fast pre-commit)
Guarantee that AI-written code stays typed/lint-clean/formatted **no matter when or by
whom it's written** — layered, treating auto-fixable (format) differently from fail-loud
(type/lint/test):

- **Format = auto-fix, never a gate.** The kit's format-on-write hook (dispatched via
  `argo-hook post-edit-write`, matcher `Edit|Write`) runs the project's own `prettier`
  on each touched file. It activates once `@argohq/kit` resolves (§6d). (No project
  prettier → it no-ops silently.)
- **Tests/e2e = gated builds, not git hooks.** Gated builds run scoped verification per
  slice and the full suite (incl. e2e) at checkpoint and final review; the integrator
  re-verifies before landing. Never install a pre-push suite that re-runs it — redundant
  for gated work, slow for everything else (e2e is uncached), and bypassable anyway. The
  author-agnostic backstop is a **CI required status check on the protected branch**
  (`turbo run typecheck lint test`) — recommend it for every project, and say so
  explicitly for merge-mode/solo ones. **Disclose the residual plainly during setup:**
  tests are enforced only during gated builds and integrator landings; direct pushes
  outside those flows are unverified until CI exists.
- **Fast pre-commit only.** Copy `${CLAUDE_PLUGIN_ROOT}/templates/lefthook.yml`
  to the project root and `${CLAUDE_PLUGIN_ROOT}/templates/lefthookrc` to `.lefthookrc`
  (the `rc:` PATH shim — GUI git clients like VS Code spawn hooks with launchd's minimal
  PATH, so without it every hook job fails with `bun: command not found` and the client
  shows a misleading generic push error). Then `bun add -d lefthook`, add
  `"prepare": "lefthook install"` to the root `package.json` (so a fresh clone re-installs
  the hook), and run `lefthook install` once — ALWAYS from the main checkout, never from a
  git worktree (the generated hook shim hardcodes the installing checkout's node_modules
  path, which dangles when that worktree is deleted).
  Fill its `{{…}}` slots from the detected lint/typecheck commands (plain, no
  force flags — see §6 on cache trust). Lint+typecheck at pre-commit is near-instant
  with a caching runner and catches breakage without slowing the loop.

Do not gate formatting in any hook or CI-as-failure beyond a `--check` backstop —
a machine can fix whitespace; failing a build on it is waste.

## 6c. TDD enforcement (tdd-guard) — default-on where supported
Deterministic tests-fail-first enforcement belongs in a hook, not agent narration.
[tdd-guard](https://github.com/nizos/tdd-guard) is the community-standard PreToolUse
guard: it blocks implementation edits that aren't preceded by a failing test, using the
project's own test reporter as ground truth. It enforces **order**, not test **quality**
— the red-proof commit gate (§6) and the reviewer stay responsible for quality.

- **Detect the runner first** (from §2): tdd-guard supports Vitest, Jest, Storybook,
  pytest, PHPUnit, Go testing, cargo (Rust), RSpec and Minitest. Supported → install
  **default-on**: `/plugin marketplace add nizos/tdd-guard`, `/plugin install
  tdd-guard@tdd-guard`, then `/tdd-guard:setup` to wire the reporter. Unsupported
  runner → print `TDD enforcement unavailable for <runner> — skipping tdd-guard` and
  move on. **Never** install an inert or all-blocking hook as a fallback.
- **Playwright:** upstream has no reporter, but the kit ships one as a normal subpath
  export — `@argohq/kit/reporters/playwright` (schema-verified against
  tdd-guard-vitest). Wire it in the project's playwright config:
  `reporter: [['list'], ['@argohq/kit/reporters/playwright', { projectRoot: '<abs repo root>' }]]`.
  The kit dep is already resolvable after §6d — **nothing to vendor**, no plugin-cache
  `file:` paths, ever.
- **Auth pre-check (hard requirement):** tdd-guard's validation model must run on the
  Claude Code SDK/subscription auth (its default, `VALIDATION_CLIENT=sdk`) — metered
  API keys are banned here. Confirm `ANTHROPIC_API_KEY` is NOT set in the environment
  (if set, Claude Code may bill it); if the project can only run tdd-guard via an API
  key, STOP and surface — do not adopt.
- **Opt-out:** `--no-tdd` (or the user saying so) skips this whole step. Mid-session,
  tdd-guard has its own toggle for legitimate exceptions — spikes disable it for the
  session (throwaway code has a "no tests" contract by design; see the spike skill).
- **Session-start clears its evidence.** tdd-guard wipes `test.json` at the start of
  every session — red/green must be re-established by running tests *within* the
  current session, and via a **direct runner invocation** (a turbo cache hit skips
  the runner and leaves `test.json` stale, looking un-run). tdd-guard's live file is
  not durable proof across sessions; `.argo/red-proof.json` is.
- **Wire the reporter into EVERY workspace whose tests must feed the guard** — not
  just the app. A workspace without the reporter produces no evidence, and the guard
  will false-block edits there for want of red it cannot see (observed: hook
  development in a plugin workspace).
- **Cosmetic-change lane (custom instructions).** tdd-guard reads
  `.claude/tdd-guard/data/instructions.md` into every validation, and its
  SessionStart hook only writes defaults when the file is MISSING — custom rules
  survive restarts. Append the project rule: cosmetic/styling-only edits (class/
  token values, spacing, alignment, sizing, colors, label copy) are refactor-class —
  allowed on green, no new failing test, and never pixel-geometry tests to justify
  them; the exemption ends where behavior begins (enabled/disabled, shown/hidden,
  handlers). Mirrors the testing rule this skill installs.
- **Minimal-fix fast path (same instructions file).** Also append: approve the
  minimal change that makes the CURRENT failing assertion pass — both a single
  statement whose field/symbol the assertion names, AND a small coordinated
  cluster driven by ONE failing behavioral assertion at the **public interface**
  (UI element shown/hidden, CLI stdout/exit-code, returned value, response body):
  e.g. a new handler plus the one or two call sites that invoke it. That one
  assertion is sufficient Red for the whole cluster — don't demand a separate
  unit Red per new symbol. Bound it: every edit must be on the path the assertion
  exercises; a new branch/action it doesn't reach is net-new and needs its own
  Red. Do not block for the confirmation run first, and an identical-or-subset
  edit already assessed as plausibly minimal MUST be approved on re-presentation
  — never re-block it. Include one worked example verbatim (a UI project's
  natural one: an e2e assertion justifying a new handler + its two call sites in
  one pass). This is interface-neutral by design — it mirrors the testing rule
  ("assert through the public interface"), and stays safe default-on because it
  only triggers when a fresh failing behavioral assertion is on record; the next
  test run remains the real green gate. (Observed in dogfooding: the guard
  blocked a 4-line handler+wiring change 5+ times, each time conceding "if the
  e2e IS your red this may be acceptable" then re-blocking on per-symbol Red —
  pure round-trip waste; the change was correct and its e2e red was on record.)

## 6d. Run `argo init` — the deterministic half
Run the kit CLI against the project root. On first run the kit isn't installed yet,
so invoke it from the plugin's own workspace copy:

```
node "${CLAUDE_PLUGIN_ROOT}/packages/kit/bin/argo.js" init --host-root "<abs repo root>"
```

(Once `bun install` has run, `npx --no @argohq/kit argo init` works too.) It
deterministically:

- detects **monorepo** (`workspaces` in the root `package.json`) vs **single-repo**;
- places `"@argohq/kit": "link:@argohq/kit"` at the workspace root (monorepo) or the
  single `package.json` — the dev-phase link protocol; a published release swaps this
  to a normal `^version` dep;
- writes `.claude/settings.json`'s `enabledPlugins` (and `extraKnownMarketplaces`
  when `--marketplace-repo <owner/repo>` is passed) — settings.json is the sole
  owner, never `settings.local.json`;
- seeds the `.claude/argo.json` skeleton per mode (one inert `design` key per
  workspace app, or a single `"."` entry) — inert means no `componentsPath`, so no
  commit gate arms until `/argo:setup-design` fills the block. Existing user-set
  fields always survive (mergeConfigShape).

Then register the link source once per machine (`cd <plugin repo>/packages/kit &&
bun link`) if not already registered, and run `bun install` in the host project so
the dep resolves. Verify: `npx --no @argohq/kit argo doctor --plugin-root
"${CLAUDE_PLUGIN_ROOT}"` reports the lockstep check ok.

## 7. graphify (conditional) — treat the graph as local build cache
Only if the `graphify` CLI is present: run `graphify install --platform claude`
(graphify installs its **own** maintained skill — don't vendor one) and copy
`deepen-architecture` from `${CLAUDE_PLUGIN_ROOT}/templates/skills/` into
`.claude/skills/`.

The labeled `graph.json` (community names embedded per node) is what Claude reads,
so it must be **committed and present**. To stay conflict-free across parallel
worktree agents, exactly **one writer commits it, on `main` only** — worktrees never
commit the graph.

- **Seed per workspace** (works for both shapes): **monorepo** → `graphify <each
  app/package dir>` → `<ws>/graphify-out/`; **single-app** → one `graphify .` at the
  repo root (a single root build handles a real monorepo poorly, so split there).
- **Install the templates** from `${CLAUDE_PLUGIN_ROOT}/templates/graphify/`: append
  `gitignore` to the project's `.gitignore` (commits `graph.json` + `GRAPH_REPORT.md`
  + `.graphify_labels.json`, ignores `graph.html`/`cache/`/analysis), and copy
  `refresh-graph.sh` into the project (e.g. `scripts/`). The script auto-discovers
  workspaces, so it serves monorepo and single-app unchanged.
- **Single touchpoint, single writer = a `post-merge` git hook** (installed via
  `lefthook`), on-device. It fires **only when `main` integrates commits** (a merge or
  `git pull`) — the one moment the graph should advance — and runs `refresh-graph.sh`:
  `graphify update --force` + `graphify label --missing-only --backend=claude-cli`
  (spawns on-device `claude` — subscription auth, **no API key**) + commit. The script
  self-guards (main-only, skips worktrees), so worktree/feature-branch commits never
  write the graph → no write-race. `post-merge` (not `post-commit`) means it never fires
  on ordinary commits and can't recurse on its own graph commit. Must run where `claude`
  is authenticated — **on-device, not headless CI**; without a backend, labels degrade to
  `Community N` (no crash).
- **Worktrees never commit the graph** — they read main's (present + labeled
  instantly on checkout). An agent that wants its own in-flight code mapped runs a
  **local, uncommitted** `graphify update <ws>` (never staged) — so parallel
  worktrees can't conflict on graph files. No merge-driver, no per-worktree hooks.

If graphify is absent, skip silently — the active skills degrade to plain read/grep.

## 8. Write stack-facts + canonical loop into CLAUDE.md
Record the detected commands/paths (so skills/agents use real values, not
placeholders) and the canonical loop: **scaffold → grill → plan → test-first build
(interactive) or /argo:build-plan (automated, worktree-isolated) → review → debug →
handoff.**

## 8b. Recommendations (read-only — propose, never install)
After the rules land, one short recommendation pass from the §2 stack evidence:

- **1-2 MCP servers** that fit what was detected (heavy external-SDK usage →
  a docs-lookup MCP; browser-driven e2e → a browser MCP; a tracked issue
  system in the repo → its MCP). Name the server and the one-line reason;
  installing is the user's call.
- **TypeScript/JavaScript stack → language-server code intelligence.** Argo
  builds apps and apps are usually TS (web, Electron, React Native):
  recommend the official `typescript-lsp` plugin (`/plugin install
  typescript-lsp@claude-plugins-official`) — go-to-definition,
  find-references and live diagnostics replace grep-and-guess for every
  agent. Precheck: `typescript-language-server` on PATH; if absent, print
  the one-line global install (`npm i -g typescript-language-server
  typescript`) — never auto-install globals. (Bundling an `lspServers`
  block into argo's own manifest is deliberately deferred until the
  server's eager-vs-lazy startup behavior is verified — an eager server
  in every non-TS host would violate ship-inert.)
- **1-2 project-specific skills worth scaffolding** (a migration creator where
  a migrations dir exists, a component generator where a component library
  exists, release-notes where releases are tagged). OFFER to author each via
  `/argo:author-skill` — never auto-create.
- **Dormant-hook disclosure:** enumerate any always-on hooks shipped by this
  plugin whose matchers or extension lists do not cover the detected stack
  (e.g. write-hygiene hooks are JS/TS-leaning; the bash source-write guard's
  default extension list may need `.claude/argo-source-extensions.json` for
  this stack) — so the adopter sees exactly what is active vs dormant here.

## 9. Finalize `.claude/argo.json`, report + one-step revert
`argo init` (§6d) seeded the skeleton; before reporting, complete it so the
lifecycle machinery works (these fields ride the SAME `.claude/argo.json` — there
is no separate argo-config.json):

```json
{
  "landing": "merge",
  "setupVersion": "<the plugin version that ran this setup>",
  "managedFiles": [".claude/rules/testing.md", ".claude/rules/…", "…"],
  "design": { "…": {} }
}
```

- `landing` — from §6a's answer.
- `setupVersion` — read from the plugin's own manifest, never hardcoded. The
  session-start card compares it against the running plugin and nudges
  `/argo:init` when setup falls behind; writing it wrong silences or
  spams every future session.
- `managedFiles` — every file THIS run wrote or updated (rules, hook configs,
  tdd-guard instructions), repo-relative. Update mode (§1) may touch only these.
- `design` — leave the CLI-seeded inert keys alone; `/argo:setup-design` owns
  their contents.

Then report: list exactly what was written where, and how to re-run or revert.
Be idempotent; every file this skill writes must be removable in one step.
