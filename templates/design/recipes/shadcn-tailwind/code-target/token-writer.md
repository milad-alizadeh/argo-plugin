# Tailwind token-writer (D19)

Regenerates the generated `@theme` region in this project's
`{{TOKEN_FILE_PATH}}` (from the app's `design.<app>` block in
`.claude/argo.json`) from the freshly dumped
`design/tokens.json`, this is the ONE writer for that region; never
hand-edit it.

## Procedure

1. Read `design/tokens.json`'s collections, modes, and values (freshly
   dumped by `figma-sync`).
2. Regenerate the generated `@theme { … }` region in `{{TOKEN_FILE_PATH}}` -
   map each Figma variable to its Tailwind CSS custom-property form (D20's
   Figma→CSS conversion table via `figma-design-kit`'s `conversion-table.js`),
   scoped to the marked generated region only; hand-authored CSS outside
   that region is untouched.
3. Leave each Semantic mode's values as a separate custom-property set,
   generated directly from the Semantic collection's Figma variable modes -
   never collapse them into a
   single value at generation time. When the Semantic collection has exactly
   one mode, emit plain `:root { … }` values (there is no second mode to
   split against). When it has 2+ modes, emit `:root { … }` for the default
   mode plus one `[data-theme="<mode>"] { … }` override block per additional
   mode.

A future non-Tailwind code-target (e.g. a Tamagui or MUI theme file) ships a
sibling `token-writer.md` under its own `code-target/` directory, this
recipe's `figma-sync`-facing contract (§9 of the mechanism/recipe plan)
delegates to whichever doc the installed recipe provides, so `figma-sync`'s
own flow text never needs to change to support that.
