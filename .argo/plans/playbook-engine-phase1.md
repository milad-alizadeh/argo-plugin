# Workflow engine — phase 1: core + adapter-claude + pack-design

> Naming note (non-normative, do not act on it in this build): the engine
> concept here called "workflow" is renamed to **playbook** in phase 2
> (`playbook-rename-phase2.md`). Build phase 1 exactly as written below.

Status: ready to build. Source of truth: `.claude/design/workflow-engine.md` (settled,
audit items 1.1–1.5 already folded in — do not relitigate). Audit rationale:
`.claude/design/workflow-engine-audit.md`. Design fixtures (pre-audit, historical shape
reference only, NOT the phase-1 diagram target):
`/Users/milad/.claude/jobs/008009a4/tmp/design-workflows.md`,
`/Users/milad/.claude/jobs/008009a4/tmp/code-workflows.md`.

Scope: `@argohq/core`, `@argohq/adapter-claude`, `@argohq/pack-design`. Everything
pack-code/pack-product/land/Probity/Codex is phase 2+ — named where core's seams touch
them, never built here.

---

## Open questions — resolved by reasonable call (recorded, not blocking)

These surfaced while grounding against the real repo. None contradicts a settled
design-doc decision; each is "the doc describes the target state, the repo hasn't
moved there yet" — I'm recording the call rather than re-litigating, per the
auto-mode bias to proceed. Flag if any should have gone to you instead.

1. **Config file moves: `.claude/argo.json` → `.argo/config.json`.** Today's kit reads
   `.claude/argo.json` (`packages/kit/src/config/argo-json.ts:28-43`, `findArgoJson`).
   The design doc's "Host project layout" section is explicit and settled: single
   `.argo/` root owns `config.json`; `.claude/` keeps only Claude-native config. Phase 1
   introduces `.argo/config.json` as the new home for `packs`, `noWorkflow`,
   `testDiscipline`, `land.mode`, gate settings — core's config reader only ever knows
   this path. The existing design-pack gates (`design-commit-gate`, `trust-gate`,
   `red-proof-gate`) keep reading `.claude/argo.json` for their own `design.<app>`
   block unchanged in phase 1 (out of scope: no rewrite of already-shipped design-guard
   consumers). The two files coexist through phase 1; a follow-up migration folding
   `design.<app>` into `.argo/config.json` is phase 2+, noted as a seam below.
2. **Repo/package rename to `argohq` monorepo, lockstep Changesets `fixed` group.** The
   design doc names this as the target shape. Root `package.json` today is
   `@argo/plugin-dev` with `workspaces: ["packages/*"]` and no Changesets config
   (confirmed: no `.changeset/` dir). Phase 1 adds the three new packages under the
   existing `packages/*` workspace glob (no rename needed — it already matches) and does
   NOT set up Changesets/lockstep versioning; each new package ships its own
   `0.1.0` and is wired by path/dev-link the same way `@argohq/kit` is today
   (`packages/kit/package.json` pattern). Lockstep versioning is a release-process
   concern, not a phase-1 code dependency — deferred, noted as a seam.
3. **`argo` CLI binary collision.** `@argohq/kit`'s `bin` is already named `argo`
   (`packages/kit/package.json:6-8`, `packages/kit/bin/argo.js`). The design doc's CLI
   verbs (`argo workflow start/status/advance/adopt/diagram`) read as the SAME `argo`
   binary gaining a new top-level subcommand family, alongside existing `argo-hook`,
   `design`, `init`, `graph`. Phase 1 adds `workflow` as a fourth subcommand to
   `packages/kit/bin/argo.js`'s switch — it is NOT a new binary and does NOT live in
   `@argohq/core`'s own `bin/` (core ships the engine as a library; kit's existing CLI
   entrypoint is the one place a human types `argo`, so it's the thinnest place to wire
   a new subcommand without asking every project to add a second global bin). If this
   split (core = library, kit = CLI surface) is wrong, that's the one call in this list
   worth confirming before build-plan starts.

---

## Context — what exists today (grounded)

- **Monorepo shape:** `packages/kit` is the only real package today (336 files under
  `src/`, `dist/` pre-built via `tsc`). Root `package.json:6-8` workspaces
  `["packages/*"]` — adding `packages/core`, `packages/adapter-claude`,
  `packages/pack-design` needs no workspace-glob change.
- **kit's CLI dispatch (`packages/kit/bin/argo.js:20-35`):** `HOOK_CHAINS` maps a hook
  event name to an ordered list of gate modules run as child processes, first non-zero
  exit short-circuits. `bash-pretooluse` today runs
  `red-proof-gate.js → trust-gate.js → design-commit-gate.js` — this is exactly the
  shape the new generic PreToolUse permission hook needs to slot into (a new
  `workflow-permission-gate` module added to this chain, or a new hook event name
  dispatched the same way).
