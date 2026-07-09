# figma-sync — the source-of-truth model

Figma-sync exists so that no downstream gate ever talks to Figma directly —
not even during a hands-off build. Every deterministic check compares
against **committed artifacts** (tokens, specs, screenshots, the story-map),
never a live MCP call. That's the property this craft doc explains the
reasoning behind.

## Source of truth (one rule, every component)

Figma owns ALL visuals — tokens, variants, spacing, styling — for every
component, base or custom, one-way Figma→code. Code owns ALL behavior — a11y,
focus, state machines, framework wiring. A sync regenerates the presentation
layer only; it never touches the hand-owned behavior file. This split
(generated presentation module vs. hand-owned behavior file, e.g.
`Button.presentation.tsx` imported by `Button.tsx`) is what makes repeat syncs
safe — a designer's Figma edit can never clobber code a human wrote by hand.

## Scope: custom + code-owned + adopted kit only

A stock/kit component master is vendored library content — most of it never
gets touched by a real project. Only kit that a project surface actually
**instances** (a custom/code-owned component, or a composed screen) is
"adopted" — treat those like any authored surface (audited, synced). Raw,
un-adopted kit is the vendored mirror nothing uses: never a hard-audit
target, never a sync target. Drift on it is advisory noise to report and
ignore, not work.

Adoption should always be **derived** from live instance usage, never
hand-flagged — the failure this guards against is real: a staleness sweep
once flagged 110+ unused stock masters, and an operator promoted them into a
sync/fix pass that then damaged them. If a kit master isn't instanced
anywhere in the real project, leave it alone.

## Non-default mode screenshots — capture-only, never persisted

For every non-default Semantic mode (e.g. a dark-mode variant of a token
collection), don't duplicate the frame to capture it — temporarily flip the
mode on the default-mode frame, capture, then revert. The flip must never
persist: explicit variable modes on an instance/frame are a standing
violation regardless of intent, so a capture-only flip has to fully revert in
the same operation, not just "eventually." A single-mode Semantic collection
has no non-default mode to capture, so this degenerates to one plain capture.

## Fail loud, never silently skip

If any synced component has an outstanding hard hygiene violation, stop — do
not write partial artifacts for that component. A dirty file syncing "mostly
cleanly" just launders the violation into the committed baseline every
downstream gate then trusts. Report which components synced cleanly and which
were blocked, with the violation detail.

## Why this is one-way and artifact-mediated

The alternative — gates reading Figma live — was rejected because it makes
every gate's outcome depend on whatever state the file happens to be in at
gate time, including someone else's in-progress edit. Freezing the sync into
committed artifacts is what lets a headless rebuild (no live MCP access at
all) reproduce the exact same comparison a human would get interactively.

## Verification

No Figma file or host project lives in this repo to exercise this against —
real verification happens on a host project's first live sync.
