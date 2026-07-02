---
name: setup-claude
description: Detect the host project's stack and install ADAPTED argo rules into the project's own .claude/, tailored to what's there and never imposed. Use once when adding the argo pack to a project, or when the user says "set up argo" / "configure argo for this project" / "adapt the rules to my stack".
---

# Set Up Argo in This Project

The argo plugin ships opinionated rules as **inert templates** under
`${CLAUDE_PLUGIN_ROOT}/templates/` — never as active rules — so installing the pack
imposes nothing. This skill turns those templates into **adapted, correctly-scoped
rules in the host project's `.claude/`**, matched to the stack that's actually there.

**Core principle:** opinionated, never imposing. Detect what's real, propose with a
reason, ask before writing, never overwrite what the user hand-wrote.

## 1. Refuse to clobber
If `.claude/rules/` already has argo-managed rules, switch to update/diff mode —
show what would change and ask. Never overwrite a hand-authored file.

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
Its commit gates (`red-proof-gate.mjs`, `trust-gate.mjs`) auto-load with the plugin and
are **inert by default**: they arm only while a build maintains `.argo/build-mode.json`,
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

## 6b. Install enforcement hooks (format-on-write + pre-push gate)
Guarantee that AI-written code stays typed/lint-clean/formatted **no matter when or by
whom it's written** — layered, treating auto-fixable (format) differently from fail-loud
(type/lint/test):

- **Format = auto-fix, never a gate.** The plugin's `format-on-write.mjs` PostToolUse hook
  (auto-loaded, matcher `Edit|Write`) runs the project's own `prettier` on each touched
  file. No install needed here — it activates with the plugin. (No project prettier → it
  no-ops silently.)
- **Type + lint + test = the gate.** A **CI required status check on the protected
  branch** running the FULL graph (`turbo run typecheck lint test`) is recommended where
  a team exists — it's the one layer `--no-verify` can't reach and is author-agnostic.
  If the project has CI, wire that as a required check. For a single-builder personal
  project, the pre-push gate below is an acceptable last line.
- **No CI → install the pre-push gate.** Copy `${CLAUDE_PLUGIN_ROOT}/templates/lefthook.yml`
  to the project root, `bun add -d lefthook`, add `"prepare": "lefthook install"` to the root
  `package.json` (so a fresh clone re-installs the hook), and run `lefthook install` once.
  Fill its `{{…}}` slots from the detected typecheck/lint/test (plain, no
  force flags — see §6 on cache trust). Pre-push is bypassable — it's fast local feedback;
  recommend adding CI when the project grows a team.

Do not gate formatting in the pre-push hook or CI-as-failure beyond a `--check` backstop —
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
- **Playwright:** upstream has no reporter, but this pack bundles one —
  `${CLAUDE_PLUGIN_ROOT}/reporters/tdd-guard-playwright/` (schema-verified against
  tdd-guard-vitest). Wire it in the project's playwright config:
  `reporter: [['list'], ['tdd-guard-playwright', { projectRoot: '<abs repo root>' }]]`
  and add the package via the project's package manager (path dep until published).
- **Auth pre-check (hard requirement):** tdd-guard's validation model must run on the
  Claude Code SDK/subscription auth (its default, `VALIDATION_CLIENT=sdk`) — metered
  API keys are banned here. Confirm `ANTHROPIC_API_KEY` is NOT set in the environment
  (if set, Claude Code may bill it); if the project can only run tdd-guard via an API
  key, STOP and surface — do not adopt.
- **Opt-out:** `--no-tdd` (or the user saying so) skips this whole step. Mid-session,
  tdd-guard has its own toggle for legitimate exceptions — spikes disable it for the
  session (throwaway code has a "no tests" contract by design; see the spike skill).

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

## 9. Report + one-step revert
List exactly what was written where, and how to re-run or revert. Be idempotent;
every file this skill writes must be removable in one step.
