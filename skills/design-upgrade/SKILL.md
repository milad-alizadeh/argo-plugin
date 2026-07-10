---
name: design-upgrade
description: The paired shadcn + starter-file refresh (D15) - manual shadcn merge into the vendored code, matching manual update of the maintained Figma starter file, project opt-in (re-duplicate the starter or paste deltas), re-audit touched components, re-sync. Use when the user asks to upgrade shadcn/the design starter, or when a new upstream shadcn release needs adopting.
---

# design-upgrade

Refreshes the **single-file starter** when upstream shadcn moves. The design
model here: one maintained Figma starter file (all shadcn-mirror components +
Lucide icons + all variables LOCAL; theme = modes on the file's own Semantic
collection) is DUPLICATED once per project — the duplicate is the project's
design file (`figma.projectFileKey`). There is no kit library subscription,
no `kit.lock`, no Library Swap, no kit-inventory recapture — those belonged
to the retired external-library model.

The paired upgrade D15 still holds in spirit: shadcn's code side and the
starter's design side move together, verified at every step — never a silent
either-side-only bump.

## Procedure (strict order)

1. **Manual shadcn merge (code side).** Treat `shadcn diff` as **advisory
   only** (upstream issue #5427 — it cannot safely auto-apply). Review the
   diff, merge by hand into the vendored source under `ui/` (or wherever
   this project's shadcn init put it). Vendored code is the source of truth
   for base primitives.
2. **Update the STARTER file (design side).** Mirror the merged changes into
   the maintained starter file's components. The Plugin API cannot copy
   nodes across files, so cross-file movement is manual: consolidate the
   changed/new components onto a dedicated export page in whichever file
   they were authored in, then copy-paste them into the starter by hand in
   the Figma UI. Author/adjust the mirrors with the same conventions
   `design-component` enforces (Semantic bindings, Auto Layout, D18 naming,
  ), then run `figma-audit` on them in the starter.
3. **Project opt-in.** Existing projects do NOT update automatically — their
   design file is an independent duplicate. A project adopts the refresh by
   either:
   - **re-duplicating the starter** (a fresh duplicate becomes the new
     project file — only sensible early, before project-specific screens
     and components accumulate), or
   - **manually pasting the deltas** from the starter into its own design
     file (the usual path: copy the changed components from the starter's
     export page into the project file, replacing the old mirrors by hand).
   Either way, record the new `figma.projectFileKey` if the file changed.
4. **Re-run the design-rules audit on the touched components** in the project
   file (`figma-audit`, named-component hard gate) — pasted components can
   carry stray literals or names; never assume a paste landed clean.
5. **Re-sync.** Run `figma-sync` on the touched components so
   `design/tokens.json`, `design/semantic-manifest.md`, specs, and
   screenshots reflect the refreshed file.

## Why this order matters

Code first, starter second, projects last: the vendored merge defines what
the mirrors must look like, the starter is the one place the mirrors are
maintained, and each project chooses when to take the delta. Skipping step 4
misses exactly the failure a manual paste invites — a component that LOOKS
right but carries unbound literals or auto-generated names the congruence
gate (which only compares specs against rendered code) would never see.

## Verification

Manual dry-run only — no live starter/project file pair exists in this repo
to upgrade. Real verification is the first live refresh in a host project.
