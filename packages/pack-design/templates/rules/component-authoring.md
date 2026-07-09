# Component authoring rules

Concrete conventions every authored Figma component/screen must follow.
Mechanically-checkable items (bindings, auto layout, names, variant naming)
are also enforced by `design-rules-check`; this doc is the human-readable
statement of the full convention, including the parts that stay a matter of
authoring discipline.

- **Compose from base instances**; every fill/stroke/radius binds the
  project's Semantic collection — never a Primitive directly, never a
  literal value.
- **Typography is always a preset text style** — never raw `fontSize`/
  `lineHeight` bindings. Apply the style LAST (setting `fontName` after a
  text style clears the style link).
- **Auto Layout on every frame-like container.** Every non-zero gap/padding
  field is bound to a spacing variable — never an unbound literal, on-scale
  or not.
- **Code-friendly names on every structural frame/group** — kebab-case or
  camelCase, no spaces, no Figma auto-generated defaults (`Frame 12`), no
  vague filler (`box`/`container`/`wrapper`/`content`). A dynamic TEXT slot
  is named for its ROLE (`filename`), never its sample content
  (`src/auth/guard.ts`).
- **Variant naming:** component property `Size` → prop `size`; Title-Case
  variant values → lowercase literal unions.
- **Icons are instances of the design system's own icon components, used
  as-is.** Never draw, redraw, or edit an icon's internal geometry/stroke.
  Sizing an icon means scaling stroke weight proportionally
  (`strokeWeight = baseStroke * (size / nativeSize)`), never a bare
  width/height resize.
- **An icon inside a component you author is a slot** (an INSTANCE_SWAP
  component property), not a hard-placed glyph — unless it's explicitly a
  fixed decorative glyph, and the report says so.
- **Prefer an existing base component over a custom build** — a custom
  component is justified only by something the base set doesn't have.
- **Screens are composition, not generation** — a screen frame contains only
  component instances + layout containers, never loose rectangles/text with
  raw styles.
- **After combining variants into a set, re-assert HUG/AUTO sizing** on every
  variant and the set — combining can freeze a variant's pre-combine width
  and clip its text content.
- **Naming collisions resolve to reuse or extend**, never a second component
  under a different name.
