# PRD template

The **product intent** for one feature — the durable WHAT and WHY, authored at
the top of the loop (in the host repo, e.g. `.claude/prds/<feature>.md`) and
cited by the hi-fi design and the implementation plan. One PRD
per *feature* (a coherent unit of user value that may span several screens), not
per screen — each per-screen brief is a projection of this doc's feature→screen
matrix.

It carries what a design and a plan both assume but neither states: *what this
feature must do and why*, written as **checkable requirements** so a downstream
verifier can rule each one present or absent without seeing the author's
reasoning. Keep it tight — a spec, not an essay. It grows by splitting into a new
PRD when the feature outgrows one sentence of "Why now", not by padding.

Copy the sections below verbatim; fill them for the feature. Delete this header.

---

## Feature

**Status:** draft | ready | superseded
<!-- draft while Open product questions has unresolved items; ready once
resolved; superseded when a newer PRD replaces this one. -->

One sentence: the user, their problem, the outcome this feature delivers.

**Grouping note:** why this is one feature (and not two), and which jobs it
deliberately does NOT cover.

## Why now / the core bet

Two or three sentences: the user need and the bet this feature makes — what
becomes true for the user that isn't true today, and which assumption, if wrong,
sinks it.

**Options considered:** one line per rejected direction + why it lost (so a
deliberate scope cut isn't later misread as a missing requirement).

<!-- If this bet is unvalidated, say so — consider /argo:spike to test the
riskiest assumption before committing. -->

## Grounding — what already exists

Narrative: the existing capabilities/surfaces this feature builds on or changes,
each with a citation (`ARCHITECTURE.md`, a prior PRD, committed inventory/
reconciliation docs, graphify). Product altitude only — never Figma/code
component names (component-level reuse is hard-gated later in design-screen).

**Reuse ledger:**

| Existing capability / surface | Source (citation) | This feature reuses it as… |
| ----------------------------- | ----------------- | -------------------------- |
| …                             | …                 | composes / extends / n/a   |

**Net-new (justify each):** the product-altitude capabilities this feature adds
that don't exist today, one line of justification each.

<!-- This ledger is product-altitude grounding evidence, not the anti-recreation
enforcement mechanism — that hard gate lives in design-screen against the live
component inventory. -->

## Requirements

Each requirement is a capability the feature MUST deliver: a slug-prefixed stable
id, a one-line statement, an observable acceptance condition, and where it's
checked. **Enumerate every non-happy-path state (empty / loading / error /
permission / edge / zero-and-many) as its own requirement row** — states are the
completeness a downstream gate can't invent, and they belong in the contract
(this table), not in Scope.

| ID          | Requirement (must deliver…)          | Acceptance (proven when…)                                   | Visible in build? |
| ----------- | ------------------------------------ | ----------------------------------------------------------- | ----------------- |
| CONCIERGE-R1 | …                                   | …                                                           | yes / no / partial |
| CONCIERGE-R2 | Empty-state shown when list has 0    | renders <empty component> with CTA, not a blank container   | yes               |

- **Slug-prefix** the ids with the PRD's filename slug so they're citable across
  PRDs. No vague requirements ("feels responsive", "handle edge cases") — make it
  observable or drop it.
- **Prefer one verifiable condition per requirement.** If a requirement bundles
  independently-failable checks, split into `R3a` / `R3b` so a verifier can cite
  which failed.
- **Visible in build?** routes each requirement to the right adversarial checker
  (`no` = the reviewer's job, not the screenshot-only design-verifier) — a
  routing hint, not a claim the verifier ingests PRD text today (that wiring is
  design-screen P5).

## Feature → screen matrix

One disposition per requirement — this is checkable (every REQ-ID has exactly one
non-empty disposition; a dangling requirement is a defect):

| Requirement  | Disposition                                              |
| ------------ | -------------------------------------------------------- |
| CONCIERGE-R1 | covered-by: <screen/surface list>                        |
| CONCIERGE-R2 | deferred: <reason> · or · open: <question>               |

Single-surface shortcut: "Single surface: <screen> — R1, R2, R3 all realized
here" (still name every REQ-ID).

## Wireframe + flow

**Wireframe:** `design/wireframes/<feature>.html` — the lo-fi HTML wireframe
file committed next to this PRD, **co-created with the user (via Artifact
publish + live iteration) and signed off before hi-fi starts**. It is the
layout sign-off artifact: one section per screen in the matrix that carries
`Visible in build? = yes/partial` requirements, naming regions and their
spatial arrangement (rows / columns / panels) as grayscale labeled divs — no
color, no components, no styling, no pixel-perfect values. The screen brief's
`Reference image` section cites it. The file is the contract; any artifact URL
is a view.

### <screen name>

**Flow:** one paragraph — what navigates to this screen, what each region's
primary action leads to, and where the user exits.

## Component Bindings (optional)

When the author already knows which existing design-system component realizes a
region or repeated pattern, bind it here so the designer doesn't hand-assemble a
duplicate from primitives. Omit the section entirely when unknown — the designer
runs its own registry lookup instead (this section is a hint layer, never a
requirement).

| Region / pattern           | Component                    | Note                     |
| -------------------------- | ---------------------------- | ------------------------ |
| session list row           | `SessionCard`                | do not hand-assemble     |
| header actions             | `Toolbar`                    |                          |

The designer verifies each entry ONCE before use (component exists, right type,
fits the brief); a failed entry falls back to its own lookup + stop-and-ask.

## Copy deck (wave-scoped)

The single upstream source for every authored string the feature's screens will
render — copy is a named dominant defect class, and confident filler looks
legitimate by render time, so the fix is upstream, not detection. **Wave-scoped,
not screen-scoped**: the same entity is named identically across every screen in
the wave.

**Shared terms** — authored ONCE, referenced by key. Any string used in more
than one region/screen lives here and is cited by key, never retyped:

| Key        | Canonical string |
| ---------- | ---------------- |
| `workflow` | Workflow         |

**Strings** — one row per rendered field:

| Region      | Field key | String (or `→ shared: <key>`) |
| ----------- | --------- | ----------------------------- |
| header      | title     | Workflow detail               |
| header      | entity    | → shared: workflow            |
| empty-state | cta       | Start a workflow              |

Rules the design stage enforces against this deck:

- The designer sources ALL authored canvas text from this deck (it emits the
  machine artifact `design/<wave>/copy-deck.json` from this section alongside
  the binding manifest); a string with **no deck entry → the designer STOPS AND
  ASKS** (extends the existing missing → ASK convention), never invents filler.
- Data slots (live values: counts, timestamps, filenames) are not deck entries —
  only authored copy is.
- The design-rules `untraced-copy` rule (hard on named audits) checks every TEXT
  node's content against this deck plus each component's documented
  `defaultStrings` in `design/registry.json`.
- **Provenance:** this deck is authored from the PRD/brief ONLY, before any
  canvas read. The designer **never adds deck entries to make existing canvas
  text pass** — text found on a cloned shell that is not in the deck is a
  defect to fix (retitle to deck copy), never an entry to add.

## Scope

- **In (this version):** the requirements above, bounded.
- **Out (deferred):** each with a one-line reason.

## Open product questions

Load-bearing product decisions still unresolved (answer A vs B changes *what*
gets built). Gates `Status: ready` — resolve with the user before the
design/plan stages consume this. Do not park them for a downstream stage to
silently assume.

## Handoff

- **Design branch:** hi-fi design (`design-screen` / `figma-create`) —
  consuming this doc's HTML wireframe + flow directly; the screen briefs
  project this doc's matrix columns. The design-verifier is intended to check
  these requirements as the semantic completeness contract — this depends on
  design-screen P5 ingesting the REQ-ID column (tracked in
  `build-design-workflow.md`); until then the reviewer carries it.
- **Code branch:** `argo:planner` → `build-plan`, citing these requirements.
