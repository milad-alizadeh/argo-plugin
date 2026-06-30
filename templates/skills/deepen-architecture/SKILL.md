---
name: deepen-architecture
description: Surface architectural friction and propose deepening opportunities — refactors that turn shallow modules into deep ones, for testability and AI-navigability. Use when the user wants to deepen or improve architecture, find refactoring opportunities, consolidate coupled modules, or rescue a ball-of-mud area.
---

# Deepen Architecture

Propose **deepening opportunities**: refactors that turn shallow modules into
deep ones (a lot of behaviour behind a small interface). The aim is testability
and AI-navigability.

## Vocabulary — use exactly, don't drift

- **Module** — anything with an interface + implementation (fn, class, machine, folder).
- **Interface** — everything a caller must know: types, invariants, error modes, ordering.
- **Depth** — leverage at the interface. **Deep** = high leverage; **shallow** =
  interface nearly as complex as the implementation.
- **Seam** — where behaviour can be altered without editing in place.
- **Locality** — change, bugs, and knowledge concentrated in one place.
- **Deletion test** — imagine deleting the module. If complexity vanishes, it was
  a pass-through. If complexity reappears across N callers, it earned its keep.

These layer on top of Argo's own rules: one-unit-per-file, ~150-line soft ceiling,
no cross-folder reach-arounds, the provider pattern, no migration maps. Friction
that violates those is a strong candidate.

## Process

1. **Explore via the graph.** Start from `graphify-out/GRAPH_REPORT.md` and
   `graphify query`. Note friction: understanding one concept means bouncing
   between many small modules; shallow modules; pure functions extracted only for
   testability while the real bugs hide in how they're called; coupled modules
   leaking across seams; areas hard to test through their current interface. Use
   `graphify affected "<node>"` to size blast radius. Apply the deletion test to
   anything you suspect is shallow.
2. **Present candidates** — a self-contained HTML report written to `$TMPDIR`
   (never the repo), one card per candidate: files, problem, plain-English
   solution, benefits (in terms of locality/leverage and how tests improve), a
   before/after sketch, and a strength badge (`Strong` / `Worth exploring` /
   `Speculative`). End with the one you'd tackle first. Do **not** propose
   interfaces yet — ask which to explore.
3. **Stress-test loop.** Once the user picks one, walk the design tree (use
   `grill-with-docs`): what sits behind the seam, what tests survive, naming. If
   they reject a candidate for a load-bearing reason, offer to record it so future
   reviews don't re-suggest it.

<!-- Adapted from mattpocock/skills (MIT). -->
