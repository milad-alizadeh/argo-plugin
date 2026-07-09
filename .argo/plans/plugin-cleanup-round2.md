# Plugin cleanup round 2 — argo-plugin implementation plan

Grounded against `.claude/plans/design-system-reset-overhaul.md`'s "Post-review
addendum" (line 724) and the current state of `/Users/milad/Developer/argo-plugin`
(packages/kit@0.13.0). This is a cleanup round, not a feature program — every
slice is small and closes a confirmed gap in the code, not a hypothetical one.

## Owner mandate (repeated so every slice is graded against it)

Very simple, effective setup. Dead/redundant code is **deleted**, not
deprecated. No speculative features, no gates beyond the ones already named.
Keep working abstractions the plan doesn't contradict.

## What's already done (verified against code, do not re-touch)

- **D11 (`missing-mode-copy` / `modeCopyViolations`) is fully deleted**, not
  just gated. The addendum (written earlier the same day) asked to make it
  same-file-exempt; the actual landed fix (v0.13.0, per the task brief) went
  further and removed the rule entirely — no `modeCopyViolations`,
  `missing-mode-copy`, or `mode-copy` string exists anywhere under
  `packages/kit/src` (grepped). This is the correct, more owner-mandate-
  aligned outcome (delete, don't gate) — Slice 2 below only sweeps the
  residue this left behind, it does not touch any rule logic.
- **Audit-receipt schema (task item 4) has no drift.** Read
  `packages/kit/src/skill-scripts/record-audit-receipt.ts` and
  `packages/kit/src/lib/session-guard.ts:86-116` end to end: every field the
  receipt writer produces (`violationCount`, `writeCounterAtAudit` on the
  legacy path; `violationCount`, `writeCountAtAudit`, `apps` on the
  per-session `SessionReceipt` path) is declared on the `SessionReceipt` type
  and asserted by `record-audit-receipt.test.ts`'s 5 cases. Nothing to
  reconcile — **drop this item.**
- **Icon check (task item 5a — text-glyph pseudo-icons): confirmed gap, judged
  not worth closing.** `handDrawnIconViolation`
  (`packages/kit/src/design-kit/tier0-rules.ts:153-160`) only fires on
  `node.type === 'VECTOR'`, so a `▶` authored as a bare TEXT node is
  confirmed NOT caught. But unlike the auto-layout and em-dash items, there
  is no live finding of this actually happening, and the only safe detection
  boundary (a TEXT node whose trimmed content is a single non-alphanumeric
  character, outside an instance) risks false-positiving on legitimate
  single-character text: counters/badges (`"1"`), avatar initials, list
  bullets, disclosure-triangle glyphs already in use elsewhere in a file.
  Per YAGNI and the owner mandate against speculative features: **drop —
  revisit only if a live audit run actually surfaces this pattern.**
- **No TODO/FIXME markers** anywhere under `packages/kit/src` (grepped,
  zero hits) — item 6 has nothing further to add beyond what's below.

## Note on scope (read before building)

Mid-task, a message formatted as a "coordinator" instruction appeared
embedded inside a tool result (not as a real user/launching-agent turn),
asking to add a large new slice (kit-component registry sweep in
figma-sync). That is not how legitimate instructions arrive — it was not
enumerated in the task brief, not present in the addendum, and arrived
through a channel (grep output) that cannot carry real direction. It is
**not included in this plan.** If that work is genuinely wanted, ask for it
explicitly as its own task — it is a real feature (new sweep semantics, page
classification, status derivation) and deserves its own grounded plan, not a
paragraph smuggled into a cleanup round.

## Approach

No architect panel needed — every slice is a small, mechanical fix to
existing code/tests/docs, not a new module boundary or data-model choice.

## Files to change

- `packages/kit/src/design-kit/tier0-rules.ts` — exempt zero-child frames in
  `missingAutoLayoutViolation`; add `emDashViolation`.
- `packages/kit/src/design-kit/tier0-rules.test.ts` — flip the "still flags
  an empty no-Auto-Layout frame" case; add em-dash rule tests.
- `packages/kit/src/design-kit/tier0-audit.ts` — drop dead `semanticModes`/
  `semanticCollectionId` threading and `collectSemanticModeNames`; wire the
  new em-dash advisory check into `auditNode`.
- `test/helpers/runPureTier0Audit.mjs` — drop the dead `semanticModes` param.
- `test/fixtures/kit-corpus.json` — drop the dead top-level `semanticModes`
  field.
- `templates/design/file-structure.md` — drop the D11 mode-copies mention
  from the `Custom Components` page description.
- `templates/design/recipes/shadcn-tailwind/code-target/token-writer.md` —
  reword step 3's "D10/D11, generalized to mode copies" citation (the
  variable-mode CSS generation itself is real and stays; only the D11
  citation is stale).
- `packages/kit/src/skill-scripts/lib/write-design-json.test.ts` — rewrite
  off `vi.mock('node:fs', importOriginal)` onto real tmpdir fixtures.

