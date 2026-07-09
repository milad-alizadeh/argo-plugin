---
status: draft
updated: 2026-07-10
---

# `prd-apply` playbook — single entry point for "a PRD changed, fan out the edits"

## Open questions (resolve before queueing)

These are load-bearing — an answer flips file layout or spec shape. Flagged
here per the planner contract; do not start build until the user (or Argo)
picks.

1. **Where does "last applied" get recorded?**
   Two candidates, both consistent with existing receipt precedent
   (`writeDesignJson` writes `<cwd>/design/<file>.json` —
   `packages/toolkit/src/packs/design/skill-scripts/lib/write-design-json.ts:22`,
   used by `record-spec-diff-receipt.ts:29` and `record-audit-receipt.ts`):
   - **(A) A receipt file** — `design/prd-apply-receipts/<feature>.json`
     `{ prdPath, lastAppliedCommit, lastAppliedAt, impactedScreens[] }`,
     written by the terminal stage, read by the next run to diff
     `lastAppliedCommit..HEAD`. Matches the existing receipt convention
     exactly (spec-diff-receipt.json, audit-receipt.json are siblings) and
     needs no PRD template change.
   - **(B) A stamp inside the PRD** — a new `Last applied:` line in the
     template (`templates/product/prd.md`), hand-edited or machine-appended.
     Rejected in this plan's recommendation: it mutates a human-authored doc
     from a machine step (write-prd's PRD is otherwise fully author-owned —
     no skill-script writes into `.claude/prds/*.md` today; grep confirms no
     precedent), and a receipt file is strictly more consistent with (A)'s
     sibling receipts.
   - **Recommendation: (A).** This plan is written assuming (A); flag if the
     user prefers (B) before building Slice 1.

2. **Is stage 2 (enumerate impacted screens/components) deterministic
   (a skill-script CLI verb) or agent judgment?**
   `completeness-checklist.ts`
   (`packages/toolkit/src/packs/design/design-kit/completeness-checklist.ts`)
   is the exact precedent: `parseMatrix(md)` mechanically parses the
   feature→screen matrix table (`Requirement | Disposition`, `covered-by:
   <screens>`) with no LLM. A PRD **diff** (which REQ-IDs changed since
   `lastAppliedCommit`) union-ed with `parseMatrix`'s `covered-by` screen
   list is equally mechanical — no reasoning is needed to intersect "changed
   requirement IDs" with "screens that requirement covers". **Recommendation:
   deterministic**, as a new skill-script + design-kit pure function pair
   (`prd-impact.ts`), mirroring `completeness-checklist.ts`'s split
   exactly. Component impact (which components a changed screen's brief/PRD
   references) reuses the existing `component-impact` stage's own registry
   lookup inside `screen-edit` — `prd-apply` does not re-derive component
   impact itself, it only enumerates SCREENS and lets each spawned
   `screen-edit` run's `component-impact` stage do what it already does
   (`packages/toolkit/src/packs/design/playbooks/screen-edit.ts:33-38`).
   Flag if the user wants component-level fan-out to also happen at the
   `prd-apply` layer instead (rejected here as duplicate mechanism).

If either answer changes, Slice 1 below changes; everything after it is
insulated (it only consumes the impacted-screens list, not the mechanism
that produced it).

## Context — what exists

- **Spec vocabulary** (`packages/toolkit/src/core/spec.ts:12-48`): stages are
  a flat list of `{ name, requires, produces, allows, policy, gate, skill,
  session, retries, repeat, maxRounds, handsOffToPack }`. No branch field —
  runtime forks resolve inside a stage's skill (spec.ts:7-8 comment). This
  plan adds **zero new spec fields** — every stage below uses vocabulary
  already exercised by `screen-create`/`screen-edit`.
