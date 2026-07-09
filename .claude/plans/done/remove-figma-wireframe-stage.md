# Remove the Figma lo-fi wireframing stage, fold it into PRD/grilling

## Context (grounded in current repo state)

**The wireframe/contract machinery is ALREADY described as retired in the two
skills that actually build hi-fi.** `skills/design-screen/SKILL.md:11-15` says:
"This is the simplified flow (design-process-simplification.md, 2026-07-07):
the old contract-freeze / region-coverage / structural-receipt /
wireframe-verifier machinery is retired... disproportionate bookkeeping." And
`skills/design-screen/SKILL.md:43-45`: "A wireframe is OPTIONAL — reference
context only, never frozen or verified against." `skills/figma-wireframe/SKILL.md:12-16`
carries the same notice. So the code-facing reality (design-screen, figma-create)
is already past the FREEZE/contract era; **README.md and PIPELINE.md are stale**
— they still describe a `brief → wireframe → FREEZE(region-contract) → hi-fi`
pipeline with `wireframe-verifier` as a gate before the freeze
(`README.md:37-45,143-192`, `PIPELINE.md:6,22-43,50-140`). This plan finishes
the retirement: delete the wireframe-authoring skill and its verifier outright,
fold what they did into PRD/grill-me as an ASCII wireframe, and bring the docs
current with what design-screen/figma-create already do.

**What the wireframe stage actually did, and where its role moves:**
- Lo-fi layout exploration + convergence on one arrangement per screen
  (`figma-wireframe/SKILL.md` "Variations are first-class" section) → moves to
  an **ASCII wireframe + flow sketch co-created in `write-prd`/`grill-me`**,
  embedded directly in the PRD (or the screen brief it feeds), agreed with the
  user before hi-fi starts.
- Region naming/decomposition that survives into hi-fi (`figma-wireframe/SKILL.md:95-99`,
  "read the brief first... wireframe the region NAMES") → the screen brief's
  **Regions → component map** already exists and already is the decomposition
  authority (`templates/design/screen-brief.md:33-46`); the ASCII wireframe is a
  visual expression of that same map, authored earlier (in the PRD) instead of
  in Figma.
- `wireframe-verifier`'s four checks (scope, region coverage, arrangement
  conformance, standing-rule conformance — `agents/wireframe-verifier.md:42-92`)
  → region coverage and arrangement conformance are **already** covered
  downstream by `design-screen`'s deterministic instance-presence check (P4a)
  and the advisory completeness pass (P4b) against the PRD
  (`skills/design-screen/SKILL.md:166-217`); there is no gate to replace here,
  because design-screen's current flow already treats the wireframe as
  optional, ungated reference. Deleting the verifier removes an agent that
  guards a stage that no longer exists.
- The **"Reference image"** brief input (`templates/design/screen-brief.md:18-26`)
  already accepts "a wireframe export... **or the original design**" — this
  plan narrows its wording to point at the PRD's ASCII wireframe as the primary
  source, with a Figma export only as an optional richer add-on a human may
  still choose to produce out-of-band (figma-wireframe's absence doesn't ban
  hand-wireframing in Figma, it just means argo no longer ships an
  agent/skill/gate for it).

