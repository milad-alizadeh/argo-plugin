# templates/rules

Rule templates `argo init` installs into a host project's `design/` directory
when the design pack is enabled (workflow-engine-phase1.md Slice 12, step 36).

These are short, atomic, checklist-shaped documents — "what good looks like,
stated as a rule" — distinct from `../craft/*.md`, which is prose: the
narrative judgment/technique that helps an agent *think* about design work
(when to ask a human, how to sequence a build, why a convention exists).
A rule template states the convention itself, tersely, as something a human
or an agent references while authoring — the same content `design-rules-check`
enforces mechanically for the checks it *can* run, restated here as
human-readable reference for the checks that stay a matter of authoring
discipline (naming, composition, review conventions) rather than a
machine-checkable predicate.

Extracted while stripping the six design skills down to craft-only content
(the concrete do/don't lists and naming conventions that were baked into
skill prose): component authoring conventions, and the Figma-comment
resolution conventions. Nothing else in the six skills was rule-shaped beyond
what's already covered by `design-rules-check`'s tier0 logic — most of the
skill prose was either narrative technique (kept in `craft/`) or sequencing/
gate-invocation (now the workflow engine's job, stripped entirely).
