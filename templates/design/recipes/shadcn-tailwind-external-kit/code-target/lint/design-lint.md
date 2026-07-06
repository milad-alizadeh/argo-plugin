---
paths:
  - "{{COMPONENTS_GLOB}}"
---

# Design-pack static lint (tier 4)

This project's own design-system rule already forbids raw hex/rgb/hsl colors
everywhere — that rule stands unchanged (mechanism-level, D10's "no raw hex"
example). The design pack adds two more rules, scoped to components and
specific to this recipe's Tailwind code-target:

## No direct Primitive-variable references in components

Components may only bind the **Semantic** collection, never the
**Primitives** collection directly (D10, §8's library-source distinction).
Primitives are an internal implementation detail of the Semantic layer; a
component that reaches past Semantic and binds a Primitive directly breaks
the theming boundary — a Primitive has no light/dark pairing of its own, so
the reference silently stops responding to theme changes.

- **Never** reference a `--primitive-*` (or your project's Primitive-prefix
  convention) custom property, class, or token name from component source.
- Always go through the Semantic name (`--semantic-*` / `bg-bg` / etc.) —
  even where the Semantic value currently aliases the exact Primitive you
  wanted. If the Semantic layer doesn't expose it yet, add the Semantic
  token first (in Figma, then synced), don't reach around it.
- Base/kit components are exempt — they legitimately bind kit variables
  directly (the tier-0 audit's library-source distinction, §8).

### Example ESLint config snippet

```js
// eslint.config.js — add alongside this project's existing no-raw-hex rule
{
  files: ['{{COMPONENTS_GLOB}}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: `Literal[value=/${'{{PRIMITIVE_TOKEN_PREFIX}}'}/]`,
        message: 'Components must bind the Semantic collection, never a Primitive directly (D10).'
      }
    ]
  }
}
```

Adjust `{{PRIMITIVE_TOKEN_PREFIX}}` to this project's actual Primitive
naming convention (e.g. `--primitive-`, `primitive-`) — filled by
`/argo:setup-design` from the app's `design.<app>` block in `.claude/argo.json`.

## No arbitrary `[…]` Tailwind values in components

Arbitrary-value syntax (`className="w-[13px]"`, `bg-[#3366ff]`) bypasses the
token system exactly the way a raw hex literal would — but the syntax itself
is Tailwind-specific, so it can't live in the host's generic design-system
rule and belongs to this code-target instead (D23's own canonical example of
a target-owned rule).

- **Never** use a Tailwind arbitrary-value bracket (`[…]`) inside
  `className`/`class` string literals in component source — every spacing,
  color, radius, or typography value must resolve through a Tailwind
  theme token (which in turn traces to a Semantic variable).
- A missing token is a signal to add the Semantic/Tailwind-theme mapping,
  not to reach for an arbitrary value as a shortcut.

### Example ESLint config snippet

```js
// eslint.config.js — add alongside the Primitive-reference rule above
{
  files: ['{{COMPONENTS_GLOB}}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Literal[value=/\\[[^\\]]+\\]/]',
        message: 'No arbitrary […] Tailwind values in components — resolve through a theme token instead.'
      }
    ]
  }
}
```
