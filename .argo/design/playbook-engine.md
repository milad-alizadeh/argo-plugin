# Argo playbook engine — ground-up redesign

Status: design settled via grill (2026-07-09). Next: `argo:planner` for the implementation plan.

## Problem

Argo's playbooks (design pipeline, gated builds) are implemented as bespoke prose-heavy
skills, hand-written hooks (design-guard, session-guard), and ad-hoc state (receipt files,
progress docs). Every new playbook means new hook code; enforcement lives in skill text
that agents can ignore; state doesn't survive worktrees; nothing is reusable for the code
side, and everything is welded to Claude Code.

## Architecture

Argo is a **passive spine over an existing interactive agent**: playbook specs +
deterministic gates + durable state. It deliberately does NOT own the execution loop
(rejected LangGraph for this reason — Claude Code is the runtime). Humans are out of the
loop: playbooks run start-to-finish autonomously; review happens out-of-band.

### Monorepo (repo renamed `argohq`, lockstep versioning via Changesets `fixed` group)

```
packages/
├── core/            @argohq/core            engine: specs, gate registry, state, permissions, argo CLI
├── adapter-claude/  @argohq/claude-adapter-plugin  hooks, session lifecycle, tool-call classifier
├── pack-product/    @argohq/pack-product    prd-create playbook, brief-check, write-prd/grill skills' logic
├── pack-design/     @argohq/pack-design     six design playbooks, design-rules-check, fresh-eyes-review, registry
└── pack-code/       @argohq/pack-code       six code playbooks, tests-pass, policies, reporters, code-review
plugin/              the Claude plugin: skills (craft-only), agents (persona+tools), hooks.json
```

One version number across everything ("argo 0.60.0" = all packages at 0.60.0).
Dependency direction: `plugin → adapter-claude → core ← packs`. Packs depend on core
only, never on each other (soft seams allowed: design briefs may reference PRDs when
pack-product is enabled; VRT gate contributed to pack-code when pack-design is enabled).

### Packs are optional

`argo init` asks which packs to enable → `.argo/config.json` `packs: [...]`. Disabled
packs: playbooks can't start, skills inert, rules never installed. A code-only project
never sees Figma; a design-only project never sees TDD.

`.argo/config.json` is the SINGLE config surface: packs, `noPlaybook`,
`testDiscipline`, `land.mode`, gate settings. Everything reads from it at run time —
hand-editable, changeable later, no re-init required. Config is read live per hook
evaluation, not cached at session start: the protected-path denial (below) makes live
reads safe, and a session-start cache would leave stale-enforcement gaps after a
legitimate hand edit.

`.argo/config.json`, stage specs (`definePlaybook` output), and gate contracts
(`GateInput`/`GateVerdict`) are validated with zod at load time. A malformed or
hand-edit-broken config fails closed with a clear message at `argo init` and
`argo playbook start` — it never silently disables a gate.

