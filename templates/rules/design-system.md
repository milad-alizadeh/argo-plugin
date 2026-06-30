---
paths:
  - "**/*.{css,scss,tsx,jsx}"
---

# Design System

Style every UI through **design tokens** surfaced as **classes/utilities**, never
as raw values or inline style objects. Two hard rules, no exceptions outside the
documented escape hatches below. They hold whatever your stack is — the examples
here happen to use Tailwind, but the discipline is framework-agnostic.

## Rule 1 — Tokens only, never magic numbers

Every visual constant lives in **one token source of truth** (e.g.
`<your-styles>/tokens.css`, a theme file, or a tokens module): colors, font
weights, line-heights, letter-spacing, radii, component sizes, durations,
opacity, z-index.

- **Never** hardcode a hex/rgb/hsl color, a px/rem/em size, a duration, or an
  opacity anywhere — not in a class, not in a style, not in code.
- Need a value that doesn't exist yet? **Add a token** to the source of truth
  first, then use it. Don't inline the raw value.
- _Example (Tailwind v4):_ tokens in `@theme {}` become both `:root` custom
  properties and utility classes; other setups expose them via `var()` or a theme
  object. Mechanism varies — the rule doesn't.

## Rule 2 — Classes/utilities, never inline styles

Style with your framework's class system (`className`, CSS modules, utilities).
**Do not** use static `style={{ ... }}` objects. Reference tokens through classes
(`bg-bg`, `text-text-muted`, `rounded-lg`, `p-3`, `h-[var(--size-control)]`, …);
token names are whatever your project defines. Dynamic per-state styling → **swap
classes**, don't compute inline styles:

```tsx
const tone = active ? 'bg-accent text-text-on-accent' : 'bg-bg-input text-text-faint'
return <button className={`px-4 py-2.5 rounded-lg ${tone}`}>Send</button>
```

## Escape hatches (the ONLY allowed inline styles)

Use an inline style **only** for a value the class system genuinely cannot
express, and add a comment saying why. Sanctioned cases:

1. **Truly dynamic runtime values** — e.g. `style={{ height: \`${height}px\` }}`,
   where the number comes from runtime, not a token.
2. **Platform-only CSS with no utility** — e.g. Electron's
   `WebkitAppRegion: 'drag'`. Keep it inline with a comment.

Everything else is a bug — convert it to classes + tokens.

## Non-token surfaces

Surfaces outside your utility system (a sandboxed iframe with its own document, a
canvas/WebGL renderer) reference tokens via `var(--token, fallback)` — the literal
after the comma is the only literal allowed. For non-CSS engines, pull token
values via `getComputedStyle` and keep engine tuning constants as named `const`s
at the top of the file — never bare magic numbers inline.

## Checklist before you finish styling work

- [ ] No hex/rgb/px/rem/ms literals (except token defs and sanctioned fallbacks).
- [ ] No inline `style={{}}` except the two escape hatches above, each commented.
- [ ] Any new visual value added to the token source of truth first.
- [ ] Your build/typecheck succeeds.
