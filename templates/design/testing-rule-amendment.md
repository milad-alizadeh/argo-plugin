## Scoped exception — generated spec-diff fixtures (design pack)

The "no pixel-geometry assertions" rule above (see "Cosmetic changes are
looked at, not unit-tested") does **not** apply to the design pack's tier-1/1b
spec-diff walkers under `{{SPEC_DIFF_WALKER_DIR}}` and `{{VRT_WALKER_DIR}}`.

Those fixtures assert `getComputedStyle`/`getBoundingClientRect` values
against `design/specs/*.json`, which is **regenerated from the Figma design
source of truth** by `/argo:figma-sync` — never hand-written. The
break-on-next-restyle objection above assumes a human authored the geometry
assertion against today's styles; here the assertion tracks whatever Figma
says the geometry should be, so a legitimate restyle in Figma regenerates the
fixture instead of breaking it.

This exception is scoped strictly to files under those two directories,
identified by their generated-fixture naming convention
(`{{SPEC_DIFF_WALKER_DIR}}/**/*.spec-diff.{{EXT}}`,
`{{VRT_WALKER_DIR}}/**/*.vrt.{{EXT}}`). A hand-written geometry assertion
anywhere else in the codebase stays forbidden — this amendment does not
loosen the rule generally, only for fixtures that regenerate from Figma.