- **Plugin-side hook wiring (`hooks/hooks.json`):** safety hooks (dangerous-git,
  pipe-to-shell, lockfile-edit, bash-source-write, designer-spawn) run directly from
  the plugin dir; every kit-owned gate goes through
  `hooks/kit-dispatch.mjs → node bin/argo.js argo-hook <event>` (fail-closed when
  `@argohq/kit` is declared but not installed, allow-with-warning when the project
  isn't argo-initialized at all — `hooks/kit-dispatch.mjs:98-120`). The new generic
  workflow-permission hook is ANOTHER `PreToolUse` matcher `*` entry added to this same
  file, dispatched through the same `kit-dispatch.mjs` pattern (new event name, e.g.
  `workflow-permission`).
- **Existing config reader (`packages/kit/src/config/argo-json.ts`):** `findArgoJson`
  walks up from `cwd` to the nearest `.claude/argo.json` (repo-root-relative to THAT
  file, not necessarily the git root — `resolveDesignArming`, `armedDesignApps`).
  `packages/kit/src/lib/repo-root.ts` gives the actual git top-level, used by
  design-guard's state file. Core's new config/state readers are new, separate modules
  — they must NOT reuse `findArgoJson` (different file, different shape) but SHOULD
  reuse `resolveRepoRoot` for computing the state store's project-id (git common dir).
- **Existing gate shape to imitate (`trust-gate.ts`, `red-proof-gate.ts`):** stdin-JSON
  hook envelope, self-scoping via a marker file
  (`.argo/build-mode.json`) checked before any enforcement, fail-closed once armed,
  `effectiveRepoDir` resolution that follows `-C`/`--git-dir`/`--work-tree` and ascends
  to the git toplevel so a subdirectory commit can't dodge the gate. The new generic
  permission hook's path resolution and self-scoping (config decides `noWorkflow`
  behavior) follow this exact pattern.
- **No workflow engine, no gate registry, no state store, no classifier, no Probity
  wiring exist yet anywhere in the repo** — phase 1 is greenfield for all three new
  packages; nothing to migrate for the engine itself. What DOES migrate (per the
  design doc's migration map, phase-1-relevant rows only):
  - tier0-rules + tier0-audit (`packages/kit/src/recipes/shadcn-tailwind/tier0-rules.ts`,
    `src/skill-scripts/bundle-tier0-audit.ts`) → pack-design `design-rules-check` gate.
  - comparator (`src/design-kit/comparator.ts`, OKLCH color-diff logic already
    zod-free and pure) → reused by pack-design's `design-matches-code` gate (phase 2
    consumer; phase 1 wires the gate to call it, no comparator rewrite needed).
  - registry gen / manifest schema (`src/skill-scripts/register-screen.ts`,
    `src/skill-scripts/pull-registry.ts`, `src/design-kit/schemas.ts`) → pack-design's
    registry module, referenced by name from `screen-create`'s registry-sync stage.
  - design-guard hooks (`src/hooks/design-guard-stop.ts`,
    `hooks/kit-dispatch.mjs`'s `design-guard-record`/`design-guard-stop` chain entries)
    are DELETED once the generic permission hook + `screen-create`/`screen-edit` specs
    replace their enforcement — deletion happens in this phase since pack-design is in
    scope, but only after the new hook chain is proven (ordering in the steps below).
  - fidelity/design-verifier harness (`agents/fidelity-verifier.md`,
    `agents/design-verifier.md`) → pack-design's `fresh-eyes-review` gate, calling
    `core.judge`. Agent persona files stay in the plugin (thinned to persona+toolset per
    the design doc); the judging logic moves to the gate.
- **Test tooling:** root `vitest.config.ts` runs `packages/**/*.test.{js,mjs,ts}` with
  the `tdd-guard-vitest` reporter already wired — new packages' tests are picked up
  automatically by this glob, no config change needed.

---

## Architecture recap (no new decisions — restating what's already settled, for the
build order below to hang off)

`plugin → adapter-claude → core ← packs`. Core: stage-spec schema, gate registry,
`GateInput`/`GateVerdict`, `core.judge` seam (adapter registers an implementation at
startup), state store (`~/.argo/state/<project-id>/`), protected-path deny list,
action-kind membership check, CLI verbs. adapter-claude: PreToolUse hook envelope,
action classifier (one table, fail-closed on ambiguity, fail-open only for kinds it
doesn't recognize — safe only because destructive kinds are explicitly enumerated and
denied per audit 1.2), session spawn (fresh/warm/retry), `core.judge` implementation
(spawns a blind session fed only artifact URIs). pack-design: six workflow specs, three
gates (`design-rules-check`, `fresh-eyes-review`, `design-matches-code`), registry
module, craft text, rule templates.

---

## Files to change / create

**New package `packages/core/`:**
- `package.json` — `@argohq/core`, no adapter/pack deps, `zod` for schema validation
  (already a kit dep elsewhere, same version).
