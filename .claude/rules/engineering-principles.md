# Engineering Principles

Write code that's easy to change **without a chain reaction**. These are rules,
not aspirations — if a change violates one, it's wrong. Stated as forbidden-lists
because you can pattern-match a violation, not an abstract virtue. They are
language-agnostic: they bind TypeScript, Python, Go, and anything else in the
repo equally.

## One source of truth (DRY + SSOT)

- Every value, rule, type, or decision lives in exactly ONE place — define once,
  import it.
- **Forbidden:** the same literal (a model id, URL, threshold, magic string)
  copy-pasted into two+ call sites. About to paste it a second time? Extract first.
- **Forbidden:** an `old → new` migration / normalizer map. Validate-and-default
  at the point of use instead.

## Depend on the abstraction, not the concretion (DIP + Strategy)

- A caller asks WHAT it needs ("give me a name", "embed this"), never HOW (which
  model, host, transport). The *how* lives behind one interface with swappable
  implementations, resolved at use-time.
- **Forbidden:** a call site naming a concrete backend — a specific model id, a
  hostname, a vendor. That's a leak; push it behind the interface.
- Test: could you swap the implementation without editing any caller? If not, the
  abstraction is wrong.

## Add by adding, not editing (Open/Closed)

- A new variant of an existing *kind* of thing (a provider, role, tool, intent) =
  ONE new file + ONE registration line. Nothing else moves.
- **Forbidden:** an `if (type === 'newThing')` branch threaded through existing
  consumers to bolt on a variant. Use the registry/interface the family already
  has. If the project documents a pattern for that family (a rule or skill), follow
  it exactly — divergence is the bug.

## One unit, one job (SRP + Separation of Concerns)

- A file/function/module does ONE thing. Orchestration is separate from the work
  it orchestrates; UI separate from logic separate from data access.
- If you can't name what a file does in one sentence without "and", split it.

## Substitutable by contract (LSP) + small interfaces (ISP)

- Every implementation of an interface honors the same contract — same inputs,
  output shape, and failure mode — so callers never special-case which one they
  got.
- An interface exposes only what the family needs; no method a client must carry
  but never calls.

## Simple, and only what's needed (KISS + YAGNI)

- Prefer the boring, obvious solution: the fewest moving parts that solve the
  ACTUAL task, not an imagined future one.
- **Forbidden:** speculative generality (config knobs, abstraction layers, hooks)
  for a need that doesn't exist yet. Delete dead/unused code on sight.

## Self-check before you finish

1. Is any value defined in more than one place?
2. Does any caller name a concrete backend / model / host?
3. Would adding the *next* variant force edits to existing files?
4. Can each file's job be said in one sentence?

Any "yes" to 1–3, or "no" to 4 → fix it before reporting done.

> Note: these govern code *structure*. **ACID** (atomicity, consistency,
> isolation, durability) is a different concern — DB transaction safety — and
> lives with the database rules, not here.
