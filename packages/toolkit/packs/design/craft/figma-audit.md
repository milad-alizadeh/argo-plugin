# figma-audit — what "hygiene-clean" means

The design-rules hygiene bar every authored component or composed screen is held to.
Knowing what it checks — and why — is what lets you author compliant the
first time instead of round-tripping through create → fix → re-check.

## What it checks

**Mechanism checks (every recipe):** unbound fills/strokes/radii/type,
missing Auto Layout, detached instances, non-semantic names, variant naming
(`Size`→`size`, Title-Case→lowercase), explicit line-height, node-scoped story
URLs, unbound Auto Layout gap/padding (every non-zero `itemSpacing`/padding
field must be bound to a spacing variable — unbound literals, on-scale or
not, are violations; a binding to a variable outside the approved spacing
collections is also a violation).

**Composite-naming (advisory, never hard).** In a composed screen, a plain
FRAME named after a registered composite rather than an INSTANCE of it is
under-decomposition — a traced screen, not one composed from built
components. This stays advisory: a traced-vs-instanced screen is a real
signal worth surfacing, but not (yet) something a mechanical name match
should hard-block on its own.

**Universal a11y/overflow checks (every audited node, no tags, no config).**
Three deterministic per-node rules run alongside the mechanism checks
uniformly: a HUG-sized node whose child's bounds escape it; a node with
prototype interactivity under the WCAG 2.5.8 touch-target minimum; and text
contrast against the nearest fully-opaque solid ancestor fill (4.5:1 normal /
3:1 for large text). The contrast check is deterministic-or-skip: an
unresolvable background, a semi-transparent fill, or any mixed value means
skip, never a guessed violation. Visual judgment beyond these three rules
belongs to a blind fidelity review, not a mechanical rule.

**Recipe-specific checks (e.g. shadcn-tailwind):** every color binding must
resolve to a LOCAL variable in the project's configured Semantic collection
(all variables live in the project's design file — the duplicated starter —
so a remote binding is itself a violation) or the recipe's declared
non-color token family (gap, padding, font, stroke-width, border-radius,
border-width, margin, space — deliberately split from Semantic instead of
folded into it). A different recipe supplies its own check set, or none at
all.

## Two modes, one philosophy

- **Named-component audit (hard gate).** When run against specific
  components (by another authoring skill, or a human), any violation on
  those nodes fails loud. This is the mode other work depends on — never
  soften it to advisory.
- **File-wide sweep (advisory), scoped to what's actually in use.** A
  standalone sweep with no component names walks every registered component
  plus every page matching the project's real composed-screen convention —
  never a literal every-page walk. A starter file's kit primitive pages,
  demo/example pages, and icon libraries are almost entirely stock content
  nobody in the project touched; auditing them is pure noise. Findings here
  inform, they don't block anything on their own.

## Read discipline

Never metadata-dump a whole page or heavy frame to run or triage this — that
is the documented #1 MCP failure mode (a whole-page dump has overflowed a
live session at ~102k chars). Resolve and read specific node ids; if you need
to inspect a node while triaging a finding, read the token-optimized context
for the exact node id first, falling back to the heavier structure map only
when that's too large, and always narrow a large subtree before reading —
never dump the parent.

## Cannot be tested outside Figma

The rule logic itself only executes inside Figma's Plugin API sandbox — its
first real proof is always a live run against an actual Figma file in a host
project. Don't invent a synthetic harness for it in a repo with no Figma file
to exercise it against.