- `src/spec.ts` — `defineWorkflow`, stage-spec types (`requires/produces/allows/policy/
  gate/skill/session/retries/repeat/maxRounds`).
- `src/gate.ts` — `Gate` interface, `GateInput`, `GateVerdict`, gate registry
  (`registerGate`/`getGate`).
- `src/judge.ts` — `core.judge(spec) → verdict-shaped result` capability seam +
  registration function the active adapter calls at startup.
- `src/permissions.ts` — action-kind membership check (string equality, no enumeration
  of domain kinds), protected-path deny list (`~/.argo/state/**`, `.argo/config.json`,
  `probity.config.ts` at repo root, `registry.json`, `manifests/`), `git-history-mutation`
  action kind constant.
- `src/config.ts` — `.argo/config.json` reader (packs, `noWorkflow`, `testDiscipline`,
  `land.mode`), live per-call read (no session-start cache, per the settled decision).
- `src/state.ts` — state store: `workflows/<key>.json` read/write (`attempts[]`,
  `history[]`), project-id derivation via git common dir (reuse
  `resolveRepoRoot`-equivalent logic, generalized for worktrees sharing one store).
- `src/cli/workflow-start.ts`, `workflow-status.ts`, `workflow-advance.ts`,
  `workflow-adopt.ts`, `workflow-diagram.ts` — the five CLI verbs' logic (pure
  functions; wiring into `bin/argo.js`'s switch is an adapter-claude/kit-glue step, see
  below).
- `src/diagram.ts` — mermaid renderer for the phase-1-expressible skeleton (stages,
  gates, retry/fix-round loops from `retries`/`maxRounds`, `repeat` annotated) — no
  runtime-decision diamonds.
