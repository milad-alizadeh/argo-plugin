---
name: design-upgrade
description: The paired shadcn + Figma kit upgrade (D15) - manual shadcn merge, kit re-import + Library Swap, post-swap audit, congruence re-gate, waiver invalidation by sourceVersion, kit.lock update. Use when the user asks to upgrade shadcn/the design kit, or when a new upstream shadcn/kit release needs adopting.
---

# design-upgrade

**Applies only to projects whose design source is an external kit library**
(the `recipe`-selected `baseSource == "external-library"`, per the app's
`design.<app>` block in `.claude/argo.json`).
Read the design block's `recipe` field first: if the installed recipe's
`baseSource` is not `external-library`, **stop** and state the alternative
explicitly (D23):

- **`same-file`:** this is just a normal shadcn upgrade (`shadcn diff` +
  manual merge) plus editing the local Figma components directly — there is
  no separate kit file, no Library Swap, and no retired-file-key check to
  run.
- **`none`:** no design kit exists to upgrade under this recipe — this
  skill doesn't apply.

The paired upgrade D15 specifies: shadcn's code side and the Figma kit's
design side move together, verified at every step — never a silent
either-side-only bump.

## Procedure (strict order — D15)

1. **Manual shadcn merge.** Treat `shadcn diff` as **advisory only**
   (upstream issue #5427 — it cannot safely auto-apply). Review the diff,
   merge by hand into the vendored source under `ui/` (or wherever this
   project's shadcn init put it).
2. **Kit re-import + Library Swap.** Re-import the updated community kit
   file as a new library copy; in the project file, run Figma's Library
   Swap, **name-matched** against the retiring copy. The old copy stays
   alive-but-unpublished (never delete it here) so stragglers stay
   enumerable in step 3.
3. **Immediate post-swap tier-0 audit — fail on any retired-file-key
   binding.** Run `figma-audit` (hard gate) across the project file. A
   swap-by-name can silently "Frankenstein" the project file if a binding
   didn't actually retarget; the tier-0 audit is the ONLY check that looks
   at the *project file* post-swap (the congruence gate in step 5 only
   compares kit↔code, and would never see this). Any binding still
   resolving to the retired kit file key fails loud — fix before continuing.
4. **Diff variable names pre-swap.** Compare the old kit copy's variable
   names against the new kit copy's — Library Swap only works because names
   matched; record any renames the swap silently rode past, since those
   need dependent bindings checked by hand.
5. **Re-run the congruence gate (tier 1b).** Use the recipe's
   `design-source/base-congruence.walker.spec-diff.js`
   (already installed) against the newly re-imported kit specs. Any drift
   here that isn't a sanctioned kit patch (`design/kit-patches.json`) is
   either fixed in the vendored merge (step 1) or... continue to step 6.
6. **Waiver invalidation by `sourceVersion`.** Call
   `figma-design-kit`'s `invalidateWaivers(waivers, newSourceVersion)` —
   any waiver whose `sourceVersion` no longer matches is dropped. A
   dropped waiver that still fails the congruence gate needs either a new,
   freshly-pinned waiver (re-observe the actual current pair) or a real
   fix — never silently re-add the old waiver under the new version.
7. **Update `kit.lock`.** New kit version, import date, library file key,
   and fresh freshness metadata (file version/lastModified/sync timestamp,
   D4), validated against `figma-design-kit`'s `recipes/external-kit`-subpath
   `KitLockSchema`.
8. **Recapture `design/kit-inventory.json`.** This skill is the SOLE writer
   of the kit-awareness browse catalog (kit-awareness.md) — the roster is a
   pure function of `kitLibraryFileKey` + kit version, and this is the only
   event that changes either. Whole-file rewrite via
   `argo design capture-kit-inventory` (wraps `buildKitInventory`), re-stamping
   `kitSourceVersion`/`capturedAt`. Preserve and extend the existing
   `aliases[]` map rather than dropping it (aliases are curated, not
   auto-derivable from the kit itself).

## Why this order matters

Skipping straight from step 2 to step 5 misses exactly the failure D15 calls
out: the congruence gate only ever compares kit specs against rendered code
— it has no view into the *project file*, so a broken Library Swap (bindings
that silently didn't retarget) sails through it undetected. Step 3's
post-swap tier-0 audit is the only check positioned to catch that.

## Verification

Manual dry-run only — no live kit/project file pair exists in this repo to
upgrade. Real verification is the first live paired upgrade in a host
project running argo-v2's Phase B/C/D pipeline.
