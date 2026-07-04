# Tailwind token-writer (D19)

Regenerates the generated `@theme` region in this project's
`{{TOKEN_FILE_PATH}}` (from `design/config.json`) from the freshly dumped
`design/tokens.json` — this is the ONE writer for that region; never
hand-edit it.

## Procedure

1. Read `design/tokens.json`'s collections, modes, and values (freshly
   dumped by `figma-sync`).
2. Regenerate the generated `@theme { … }` region in `{{TOKEN_FILE_PATH}}` —
   map each Figma variable to its Tailwind CSS custom-property form (D20's
   Figma→CSS conversion table via `figma-design-kit`'s `conversion-table.js`),
   scoped to the marked generated region only; hand-authored CSS outside
   that region is untouched.
3. Leave light/dark mode values as separate custom-property sets (the
   Semantic collection's mode split, D10/D11) — never collapse them into a
   single value at generation time.

A future non-Tailwind code-target (e.g. a Tamagui or MUI theme file) ships a
sibling `token-writer.md` under its own `code-target/` directory — this
recipe's `figma-sync`-facing contract (§9 of the mechanism/recipe plan)
delegates to whichever doc the installed recipe provides, so `figma-sync`'s
own flow text never needs to change to support that.
