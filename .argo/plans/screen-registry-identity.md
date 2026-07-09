# Screen identity via registry keys (kill isDesignPageName gating)

## Problem
`isScreenFrame` (tier-0 exemptions for a screen's own top-level artboard:
`non-code-friendly-name`, `missing-auto-layout`, `non-semantic-binding`) is
gated on `isDesignPageName(owningPageName)` = `/^D\d{2}/` on the PAGE name.
Real projects put screens on a page named "Screens" (frames named `D02.x`), so
the gate never arms → every composed screen fails the hard gate on 3
false-positives shared with the shipped, "audit-clean" sibling. Reproduced by 3
independent designer runs + a shipped-sibling cross-check.

## Rejected
- Second heuristic (`isDesignPageName(pageName) || isDesignPageName(frameName)`)
  — still a name guess for a load-bearing gate.
- `@screen` in the frame **description** — plain FRAME nodes are not
  `PublishableMixin`, so they have no `description` field (only
  components/styles/variables do). Confirmed in plugin-api typings.

## Decision — registry is the screen identity source of truth
Mirror the code-owned model (registry machine-written; the marker is the ONLY
flag). Screens become first-class `registry.json` entries:

    "D02.6 · Session · Chat · plain": {
      "nodeId": "5319:1712", "kind": "screen", "status": "audit-clean", ...
    }

- **Audit**: `runTier0Audit` receives the set of registered screen nodeIds;
  `isScreenFrame = match.parent?.type === 'PAGE' && screenNodeIds.has(match.id)`.
  Frame-only (descendants still gated), same discipline as today. Drop
  `isDesignPageName` from screen-frame identity entirely (it may stay for page
  discovery in the sweep — separate concern).
- **Exemptions** key off `isScreenFrame`: `nonSemanticName` (already),
  `missingAutoLayout` (add), and the recipe `nonSemanticBinding` (skip the
  screen frame's own fill binding at the walker).
- **Registration**: `figma-create`/`design-screen` register the screen on
  create (AI); `argo design register-screen --node <id> --name <slug>` for
  manual; a human can also just add the JSON line. Screens become addressable:
  `registry-lookup --kind screen`.

## Why this also fixes discovery
Screens weren't in the registry, so even the orchestrator had to spelunk pages
to find them. Registered screens resolve by key like components.

## Build order (TDD, argo-plugin)
1. schema: allow `kind: "screen"`.
2. `missingAutoLayoutViolation`: `if (node.isScreenFrame) return null` + test.
3. recipe walker: skip `nonSemanticBinding` for the screen frame's own fill.
4. `tier0-audit.ts`: thread `screenNodeIds`, set `isScreenFrame` from it at the
   named-audit + sweep call sites; remove isDesignPageName screen gating.
5. `prepare-tier0-audit-options` / audit entry: read registry, pass screen ids.
6. `register-screen` verb + `registry-lookup --kind`.
7. figma-create/design-screen SKILL + designer.md: register-on-create.
8. version bump, re-audit the 4 live screens → clean.

## Unify code-owned onto Dev annotations? (pending user decision)

Screens now use a Dev Mode `@screen` **annotation** as their identity marker
(frames have no `description`), while code-owned components still use the
`@code-owned:` marker in the component **description**. Two marker surfaces for
one conceptual mechanism ("a Figma node's kit/screen/code-owned classification
lives on the node itself, machine-mirrored into the registry"). Tempting to
unify code-owned onto annotations too, for one code path.

**Do NOT migrate yet.** The tradeoff, for the record:

- **Seat cost.** Authoring a Dev Mode annotation manually requires a **Dev or
  Full Figma seat**. A component `description` is editable by **any** seat
  (incl. Viewer-can-edit / collaborator). Moving `@code-owned:` to annotations
  raises the floor on who can hand-author the marker. Screens accept this
  because screen creation is already an agent/Dev-seat activity; code-owned
  markers are more often touched by whoever owns the component.
- **Blast radius.** Migration touches `parseCodeOwnedPath` +
  `buildCodeOwnedEntries` (read annotations instead of description),
  `pull-registry` (already reads annotations for screens — could share), the
  live tier-0 audit's code-owned exemption path, and the staleness/drift
  detection (description-change reasons become annotation-change reasons). Non-
  trivial, and every existing `@code-owned:` description in live files would
  need re-authoring as an annotation.
- **Asymmetry is real, not accidental.** Components ARE `PublishableMixin` and
  DO have a `description` — the description marker works and is cheaper to
  author. Screens are the only case FORCED onto annotations. So the "two
  surfaces" cost buys a lower authoring floor for the common case.

Decision deferred to the user. Leaving `@code-owned:` on the description for
now; `@screen` on the annotation. If unification is chosen later, the
`pull-registry` annotation read added for screens is the natural shared base.
</content>
