# Tailwind CSS pipeline parity (this recipe's `codeTarget: tailwind`)

`SKILL.md` §7b's alias-parity rule ("Storybook and every walker project are
SEPARATE Vite configs, mirror the host's config into all of them") applies
identically to the CSS build step, not just `resolve.alias`. This recipe's
`codeTarget` is Tailwind, so the concrete plugin/detection details live here
— a future non-Tailwind `codeTarget` (e.g. a Tamagui or MUI theme file) ships
its own sibling `css-pipeline.md` with its own tool's wiring, and `SKILL.md`
never needs to change to support it (same dispatch pattern as this
directory's `token-writer.md`).

## Detect

- **Tailwind v4** (this recipe assumes v4, per D19's `@theme` seeding): the
  host app's own bundler config (`electron.vite.config.ts` / `vite.config.ts`
  / `vite.config.js`) imports `@tailwindcss/vite` and calls `tailwindcss()` in
  its `plugins` array. Confirm the version in the host's lockfile — this
  recipe does not support Tailwind v3's PostCSS-plugin wiring
  (`tailwindcss()` in `postcss.config.js` + `@tailwind base/components/utilities`
  directives); if the host is still on v3, stop and flag the mismatch rather
  than guessing at a translation.
- Confirm the exact import/call shape against **current** Tailwind v4 Vite
  plugin docs before wiring anything below — don't invent it from training
  data. Vite plugin APIs and Storybook's own `viteFinal` shape both drift
  across majors; WebSearch both (Tailwind's Vite plugin guide, and the
  detected Storybook major's Vite-builder integration doc) the same way
  `SKILL.md` §2 requires for the shadcn CLI install command.

## Wire it into every separate Vite config

Every config below is its own Vite instance and inherits nothing from the
host app's `electron.vite.config.ts`/`vite.config.ts` — each needs the
identical `import tailwindcss from '@tailwindcss/vite'` +
`tailwindcss()` in its own `plugins` array:

1. **`.storybook/main.ts`** — inside the `viteFinal`/`mergeConfig` call
   `SKILL.md` §7b already has you adding the alias to; add `tailwindcss()` to
   that same `plugins` array, don't create a second `viteFinal`.
2. **The VRT walker's `vitest.vrt.config.js`** (`{{CSS_PLUGIN_IMPORT}}`/
   `{{CSS_PLUGIN_CALL}}` slots) — fill with
   `import tailwindcss from '@tailwindcss/vite'` / `tailwindcss()`.
3. **Any Vitest project that renders components directly rather than through
   `@storybook/addon-vitest`'s `storybookTest` plugin** — e.g. this recipe's
   spec-diff/base-congruence walker project, if it isn't composed through the
   Storybook config. A project wired via `storybookTest({ configDir:
   '.storybook' })` already inherits whatever `.storybook/main.ts` exports
   (Storybook's own Vite config is the thing that plugin builds on top of),
   so it does NOT need a second, separate `tailwindcss()` — adding one there
   is redundant, not wrong, but check which case applies before assuming
   every project needs its own copy.

## Why this matters (the failure mode)

Skipping any one of these is **silent** — no thrown error, no failing
assertion by default. The component mounts, every class is present in its
`className`, and the story test / spec-diff todo / VRT todo all PASS,
because none of them assert on computed style unless a spec/baseline exists
yet (Phase D pilot state). The component simply renders with zero CSS rules
beyond `:root`/`@theme` — `bg-primary`, `flex`, `rounded-lg`, and every other
Tailwind utility resolve to nothing.

Observed in a real host project: `.storybook/main.ts` had the `@renderer`
alias fix from a prior `setup-design` run but no `@tailwindcss/vite` plugin.
`bun run test` was fully green. Only `SKILL.md` §8 step 6's real
headless-browser screenshot + `getComputedStyle` check on the rendered
smoke component (background-color resolving to `rgba(0, 0, 0, 0)` instead of
a real color) surfaced it.