One general engine rule for cross-pack handoffs: a playbook whose terminal stage hands
off to a disabled pack (design-to-code → pack-code's screen-implement) is refused at
`argo playbook start` with a config error naming the missing pack, never failing
mid-run at the handoff.

### Naming rule (standing)

Every name — gates, packages, CLI verbs, spec fields — is plain self-describing English.
No acronyms, no numbered tiers, no invented jargon. Renames: tier0-audit→design-rules-check,
blind-verify→fresh-eyes-review, brief-lint→brief-check, tests-green→tests-pass.

## The stage spec (core)

```ts
definePlaybook({
  name: "screen-create",
  stages: [
    { name: "brief",  allows: ["file-edit","figma-read"], produces: ["design/briefs/<key>.md"],
      gate: "brief-check", session: "fresh" },
    { name: "build",  requires: ["brief"], allows: ["figma-write","figma-read"],
      produces: ["figma:<key>","manifests/<key>.json"], gate: "design-rules-check",
      skill: "design-screen", session: "fresh", retries: 2 },
    { name: "review", requires: ["build"], allows: ["figma-read"],
      gate: "fresh-eyes-review", maxRounds: 1 },
  ],
})
```

Full vocabulary: `requires / produces / allows / policy / gate / skill / session / retries / repeat / maxRounds`.
Specs are pure data (plain TS in a pack), unit-testable with fake gates, no provider imports.

Stages are a flat list — there is no spec-level branch field, and none is coming.
Same-convergence data forks ("Code-owned?", "Exists?") are resolved inside a stage's
skill by reading metadata truth (the `@code-owned` annotation, the registry), never by
spec branching. The one engine mechanism beyond the flat list is cross-playbook
dependency resolution: a stage that requires another component's or playbook's output
triggers the engine to spawn the prerequisite playbook first ("Missing components?" is
this, not stage branching), plus an early-`done` exit when a guard finds the work
already exists ("Exists? Stop.").

Because specs are data, core ships `argo playbook diagram <name> [--all]`: renders a
spec to mermaid (stages as FRESH/WARM nodes, gates on edges, retry/fix-round loops from
`retries`/`maxRounds`, `repeat` annotated). Docs regenerate diagrams from specs — no
drift. Phase 1 scope is the linear skeleton specs can actually emit; the design
fixtures are redrawn to match it (stale human-gate ship/accept nodes dropped). The
generator emits the spec-expressible skeleton; runtime-decision diamonds and prose live
outside the spec and are not round-tripped.

## Gates (core interface, pack implementations)

```ts
interface Gate {
  name: string                                  // "design-rules-check", "tests-pass", ...
  check(input: GateInput): Promise<GateVerdict>
}
GateInput  = { target: string, artifacts: Record<string, URI>, settings: {...} }
GateVerdict = { passed: boolean, findings: Finding[], evidence: URI[] }
```

AI-judging gates (fresh-eyes-review, code-matches-design, code-review) obtain their
judging session through one narrow core capability, `core.judge(spec) → verdict-shaped
result`, registered by the active adapter at startup and passed to gates as a context
argument alongside GateInput: the gate calls `ctx.judge(...)` and never imports
adapter-claude. The judge dispatch path accepts only artifact URIs, never the working
transcript, so core enforces blindness centrally; deterministic gates ignore the
capability. Same shape as the adapter-owned classifier seam: one interface, not a layer.

- Gates judge **finished artifacts at stage exit only**. GateInput has no field for
  transcripts or agent self-reports — the anti-reward-hack rule as a type: every gate
  checks something the working agent didn't self-report (design-rules-check reads Figma
  directly, fresh-eyes-review never sees the transcript, tests-pass runs the suite).
  Any gate whose evidence is a live render captures that render itself at check time
  (fresh app launch / `get_screenshot`) and never accepts a working-agent image URI as
  the thing under test; only the reference side (Figma) may come from an external
  source. Capture mechanics live in the adapter/pack, keeping core provider-agnostic.
- No human gate. Playbook ends `done` when the last gate passes; review is out-of-band.
  The only human-relevant state is `stuck` (retry budget exhausted) — parks and notifies,
  never awaits.
- Packs register gates into core's registry at import time; specs reference by name.
- Prose-artifact gates (`plan-check`, `brief-check`) are structural lint ONLY in
  phase 1: required sections present, every slice/section names its files and test
  criteria, every referenced path exists in the repo (catches hallucinated plans).
  No AI quality judge — that's where gate false positives come from; quality is
  covered upstream by grilling. An AI judge may become an opt-in gate setting later.

## Stage permissions (in-flight enforcement)

- Each stage declares `allows: [...]` of **action kinds**: an open, pack-extensible
  vocabulary of plain strings. Core does a string-equality membership check between the
  classifier's output and the stage's `allows` and never enumerates domain-specific
  kinds itself; `figma-read`/`figma-write` live in pack-design specs and the adapter's
  classifier, keeping core domain-neutral. Generic kinds: `file-read, file-edit,
  git-commit, test-run, web-fetch, ...`
- The adapter owns ONE classifier table `(toolName, toolInput) → actionKind`
  (Bash classified by command string; use_figma by script-sniff for canvas mutation;
  ambiguity fails closed to the stricter kind; unclassified → allowed — the enforcer
  only narrows what it understands). The fail-open rule is only safe because
  destructive, irreversible kinds are explicitly enumerated and denied; without that,
  "only narrows what it understands" silently permits anything a future tool surface
  exposes.
- One core action kind, `git-history-mutation` (reset, amend, rebase, checkout of
  tracked paths, filter-branch), classified by the adapter's existing git-command-string
  parser and denied by default unless a stage's `allows` opts in. No stage in the six
  code playbooks needs it; history rewriting would otherwise let an agent erase the
  commit/test evidence the policies and `tests-pass` depend on.
