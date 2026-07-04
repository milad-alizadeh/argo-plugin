---
paths:
  - "{{COMPONENTS_GLOB}}"
---

# Design-pack static lint (tier 4)

This project's own design-system rule already forbids raw hex/rgb/hsl colors
and arbitrary `[…]` values everywhere — that rule stands unchanged. The
design pack adds exactly one more rule, scoped to components:

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

## Example ESLint config snippet

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
`/argo:setup-design` from `design/config.json`.