- **`playbook-start` is itself an allow, not new mechanism**
  (`packages/toolkit/src/packs/design/playbooks/screen-create.ts:42`,
  `screen-edit.ts:35`): a stage that lists `'playbook-start'` in `allows` may
  call `argo playbook start` to spawn other playbook runs from inside its
  skill. `screen-create`'s `missing-components` stage and `screen-edit`'s
  `component-impact` stage are the two existing precedents; `prd-apply`'s
  fan-out stage is a third instance of the same pattern, one level up
  (PRD → screens, instead of screen → components).
- **`playbookStart`** (`packages/toolkit/src/core/cli/playbook-start.ts:29`)
  takes `{ name, target, key? }`, resolves the spec via `getPlaybook`,
  refuses at start time if the terminal stage's `handsOffToPack` is disabled,
  derives an instance key via `deriveInstanceKey`, writes state, and returns
  `{ key, instance, events }`. `prd-apply`'s fan-out stage calls this once
  per impacted screen with `{ name: 'screen-edit', target: screenName }` —
  no new spawn primitive needed.
- **Deterministic markdown parsing precedent**:
  `completeness-checklist.ts` (design-kit) exports `parseRequirements`,
  `parseMatrix`, `selectChecklistForScreen` — pure functions, no fs, unit
  tested (`completeness-checklist.test.ts`). The matching skill-script
  (`skill-scripts/completeness-checklist.ts`) is the thin CLI wrapper: reads
  files, calls the pure function, prints JSON, non-zero exit + stderr
  message on empty result. `prd-impact.ts` follows this exact split.
- **Receipt-write precedent**: `write-design-json.ts:22` (`writeDesignJson`,
  atomic temp-then-rename) is the one writer every receipt goes through
  (`record-spec-diff-receipt.ts:29`, `record-audit-receipt.ts`). `prd-apply`'s
  terminal stage reuses it, no new writer.
