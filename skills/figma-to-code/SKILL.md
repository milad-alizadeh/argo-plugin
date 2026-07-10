---
name: figma-to-code
description: Generate component code from a synced Figma design — reads story-map.json and committed design context, generates through the normal test-first loop, then runs the tiered acceptance gates in D22's order (spec-diff -> gestalt -> baseline commit). Use when the user asks to generate/build/implement a component from a Figma design that's already been synced.
---

<!-- INCLUDE: packages/toolkit/packs/design/craft/figma-to-code.md -->
# figma-to-code — generating from a synced design

Generates working component code from an already-synced Figma design, then
proves it visually — never on the strength of your own reading of the
result.

## Self-checks are advisory, not proof

Reading a comparator's output and concluding "it passed" is a self-check, not
proof — the same trust boundary that applies to test runs applies here to
design acceptance. Treat your own narration of "looks right" as worthless
evidence; only a structured, re-runnable comparison against a committed
reference counts.

## Code-owned components are never generated here

If a target component's real implementation already lives in code (a
Three.js scene, a canvas viz — anything Figma can only hold as a flat
screenshot placeholder), do not generate, diff, or visually test it. Import
the existing component from its real path and place it where a screen needs
it. Generating "a version" of something Figma can't faithfully represent just
produces a second, divergent implementation.

## Presentation-regen seam

Every generated component splits into a GENERATED presentation module (the
purely-visual variant/class logic) and a hand-owned behavior file that
imports it. Regenerating a component ever only rewrites the presentation
module — never the behavior file a human wrote. Before regenerating, check
whether the component's variant *shape* actually changed since it was last
synced (not just its values) — a shape change (a new variant axis, a removed
prop) is not safe to regenerate silently, because the hand-owned behavior
file may reference the old shape; that needs a human's attention, not a
silent regen.

## Why the acceptance order matters

Mechanism-level checks (does the generated markup match the design's
structural spec — spacing, sizing, tokens) should run and pass *before* any
visual/gestalt comparison, which in turn must produce a recorded verdict
*before* any new baseline screenshot is committed. Committing a new visual
baseline before a verdict is recorded is the failure mode this ordering
exists to prevent — a wrong baseline could otherwise ride through many
commits before a human happens to notice, since the baseline itself becomes
the thing future diffs are compared against. Never let a baseline update
race ahead of the check it's supposed to be the reward for passing.

## Read what was synced, not what you remember

All design context for generation — tokens, specs, screenshots per
variant×mode — should come from what was actually committed by the last
sync, never a live Figma read, and never invented. If a needed artifact
appears to be missing, that's a signal the component wasn't synced yet (or
doesn't exist in Figma yet) — stop and say so rather than improvising a
mapping. If the project has an `aesthetic-profile.md`, read it too — it
carries non-tokenizable design intent (material logic, light logic, motion
feel) the generated code should honor with the token names it cites.

## Verification

No such fixture exists in this repo — this skill's true test is a host
project actually generating a real component from a real synced design.
<!-- /INCLUDE -->
