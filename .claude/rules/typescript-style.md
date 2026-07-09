---
paths:
  - "**/*.{ts,tsx}"
---

# TypeScript Style Rules

## switch over if/else

When branching on a discriminant (string literal union, `.type` field, enum) always use `switch`. Reserve `if/else` for non-enumerable conditions (range checks, truthiness, arbitrary booleans). `switch` enables exhaustiveness checking and is easier to extend.

## No nested ternaries

Single-depth `a ? b : c` is fine. Chaining ternaries (`a ? b : c ? d : e`) is forbidden — use `switch` or early-return `if` blocks instead. This applies everywhere: action bodies, JSX, helper functions.

## No comments on obvious code

Default to writing no comments. Add one only when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug. Never write multi-paragraph docstrings or multi-line comment blocks.

## One unit per file

A file exports exactly one of: a gate, a walker, a class, or a cohesive set of functions for one concern. Soft ceiling of ~150 lines (pure data files exempt).

## No dead code

Remove unused exports, events, context fields, and config the moment they stop being wired up.
