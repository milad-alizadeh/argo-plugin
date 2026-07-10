---
name: init
description: Detect the host project's stack and initialize argo — install ADAPTED argo rules into the project's own .claude/, place the @argohq/toolkit dependency, and write .argo/config.json, tailored to what's there and never imposed. Use once when adding the argo pack to a project, or when the user says "set up argo" / "init argo" / "configure argo for this project" / "adapt the rules to my stack".
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
`enabledPlugins`/`extraKnownMarketplaces`, the `.argo/config.json` skeleton — is
`argo init` (`@argohq/toolkit`'s CLI), invoked in §6d below. Never hand-write what the
CLI owns.

## 0. Wizard UX — forms, not walls of text
Every decision in this skill goes through the **AskUserQuestion tool** — native
multiple-choice prompts, never a paragraph ending in "shall I?". Rules:

- Batch related decisions into one call (up to 4 questions per screen): e.g. one
  screen for {landing mode, tdd-guard, rtk (§6e — global, default-off), rules-to-install (multiSelect)}.
- Put the recommended option FIRST, labeled `(Recommended)`, with the detected
  evidence in its description ("vitest found in package.json").
- Free-form input (custom commands, paths) rides the built-in "Other" option —
  don't ask open prose questions for things that have sane detected defaults.
- Prose is for two moments only: the opening one-liner ("detected X, Y, Z — a few
  questions") and the §9 report.

## 1. Entry mode — first run or re-run
Read `.argo/config.json` first; it decides the mode:

- **Missing → first-run wizard**: the full flow below (§1b–§9).
- **Present → re-run offer**: "argo is already set up here — re-run detection
  anyway (re-derive the rules/config), or exit?" via AskUserQuestion. There is
  no version-comparison / migration mode: the plugin's real logic lives in the
  versioned `@argohq/toolkit`, so `.argo/config.json` and the pack wiring it
  controls are static suggestions written once here, not artifacts reconciled
  against a plugin version. If the on-disk shape predates a breaking change,
  rip-and-re-init. This "no handshake" stance is scoped to init/config —
  installed `.claude/rules/*.md` content is expected to be hand-adapted per
  project and can silently drift from its source template, which is a
  distinct problem `argo rules status` addresses (advisory hash-drift check,
  never a gate, never run automatically).

Never overwrite a hand-authored file in any mode.

## 1b. Plugin install scope — project scope is fine, worktrees included
Project-scoped plugins load in sessions rooted in a **git worktree** on Claude
Code ≥ 2.1.200 (the historical worktree gap is fixed — no user-scope
reinstall recommendation, no CLAUDE.md limitation note). Only if
`claude --version` reports something older: warn that worktree sessions
(`/argo:build-plan` runs, Argo cockpit agents) won't fire a project-scoped
plugin's hooks there, and recommend upgrading Claude Code rather than
changing the plugin's scope.

## 2. Detect the stack (read-only, evidence-based)
From manifests/lockfiles/config, determine and cite evidence for: language(s) (TS vs
JS); UI framework + whether a components dir exists; styling system + the **real
token source file**; test runner + e2e tool + the real `lint`/`test` commands; the
**observed** file-naming/folder convention (sample real names — don't impose);
**monorepo layout** (workspaces in `package.json` / `pnpm-workspace.yaml` /
`turbo.json` / multiple `apps/*`|`packages/*`); whether the `graphify` CLI is present;
whether the **context-mode** plugin is present (`enabledPlugins` in
`.claude/settings.json`, or a `context-mode` MCP server registration). Both are
context-optimizing tools whose routing rules §8a offers to make durable.

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
For each installed file, run `argo rules record .claude/rules/<installed-filename> <sha1-of-the-SOURCE-template-content>`
(installed path as the key; hash the template file's raw content BEFORE placeholder
substitution). This is deliberately an "upstream moved on" signal, not an "installed
file diverged from a fresh regeneration" signal — it stamps `.argo/config.json`'s
`provenance` (covers any file argo installs from a template, not just rules) with
the template's hash AT ADOPTION TIME; `argo rules status --templates-dir
<plugin>/templates/rules` recomputes the hash of the plugin's CURRENT template and
flags a mismatch. A project's own `{{…}}` fills and later hand-edits never register
as drift (the comparison never touches the installed file's content at all) — only
"the template you adopted from has since changed upstream" does. A rule installed
by hand (not from a template) has no entry and is never flagged.

**Placeholders:** templates carry explicit `{{…}}` slots (`{{TYPECHECK_CMD}}`,
`{{LINT_CMD}}`, `{{TEST_CMD}}`, `{{LOCKFILE}}`, …) wherever a project-specific value
belongs. Fill every slot from the values detected in §2 — never leave a `{{…}}`
literal in an installed file.

## 6. Gated builds — `.argo/` receipts (no workflows to install)
The automated build stage (`/argo:build-plan`) is a **single long-lived builder
session**, not a workflow script — there is nothing to copy into `.claude/workflows/`.
Its commit gates (red-proof, trust — dispatched via `@argohq/toolkit`'s `argo-hook`) are
**inert by default**: they arm only while a build maintains `.argo/evidence/build-mode.json`,
so installing the pack never gates a host project's normal commits.

Setup here is small:
- **`.gitignore` gets the deny-by-default `.argo/` block** (`argo init` writes it in
  §6d): `/.argo/*` with explicit re-includes for `config.json`, `plans/`, `design/`
  only. NEVER narrow it to one subdir — `.argo/` also holds secrets and session-local
  files (tokens, receipts, `evidence/`), and a narrowed ignore would stage them on
  the next `git add -A`.
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

### 6a. Landing mode — ask solo vs team; recorded in `.argo/config.json`
Ask ONE question: "Solo maintainer, or does this project have reviewers?" The answer
becomes the `landing` field of `.argo/config.json` (written by `argo init` in §6d —
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

### 6a2. No-playbook policy — ask the mode; recorded as `noPlaybook`
Ask ONE question: "When an edit happens with no playbook run attached, should argo
allow it silently, allow it but coach toward starting a playbook, or block it?"
The answer becomes the `noPlaybook` field of `.argo/config.json`:

- `"allow"` — every bare edit passes silently. The plugin default: safe for
  existing repos, opinionated but non-breaking. An unanswered question resolves
  here (omit the key — a missing key reads as `allow`); never write
  `coach`/`deny-edits` without an explicit answer.
- `"coach"` (**recommend this**) — bare mutating edits are allowed, but the
  permission hook injects advisory context suggesting
  `argo playbook start <slug> --target <t>`. The right middle ground while the
  playbook catalog matures.
- `"deny-edits"` — bare mutating edits are blocked with the same coaching; for
  delegated/hands-off projects where no mutation should happen outside a gated
  run.

Existing projects change the mode later by editing `.argo/config.json` directly —
no re-init needed.

## 6b. Install enforcement hooks (format-on-write + fast pre-commit)
Guarantee that AI-written code stays typed/lint-clean/formatted **no matter when or by
whom it's written** — layered, treating auto-fixable (format) differently from fail-loud
(type/lint/test):

- **Format = auto-fix, never a gate.** The kit's format-on-write hook (dispatched via
  `argo-hook post-edit-write`, matcher `Edit|Write`) runs the project's own `prettier`
  on each touched file. It activates once `@argohq/toolkit` resolves (§6d). (No project
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
  export — `@argohq/toolkit/reporters/playwright` (schema-verified against
  tdd-guard-vitest). Wire it in the project's playwright config:
  `reporter: [['list'], ['@argohq/toolkit/reporters/playwright', { projectRoot: '<abs repo root>' }]]`.
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
  not durable proof across sessions; `.argo/evidence/red-proof.json` is.
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
node "${CLAUDE_PLUGIN_ROOT}/packages/toolkit/bin/argo.js" init --host-root "<abs repo root>"
```

(Once `bun install` has run, `npx --no -p @argohq/toolkit argo init` works too.) It
deterministically:

- detects **monorepo** (`workspaces` in the root `package.json`) vs **single-repo**;
- places `"@argohq/toolkit": "link:@argohq/toolkit"` at the workspace root (monorepo) or the
  single `package.json` — the dev-phase link protocol; a published release swaps this
  to a normal `^version` dep;
- writes `.claude/settings.json`'s `enabledPlugins` (and `extraKnownMarketplaces`
  when `--marketplace-repo <owner/repo>` is passed) — settings.json is the sole
  owner, never `settings.local.json`;
- seeds the `.argo/config.json` skeleton per mode (one inert `design` key per
  workspace app, or a single `"."` entry) — inert means no `componentsPath`, so no
  commit gate arms until `/argo:setup-design` fills the block. Existing user-set
  fields always survive (mergeConfigShape);
- appends the deny-by-default `.argo/` block to `.gitignore` (idempotent — only
  missing lines are added, user content untouched).

Then register the link source once per machine (`cd <plugin repo>/packages/toolkit &&
bun link`) if not already registered, and run `bun install` in the host project so
the dep resolves. Verify the dep resolves: `npx --no -p @argohq/toolkit argo` prints
its usage (the kit CLI is reachable).

## 6e. rtk — shell-output token compression (opt-in, GLOBAL, offered not imposed)
[rtk](https://github.com/rtk-ai/rtk) is a CLI proxy (single Rust binary) that
rewrites Bash commands to compact equivalents via a PreToolUse hook — `git push`
becomes `ok main`, a 200-line failing test run becomes ~20 lines of just the
failures — for a claimed 60-90% cut in shell-output tokens. A transparent rewrite
before execution: the agent gets compact output without calling `rtk` explicitly.

- **Not per-project — it's a machine-level choice.** rtk's transparent hook for
  Claude Code is **global only** (`rtk init -g`, one entry in
  `~/.claude/settings.json`, affecting every project on the box). There is NO
  project-scoped hook: `rtk init` (local) only injects a "prefix everything with
  `rtk`" block into the project's `CLAUDE.md` — no rewrite, relies on compliance,
  and it directly duels with context-mode's routing rules where a project runs
  context-mode. So argo does NOT wire rtk through `argo init`'s per-project
  settings; surface it as a one-time global opt-in the user makes deliberately,
  then move on. Default-OFF.
- **Detect first.** If `rtk` is already on PATH (`rtk --version`), skip install.
  Otherwise offer the official installer — **never pipe-to-shell** (the plugin's
  own hook blocks `curl … | sh`, correctly): download to a file, let the user
  eyeball it, then run it. `brew` is fine where a tap exists. The binary lands in
  `~/.local/bin` — confirm that's on PATH.
- **Install hook-only.** `rtk init -g --hook-only --auto-patch`: registers the
  transparent hook and writes NEITHER an `RTK.md` nor an `@RTK.md` line in
  `~/.claude/CLAUDE.md`. Drop `--hook-only` and rtk adds that instruction block
  globally — reintroducing the context-mode conflict in every project. The hook
  alone delivers the savings; the prose is noise here. Takes effect on the next
  Claude Code restart, not mid-session.
- **Coexistence with context-mode (state it plainly).** Both fire on Bash. rtk is
  the lighter touch for fire-and-forget commands you only want the gist of (`git
  push`, dir listings); context-mode is for anything you may re-query in detail,
  since rtk's compression is lossy and an rtk-rewritten command gets indexed in
  its already-compressed form. Standing guidance for such a project: route
  processing/analysis through `ctx_execute` (full-fidelity, queryable); let rtk
  trim the shell noise context-mode's routing leaves in raw Bash (`git`, `ls`).
  rtk tees the full unfiltered output on failure, so a failed command stays
  readable without a re-run.
- **Opt-out / uninstall:** `rtk init -g --uninstall` removes the hook (and any
  RTK.md / CLAUDE.md reference); `--no-rtk`, or declining the offer, skips it.

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
  + `.graphify_labels.json`, ignores `graph.html`/`cache/`/analysis). The refresh logic
  itself ships in the kit as `argo graph refresh` — nothing to copy; it auto-discovers
  workspaces, so it serves monorepo and single-app unchanged.
- **Single touchpoint, single writer = a `post-merge` git hook** (installed via
  `lefthook`), on-device. It fires **only when `main` integrates commits** (a merge or
  `git pull`) — the one moment the graph should advance — and runs `argo graph refresh`
  (the `@argohq/toolkit` CLI): `graphify update --force` + `graphify label --missing-only
  --backend=claude-cli` (spawns on-device `claude` — subscription auth, **no API key**)
  + a pathspec-scoped commit. The verb self-guards (graphify-missing, main-only, skips
  worktrees), so worktree/feature-branch commits never write the graph → no write-race.
  `post-merge` (not `post-commit`) means it never fires on ordinary commits and can't
  recurse on its own graph commit. Must run where `claude` is authenticated —
  **on-device, not headless CI**; without a backend, labels degrade to `Community N`
  (no crash).
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

## 8a. Durable tool-routing block (conditional — only for detected tools)
context-mode and graphify both inject routing guidance per session (via their own
hooks/skills), but injected context is **summarized away on `/compact`** — mid-long-session,
Claude drifts back to raw `Read`/`grep`/`WebFetch` and the context savings evaporate. The
fix is to keep the routing in the **project-root CLAUDE.md**, which survives compaction. A
path-scoped `.claude/rules/*.md` would NOT work here — those load only when a matching file
is read and get summarized like anything else — so this belongs in CLAUDE.md, not a rule
template.

Only if §2 detected the tool: **ask** (one AskUserQuestion, per-tool multiSelect) whether to
add its durable routing block to CLAUDE.md. Skip a tool's block silently if that tool is
absent. Append only the detected tools' sub-blocks under one `## Tool routing (kept durable
across compaction)` heading:

**graphify sub-block** (if graphify present):
```markdown
**graphify (knowledge graph):**
- Code questions ("where does X live", "what depends on Y", architecture) → query the
  graphify knowledge graph first when a `graphify-out/` exists; faster and more complete
  than cold grep. Fall back to grep only if the graph doesn't answer.
- Refresh only via `argo graph refresh` — single writer, on `main`, on-device.
```

**context-mode sub-block** (if context-mode present):
```markdown
**context-mode (context window):**
- Processing data (filter/count/parse/aggregate/search) → `ctx_execute` /
  `ctx_batch_execute`, `console.log` only the answer. Never read raw data into context
  just to eyeball it.
- Analyzing a file (not editing it) → `ctx_execute_file`. Native `Read` only when the
  next step is `Edit`.
- Web content → `ctx_fetch_and_index` then `ctx_search`. Never `WebFetch` raw pages.
- Bash ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, install commands. Everything
  else routes through the ctx tools.
- On resume / after compaction → `ctx_search(sort: "timeline")` BEFORE asking the user.
- Stats/health → the `/ctx-stats` and `/ctx-doctor` slash commands (not the bare phrase
  "ctx stats", which grabs the skill instead of the tool).
- Images/screenshots can't be sandboxed and reads-for-editing must be native — routing
  has a real ceiling, don't force it.
```

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

## 9. Finalize `.argo/config.json`, report + one-step revert
`argo init` (§6d) seeded the skeleton; before reporting, complete it (these fields
ride the SAME `.argo/config.json` — there is no separate config file):

```json
{
  "landing": "merge",
  "noPlaybook": "coach",
  "design": { "…": {} }
}
```

- `landing` — from §6a's answer.
- `noPlaybook` — from §6a2's answer (`allow` | `coach` | `deny-edits`); omit
  the key if the question went unanswered (missing key reads as `allow`).
- `design` — leave the CLI-seeded inert keys alone; `/argo:setup-design` owns
  their contents.

There is NO `setupVersion`/`managedFiles` lifecycle state — the installed rules
are static suggestions, never reconciled against a plugin version.

Then report: list exactly what was written where, and how to re-run or revert.
Be idempotent; every file this skill writes must be removable in one step.
