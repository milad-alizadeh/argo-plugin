---
name: figma-wireframe
description: Author lo-fi wireframes in Figma, layout and information design only, grayscale, no brand styling or design-system token bindings, so every project's wireframes come out the same shape. Use when the user asks to wireframe, sketch a layout, do a layout study, or lay out lo-fi/greybox screens before hi-fi design.
---

# figma-wireframe

Authors lo-fi wireframes to a fixed shape so they read the same across every
project, and stay obviously separate from hi-fi design work. Builds on
`figma:figma-use` for node creation.

## The screen brief is the spec — read it first

A wireframe is a lo-fi **layout expression of a screen's brief**, never the
spec itself. Before wireframing any screen, read its brief (host repo, e.g.
`apps/desktop/design/briefs/<screen>.md`, format in
`templates/design/screen-brief.md`):

- Lay out exactly the regions the brief's **Regions → component map** lists,
  in that order — a `composite` region is one greybox block labelled with the
  component's name (`RailSessionCard`), a `layout` region is its container.
  Wireframe the region NAMES from the brief, so the decomposition survives into
  hi-fi instead of being re-inferred from anonymous boxes.
- Realize the brief's **Flow / IA**: which screen this flows to/from, what each
  affordance triggers. The brief pins the flow; the wireframe shows it.
- **Realize the brief's Stage arrangement — do NOT default to a flat vertical
  stack.** If the brief specifies a spatial backbone (master/detail, split,
  canvas-dominant, dashboard grid), lay the regions out that way: a master column
  beside a wide detail pane, a docked terminal, an addable side panel — not every
  region stacked top-to-bottom in one column. A single flat column is the failure
  mode where every screen collapses to an identical sidebar + stacked main; it is
  only correct when the brief's arrangement genuinely IS a single surface (plain
  chat, a document reader). If the brief has more than one content region and no
  Stage-arrangement section, STOP and add it to the brief first (same rule as
  "no brief, no wireframe").

**Ground in the PRD, don't just echo the brief (the circularity fix).** The
brief is a *projection* of the feature's PRD onto this screen. Before laying out,
read the PRD (`.claude/prds/<feature>.md`) and cross-check its `Visible in
build?` requirements for this screen (via the feature→screen matrix). If a PRD
requirement — a state (empty/loading/error), a cardinality (3 projects), an
affordance — is NOT expressed by a region the brief lists, the wireframe must
add that region (and flag the brief gap), NOT quietly narrow to the brief. This
is what keeps the wireframe an **independent, product-grounded completeness
source** rather than a 1:1 brief echo: downstream, `build-design` freezes this
wireframe into the structural region-contract, and a contract that merely mirrors
the brief makes the completeness gate circular theater. The wireframe is allowed
to be richer than the brief; it must never be poorer than the PRD.

**No brief, no wireframe.** If a screen has no brief, stop and author the brief
first (or record an explicit decision to skip it for a trivial variation of an
already-briefed screen). A wireframe drawn without a brief is exactly the
failure this guards against: a layout with no product intent, which hi-fi then
traces.

## Use the project's wireframe kit (rough, not hand-drawn hi-fi)

Read `design/config.json` → `figma.wireframeKitFileKey` FIRST. If set, that is a
lo-fi wireframe component library; **build regions by placing INSTANCES of its
components**, not by hand-drawing frames. This is deliberate and it fixes two
observed failures:

- **Stops wireframes drifting hi-fi.** A hand-drawn greybox tends to creep toward
  a polished greyscale mock that hi-fi then traces 1:1. A rough-kit instance stays
  visibly a wireframe — it reads as "not final," so nothing traces it.
- **Kills the downstream inconsistency passes.** When every card/row/panel is an
  instance of ONE kit component (variations = variant props), variants can't drift
  into N hand-edited boxes that someone reconciles later. It also makes the
  region decomposition survive into `build-design`'s region-contract cleanly
  (named instance boundaries flatten to first-class regions).

Rules for kit use:
- Instance the kit's rough primitives; set text/labels to the brief's region
  names. Do NOT restyle instances toward brand colors or bind Semantic tokens —
  they stay lo-fi kit-native.
- **ONE typeface everywhere — the kit's.** EVERY text node uses the wireframe
  kit's typography (its rough/handwritten text styles), with no exception:
  panel headings, breadcrumbs, captions, annotations, labels, code/terminal
  content — all of it. NEVER a default Figma font, a system sans, or a hi-fi
  type style. Mixed fonts (kit handwritten in the cards + a default greyscale
  sans in the panel captions) is the #1 tell that a wireframe has half-drifted
  to hi-fi — it reads "fucking strange." If you create a new frame/label
  (a StageHeader, a PanelHeader, a new annotation), it MUST take a kit text
  style, not Figma's default. Likewise every CONTAINER is a kit component or a
  kit-native frame on the lo-fi palette — never an ad-hoc rectangle styled
  toward hi-fi. Same font, same container vocabulary, every frame, every page.
- A repeated element (a list of cards) is N instances of ONE kit component with a
  `state`/`variant` prop, never N detached copies.
- **Never collapse a content region to a blank image/skeleton placeholder.** A
  content pane the brief specifies internal structure for (a terminal, diff
  viewer, document view, canvas panel, table) must be laid out with THAT
  structure — its rows, headers, sub-regions, affordances — using kit
  primitives, exactly like a list-shaped region. The kit's `Image`/`Skeleton`
  box (the empty X-crossed placeholder) is ONLY for a genuinely opaque
  media/thumbnail slot, never a stand-in for a content region that has a
  specified layout. A wireframe exists to express information design; an X-box
  conveys none, and hi-fi then traces a blank. A freeform/canvas-shaped pane is
  NOT an excuse to skip this — decompose it into its brief-named sub-regions the
  same way a row-shaped one decomposes into rows.
