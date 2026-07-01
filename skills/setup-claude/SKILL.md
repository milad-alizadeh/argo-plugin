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

## 6. Install workflows
Copy `${CLAUDE_PLUGIN_ROOT}/templates/workflows/*` into the project's
`.claude/workflows/` (create it if absent) — these are the orchestration scripts the
Workflow tool runs (plugins can't auto-load workflows, so they're installed here, like
the rules). `build-slice` is the automated build stage invoked by `/argo:build-feature`;
it expects the argo agents (`argo:builder`/`argo:reviewer`), also installed by this pack.

**Instantiate, don't ship raw:** `build-slice`'s `verifyCmd` default is a bun placeholder.
Replace it with the project's **detected** typecheck/lint/test commands (from §2) so it
doesn't fail every slice on a non-bun project — same adapt-on-install treatment the rules
get. **Defeat build-cache false-greens:** if the project uses a caching task runner
(turbo/nx/bazel), the instantiated `verifyCmd` MUST force execution (e.g. `TURBO_FORCE=true`
/ `--force`) — a cached pass can mask tests that never ran (observed in dogfooding). Don't
overwrite a workflow the user has edited: switch to diff/ask mode (per §1).

**Wire the trust gate (§7, only if the trust-gate hook is installed):** `build-slice`
chains `${CLAUDE_PLUGIN_ROOT}/hooks/trust-gate.mjs` onto Verify for slices marked
`requiresLaunch` (those that ship launchable app/UI behaviour). Export
`ARGO_TRUST_GATE=<abs path to trust-gate.mjs>` in the build environment (or pass
`trustGateCmd` as a workflow arg) so those slices go RED unless a launch evidence receipt
(`.argo/launch-receipt.json`) proves the app was launched **and** exercised. Pure
logic/library/config slices set `requiresLaunch:false` and are unaffected — the gate never
blocks a slice that isn't shipping launchable behaviour.

## 6b. Install enforcement hooks (format-on-write + pre-push gate)
Guarantee that AI-written code stays typed/lint-clean/formatted **no matter when or by
whom it's written** — layered, treating auto-fixable (format) differently from fail-loud
(type/lint/test):

- **Format = auto-fix, never a gate.** The plugin's `format-on-write.mjs` PostToolUse hook
  (auto-loaded, matcher `Edit|Write`) runs the project's own `prettier` on each touched
  file. No install needed here — it activates with the plugin. (No project prettier → it
  no-ops silently.)
- **Type + lint + test = the gate.** The load-bearing guarantee is a **CI required status
  check on the protected branch** running the FULL graph (`turbo run typecheck lint test`),
  because it's the one layer `--no-verify` can't reach and is author-agnostic. If the
  project has CI, wire that as a required check.
- **No CI yet → install the pre-push gate.** Copy `${CLAUDE_PLUGIN_ROOT}/templates/lefthook.yml`
  to the project root, `bun add -d lefthook`, add `"prepare": "lefthook install"` to the root
  `package.json` (so a fresh clone re-installs the hook), and run `lefthook install` once.
  Instantiate the three `run:` commands from the detected typecheck/lint/test (with the same
  cache-buster as §6). Pre-push is bypassable — it's fast local feedback, not the guarantee;
  say so and recommend adding CI later.

Do not gate formatting in the pre-push hook or CI-as-failure beyond a `--check` backstop —
a machine can fix whitespace; failing a build on it is waste.

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
- **Blast-radius review escalation (graphify-derived):** `refresh-graph.sh` also runs
  `blast-radius.mjs` (installed alongside it) to emit `.argo/blast-radius.json` — the paths
  the graph flags as high-impact (most **dependents**, dependency edges only, never
  `contains`). `/argo:build-feature` passes this to `build-slice`, whose review gate
  escalates when a slice edits one — the risky-path glob's data-derived cousin, catching the
  UNNAMED central module the hand-named glob misses. It is **dormant until the graph captures
  real import/call edges** (a shallow `contains`-only graph emits an empty set → no false
  escalations), so it's safe to install early; its usefulness scales with graph richness.
- **Install the templates** from `${CLAUDE_PLUGIN_ROOT}/templates/graphify/`: append
  `gitignore` to the project's `.gitignore` (commits `graph.json` + `GRAPH_REPORT.md`
  + `.graphify_labels.json`, ignores `graph.html`/`cache/`/analysis), and copy
  `refresh-graph.sh` into the project (e.g. `scripts/`). The script auto-discovers
  workspaces, so it serves monorepo and single-app unchanged.
- **Single writer = the `integrator` agent (or a local main-side step), on-device.**
  On each integration to `main`, hands-off, it runs `refresh-graph.sh`:
  `graphify update --force` + `graphify label --missing-only --backend=claude-cli`
  (spawns on-device `claude` — subscription auth, **no API key**) + commit. The writer
  must run where `claude` is authenticated — **on-device, not headless cloud CI**;
  without a backend, labels degrade to `Community N` (no crash). Solo dev = one
  writer, one machine → no write-race.
- **Worktrees never commit the graph** — they read main's (present + labeled
  instantly on checkout). An agent that wants its own in-flight code mapped runs a
  **local, uncommitted** `graphify update <ws>` (never staged) — so parallel
  worktrees can't conflict on graph files. No merge-driver, no per-worktree hooks.

If graphify is absent, skip silently — the active skills degrade to plain read/grep.

## 8. Write stack-facts + canonical loop into CLAUDE.md
Record the detected commands/paths (so skills/agents use real values, not
placeholders) and the canonical loop: **scaffold → grill → plan → test-first build
(interactive) or /argo:build-feature (automated, worktree-isolated) → review → debug →
handoff.**

## 9. Report + one-step revert
List exactly what was written where, and how to re-run or revert. Be idempotent;
every file this skill writes must be removable in one step.