- **PRD structure** (`templates/product/prd.md`): `## Requirements` table
  (`ID | Requirement | Acceptance | Visible in build?`, parsed by
  `parseRequirements`) and `## Feature → screen matrix` table (`Requirement |
  Disposition`, parsed by `parseMatrix`; `covered-by: <screen list>`
  dispositions are the ones that route to a screen). Host project keeps PRDs
  at `.claude/prds/<feature>.md` (confirmed by `write-prd/SKILL.md:161`
  and the template's own header comment).
- **`screen-edit` spec** (`playbooks/screen-edit.ts:21-62`): `update-brief` →
  `component-impact` → `targeted-edits` → `review`. `prd-apply` spawns one
  `screen-edit` run per impacted screen; it does not reach into
  `screen-edit`'s stages.

## Approach

`prd-apply` is a **thin orchestration playbook**: one deterministic fan-out
stage, no gate of its own (the fanned-out `screen-edit` runs carry their own
`brief-check` / `design-rules-check` / `fresh-eyes-review` gates already), and
a terminal bookkeeping stage that writes the roster + advances the "last
applied" receipt. It does not duplicate `screen-edit`'s judgment or gates —
it only decides WHICH screens to start, then gets out of the way.

Three stages:

1. **`diff-impact`** — deterministic. Resolves `lastAppliedCommit` from the
   prior receipt (or "never applied" → whole-PRD scope). Runs `git log
   <lastAppliedCommit>..HEAD -- <prdPath>` (or, if never applied, treats every
   `covered-by` row as impacted) to get the changed PRD text, extracts
   changed/added REQ-IDs (line-level diff against the requirements table),
   intersects with `parseMatrix`'s `covered-by` dispositions to get the
   impacted screen list. Pure logic lives in `design-kit/prd-impact.ts`; the
   `argo design prd-impact` skill-script CLI wraps it (git diff + file reads
   are the only I/O). No LLM involved — this is the CLI-verb resolution from
   open question 2.
2. **`fan-out`** — allows `playbook-start`. For each screen in the
   `diff-impact` output, calls `playbookStart({ name: 'screen-edit', target:
   screen })`. Produces the run roster (list of `{ screen, key }` pairs).
   This stage's skill is a thin loop over `diff-impact`'s output — no new
   craft skill needed beyond a short addition to the existing `design-screen`
   skill (or a new minimal skill if the user wants `prd-apply` kept out of
   `design-screen`'s file — flagged as an incidental choice, resolved in
   Slice 2 below by reusing `design-screen`, consistent with how
   `missing-components`/`component-impact` already reuse it).
3. **`report`** — no gate, `allows: ['registry-write']` is not applicable
   here (it's not touching the component registry) so this uses a new-but-
   already-general allow value already accepted by the open, string-based
   `allows` vocabulary (`spec.ts:19-24`: "core does string-equality
   membership only, never enumerates domain kinds") — `'file-edit'` is
   sufficient since this stage only writes the receipt JSON and prints the
   roster. Writes the updated receipt (`writeDesignJson`, reusing the exact
   writer already shared by every other receipt) recording
   `{ prdPath, lastAppliedCommit: HEAD, lastAppliedAt, impactedScreens,
   runs: [{screen, key}] }`.

No `gate` field on any of these three stages — correctness of the fan-out
lives entirely in `diff-impact`'s deterministic parse (unit-tested), and the
actual design correctness is gated per-screen by the `screen-edit` runs it
spawns, which is the existing, already-audited gate chain. Adding a gate here
would duplicate that.

`repeat`/`maxRounds`/`retries` are omitted — this playbook does no
LLM-in-the-loop craft work of its own to retry; the fan-out stage's
`screen-edit` children each carry their own budgets already.

## File layout

```
packages/toolkit/src/packs/design/
  playbooks/
    prd-apply.ts                 # new spec (definePlaybook + registerPlaybook)
    prd-apply.test.ts            # spec-shape test, mirrors screen-edit.test.ts
    index.ts                     # + `export * from './prd-apply.js'`
  design-kit/
    prd-impact.ts                # pure: diff PRD since lastAppliedCommit -> impacted screens
    prd-impact.test.ts
  skill-scripts/
    prd-impact.ts                # CLI wrapper: `argo design prd-impact --prd <path>`
    prd-impact.test.ts           # (if the CLI wrapper carries any pure-testable branch)
    record-prd-apply-receipt.ts  # writes design/prd-apply-receipts/<feature>.json via writeDesignJson
    record-prd-apply-receipt.test.ts
```

No new top-level flat files — everything sits under the existing
`packs/design/{playbooks,design-kit,skill-scripts}` domain folders, same as
every sibling playbook/skill-script pair.

## Files to change

- `packages/toolkit/src/packs/design/playbooks/prd-apply.ts` — new spec.
- `packages/toolkit/src/packs/design/playbooks/prd-apply.test.ts` — new spec test.
- `packages/toolkit/src/packs/design/playbooks/index.ts` — add barrel export (currently exports the 6 existing specs, `index.ts:9-14`).
- `packages/toolkit/src/packs/design/design-kit/prd-impact.ts` — new pure diff+matrix-intersection function.
- `packages/toolkit/src/packs/design/design-kit/prd-impact.test.ts` — unit tests.
- `packages/toolkit/src/packs/design/skill-scripts/prd-impact.ts` — new CLI wrapper (`argo design prd-impact`).
- `packages/toolkit/src/packs/design/skill-scripts/record-prd-apply-receipt.ts` — new receipt writer, thin wrapper over `writeDesignJson` (`skill-scripts/lib/write-design-json.ts:22`).
- `packages/toolkit/src/packs/design/skill-scripts/record-prd-apply-receipt.test.ts` — unit test.
- `packages/toolkit/packs/design/craft/design-screen.md` — add the short `prd-apply` fan-out loop (reusing the `design-screen` skill, consistent with how `missing-components`/`component-impact` are already documented there) — confirm exact insertion point when building (file exists, read at build time; not quoted here to avoid asserting content not yet re-read at build time).
- `packages/toolkit/src/cli/playbook-list.ts` — no change expected (it enumerates the registry generically), confirm at build time.

## Step-by-step work items

### Slice 1 — deterministic impact resolution (`testable: true`, `requiresLaunch: false`)

1. Write `design-kit/prd-impact.test.ts` first (red): given a PRD markdown
   string, a `lastAppliedCommit` (or `undefined` for "never applied"), and a
   fake git-diff-provided "changed requirement text", assert the returned
   impacted-screen list matches `covered-by` rows for changed REQ-IDs only,
   and that "never applied" returns every `covered-by` screen in the matrix.
   Reuse `parseMatrix`/`parseRequirements` from `completeness-checklist.ts`
   directly (import, don't duplicate).
2. Implement `design-kit/prd-impact.ts` to pass. Pure function, no fs, no git
   calls inside it — takes already-fetched PRD text(s) as arguments, mirrors
   `completeness-checklist.ts`'s purity discipline exactly.
3. Write `skill-scripts/prd-impact.test.ts` if the wrapper has any
   branch worth unit-testing (arg parsing); otherwise skip per the
   `sync-check.ts`/`completeness-checklist.ts` precedent of leaving the CLI
   entry point itself untested by convention (stated explicitly in
   `record-spec-diff-receipt.ts:6-9`'s comment).
4. Implement `skill-scripts/prd-impact.ts`: reads the receipt (if any) for
   `lastAppliedCommit`, shells `git log <range> -- <prdPath>` (or reads the
   whole PRD when no prior receipt), reads the PRD file, calls
   `prd-impact.ts`'s pure function, prints `{ impactedScreens: string[] }`
   JSON to stdout, non-zero exit + stderr message when the PRD path doesn't
   exist (mirror `completeness-checklist.ts`'s CLI error handling exactly).

Verify: `bun run test packages/toolkit/src/packs/design/design-kit/prd-impact.test.ts packages/toolkit/src/packs/design/skill-scripts/prd-impact.test.ts` (or the repo's actual per-package test invocation — confirm exact script name in `packages/toolkit/package.json` at build time) green; `bun run typecheck --filter=@argohq/toolkit` clean.

### Slice 2 — receipt writer (`testable: true`, `requiresLaunch: false`)

5. Write `skill-scripts/record-prd-apply-receipt.test.ts` (red): given a
   `{ prdPath, commit, impactedScreens, runs }` input, assert the JSON shape
   written matches the receipt schema stated in this plan's Approach section.
6. Implement `skill-scripts/record-prd-apply-receipt.ts`: thin function that
   calls `writeDesignJson(cwd, \`prd-apply-receipts/${featureSlug}.json\`,
   receipt)` — reuse the existing writer verbatim, no new atomic-write logic.

Verify: same test command as Slice 1, scoped to this file.

### Slice 3 — the `prd-apply` spec (`testable: true`, `requiresLaunch: false`)

7. Write `playbooks/prd-apply.test.ts` (red) mirroring
   `screen-edit.test.ts`'s shape: assert the three stages exist in order,
   `fan-out` requires `diff-impact` and allows `playbook-start`, `report`
   requires `fan-out`, no stage declares a `gate` (per this plan's
   no-duplicate-gating decision — assert `gate` is undefined on all three).
8. Implement `playbooks/prd-apply.ts` per the Approach section's three-stage
   shape, calling `definePlaybook`/`registerPlaybook` exactly like the six
   existing specs.
9. Add `export * from './prd-apply.js'` to `playbooks/index.ts`.

Verify: `playbook-list` output (`argo playbook list --json` or its
programmatic equivalent — confirm exact invocation in
`packages/toolkit/src/cli/playbook-list.ts` at build time) includes
`prd-apply`; `playbookStart({ name: 'prd-apply', target: '<prd-basename>' })`
in a throwaway test succeeds against the registry (mirror
`playbook-start.test.ts`'s harness).

**Checkpoint review after Slice 3** — the spec + deterministic impact logic
are both independently verifiable before wiring the skill-side fan-out loop;
natural seam since Slice 4 is craft-doc prose, harder to gate mechanically.

### Slice 4 — fan-out skill wiring (`testable: false`, `requiresLaunch: false`)

10. Read `packages/toolkit/packs/design/craft/design-screen.md` in full at
    build time (not re-quoted here — grounding rule: don't assert content not
    freshly read) and add the `prd-apply` fan-out step: on the `fan-out`
    stage, read `diff-impact`'s `impactedScreens` output, call `argo playbook
    start --name screen-edit --target <screen>` once per screen (or the
    equivalent programmatic `playbookStart` call if the skill runs
    in-process — confirm which calling convention `missing-components`/
    `component-impact`'s existing prose actually documents before adding a
    third, inconsistent one), then hand the roster to the `report` stage.
    This is prose/doc, not behavioral code — `testable: false`.

Verify: manual read-through against Slice 3's spec (stage names, `allows`
values match what's written).

### Slice 5 — end-to-end dry run (`testable: true`, `requiresLaunch: true`)

11. In a scratch project fixture (or the existing test fixtures used by
    `playbook-start.test.ts`), seed a PRD with a requirements table + matrix,
    seed a fake prior receipt, make a git commit that changes one REQ-ID's
    row, run the full `diff-impact` → `fan-out` → `report` sequence via the
    CLI verbs (not mocked), and assert: only the screen(s) `covered-by` the
    changed REQ-ID got a `screen-edit` run started, the receipt's
    `lastAppliedCommit` advanced to the new commit, and the roster in the
    receipt matches the started runs. This is the step that needs fresh
    launch-evidence — it exercises the real git/file/registry integration,
    not unit-level fakes.

Verify: the fixture's own test command (confirm harness — likely a
`*.integration.test.ts` alongside `playbook-start.test.ts`'s existing
`mkdtempSync`-based state-root isolation pattern, seen at
`playbook-start.test.ts:15-16`) green end to end.

## Risks & assumptions

- **Assumption (recorded, incidental):** "impacted components" fan-out is
  fully delegated to each spawned `screen-edit` run's existing
  `component-impact` stage — `prd-apply` never computes component impact
  itself. This keeps the plan to zero new spec vocabulary and zero
  duplicate mechanism, per the task's "keep it thin" instruction. If this
  turns out wrong (component impact needs cross-screen dedup that
  `component-impact` can't see per-screen), that's a design gap in
  `component-impact` itself, out of scope for this plan.
- **Risk:** git-diff-based REQ-ID change detection is line-based text diff
  against a markdown table — a REQ-ID whose row is reformatted (column
  reorder, whitespace) without content change could false-positive as
  "changed". Accepted risk, same class as `completeness-checklist.ts`'s
  existing markdown-table parsing fragility; not a new risk class.
  Mitigated by keeping `prd-impact.ts` unit-tested against realistic diffs
  in Slice 1.
  - **Risk:** the exact test-runner invocation (`bun run test <path>` vs a
  package-scoped script) is asserted provisionally above — confirm the real
  command from `packages/toolkit/package.json` at build start before running
  any "Verify" line literally.
- **Open questions above must be resolved before Slice 1** — this plan is
  written to option (A)/(deterministic) throughout; changing either flips
  Slice 1's target file layout (receipt goes into the PRD's own frontmatter
  instead of a sibling JSON) but not Slices 3-5.

## Verification (overall)

- All five slices' unit/spec tests green.
- `argo playbook list --json` includes `prd-apply` with 3 stages.
- The Slice 5 integration run demonstrates: PRD diff → correct screen subset
  → real `screen-edit` runs started → receipt advanced — the full loop the
  task describes, with no manual "start one screen-edit per screen" step
  left for the user.
