---
paths:
  - "**/components/**/*.{ts,tsx,jsx}"
---

# UI Component Rules

Applies to all UI components under your components directory. Read together with
the `design-system` skill (tokens + utilities, no magic numbers).

## Atomic design — always (atoms → molecules → organisms)

Every piece of UI is classified into one of three tiers. This vocabulary is
mandatory: it is what stops rogue, one-off styling from creeping in. Before
writing markup, decide which tier the unit belongs to and build/reuse at that
tier — never hand-write a shape that belongs to a lower tier inline.

- **Atoms** — the smallest indivisible presentational units: a button, an input,
  a label, an icon, a badge, a dot, a divider, a spinner, a meter bar. Atoms live
  in your primitives directory (e.g. `components/ui/`, icons in a dedicated
  `icons/` folder). They take only presentational props, hold no domain logic,
  and never emit raw `<svg>`.
- **Molecules** — a small, reusable composition of atoms that forms one labelled
  unit: a setting row (label + control + help text), a status banner (icon +
  title + message), a card header, a labelled field, an empty-state block, a
  pill/chip, a divider-with-label. Molecules also live in the primitives directory
  when reused across two or more domains; otherwise as a subcomponent file under
  the parent domain folder.
- **Organisms** — a self-contained domain section composed of molecules and
  atoms: a card, a list/table, a settings panel, a detail view. Organisms live in
  their domain folder (e.g. `components/<Domain>/`), compose primitive molecules
  and atoms, and are where domain logic / state wiring is allowed.

Rules that fall out of this:

- **Never inline a lower-tier shape.** If you find yourself writing the markup
  for an atom or molecule inside an organism, stop — import the atom/molecule, or
  extract it if it doesn't exist yet. Raw markup for a shape that is (or should
  be) an atom/molecule is a duplication bug, even on first use.
- **Build bottom-up.** A new organism is assembled from existing atoms and
  molecules. If a needed atom/molecule is missing, create it in the primitives
  directory first, then compose. Do not bury new primitives inside an organism.
- **One tier per file** (consistent with the one-unit-per-file rule): an atom
  file exports one atom, a molecule file exports one molecule.

## Reuse before you build

The general duplication rules live in the `engineering-principles` skill; these
are their UI-specific consequences for visual shapes (a row, a card, a labelled
field, a button, a list, a section header, an icon):

- **Before writing any raw markup, search the primitives directory (and the parent
  domain folder) for a component that already renders it.** If one exists, import
  and use it — never re-implement its markup at a call site.
- **The moment the same shape would appear a second time, stop and extract it**
  into one component (a shared primitive if two or more domains would duplicate it,
  otherwise a subcomponent under the parent folder). Two copies is the trigger —
  do not wait for a third.
- **Do not introduce a bespoke element where a primitive component is the right
  tool** (sliders, selects, dialogs, radio groups, meters, dividers, section
  labels, icons). Raw buttons/inputs standing in for an existing primitive are
  forbidden.
- The only sanctioned new raw markup is a genuinely one-off, single-use layout
  that no existing component covers and that is not repeated anywhere — and even
  then it is built by composing primitives wherever possible.
- Re-export every primitive from a barrel (e.g. `ui/index.ts`) so imports are a
  single line.
- Primitive components are pure presentation — no state machines, no I/O calls, no
  hooks beyond local interaction state. Interactive primitives wrap your UI
  primitive library (e.g. Radix, MUI, Headless UI) and are styled only with
  design-system tokens; never import the library's default CSS.

## Icons — one icon component per file

**No inline SVGs anywhere in the codebase.** Every SVG icon is its own named
component in a dedicated icons directory, re-exported from its barrel. Each icon
file exports exactly one component, accepts optional `width`/`height`/`className`,
and defaults to its original usage size. Need a new icon? Add it to the icons
directory first — never inline it at the call site. Plain-text glyphs standing in
for icons (e.g. `✕`, `→`) are forbidden — use the icon atom.