- The kit is a wireframe library, NOT the design system. The brief's
  region→component map is the bridge from a `wf-card` instance to the real
  `SessionCard` at hi-fi time.
- **No kit configured** → fall back to hand-drawn greyboxes on the fixed lo-fi
  palette below. Keep them deliberately rough (boxes + labels), never polished.

Componentize on convergence, not during exploration: a first throwaway pass
exploring a flow can be loose; the moment a screen's structure settles or an
element repeats, express it as kit instances.

## What a wireframe is (and isn't)

Wireframes are **layout and information design only**: what's on the screen,
where it sits, what state it's in, how it flows to the next screen. They are
never brand design:

- Grayscale only, no brand colors, no design-system token bindings. Wireframe
  pages are exempt from the tier-0 hard gate (`figma-audit`) for exactly this
  reason: they are never synced to code, so unbound fills/strokes are
  expected, not a violation.
- Fixed lo-fi palette, the standard for every project:
  - Background: `#fafafa`
  - Panel: `#f4f4f4`
  - Card/surface: `#ffffff`, stroke `#d8d8d8` or `#cfcfcf`
  - Text: primary `#111111`, secondary `#555555`, tertiary `#999999`
  - Selected state: `#f0f0f0`
  - Pills/tags: `#ececec`

## Frame naming and layout

- Name every frame `WF / <area> · <focus>` (e.g. `WF / Shell · stage + rail`,
  `WF / Onboarding · step 2`).
- Default to 1440x900 for desktop surfaces.
- One concern per frame. A variation on a frame (empty state, error state, a
  different data density) is a **separate frame**, never a stacked/hidden
  state layered inside the same frame.
- Pages follow `templates/design/file-structure.md`: one `W<NN> <group>`
  page per surface group, frames laid out horizontally with 200-240px
  gutters between them. When a page grows past roughly seven frames, split
  the group into a new `W<NN>` page rather than keep piling on.
- **All wireframe components live on ONE dedicated components page**, never
  scattered next to the frames that instance them. Keep a single `W00
  Components` (or `WF · Components`) page holding every local master component
  the wireframes use (panel headers, cards, spine rows, terminal, diff viewer,
  stage header, etc.), laid out together so the whole lo-fi vocabulary is
  visible in one place. Frames on the `W<NN>` pages carry only INSTANCES of
  these masters. This is what makes the component set auditable at a glance and
  keeps edits propagating from one obvious source — a master placed loose on a
  frame page is a defect.

## Vocabulary discipline

The `Cover` page's design-language legend defines the canonical state names
and marker semantics for the project (see `file-structure.md`). Wireframes
use that vocabulary verbatim: the same word for the same state everywhere,
one visual language per concept. Never invent a synonym or a new marker
convention inside a wireframe page; if the legend doesn't cover a concept
yet, add it to the legend first.

## Variations are first-class (explore in parallel, then converge)

Cheap parallel variation is the POINT of lo-fi wireframing — a kit-instance
variant costs almost nothing, so exploring 2-4 alternative layouts of one screen
side by side is a primary use, not an exception. Distinguish two things the
"delete superseded frames" rule below otherwise conflates:

- **Exploratory variants** — intentional, live alternatives of ONE concern, kept
  side by side to compare. Name them explicitly: `WF / <area> · <focus> — variant
  A｜B｜C` (or a one-word thesis each, e.g. `… — master-detail` vs `… — stacked`).
  Lay them out adjacent on the same `W<NN>` page with the standard gutter. KEEP
  them until the user picks — do NOT auto-delete a variant just because another
  exists; that is the whole comparison.
- **Superseded frames** — a dead earlier attempt at the SAME variant, replaced by
  a newer take. Delete these (the iteration rule below).

**Converge on decision.** Once the user chooses a variant, delete the losers and
keep the winner as the single current frame for that concern. Converging is what
deletes variants — not the act of making a second one. Downstream (`build-design`
P1) freezes the CHOSEN frame into the region-contract, so only one variant per
screen survives into hi-fi; variations live and die at the lo-fi stage, which is
exactly where exploration is cheap.

## Iteration rule

Iterate **one thing at a time** with the user. When a frame is superseded by a
newer take on the SAME variant, **delete the old one** rather than keep it as a
stale duplicate: dead frames lie about what's current and rot a page fast. This
is about killing dead iterations, NOT about killing live exploratory variants
(above) — a labeled A｜B｜C set held for comparison is not "stale," it is the work.

## Auto Layout still applies

Wireframes are cheap to keep structurally sound: use Auto Layout on every
frame-like container, same as hi-fi work. What does **not** apply is
variable binding, colors and type stay as hand-set grayscale hex values from
the fixed palette above, never bound to the Semantic collection.

## Procedure

1. **Read the screen brief** (`design/briefs/<screen>.md`) — no brief, stop and
   author it first. The brief's region map and flow are what you lay out.
2. Confirm the surface group and its `W<NN>` page per `file-structure.md`
   (create the page if it doesn't exist yet).
3. Build each concern as its own `WF / <area> · <focus>` frame, grayscale
   only, Auto Layout, using the legend's vocabulary for any labeled state.
   Label each region with its brief name; keep a `composite` region as one
   named block, not a pre-decomposed pile of atoms.
4. Lay frames out horizontally with 200-240px gutters; split to a new
   `W<NN>` page once a page passes roughly seven frames.
5. When iterating, change one thing, delete superseded frames, never keep
   both.

## Verification

Manual dry-run only, no Figma file lives in this repo to create anything
in. Real verification is a live project actually wireframing a surface with
this skill loaded.