**FREEZE / region-contract:** confirmed dead code already — no file in the repo
references a `design/contracts/<screen>.json` region-contract, no code parses
one, and the only artifact of that era is the orphaned fixture
`test/fixtures/d01-wireframe-contract.json` (grep across the repo found zero
other references to `d01-wireframe-contract` or `region-contract`). The prior
owner decision cited in the task ("drop contract-freeze/coverage; the PRD is the
completeness oracle") is already fully implemented in `design-screen.md`/
`figma-create.md`. Nothing to build here — only delete the dead fixture and
correct the stale docs that still describe FREEZE as live.

## Decisions (incidental, resolved — not blocking)

1. **Keep the kit-side wireframe-*page*-classification plumbing** (
   `isWireframePageName`, its use in `isKitPageName`/`kitPageIndices`
   (`packages/kit/src/design-kit/registry-reconcile.ts:18,59-67`), the tier-0
   audit's wireframe-page exemption (`tier0-audit.ts:497-498,523-524,598-599`),
   and `design-guard-record.ts`'s `figma-wireframe`/`figma-read-only`
   `skillNames` write-exemption). **Rationale:** these are passive,
   backward-compatible page-classification rules, not the authoring
   stage — a project whose Figma file already has legacy `W##`/`Cover` pages
   from before this change must not have those pages suddenly start failing
   the tier-0 hard gate or bumping the design-guard write counter just because
   the *authoring* skill was deleted. No new code is added; nothing here
   references the deleted skill/agent by name (`isWireframePageName`'s doc
   comment cites `figma-wireframe/SKILL.md` in prose only — updated below to
   say "legacy" instead of pointing at a skill that no longer exists).
   **Consequence: no `@argohq/kit` source/logic changes, so no kit version
   bump** — only its test file's example comment gets a one-line grounding
   fix (see Files to change).
2. **`resolve-comments`'s three-way routing table drops the `W##` row.**
   Since `figma-wireframe` is deleted, there is no skill left to route a
   wireframe-page comment to. A comment whose pin resolves to a `W##`/`Cover`
   page is now classified `unmatched` (falls through `resolve-context.js`'s
   `classifySurface`, updated below) and handled by the skill's existing
   unmatched-handling: post a `❓` rather than silently apply a convention that
   no longer has an owning skill. This is the correct "collapse" per task item
   5 — no new prose skill added, the existing ambiguous-surface path already
   does the right thing once wireframe pages stop being a recognized surface.
3. **`fidelity-verifier`'s reference input retargets from "brief/wireframe/
   original screenshot" to "brief + PRD's ASCII wireframe"** (task item 6) —
   the PRD's ASCII wireframe is now the durable pre-build reference; a Figma
   wireframe export remains an allowed input only in the sense that "the
   original design" already covered arbitrary reference images (no code
   changes needed there beyond the wording, since the agent takes whatever
   reference the spawner hands it — the change is in what the SPAWNER's brief
   points at, i.e. `templates/design/screen-brief.md`'s `Reference image`
   section).

## Approach

No architecture change — this is a deletion + doc/prompt-content edit pass, no
new module boundary or data model. Single-pass plan, buildable in one
`/argo:build-plan` run.

## Files to change

### Delete outright
- `skills/figma-wireframe/` (whole directory — `SKILL.md` is its only file)
- `agents/wireframe-verifier.md`
- `test/fixtures/d01-wireframe-contract.json` (orphaned FREEZE-era fixture, zero referrers)