- A core-owned **protected-path list** that the generic hook denies for the working-agent
  role unconditionally, evaluated before the stage's `allows`, regardless of stage:
  everything under `~/.argo/state/**`, `.argo/config.json`, `probity.config.ts` (repo
  root, so an "ownership of `.argo/`" rule alone would miss it), and machine-written
  artifacts (`registry.json`, `manifests/`). The only write path for config is a human
  hand-edit outside a session or an engine command; the only writer of state is the
  engine/gate process (the `argo` CLI, which never passes through the interactive tool
  surface), so no separate auth principal is needed. This lives in core, so a future
  Codex adapter inherits it for free. Without it, "written by the engine and gates only"
  is a convention an agent can defeat with one `file-edit`.
- ONE generic PreToolUse hook (matcher `*`): read active instance from state (session-
  cached) → no active playbook ⇒ config decides (`noPlaybook: "allow" | "coach" |
  "deny-edits"` in `.argo/config.json`; default allow — argo never blocks a human
  tinkering; coach allows the edit but injects advisory context suggesting a playbook
  start — recommended for argo projects; deny for autonomous projects: no coding
  outside a playbook, hook coaches "start one") →
  protected-path check → classify → membership check → deny with a coaching message
  naming the stage, the rule, and the correct path.
- Replaces design-guard and session-guard outright. Composes with (only narrows, never
  widens) the user's own Claude Code permissions. A Codex adapter reimplements only the
  classifier + hook against its own surface.
- Degradation: in-flight `allows`/`policy` is a narrowing safety-and-coaching layer,
  not a correctness guarantee; on a provider without a pre-execution hook (Codex CLI
  exposes approval modes, some Copilot surfaces only post-hoc diffs) it degrades to
  gate-only, and the blind stage-exit gates remain the enforcement floor. The one place
  the guarantee genuinely depends on interception is read-only stages like bug-fix
  DIAGNOSE, which need a gate-side "diagnose produced no code edits" assertion to stay
  foolproof cross-provider.

## Named stage policies (stateful in-flight rules)

