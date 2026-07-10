# Comment Discipline

Comments are a liability: they drift from the code and nobody re-verifies
them on every edit the way tests and types get re-verified. Default to NO
comment. Good code and good names are the documentation. Language-agnostic —
binds `//`, `/* */`, and `#` comments alike, in every language in the repo.

## The one sanctioned comment: WHY the code cannot say

A comment earns its place only when it encodes a WHY that cannot be
recovered by reading the code itself:

- a constraint or invariant the code must honor (a version ceiling, an
  ordering requirement, a fail-closed contract)
- a workaround, paired with the reason it exists (the bug/limitation it
  routes around)
- a choice that looks wrong on first read but is deliberate (the obvious
  alternative was tried and rejected, for a reason that isn't visible in the
  diff)

If the WHY becomes inferable from the code itself (a rename, a type, an
assertion makes it obvious) — delete the comment. A comment that no longer
adds information is now drift risk, not documentation.

## Forbidden in CODE

- **WHAT-restatement:** a comment that repeats what the next line already
  says in English. If you can delete the comment and the code reads exactly
  as clearly, it was never earning its place.
- **Referential comments:** naming a file, path, sibling module, or "see X"
  inside a code comment. Code that needs a pointer to another file to be
  understood has a naming or structure problem — fix that, don't paper over
  it with a pointer. (Referential naming is allowed in the interface surface
  below — that's the one place naming a path or verb IS the contract.)
- **Tombstone / changelog comments:** `// removed X because Y`, `// old:
  ... new: ...`, dated notes, commented-out code kept "just in case." Git
  history is the changelog. Delete cleanly; put the rationale in the commit
  message.
- **Multi-paragraph rationale:** a comment that spans two or more paragraphs is
  a design doc that leaked into the source file. Move it to the commit message,
  a plan doc, or an ADR; leave at most a single dense paragraph stating WHY, not
  the whole argument. A long single-paragraph WHY is fine; the smell is the
  paragraph break, not the line count.

## The one exception: the interface surface

Docs, `SKILL.md` files, rule files, and public API documentation are a
different surface — there, naming a verb, a path, a gate, or a config key IS
the contract the reader depends on. Referential naming is expected and
required there. That surface is checked separately (`comment-refs-check`):
every reference it makes must resolve to something real on disk or in the
known verb set, so the documentation never points at a file, verb, or gate
that has moved or never existed.

## Self-check before you finish

1. Does this comment say WHAT the next line does, in different words? Delete it.
2. Does this comment point at a file/path/"see X" from inside code? Fix the
   name instead of adding a pointer.
3. Is this comment now inferable from the code around it? Delete it.
4. Is this comment more than a couple of lines? Move it to the commit message.

Any "yes" above → fix it before reporting done.