### Skills / agents — edit
- `skills/write-prd/SKILL.md` — add the ASCII wireframe + flow-sketch step (new
  step between current step 4 "Write checkable requirements" and step 5 "Build
  the feature→screen matrix"); update line 3 description and lines 8-11, 148-149
  ("cited by every stage after it (wireframe → hi-fi design...)" →
  "cited by every stage after it (hi-fi design...)"; the PRD now CARRIES the
  wireframe, it doesn't hand off to a separate stage).
- `agents/product.md` — no wireframe mention to strip (checked: none found)
  beyond the boundary note; leave as-is except confirming it doesn't claim a
  wireframe handoff (it doesn't — it says "wireframe... consume the PRD" at
  line 75-76, update to "hi-fi design consumes the PRD").
- `skills/grill-me/SKILL.md` — no direct wireframe reference found; no edit
  needed structurally, but add one line to the blank-slate feature-level fork
  (lines 20-22) noting that when `argo:product`/`write-prd` is invoked, the ASCII
  wireframe + flow sketch is agreed with the user as part of that hand-off, so
  grill-me's own interview doesn't need to re-derive layout.
- `agents/designer.md` — remove `figma-wireframe`/lo-fi routing line
  (line 60: "Lo-fi layout work, sketching, or a layout study:
  `argo:figma-wireframe`."), remove it from the one-line skill summary
  (line 3), and the `AESTHETIC PROFILE` note "(Wireframe work ignores it...)"
  (line 276) — drop the parenthetical since there is no more wireframe work
  this agent routes to.
- `skills/design-screen/SKILL.md` — retarget "A wireframe is OPTIONAL" (line
  43-45) to "**An ASCII wireframe from the PRD/brief is the layout reference**
  — the PRD (via `write-prd`'s ASCII-wireframe step) or the screen brief's
  `Reference image` section carries it; a hand-drawn Figma wireframe is no
  longer an argo-owned stage but a human may still produce one out-of-band as
  an additional reference image." Update the retirement note (lines 11-15) to
  also name `figma-wireframe`/`wireframe-verifier` as fully deleted, not just
  "retired machinery."
- `skills/figma-create/SKILL.md` — line 237-243 ("A screen is built from its
  brief, not traced from its wireframe... The wireframe is a lo-fi layout
  reference") → reword to "not traced from a wireframe export" and clarify the
  brief's `Reference image` is normally the PRD's ASCII wireframe now. Lines
  245-252 (`Reference image` STOP AND ASK block) — no functional change, just
  confirm wording doesn't imply a Figma wireframe is expected by default.
- `skills/resolve-comments/SKILL.md` — remove the `W##` row from the "Three-way
  routing" table (lines 88-101), rename the table intro from "Three-way" to
  "Two-way" (screen / component master), and add one sentence: "A pin that
  resolves to a legacy `W##`/`Cover` page (from a project wireframed before
  this stage was retired) falls through to `unmatched` — post a `❓` noting
  wireframing is retired and ask whether the fix should move to the screen
  brief/PRD instead." Update the componentization-request fallback note (line
  151-152, "the pin sits on a `W##` wireframe page") similarly — that carve-out
  becomes unreachable via the routing table and should be deleted, not
  reworded, since `unmatched` already covers it.
- `skills/resolve-comments/scripts/resolve-context.js` — `classifySurface`
  (lines 27-33): delete the `wireframe` branch (`/^W\d{2}.../ || page === 'Cover'`
  → `'wireframe'`); pages matching that pattern now fall through to the final
  `return 'unmatched'`. Update the file-header comment (lines 25-26) that says
  "Keep in lockstep with the Three-way routing table" → "Two-way routing
  table."
- `skills/setup-design/SKILL.md` (line ~94-103) — the `figma.wireframeKitFileKey`
  config block description ("A lo-fi wireframe component library
  `figma-wireframe` instances from") — delete this config key's install-time
  guidance entirely (it configures a skill that no longer exists); leave the
  key itself in `templates/design/config.example.json` schema as a no-op
  documented-dead field ONLY if something else still reads it — confirmed
  nothing else reads `wireframeKitFileKey` outside the deleted skill, so
  **delete the key from `templates/design/config.example.json` too** (line 20).
- `skills/setup-design/templates-reference.md` — remove the wireframe-page
  scaffolding bullets (lines 15-24: "wireframes and designs both use its
  vocabulary", "`──── Wireframes ────`... marks the start of the lo-fi
  section", "`W01 <group>`... lo-fi wireframes only") to match the trimmed
  `file-structure.md` page order below.
- `skills/figma-audit/SKILL.md` (line 226) — comment referencing "figma-wireframe's
  `figma-wireframe` tag" as precedent for the `figma-read-only` tag mechanism →
  reword to "the legacy `figma-wireframe` write-exemption tag (kept for
  backward compat on projects with existing wireframe pages, see
  `design-guard-record.ts`)" so the cross-reference stays accurate once the
  skill is gone.
- `skills/orchestrate/SKILL.md` (lines 79-94, ~129) — "Brief before wireframe,
  component before screen" ordering rule and the "if figma-wireframe runs"
  language: reword to drop the wireframe step from the supervised sequence
  (brief → component → screen, no wireframe step in between); update line 129
  ("reference (brief/wireframe/original screenshot)") → "reference (brief/PRD
  ASCII wireframe/original screenshot)".
- `skills/figma-sync/SKILL.md` — no wireframe-specific sync behavior found
  (grep returned nothing); no edit needed.

### Templates — edit
- `templates/design/screen-brief.md` — lines 3-11 ("Authored... BEFORE its
  wireframe, and read by BOTH the wireframe stage (`figma-wireframe`) and the
  hi-fi stage"; "A screen is not started (wireframe or hi-fi) until its brief
  exists.") → "Authored before hi-fi design, read by `figma-create`. It carries
  the two things a PRD-level ASCII wireframe deliberately doesn't fully spell
  out — which regions are reusable components and their sub-parts..."; line 20-21
  ("a wireframe export, an annotated sibling screenshot, or the original
  design") → "the PRD's ASCII wireframe, an annotated sibling screenshot, or
  the original design"; line 52 ("a soft wireframe flow can't quietly drift")
  → "the flow can't quietly drift"; line 64 ("a wireframe drawn without this
  defaults to...") → "a layout sketched without this defaults to..."; line 81
  ("this is the spec a wireframe realizes, not prose") → "this is the spec the
  PRD's ASCII wireframe and hi-fi both realize, not prose."
- `templates/design/config.example.json` — delete the `wireframeKitFileKey`
  key (line 20).
- `templates/design/file-structure.md` — remove page-order entries 2 and 3
  (the `──── Wireframes ────` divider and `W<NN> <group>` pages, lines 17-21),
  renumber the remaining entries (Cover=1, `──── Designs ────`=2, `D<NN>
  <group>`=3, `Custom Components`=4, `Foundations`=5); update line 4-7 ("This is
  the single source of truth... `figma-create`, `figma-wireframe`, and
  (eventually) `setup-design`'s...") → drop `figma-wireframe` from the pointer
  list; update line 15 ("wireframes and designs both use its vocabulary") →
  "every design page uses its vocabulary"; update line 24-25 ("mirroring the
  wireframe group names 1:1... `W03 Onboarding` matches `D03 Onboarding`") →
  delete the wireframe-mirroring clause since there's no `W` series left to
  mirror; group numbering becomes purely sequential per surface group, not
  paired across two series.
- `templates/product/prd.md` — read the full template (see Step-by-step work
  below — the grep-context above shows lines 5, 10, 166 reference "wireframe"
  and "wireframe (optional) → `figma-create`") — add the new **ASCII wireframe
  + flow** section (schema below) and update the handoff line (166) from
  "wireframe (optional) → `figma-create`" to "hi-fi design (`figma-create` /
  `design-screen`) — consuming this PRD's ASCII wireframe + flow directly."

### Docs — rewrite (bring current with the already-implemented simplified flow, and remove wireframe)
- `README.md` — pipeline diagram (lines 20-76): remove the `wf`/`wfv`/`freeze`
  nodes and the `DESIGN LOOP` subgraph's edges through them; new shape:
  `grill --> brief --> hifi["design-screen / figma-create"] --> t0{"tier-0
  audit + P4a instance-presence + P4b advisory completeness"} --> dv{"design-verifier
  (advisory, PRD-vs-manifest)"}`. Drop the `FREEZE` det-node entirely. Update
  the enforcement-layer table (line 100) — delete the `wireframe-verifier /
  design-verifier` row's "wireframe" half, rename to just `design-verifier /
  fidelity-verifier` and correct "screens that miss PRD requirements or
  contract regions" → "screens that miss PRD requirements or manifest rows"
  (no more "contract regions" — that's the dead FREEZE concept). Update the
  loop walkthrough (line 143): "Design pack (UI work): brief →
  `/argo:figma-wireframe` → freeze → `/argo:design-screen`..." →
  "Design pack (UI work): PRD's ASCII wireframe → brief → `/argo:design-screen`
  (or `/argo:figma-create`)...". Update the re-entry-altitude diagram/table
  (lines 165-192): drop the `wf`/`FREEZE` nodes and the "Re-wireframe?" column
  header/rows; the pivot for structural vs. style changes becomes "the PRD's
  ASCII wireframe vs. hi-fi", not "the freeze" (there is no freeze artifact).
  Update "What ships active" (lines 196-201): drop `wireframe-verifier` from
  the twelve-agents list (now eleven; recount and fix the stated number) and
  drop `figma-wireframe` from "the twenty-two disciplines" skill count (recount
  and fix that number too, since a whole skill directory is gone).
- `PIPELINE.md` — this file is the most FREEZE-era-stale of all; full rewrite
  of the stage table (lines 6, 22-43) and "Seam 1 — the FREEZE" section (lines
  50-94, currently ~45 lines describing a `design/contracts/<screen>.json`
  artifact that doesn't exist in code) — delete Seam 1 entirely (there is only
  one seam left: design → code handoff via `figma-sync`), renumber "Seam 2" (if
  present further down — confirm by reading the full file during the build
  step) to "the handoff" or "Seam 1" as the sole seam. Replace the stage table's
  wireframe/freeze rows (rows 3-5 in the current numbering) with a single
  "Screen brief (with PRD ASCII wireframe as layout reference) → design-screen/
  figma-create" row. Update the re-entry table (lines 106-140) to match
  README's corrected version — drop "Re-wireframe?" column, drop `wf`/`FREEZE`
  nodes from its mermaid diagram, and correct the verifier-list line 138-140
  ("`wireframe-verifier` (before the freeze)...") by deleting that bullet
  entirely (only `design-verifier`/`fidelity-verifier` remain).
- `.claude-plugin/plugin.json` — bump `version` to `0.54.0`; rewrite the
  `description` string's design-pack clause: delete
  `figma-wireframe` from the parenthetical skill list
  (`setup-design/figma-audit/figma-sync/figma-create/figma-wireframe/figma-to-code/design-upgrade`
  → drop `figma-wireframe`), and extend the write-prd clause ("a product role +
  write-prd skill that author a lightweight grounded PRD... with checkable
  requirements and a feature→screen matrix") to also name the new ASCII
  wireframe + flow-sketch authored inline in the PRD as the sole layout-intent
  artifact feeding the designer (since this is the substantive behavior change
  the version bump documents).

## Step-by-step work (ordered)

Each step's verify command runs from the plugin repo root
(`/Users/milad/Developer/argo-plugin`) unless noted. `testable: false` marks a
step with no runtime behavior to red-green (pure prose/config); everything else
is prose-authored content whose only "test" is the grep-verification in step 9
— there is no unit-testable logic in this plan (no kit source changes), so no
step below is behavioral in the red-green sense; mark all `testable: false`,
`requiresLaunch: false`.

1. **Delete the three dead artifacts.**
   `rm -rf skills/figma-wireframe agents/wireframe-verifier.md
   test/fixtures/d01-wireframe-contract.json`.
   Verify: `git status --porcelain` shows exactly these three deletions;
   `grep -rl "d01-wireframe-contract" .` returns nothing (already confirmed
   zero referrers before deletion).
   `testable: false`, `requiresLaunch: false`.

2. **Edit `write-prd/SKILL.md` and `templates/product/prd.md`** to add the
   ASCII wireframe + flow-sketch step. In `write-prd/SKILL.md`, insert new
   step "4b. **Sketch the ASCII wireframe + flow (per screen the matrix
   covers).** For each screen with `Visible in build? = yes/partial`
   requirements, co-create with the user (one screen at a time, following
   grill-me's one-question-at-a-time discipline where a layout choice is
   genuinely open) a plain-text ASCII block naming that screen's regions and
   their spatial arrangement (rows/columns/panels, indentation or box-drawing
   characters — no fixed notation mandated, legibility is the only bar), plus
   a one-paragraph flow sketch (what navigates to/from this screen). Embed
   both directly under that screen's row in the template's new `## ASCII
   wireframe + flow` section. This is the sign-off artifact: the user
   confirms the sketch before hi-fi starts; it is also the layout-intent input
   `design-screen`/`figma-create` read via the screen brief's `Reference
   image` section (a screen brief that cites the PRD's sketch, or embeds it
   directly, satisfies that section — no separate Figma wireframe needed)."
   In `templates/product/prd.md`, add the `## ASCII wireframe + flow` section
   (one subsection per screen in the feature→screen matrix) with a short
   worked example (a 3-region screen as a labeled ASCII box diagram + one
   flow sentence) so authors have a concrete shape to copy, matching the
   template's existing "filled example" convention (see
   `templates/design/screen-brief.md`'s "Filled example" section for the
   pattern to mirror).
   Verify: `Read templates/product/prd.md` renders the new section with valid
   markdown (no unclosed code fences around the ASCII art — wrap each in a
   fenced ```text block so ASCII box-drawing/indentation survives rendering).
   `testable: false`, `requiresLaunch: false`.

3. **Edit the remaining skills/agents list** (`agents/product.md`,
   `skills/grill-me/SKILL.md`, `agents/designer.md`,
   `skills/design-screen/SKILL.md`, `skills/figma-create/SKILL.md`,
   `skills/resolve-comments/SKILL.md`, `skills/setup-design/SKILL.md`,
   `skills/setup-design/templates-reference.md`, `skills/figma-audit/SKILL.md`,
   `skills/orchestrate/SKILL.md`) per the "Files to change" section above, one
   file at a time.
   Verify per file: `grep -n "figma-wireframe\|wireframe-verifier" <file>`
   returns nothing (aside from the deliberately-kept legacy-compat mentions in
   `figma-audit/SKILL.md`'s updated comment and `resolve-comments`'s
   `unmatched`-fallback sentence, both of which say "legacy"/"retired"
   explicitly rather than routing to a live skill).
   `testable: false`, `requiresLaunch: false`.

4. **Edit `skills/resolve-comments/scripts/resolve-context.js`** — delete the
   `wireframe` branch in `classifySurface` (lines 27-33), update the header
   comment's "Three-way routing" reference to "Two-way routing".
   Verify: `grep -n "wireframe" skills/resolve-comments/scripts/resolve-context.js`
   returns nothing; the function's remaining branches (`screen`, `master`,
   `file-note`, `unmatched`) still type-check as plain JS (no test harness
   exists for this file per its own header — "runs INSIDE the Figma sandbox" —
   so verification is a manual read, consistent with the skill's documented
   "Manual dry-run only" verification posture).
   `testable: false`, `requiresLaunch: false`.

5. **Edit the templates** (`templates/design/screen-brief.md`,
   `templates/design/config.example.json`, `templates/design/file-structure.md`)
   per "Files to change" above.
   Verify: `grep -n "wireframe\|Wireframe" templates/design/*.md
   templates/design/config.example.json` returns nothing.
   `testable: false`, `requiresLaunch: false`.

6. **Rewrite `README.md`'s pipeline diagram, enforcement table, loop
   walkthrough, and re-entry-altitude section**, plus the "What ships active"
   agent/skill counts. Recount the agents directory (`ls agents/ | wc -l`,
   now eleven after deleting `wireframe-verifier.md`) and the skills directory
   (`ls skills/ | wc -l`, one fewer after deleting `figma-wireframe/`) and use
   the real counts in the prose, not a guessed number.
   Verify: `grep -n "wireframe\|Wireframe\|FREEZE\|region-contract" README.md`
   returns nothing; the counts stated in "What ships active" match
   `ls agents/*.md | wc -l` and `ls -d skills/*/ | wc -l` exactly.
   `testable: false`, `requiresLaunch: false`.

7. **Rewrite `PIPELINE.md`** — delete "Seam 1 — the FREEZE" section, collapse
   the stage table's wireframe/freeze rows, fix the re-entry table and its
   mermaid diagram, delete the `wireframe-verifier` bullet from the verifier
   list. Read the full file first (it wasn't fully read during planning past
   line 140 — confirm no further wireframe references exist past that point
   before finalizing the rewrite).
   Verify: `grep -n "wireframe\|Wireframe\|FREEZE\|region-contract" PIPELINE.md`
   returns nothing.
   `testable: false`, `requiresLaunch: false`.

8. **Bump `.claude-plugin/plugin.json`** — `version` → `0.54.0`, rewrite
   `description` per "Files to change" above.
   Verify: `cat .claude-plugin/plugin.json | node -e
   "JSON.parse(require('fs').readFileSync(0,'utf8'))"` parses cleanly (valid
   JSON); `grep -n "figma-wireframe" .claude-plugin/plugin.json` returns
   nothing.
   `testable: false`, `requiresLaunch: false`.

9. **Full-repo verification sweep.**
   `grep -rin "wireframe" --include="*.md" --include="*.json" --include="*.js"
   --include="*.ts" . | grep -v "^\./.claude/plans/"` — every remaining hit
   must be one of the deliberately-kept legacy/backward-compat mentions
   enumerated in this plan's "Decisions" section (kit-side page-classification
   comments/tests, the `resolve-comments` unmatched-fallback sentence, the
   `figma-audit` legacy-tag comment) — no hit should reference a skill, agent,
   template section, or pipeline stage that this plan deleted. Then run the
   kit test suite to confirm no code path broke (it shouldn't have — no kit
   source changed per Decision 1): `cd packages/kit && bun test`.
   Verify: the grep output is fully accounted for against this plan's kept-list;
   `bun test` exits 0 with the same pass count as before this change (the
   `isWireframePageName`/wireframe-write-exemption tests in
   `tier0-rules.test.ts`/`design-guard-record.test.ts` still pass unchanged,
   since their production code is untouched).
   `testable: false`, `requiresLaunch: false`.

## Seam / checkpoint

Single natural seam: **after step 4** (all skill/agent/script prose and the
resolve-comments routing collapse are done, before the doc rewrites in steps
6-7). A checkpoint review here catches any missed prose reference before the
larger README/PIPELINE rewrites build on top of a wrong assumption about what
was kept vs. deleted. No `requiresLaunch: true` step exists in this plan (pure
prose/config, nothing launchable to verify against a running app).

## Risks & assumptions

- **Risk:** `PIPELINE.md` was not read past line 140 during planning (deep
  research budget). Step 7 explicitly re-reads the full file before rewriting
  — if it contains a "Seam 2" or further wireframe references not captured
  here, step 7's own verify grep will catch it before the plan is considered
  done.
- **Assumption (Decision 1):** kit-side wireframe-page-classification code
  stays as backward-compatible legacy plumbing. If the user instead wants it
  ripped out entirely (breaking any project with pre-existing `W##` Figma
  pages), that is a reversal of this plan's Decision 1, would touch
  `packages/kit/src/design-kit/{registry-reconcile,tier0-audit,tier0-rules}.ts`
  and their tests, and would require a kit **minor** version bump — flagged
  here as the one point where the plan's scope could grow if that assumption
  is rejected.
- **Assumption (Decision 2):** `resolve-comments` treats legacy `W##` pins as
  `unmatched` (→ a `❓` reply) rather than silently ignoring them. This keeps
  the triage-completeness close-out contract intact (every open thread ends
  with a reply) without resurrecting the deleted skill.
- **No behavioral/runtime surface changes.** This plan touches zero
  `packages/kit/src` logic and zero hook code — it is prose (skills, agent
  system prompts, templates, docs) plus a version/description bump. The
  verification bar is grep-completeness + a passing existing kit test suite,
  not new tests.

## Verification (recap)

- `git status --porcelain` after step 1 shows only the three intended deletions.
- Per-file `grep -n "figma-wireframe\|wireframe-verifier"` clean (steps 3-5).
- Repo-wide `grep -rin wireframe` (excluding `.claude/plans/`) fully accounted
  for against the kept-list (step 9).
- `.claude-plugin/plugin.json` parses as valid JSON with `version: "0.54.0"`
  and no `figma-wireframe` mention (step 8).
- `cd packages/kit && bun test` exits 0, same pass count as pre-change (step 9)
  — confirms Decision 1 held (no kit source touched) and nothing broke.