`allows` is static membership; some rules are stateful ("no implementation edit without
a currently-failing test"). A stage may declare `policy: "<name>"`; packs define policies;
the same adapter hook enforces them.

Implementation: **Probity** (`@nizos/probity`), the tdd-guard author's provider-agnostic
successor (tdd-guard is Claude-locked: Anthropic-only validator backends, Claude Code
hook envelope hardcoded; its own README points new projects at Probity). Probity's shape
matches ours exactly — per-vendor adapters (Claude Code, Codex, Copilot) parsing into a
canonical Action, `probity.config.ts` with `defineConfig` + rule factories, path-scoped
`{ files, rules }` blocks. No test-runner reporters: evidence is parsed from the agent's
session transcript, so any language/runner works with zero glue (deletes our
tdd-guard-playwright reporter and the cross-repo evidence bug class outright).
Risk: young project, single maintainer — mitigated by the policy abstraction (swap the
implementation behind `policy: "test-first"` without touching specs).

Probity is the day-one implementation of these policies. Building argo-owned
enforcement first and swapping to Probity later was considered and rejected: real
test-first enforcement needs AI validation (a deterministic version is either toothless
or false-positive-prone), and a tdd-guard-style fallback shares the same single
maintainer one project older, so it is no safer. The exit path if Probity stalls is to
vendor or fork just the rules argo uses, or replace them behind the unchanged policy
interface — policies-as-names make either swap invisible to packs.

- **test-first** (pack-code) — `enforceTdd()` (AI-validated via the agent's own SDK,
  optional deterministic fastPath). The engine owns which stages it applies to.
- **reproduce-first** (bug fix) — `enforceTdd()` scoped to the fix stage: failing repro
  test must exist before fix edits.
- **tests-stay-green** (refactor) — deterministic Probity rules: `forbidContentPattern`
  scoped to test files (no test edits) + `requireCommand` (green baseline before
  commit); "if a test must change it's not a refactor" as the block reason. Its
  protected surface also denies deletion/rename of test files and edits to
  suite-scoping runner-config paths (`vitest.config`, `playwright.config`, the
  `package.json` test script, include/exclude globs); the same runner-config
  protection applies on `small-change`'s tests-pass path, so `tests-pass` can't be
  gamed by hollowing out what "the suite" is. Exact globs are the planner's call.
  Legitimately removing a test is an explicit small-change or refactor decision, not
  a silent edit inside a green-keeping stage.

## Session model (the cold-start fix)

- **FRESH** — stage boundary: new session whose entire input is the stage's `requires`
  artifacts. Only legal where the handoff contract is small and complete (brief,
  manifest, verdict — a few KB).
- **WARM** — inside a stage: ONE session for all repeated units (sections, slices, fix
  rounds). Never per-slice/per-section respawn — no artifact captures accumulated
  codebase knowledge; respawning re-explores it (the 800k-token per-slice-fleet failure).
- **RETRY** — budgeted gate failure (`retries: N`): cold restart, fresh session fed the
  gate verdict + `attempts[]` from state — knows what earlier rounds tried without
  inheriting the polluted transcript. Distinct from a fix round (warm, same session,
  findings injected, `maxRounds`).
- The adapter starts each stage session with: requires artifacts + the stage's skill +
  a one-line frame ("You are in stage `build` of `screen-create` for `<target>`; say
  when done — the engine takes it from there").

## State (machine store)

`~/.argo/state/<project-id>/` — project-id derived from the git common dir, so ALL
worktrees share one store. Design state describes Figma (one shared external surface);
git branches must not fork it.

- `playbooks/<key>.json` — instance: `{ playbook, target, stage, status, attempts: [
  { round, gate, findings, whatWasTried } ], history: [{stage, gate, at, verdict}] }`.
  Written by the engine and gates only, NEVER by the working agent (context-poisoning
  of persisted state is a documented loop-engineering failure mode). Enforced as a
  control by the core protected-path denial in the permissions hook, not left as a
  convention.
- `sessions/<id>/` — hook-to-hook scratch (policy evidence, counters); purged.
- Repo commits only durable artifacts. `argo playbook adopt` re-derives stage from
  artifacts/Figma reality (self-healing after crashes or manual work). Adopt re-verifies
  boundaries rather than trusting artifact presence: it walks stages in order, re-runs
  each stage's declared gate against the discovered artifacts, and sets the current
  stage to the highest contiguously-passing one, so a fabricated or copied file at a
  `produces` path can't advance past a gate. Resuming mid-stage before that stage's
  exit gate is inherently safe (the gate still fires); for genuinely un-re-runnable
  gates, adopt records `verified: false` provenance in `history` and surfaces it in
  `argo playbook status` instead of silently advancing.

CLI verbs: `argo playbook start <name> --target <t> / status / advance / adopt`.

### Routing (who picks the playbook)

Explicit start is the only entry point (state, permissions, gates hang off it). The
user may start one directly; otherwise the agent triages the request to a playbook via
a one-paragraph plugin instruction (a casual "fix this bug" auto-starts bug-fix).
Misrouting is visible in `argo playbook status` and cheap to correct. With
`noPlaybook: "deny-edits"`, everything code-touching goes through a playbook — the
small-change escape hatch keeps that near-zero ceremony.

## Host project layout

Single `.argo/` root: `config.json`, `design/` (human-authored briefs/PRDs),
`workspaces/<app>/{registry.json, manifests/, copy-decks/}`, `tmp/` (the only
gitignore line). `.claude/` keeps only Claude-native config. The plugin/packs own all
schemas and readers/writers of `.argo/`; the host hand-edits only `design/`.

## Skills = craft only

A skill is craft knowledge for one stage (how to do the work well): no sequencing, no
gate invocations, no state writes (may read `argo playbook status`), no enforcement
prose (on Claude Code, permissions make violations impossible in-flight; elsewhere the
gates catch them at stage exit — a large fraction of current skill text
is enforcement-by-threat that hooks now do mechanically). One skill serves many
playbooks (design-screen serves screen-create's build and screen-edit's edit). Slash
commands become `argo playbook start` wrappers. Agents shrink to persona + toolset.

### Content placement rule

Provider-neutral content lives in packs; Claude-specific wiring lives in the plugin.
adapter-claude is code, the plugin is manifest.

- Skill craft text → owning pack (`pack-design/craft/design-screen.md`); the plugin's
  SKILL.md is a thin wrapper (frontmatter + include at build time). A future adapter
  reuses the same craft text with its own wrapper format.
- Rule templates → packs (`pack-*/templates/rules/`); `argo init` installs per enabled
  pack.
- Agent personas, hooks.json, slash commands → plugin (hook logic = adapter-claude
  code calling core).
The plugin ends up almost content-free: manifests, wrappers, personas.

## Playbook matrices

### pack-design (six)

1. **screen-create** (feature→screens): PRD+grill+ASCII wireframe (interactive) →
   brief per screen (brief-check) → missing components via component-create first →
   build (one designer session, sections+fix rounds warm, design-rules-check) →
   fresh-eyes-review vs brief (maxRounds 1, then retries) → registry sync.
2. **component-create**: exists-check (registry + search_design_system; no card = doesn't
   exist) → code-owned? code-first-then-mirror : figma-build → annotate →
   design-rules-check → registry card generated (deterministic).
3. **component-edit**: code-owned? code-first : figma-edit → design-rules-check + card
   refresh → instance-impact scan on consuming screens (blind spot-check).
4. **screen-edit**: update brief FIRST (it's the verify contract) → targeted edits
   (warm across sections) → design-rules-check → fresh-eyes-review vs updated brief.
5. **design-to-code**: metadata-first reads (get_metadata outline → per-section
   get_design_context) → registry cards resolve instances to real imports → hands off
   to pack-code's screen-implement.
6. **code-to-design**: figma-sync drift detect (comparator) → patch kit mirror →
   design-rules-check + card refresh → instance-impact check.

### pack-code (six)

1. **plan-and-build**: plan (fresh, read-only, plan-check) → build (warm, repeat
   per-slice, policy test-first, tests-pass per slice, git-commit allowed) → review
   (fresh, blind code-review on the diff, retries 1).
2. **bug-fix**: diagnose (fresh, READ-ONLY — produces diagnosis, never a fix; the
   root-cause discipline as stage permissions) → fix (policy reproduce-first) → review.
3. **refactor**: single stage, policy tests-stay-green, tests-pass baseline + exit.
4. **small-change**: single stage, no plan, no policy, tests-pass. The escape hatch —
   still gated, still recorded.
5. **style-change**: refactor-class (standing rule): no new tests, no geometry
   assertions, tests-pass + verify by looking; screenshot evidence when pack-design on.
6. **screen-implement**: read-design → build (test-first per slice) → tests-pass +
   `code-matches-design` (screenshot vs Figma; gate contributed by pack-design, the
   mirror of its `design-matches-code`; degrades to plain build without it).
7. **land**: explicit-start only, never triaged into (outward-facing). Requires the
   branch's playbooks to be `done` — the engine mechanically refuses to ship unreviewed
   work. Fresh session, allows git-push; behavior from config `land.mode:
   "open-pr" | "merge-to-main"`. Absorbs the integrator's job.

### TDD is a project setting

`argo init` (pack-code) asks and writes `testDiscipline: "test-first" | "tests-required"`.
- **test-first** (default): `test-first`/`reproduce-first` policies enforce via Probity's
  `enforceTdd`; `tests-pass` gates at stage exit.
- **tests-required**: in-flight TDD policies resolve to no-op (Probity TDD rule not
  configured); `tests-pass` gates and `tests-stay-green` STAY — you can write tests
  after the code, but can't exit a stage red. `reproduce-first` follows the flag.
No "none" level: a floor gate that's optional is no floor; small-change is already the
low-ceremony path. Cost of the option: one init question + one conditional in policy
resolution — specs, gates, sessions, state unchanged.

### Shared design substrate

- Figma = metadata truth (`@screen`, `@code-owned`, `@when-to-use` annotations).
- Registry = LLM projection: Code-Connect-shaped cards (id, importPath, literal usage
  example, prop/variant map, when-to-use, custom instructions) — regenerated, never
  hand-edited. The non-Enterprise Code Connect substitute, grounded in how Figma's own
  MCP steers models.

## Migration map

| Existing | Destination |
|---|---|
| definePlaybook/engine/state/CLI | core (new, small) |
| tier0-rules + tier0-audit | pack-design `design-rules-check` |
| fidelity/design-verifier harness | pack-design `fresh-eyes-review` (calls `core.judge`, implemented by the adapter) |
| comparator + figma-sync | pack-design `design-matches-code` + sync tooling |
| registry gen, manifest schema, validate-manifest | pack-design registry module (`bindings-check`) |
| tdd-guard reporters (vitest/playwright) | DELETED — Probity reads the session transcript, no reporters |
| tdd-guard (dependency) | REPLACED by Probity (`@nizos/probity`) behind pack-code policies |
| design-guard, session-guard hooks | DELETED — generic enforcer + specs |
| build-plan orchestration/progress doc | DELETED once plan-and-build lands (phase 2) |
| in-repo receipt files under .argo/ | DELETED — machine store |
| enforcement prose in skills | DELETED — permissions do it |
| skills (design-screen, write-prd, test-first, root-cause…) | plugin, dieted to craft |
| agents | plugin, persona + toolset |
| integrator agent's push/PR duties | pack-code `land` playbook (agent persona may remain) |
| templates/rules | plugin, installed per enabled pack by argo init |

## Phasing

1. core + adapter-claude + pack-design on the engine (design playbooks prove it — they
   are the active pain).
2. pack-code on the same engine; retire build-plan's bespoke orchestration.
3. pack-product formalized; adapter-codex when a second provider matters.
