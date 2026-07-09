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