- One `.test.ts` per module above, colocated (matches kit's convention).

**New package `packages/adapter-claude/`:**
- `package.json` — `@argohq/adapter-claude`, depends on `@argohq/core`.
- `src/classifier.ts` — the one `(toolName, toolInput) → actionKind` table: Bash by
  command-string, `use_figma` by script-sniff, git-history-mutation detection
  (reset/amend/rebase/checkout-of-tracked-paths/filter-branch), unclassified → allowed.
- `src/hook.ts` — the generic PreToolUse hook body: read active workflow instance from
  state (session-cached) → no active instance ⇒ config's `noWorkflow` → protected-path
  check (before stage `allows`, unconditional) → classify → membership check → deny
  with stage/rule/correct-path coaching message.
- `src/session.ts` — FRESH/WARM/RETRY session spawn against the Claude Code session
  API: FRESH feeds only `requires` artifacts + skill + one-line frame; WARM keeps the
  session across repeat units; RETRY is a fresh session fed the gate verdict +
  `attempts[]`.
- `src/judge-impl.ts` — the adapter's `core.judge` implementation: spawns a fresh,
  blind session, accepts only artifact URIs (never the working transcript).
- One `.test.ts` per module.

**New package `packages/toolkit/packs/design/`:**
- `package.json` — `@argohq/pack-design`, depends on `@argohq/core` only.
- `src/workflows/screen-create.ts`, `component-create.ts`, `component-edit.ts`,
  `screen-edit.ts`, `design-to-code.ts`, `code-to-design.ts` — the six `defineWorkflow`
  specs, flat stage lists per the settled "no branch field" ruling (same-convergence
  forks like "Code-owned?"/"Exists?" resolved inside the stage's skill by reading
  registry/annotation metadata, not spec branching).
- `src/gates/design-rules-check.ts` — wraps the existing tier0-rules/tier0-audit logic
  (`packages/kit/src/recipes/shadcn-tailwind/tier0-rules.ts`,
  `src/skill-scripts/bundle-tier0-audit.ts`) behind the `Gate` interface; reads Figma
  directly, never a working-agent self-report.
- `src/gates/fresh-eyes-review.ts` — calls `ctx.judge(...)`, never imports
  adapter-claude; compares finished artifact against the brief.
- `src/gates/design-matches-code.ts` — the code-to-design mirror gate; captures its own
  screenshot at check time (never accepts a working-agent-supplied image URI per audit
  2.2), reuses `packages/kit/src/design-kit/comparator.ts`'s OKLCH diff.
- `src/policies/` — none in phase 1 (Probity policies are pack-code territory); note
  the seam only.
- `src/registry/` — thin wrapper over the existing `register-screen.ts`/
  `pull-registry.ts`/`schemas.ts` kit modules, exposed as pack-design's registry module
  referenced by `screen-create`'s registry-sync stage.
- `craft/*.md` — craft text migrated from the plugin's `skills/design-screen/SKILL.md`,
  `skills/figma-create/SKILL.md`, `skills/figma-audit/SKILL.md`,
  `skills/figma-sync/SKILL.md`, `skills/figma-to-code/SKILL.md`, `skills/resolve-comments/
  SKILL.md` — enforcement prose stripped (permissions/gates do it now), craft-only
  content kept.
- `templates/rules/*` — rule templates `argo init` installs when pack-design is
  enabled (new home; nothing currently lives here to migrate from — design rules today
  are baked into skill prose, being extracted).
- One `.test.ts` per gate/workflow-spec module (specs are pure data — unit-testable
  with fake gates per the design doc).

**Modified existing files:**
- `packages/kit/bin/argo.js` — add `workflow` subcommand (start/status/advance/adopt/
  diagram) dispatching to `@argohq/core`'s CLI functions; add a `workflow-permission`
  entry to `HOOK_CHAINS` dispatching to `@argohq/adapter-claude`'s hook body.
- `hooks/hooks.json` — add one `PreToolUse` matcher `*` entry calling
  `kit-dispatch.mjs workflow-permission`, ordered AFTER the existing safety hooks
  (dangerous-git etc. stay first — they're a stricter, unconditional floor) and BEFORE
  nothing else needs to run first.
- `packages/kit/package.json` — add `@argohq/core`, `@argohq/adapter-claude`,
  `@argohq/pack-design` as dependencies of the CLI glue (kit's `bin/argo.js` is the
  thinnest place these three packages get invoked from, per open question 3 above).
- `src/hooks/design-guard-stop.ts`, `hooks/kit-dispatch.mjs`'s `design-guard-record`/
  `design-guard-stop` chain entries — DELETED in the last step of this plan, once
  `screen-create`/`screen-edit` + the generic permission hook are proven end-to-end
  (migration map: "design-guard, session-guard hooks — DELETED").
- `agents/design-verifier.md`, `agents/fidelity-verifier.md` — thinned to
  persona+toolset; judging logic removed (now lives in `fresh-eyes-review` gate).
- `skills/design-screen/SKILL.md` (+ the five other design skills named above) —
  thinned to craft-only; sequencing/gate-invocation/state-write/enforcement prose
  removed (now `pack-design/craft/*.md`, included at build time — build-time include
  mechanism itself is a small addition to whatever currently assembles `SKILL.md` from
  source, confirmed absent today, so this is new plumbing, scoped to "wrapper includes
  craft file" — no templating engine).

---

## Step-by-step work items (ordered, red-green)

Each step is its own vertical slice: write the failing test first, implement, green,
commit. Verify command for every step: `bun test packages/core` /
`bun test packages/adapter-claude` / `bun test packages/pack-design` (vitest picks
these up via the root config's glob) plus `bun run --cwd packages/<pkg> build` (tsc)
once a package has a `tsconfig.json`.

### Slice 1 — `@argohq/core` spec + gate registry (no state, no permissions yet)
1. Scaffold `packages/core/package.json` + `tsconfig.json` (copy kit's compiler options
   verbatim — same target/strict/NodeNext). `testable: true`, `requiresLaunch: false`.
2. `src/spec.ts`: `defineWorkflow(spec)` — validates the stage vocabulary shape
   (zod schema mirroring kit's `src/design-kit/schemas.ts` pattern), returns the spec
   unchanged (specs are pure data). Test: a spec missing a required field throws; a
   valid spec round-trips. `testable: true`, `requiresLaunch: false`.
3. `src/gate.ts`: `Gate` interface, `GateInput`/`GateVerdict` types, `registerGate`/
   `getGate` registry (a `Map<string, Gate>`, throws on duplicate name registration).
   Test: register two gates, fetch by name, duplicate-name registration throws.
   `testable: true`, `requiresLaunch: false`.
4. `src/judge.ts`: `registerJudge(fn)` / `core.judge(spec)` — throws "no judge
   registered" if called before an adapter registers one; a registered judge is called
   with only the spec's artifact URIs (type-level: the function signature never accepts
   a transcript field). Test: unregistered call throws; registered call forwards args
   and returns the verdict. `testable: true`, `requiresLaunch: false`.

**Seam declaration: checkpoint review after Slice 1** — spec/gate/judge are the
type surface every later package imports; confirm the shapes before building state/
permissions/CLI on top.

### Slice 2 — `@argohq/core` state store + `attempts[]`
5. `src/state.ts`: project-id derivation from git common dir (new helper, generalizes
   `packages/kit/src/lib/repo-root.ts`'s `resolveRepoRoot` to resolve the common dir
   across worktrees via `git rev-parse --git-common-dir`, not just `--show-toplevel`).
   Test: two worktrees of the same repo resolve to the same project-id. `testable:
   true`, `requiresLaunch: false`.
6. `src/state.ts`: `readInstance(key)`/`writeInstance(key, instance)` against
   `~/.argo/state/<project-id>/workflows/<key>.json` — instance shape `{ workflow,
   target, stage, status, attempts: [{round, gate, findings, whatWasTried}], history:
   [{stage, gate, at, verdict}] }`. Test: write then read round-trips; missing file
   reads as "no instance". `testable: true`, `requiresLaunch: false`.
7. `src/state.ts`: append-only `attempts[]`/`history[]` helpers — `recordAttempt`,
   `recordHistory` — never allow overwriting a prior entry, only append. Test:
   recording twice yields two entries in order. `testable: true`, `requiresLaunch:
   false`.

### Slice 3 — `@argohq/core` permissions: action-kind membership + protected paths
8. `src/permissions.ts`: `isActionAllowed(actionKind, stageAllows)` — plain string-
   equality membership check, no domain enumeration. Test: kind in `allows` passes,
   kind absent fails, empty `allows` fails everything. `testable: true`,
   `requiresLaunch: false`.
9. `src/permissions.ts`: protected-path deny list — `isProtectedPath(path)` matching
   `~/.argo/state/**`, `.argo/config.json`, `probity.config.ts` (repo root — note the
   audit's explicit callout that this file sits OUTSIDE `.argo/`, so a
   `.argo/`-prefix-only rule would miss it), `registry.json`, `manifests/**`. Test:
   each listed pattern matches; an adjacent non-protected path (e.g.
   `.argo/design/brief.md`) does not. `testable: true`, `requiresLaunch: false`.
10. `src/permissions.ts`: `git-history-mutation` action-kind constant, exported for
    the classifier to reference (denied-by-default is enforced in the classifier +
    hook, not here — core just names the kind). Test: constant is a stable string,
    reachable by import. `testable: true`, `requiresLaunch: false`.

### Slice 4 — `@argohq/core` config reader
11. `src/config.ts`: `.argo/config.json` reader — walks up from cwd (same pattern as
    kit's `findArgoJson`, new module, does not import `argo-json.ts`) to the nearest
    `.argo/config.json`; returns `{ packs, noWorkflow, testDiscipline, land }` with
    documented defaults (`noWorkflow: "allow"`) when a key is absent. Read LIVE per
    call — no caching — per the settled decision. Test: missing file → defaults;
    present file → values read verbatim; malformed JSON → defaults (never throws
    inside a hook). `testable: true`, `requiresLaunch: false`.
12. `src/config.ts`: cross-pack refusal check — `assertPackAvailable(workflowName,
    requiredPack, config)` throws a named config error when a workflow's terminal
    stage hands off to a disabled pack (per audit 2.4), called from
    `workflow-start.ts` (Slice 5) at start time, never mid-run. Test: pack-design
    enabled + pack-code disabled + a `design-to-code`-shaped spec → throws naming
    `pack-code`. `testable: true`, `requiresLaunch: false`.

### Slice 5 — `@argohq/core` CLI verbs (library functions; no bin wiring yet)
13. `src/cli/workflow-start.ts`: given `{ name, target }`, resolves the spec (looked
    up by name from a spec registry the packs populate at import time — same shape as
    `registerGate`), calls `assertPackAvailable`, writes the initial `workflows/<key>.json`
    instance at stage 0. Test: unknown workflow name errors; a valid start writes the
    instance. `testable: true`, `requiresLaunch: false`.
14. `src/cli/workflow-status.ts`: reads and formats an instance for display (stage,
    status, last verdict, `stuck` flag when retry budget exhausted). Test: a `stuck`
    instance (attempts.length >= retries) reports `stuck`; a normal one reports its
    current stage. `testable: true`, `requiresLaunch: false`.
15. `src/cli/workflow-advance.ts`: runs the current stage's gate, records the verdict
    to `history`, advances `stage` on pass or records an `attempts[]` entry and retries
    or parks `stuck` on fail (budget from `retries`/`maxRounds`). Test: pass advances;
    fail within budget increments attempts and stays; fail past budget sets `stuck`.
    `testable: true`, `requiresLaunch: false`.
16. `src/cli/workflow-adopt.ts`: walks stages in order from the start, re-running
    each stage's declared gate against discovered artifacts, sets current stage to the
    highest CONTIGUOUSLY-passing one (per audit 2.1 — never trust artifact presence
    alone); for a gate that can't be safely re-run, records `verified: false`
    provenance in `history` instead of advancing past it. Test: a stage with a
    fabricated artifact but a failing re-run gate does not advance past it; a
    genuinely un-re-runnable gate records `verified: false` and stops there. `testable:
    true`, `requiresLaunch: false`.
17. `src/diagram.ts` + `src/cli/workflow-diagram.ts`: renders a spec's stages as
    FRESH/WARM mermaid nodes, gates on edges, retry/fix-round loops from `retries`/
    `maxRounds`, `repeat` annotated — the phase-1-expressible skeleton only, no
    runtime-decision diamonds (per audit 1.5's resolution). Test: a spec with
    `retries: 2` renders a labeled retry loop edge; a spec with no `repeat` renders no
    repeat annotation. `testable: true`, `requiresLaunch: false`.

**Checkpoint review after Slice 5** — this is core's complete public surface; adapter-
claude and pack-design both build against it starting Slice 6. Confirm the CLI verb
signatures before two packages start depending on them.

### Slice 6 — `@argohq/adapter-claude` classifier + judge implementation
18. Scaffold `packages/adapter-claude/package.json` + `tsconfig.json`, dependency on
    `@argohq/core`. `testable: true`, `requiresLaunch: false`.
19. `src/classifier.ts`: the `(toolName, toolInput) → actionKind` table for generic
    kinds (`file-read, file-edit, git-commit, test-run, web-fetch`) plus
    `git-history-mutation` detection by command-string parse (reset/amend/rebase/
    checkout-of-tracked-paths/filter-branch) and `figma-read`/`figma-write` by
    script-sniff on `use_figma` calls. Ambiguity fails closed to the stricter kind;
    truly unclassified → allowed (safe only because destructive kinds are explicitly
    enumerated per audit 1.2 — test this exact invariant). Test: each named git
    subcommand classifies as `git-history-mutation`; a benign `git status` classifies
    as unclassified/allowed; an ambiguous compound command fails closed. `testable:
    true`, `requiresLaunch: false`.
20. `src/judge-impl.ts`: registers `core.judge` at adapter startup — spawns a fresh
    session fed only the spec's artifact URIs (never a working transcript), returns
    the verdict shape `Gate.check` expects. Test (fake session spawner injected):
    the transcript is never passed to the spawned session's input; the verdict shape
    round-trips. `testable: true`, `requiresLaunch: false`.

### Slice 7 — `@argohq/adapter-claude` generic permission hook
21. `src/hook.ts`: the PreToolUse hook body — read active instance (session-cached)
    → no active instance ⇒ `config.noWorkflow` decides (`allow` passes everything,
    `deny-edits` blocks file-edit-shaped kinds with a coaching message to start a
    workflow) → protected-path check UNCONDITIONALLY before stage `allows` → classify
    → membership check → deny with a message naming the stage, the rule, and the
    correct path. Test: a protected-path write is denied even when the stage's
    `allows` includes `file-edit`; a `noWorkflow: "deny-edits"` project with no active
    workflow blocks a file-edit and coaches to start one; a `noWorkflow: "allow"`
    project with no active workflow passes everything. `testable: true`,
    `requiresLaunch: false`.
22. `src/session.ts`: FRESH/WARM/RETRY spawn functions against the Claude Code
    session API — FRESH feeds only `requires` artifacts + skill text + the one-line
    frame; WARM returns the same session handle for repeat units; RETRY spawns fresh,
    feeding the gate verdict + `attempts[]`, never the prior transcript. Test (fake
    session API): FRESH's input excludes anything outside `requires`; RETRY's input
    includes `attempts[]` but not transcript history. `testable: true`,
    `requiresLaunch: false`.

### Slice 8 — wire the permission hook + CLI verbs into kit's existing dispatch
23. `packages/kit/bin/argo.js`: add `workflow-permission` to `HOOK_CHAINS` (dispatches
    to `@argohq/adapter-claude`'s hook body) and a `workflow` case to the CLI switch
    (dispatches to `@argohq/core`'s five CLI functions). `hooks/hooks.json`: add the
    `PreToolUse` matcher `*` entry. Test: an end-to-end hook invocation (stdin JSON in,
    exit code out) for a protected-path write returns exit 2 with the coaching message
    on stderr; `argo workflow status --key <k>` on a fresh repo reports "no active
    workflow". `testable: true`, `requiresLaunch: false` (CLI/hook wiring is
    behavioral but doesn't ship launchable UI).

**Checkpoint review after Slice 8** — core + adapter-claude are now live in the real
hook chain. This is the natural halfway seam: pack-design (Slices 9-12) is the first
real consumer proving the whole spine end-to-end.

### Slice 9 — `@argohq/pack-design` gates
24. Scaffold `packages/toolkit/packs/design/package.json` + `tsconfig.json`, dependency on
    `@argohq/core` only. `testable: true`, `requiresLaunch: false`.
25. `src/gates/design-rules-check.ts`: wraps `packages/kit/src/recipes/shadcn-tailwind/
    tier0-rules.ts` + `src/skill-scripts/bundle-tier0-audit.ts` behind the `Gate`
    interface — reads Figma directly via the existing audit bundling logic, never a
    working-agent self-report. Test: a fixture with a known tier0 violation fails; a
    clean fixture passes; `evidence` in the verdict points at the audit receipt.
    `testable: true`, `requiresLaunch: false`.
26. `src/gates/fresh-eyes-review.ts`: calls `ctx.judge(...)` (the `core.judge` seam),
    never imports `@argohq/adapter-claude`. Compares the finished artifact against the
    brief; `maxRounds`/`retries` handling stays in core's `workflow-advance`, this gate
    only returns pass/fail + findings. Test (fake judge injected via `ctx`): the gate
    never receives or forwards a transcript field; findings from a failing verdict
    propagate into the returned `GateVerdict.findings`. `testable: true`,
    `requiresLaunch: false`.
27. `src/gates/design-matches-code.ts`: captures its own screenshot at check time
    (fresh render, per audit 2.2 — never accepts a working-agent-supplied image URI as
    the thing under test), diffs against Figma via `packages/kit/src/design-kit/
    comparator.ts`'s OKLCH logic. Test: a working-agent-supplied `artifacts.screenshot`
    URI is ignored/rejected by the gate's own capture step; the comparator's existing
    epsilon-based diff logic is invoked and reflected in the verdict. `testable: true`,
    `requiresLaunch: false`.

### Slice 10 — `@argohq/pack-design` registry module
28. `src/registry/index.ts`: thin wrapper over `packages/kit/src/skill-scripts/
    register-screen.ts`, `pull-registry.ts`, `src/design-kit/schemas.ts` — exposes the
    registry-sync operation `screen-create`'s final stage calls. Test: registering a
    screen produces a card matching the existing schema; the wrapper doesn't duplicate
    validation logic already in `schemas.ts` (imports it). `testable: true`,
    `requiresLaunch: false`.

### Slice 11 — `@argohq/pack-design` workflow specs (all six)
29. `src/workflows/screen-create.ts`: brief (fresh, `brief-check` — structural lint
    only per the settled ruling, no AI quality judge) → missing-components spawn
    (cross-workflow dependency resolution, not branching) → build (fresh start, warm
    across sections+fix-rounds, `design-rules-check`) → `fresh-eyes-review` vs brief
    (`maxRounds: 1`, then `retries`) → registry sync. Test: `defineWorkflow` accepts
    the spec without validation errors; `workflow-diagram` renders it with the retry/
    fix-round loops present and no human-gate nodes. `testable: true`,
    `requiresLaunch: false`.
30. `src/workflows/component-create.ts`: exists-check (early-`done` exit, a guard
    finding existing work — not stage branching) → code-owned-or-figma build (resolved
    inside the skill, not the spec) → annotate → `design-rules-check` → registry card.
    Same test shape as step 29. `testable: true`, `requiresLaunch: false`.
31. `src/workflows/component-edit.ts`: code-owned-or-figma edit → `design-rules-check`
    + card refresh → instance-impact scan (blind spot-check). Same test shape.
    `testable: true`, `requiresLaunch: false`.
32. `src/workflows/screen-edit.ts`: update brief first → targeted edits (warm across
    sections) → `design-rules-check` → `fresh-eyes-review` vs updated brief. Same test
    shape. `testable: true`, `requiresLaunch: false`.
33. `src/workflows/design-to-code.ts`: metadata-first reads → registry cards resolve
    instances to imports → hands off to pack-code's `screen-implement` BY NAME (soft
    seam through core's registry — `assertPackAvailable` from Slice 4 step 12 is what
    makes this safe when pack-code is disabled). Test: starting this workflow with
    pack-code disabled in config throws the named config error from step 12; with
    pack-code "enabled" (a stub registration in the test, since pack-code doesn't
    exist yet) it does not throw. `testable: true`, `requiresLaunch: false`.
34. `src/workflows/code-to-design.ts`: figma-sync drift detect (comparator,
    deterministic) → patch kit mirror → `design-rules-check` + card refresh →
    instance-impact check (workflow no.3's mechanism, referenced not duplicated). Same
    test shape as step 29. `testable: true`, `requiresLaunch: false`.

### Slice 12 — craft text + rule templates + skill/agent thinning
35. `craft/design-screen.md` (+ the five sibling craft files) — migrate craft-only
    content from `skills/design-screen/SKILL.md` and its five siblings
    (`figma-create`, `figma-audit`, `figma-sync`, `figma-to-code`, `resolve-comments`);
    strip sequencing/gate-invocation/state-write/enforcement prose per the "skills =
    craft only" rule. `testable: false` (documentation/content move), `requiresLaunch:
    false`.
36. `templates/rules/*` in `packages/pack-design` — new rule templates `argo init`
    installs when pack-design is enabled (nothing to migrate from; today's design
    rules live baked into skill prose being extracted in step 35). `testable: false`,
    `requiresLaunch: false`.
37. Thin `skills/design-screen/SKILL.md` (+ siblings) to a wrapper (frontmatter +
    include of the pack's craft file at build time); thin `agents/design-verifier.md`,
    `agents/fidelity-verifier.md` to persona+toolset (judging logic now lives in
    `fresh-eyes-review`). Test: the skill wrapper's rendered content matches the
    pack's craft file byte-for-byte (a snapshot test on the include mechanism).
    `testable: true`, `requiresLaunch: false`.

### Slice 13 — retire design-guard, prove the replacement, delete
38. With `screen-create`/`screen-edit` + the generic permission hook exercised
    end-to-end (Slices 8-11 all green), delete `src/hooks/design-guard-stop.ts` and
    the `design-guard-record`/`design-guard-stop` entries from `packages/kit/bin/
    argo.js`'s `HOOK_CHAINS`, `hooks/hooks.json`'s matching `PostToolUse`/`Stop`/
    `SubagentStop` entries, and the corresponding `.test.ts` files. Test: the full
    kit test suite (`bun test`) stays green with the deleted modules gone (no dangling
    import); a manual end-to-end run of `screen-create` against a fixture project
    shows the generic permission hook catching what design-guard used to catch (a
    Figma write attempted outside an active `build` stage is denied). `testable:
    true`, `requiresLaunch: true` (this step's own verification is the replacement
    proof — it needs a real hook-chain run, not just unit tests).

---

## Out of scope (explicit)

- `@argohq/pack-code` (all six workflows), `@argohq/pack-product`, the `land` workflow,
  Probity integration (`test-first`/`reproduce-first`/`tests-stay-green` policies) —
  phase 2. Core's `policy` field and the classifier's policy-enforcement hook point
  exist as a seam (mentioned in adapter-claude's hook body) but no policy
  implementation ships.
- `probity.config.ts` schema/rule factories, `@nizos/probity` as an installed
  dependency — phase 2. Phase 1 only reserves the protected-path entry for it.
- Changesets `fixed` group / lockstep versioning, repo rename to `argohq` — deferred
  per open question 2 above.
- `design.<app>` config migration from `.claude/argo.json` into `.argo/config.json` —
  deferred per open question 1 above; both files coexist through phase 1.
- A second adapter (Codex) — phase 3, per the design doc's own phasing.
- Any human-facing `argo init` wizard changes to ask about packs/testDiscipline — the
  config SHAPE is phase 1 (core reads `packs`/`testDiscipline`/`land.mode` if present),
  the wizard UX that WRITES them is phase 2 alongside pack-code (testDiscipline is
  meaningless without pack-code's TDD policies to gate).

---

## Risks & assumptions

- **Assumption:** `@argohq/core`'s CLI functions are consumed through kit's existing
  `bin/argo.js` rather than a second binary (open question 3). If wrong, Slice 8
  changes shape (a new `packages/core/bin/argo-workflow.js` instead) but nothing
  upstream of it does.
- **Assumption:** the build-time "include craft file into SKILL.md" mechanism (Slice
  12) is new plumbing with no existing analog in this repo (confirmed absent by
  search) — scoped deliberately small (string include, not a templating engine); if a
  richer mechanism is wanted, that's a call for whoever reviews Slice 12, not a
  phase-1 blocker.
- **Risk:** deleting design-guard (Slice 13) before pack-design's replacement is
  exercised against a real project would regress in-flight design enforcement to
  nothing. Mitigated by ordering: Slice 13 is last and gated on Slices 8-11 being
  green first (explicit precondition in step 38).
- **Risk:** the protected-path list (Slice 3) is core's single highest-leverage
  control per the audit — a missed pattern (e.g. a future machine-written artifact
  path) silently reopens the hole 1.1 closed. Mitigated by keeping the list itself in
  one exported array (`src/permissions.ts`) so adding a path is a one-line, easily
  reviewed diff, not a scattered search-and-add.

---

## Verification (behaviours a reviewer should confirm)

- `bun test packages/core packages/adapter-claude packages/pack-design` green at every
  checkpoint (Slice 1, 5, 8, and final).
- `bun run --cwd packages/core build`, same for adapter-claude and pack-design (tsc
  clean, matching kit's existing build script pattern).
- Protected-path denial: a fake PreToolUse Edit event targeting
  `~/.argo/state/<id>/workflows/x.json` is denied even from inside a stage whose
  `allows` includes `file-edit` (this is THE audit 1.1 fix — must have a dedicated
  test, not just incidental coverage).
- `git-history-mutation` denial: a fake Bash event running `git commit --amend` inside
  an active `tests-stay-green`-shaped stage (simulated with a fake pack-code spec,
  since pack-code doesn't exist yet) is denied by default.
- `argo workflow diagram screen-create` renders retry/fix-round loops and NO human-gate
  nodes (the audit 1.5 fix — the historical fixtures in `/Users/milad/.claude/jobs/
  008009a4/tmp/design-workflows.md` still show human-gate diamonds; the phase-1
  generator output must NOT match those diamonds, it should match the settled
  linear-skeleton shape).
- End-to-end: `argo workflow start screen-create --target <fixture>` through to
  `done` against a small fixture screen, with design-guard's hooks deleted, produces
  the same enforcement outcome (a Figma write outside the `build` stage denied) that
  design-guard used to produce — this is Slice 13's own acceptance test.
