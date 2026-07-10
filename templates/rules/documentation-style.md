# Documentation Style

Write for a reader who wants the answer, not the tone of an announcement.
Second person, present tense, active voice, lead with the point. Language-agnostic
in the same sense as this repo's other rule templates — a checkable forbidden-list,
not an aspiration.

## Forbidden phrases

The exact literal phrases below (case-insensitive) never appear in shipped docs
prose. `apps/docs/scripts/lint-docs-style.mjs` reads this list mechanically — keep
every entry inside the fenced block below, one per line, nothing else in the block.

```forbidden-phrases
em dash
delve
seamless
robust
leverage
ever-evolving
it's important to note
in today's world
```

## Structural notes

- **No uniform bullet-and-heading structure where prose is clearer.** A list is for
  genuinely parallel, scannable items — not a reflex applied to every paragraph.
  If a sentence reads better as a sentence, write a sentence.
- **Never restate the question.** Answer directly; don't open a section by
  paraphrasing its own heading back at the reader.

## Edited pages

A prose page hand-edited since it was last generated is human-owned — routine
doc-sync skips it silently rather than overwriting it. Run `/argo:docs-refresh`
to review and optionally regenerate the edited set under this rule.