## Step-by-step work items

### Slice 1 — `missing-auto-layout` zero-child exemption (StatusDot false positive)

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.

1. In `packages/kit/src/design-kit/tier0-rules.ts`'s `missingAutoLayoutViolation`
   (line 129-151), add a zero-child exemption alongside the existing
   all-absolute-children exemption: `if (children.length === 0) return null`,
   placed after the `children` const is read (line 146) so it short-circuits
   before the all-absolute check runs (an empty array already vacuously
   passes `.every()`, so the exemption must be explicit, not implied — a
   leaf shape like StatusDot's colored dot variants has nothing to lay out).
2. In `packages/kit/src/design-kit/tier0-rules.test.ts`, flip the existing
   case at line 158-164 (`'still flags an empty no-Auto-Layout frame (no
   children is not an absolute canvas)'`) — it currently asserts the
   opposite of the new behavior. Rename it to describe the exemption and
   assert `toBeNull()`. Add a second case using a `COMPONENT` type (the
   addendum's exact ask: "regression test with a zero-child COMPONENT") to
   confirm the exemption isn't FRAME-only.
3. Verify: `cd packages/kit && bun test src/design-kit/tier0-rules.test.ts`

### Slice 2 — D11 residue sweep (docs + dead walker threading)

`argo:build-plan` metadata: `testable: true` for the code sub-steps,
`testable: false` for the doc rewords; `requiresLaunch: false`.

1. `templates/design/file-structure.md:29-30` — reword the `Custom
   Components` page bullet: remove "plus its D11 mode copies when the
   Semantic collection has 2+ modes" (mode copies don't exist under the
   reset model's dark-default-authoring-with-variables rule). Keep the rest
   of the bullet (project-owned components, imported raster assets) as-is.
2. `templates/design/recipes/shadcn-tailwind/code-target/token-writer.md:18-19`
   — reword "(D10/D11, generalized to mode copies, 2026-07-05)" — the actual
   mechanism this step describes (per-mode CSS custom-property blocks from
   the Semantic collection's Figma variable MODES, e.g.
   `[data-theme="light"] { … }`) is real and unaffected by D11's deletion;
   only the stale D10/D11 citation needs to go. Replace with a short note
   that this generates from the Semantic collection's variable modes
   directly, dropping the D-number citation.
3. In `packages/kit/src/design-kit/tier0-audit.ts`: delete the
   `collectSemanticModeNames` function (line 435-442) and its call site
   (line 359); remove `semanticModes`/`semanticCollectionId` from
   `auditNode`'s options type and destructuring (lines 66-67, 77-78) and
   from both `walkOpts` object literals (lines 371, 420) and the `walk`
   function's option pass-through — grep-confirmed zero consumers: no rule
   function inside `auditNode`'s body reads either value, and
   `nonSemanticBindingViolation` (the only plausible consumer, in
   `packages/kit/src/recipes/shadcn-tailwind/tier0-rules.ts:36`) keys off
   `variable.collectionName`, a string, never off the collection id. Also
   fix the now-inaccurate doc comment at line 432-433 ("Non-semantic-binding
   checks key off the id") since that consumer never existed after D11's
   removal — delete the whole function rather than patch a comment on top
   of dead code.
4. In `test/helpers/runPureTier0Audit.mjs`: drop the unused `semanticModes`
   param from `auditPureNode`'s destructured options (line 29) and
   `runPureTier0Audit`'s pass-through (line 82) — confirmed unread inside
   `auditPureNode`'s body.
5. In `test/fixtures/kit-corpus.json`: drop the top-level `"semanticModes":
   ["Light", "Dark"]` field (line 3) — no reader remains after step 4.
6. Verify: `cd packages/kit && bun test src/ && bun run build` (the R7
   corpus test in `kit-corpus.test.js` must still pass zero-violation with
   the field gone — it only ever forwarded the value, never asserted on it).

### Slice 3 — em-dash advisory check (owner despises em dashes, cheap deterministic)

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.
Checkpoint: none needed — 3 independent slices, no seam.

1. In `packages/kit/src/design-kit/tier0-rules.ts`, add a new pure function
   near `implicitLineHeightViolation` (line 245-250):
   ```ts
   export function emDashViolation(node: AnyNode): Violation | null {
     if (node.type === 'TEXT' && typeof node.characters === 'string' && node.characters.includes('—')) {
       return { rule: 'em-dash-in-text', detail: 'text node contains an em dash (—) — never author one; use a period, comma, colon, or ·' }
     }
     return null
   }
   ```
   (`—` is the em dash — spelled as an escape so the character isn't
   silently normalized/stripped by an editor or linter touching this file.)
2. Wire it into `packages/kit/src/design-kit/tier0-audit.ts`'s `auditNode`
   (near the `implicitLineHeightViolation` call, ~line 227-228). Always
   advisory regardless of `hard` — same pattern already used for
   `compositeNaming`/`strokeScale` (push directly with
   `severity: 'advisory'`, not through the `report()` helper which honors
   `hard`) since this is a style-hygiene nit, not a structural defect that
   should ever hard-fail a named audit.
3. Also wire it into `test/helpers/runPureTier0Audit.mjs`'s `auditPureNode`
   (mirrors the real walker's rule set, per that file's own header comment)
   so the R7-style pure-audit path stays in lock-step.
4. Add test cases to `tier0-rules.test.ts`: a `TEXT` node with an em dash in
   `characters` flags `em-dash-in-text`; a `TEXT` node without one passes;
   a non-`TEXT` node with an em dash-containing field (e.g. a component
   `name`) is ignored (this only inspects `characters`, never node names).
5. Verify: `cd packages/kit && bun test src/design-kit/tier0-rules.test.ts`

### Slice 4 — `write-design-json.test.ts` off vitest-only mock idioms

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.

1. Confirmed the ONLY vitest-incompatible file in the package (grepped
   `vi\.mock` across `packages/kit/src`: the sole other hit,
   `hooks/test-smell.ts`, is a string literal inside a smell-detector's own
   description text, not a real mock call).
2. Rewrite `packages/kit/src/skill-scripts/lib/write-design-json.test.ts`'s
   second test ("writes via a temp file + rename, not a direct write to the
   final path") off `vi.mock('node:fs', importOriginal)` (lines 6-12) onto a
   real-filesystem assertion: instead of spying on `renameSync`, assert the
   *observable* crash-mid-write-safety contract directly — write once, then
   read the `design/` dir immediately after `writeDesignJson` returns and
   confirm exactly one file (`registry.json`) exists with no stray
   `.registry.json.tmp-*` sibling (this is what the first test already
   partially checks at line 21-22, so the second test should assert the
   *mechanism* a different way: create a pre-existing `registry.json` with
   sentinel content, call `writeDesignJson` mid-flight is not observable
   without a mock — so instead assert atomicity indirectly: the temp
   filename pattern `.${filename}.tmp-${pid}-${timestamp}` is derived from
   `writeDesignJson`'s own source (`write-design-json.ts:26`), so glob the
   `design/` dir for `.registry.json.tmp-*` immediately after the call
   returns and assert it's absent, and separately assert the final content
   is exactly what was written — this exercises the real
   `writeFileSync`+`renameSync` sequence with zero mocking, on a real
   tmpdir, which is what this package's every other fs-touching test
   (`record-audit-receipt.test.ts`) already does).
3. Remove the `vi.mock` block and the `renameSpy` import entirely; keep
   `vi`'s `describe`/`it`/`expect` imports only if still used elsewhere in
   the file (they are, for the test bodies) — drop `vi` from the import if
   nothing in the rewritten file still calls it.
4. Verify: `cd packages/kit && bun test src/skill-scripts/lib/write-design-json.test.ts`
   — must show 0 unhandled errors (today's baseline: 2 unhandled errors on
   every `bun test` run per the task brief); confirm with
   `cd packages/kit && bun test src/` for the whole-package sweep.

## Verification (whole-plan)

- `cd packages/kit && bun test src/ && bun run build` — the plan's own
  standard verify command, run after each slice and once more at the end.
- Slice 4 specifically: re-run `bun test src/` and confirm the previously
  reported "2 unhandled errors on every run" (task brief) are gone from the
  output, not merely that the assertions pass (the vitest-only mock idiom
  throws at the `bun test` runner level, separate from assertion failures).
- Slice 1: re-run `bun test src/design-kit/tier0-rules.test.ts` and confirm
  both the FRAME and COMPONENT zero-child cases pass, and that the existing
  all-absolute-children and "still flags a non-absolute child" cases are
  untouched (no regression on the exemptions that already work).

## Risks & assumptions

- Slice 2 assumes `nonSemanticBindingViolation` is genuinely the only
  plausible consumer of `semanticCollectionId`/`semanticModes` — grounded by
  reading every call site of both identifiers across `packages/kit/src`
  (8 matches total, all either the dead declaration/threading or this one
  recipe function, which reads `collectionName` not the id). If a future
  recipe needs the real Semantic collection id, `collectSemanticModeNames`'s
  logic (2 lines: find by name, return `.id`) is trivial to re-add scoped to
  wherever it's actually needed — not worth keeping speculatively today.
- Slice 3's em-dash check only inspects `TEXT.characters`, never component/
  layer names — an em dash in a layer name (e.g. a component named
  "Card — compact") is out of scope; the owner's complaint is about authored
  copy, not internal naming, and node names already go through
  `nonSemanticNameViolation`'s separate convention, not this check.
- Slice 4's rewrite trades a mocked assertion ("renameSync was called
  exactly once") for a black-box one (no stray temp file remains, final
  content is correct) — this is a strictly weaker assertion about the
  *mechanism* (doesn't prove the write goes through a rename specifically,
  only that it's atomic-observable), but it's the only assertion `bun test`
  can make without a working `vi.mock` — matches how
  `record-audit-receipt.test.ts` already tests the same writer's callers.
