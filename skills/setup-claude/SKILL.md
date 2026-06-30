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

## 6. graphify (conditional) — treat the graph as local build cache
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

## 7. Write stack-facts + canonical loop into CLAUDE.md
Record the detected commands/paths (so skills/agents use real values, not
placeholders) and the canonical loop: **scaffold → grill → plan → test-first build →
review → debug → handoff.**

## 8. Report + one-step revert
List exactly what was written where, and how to re-run or revert. Be idempotent;
every file this skill writes must be removable in one step.
