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

A file exports exactly one of: a state machine, an actor, a React component, a hook, a class, or a top-level function. Soft ceiling of ~150 lines (machines and pure data files exempt).

## File naming — cased by what the file exports

| Thing | Case | Example |
|---|---|---|
| **Folders** (domain groupings) | `kebab-case` | `agent-detail/`, `mission-control/`, `settings/` |
| **Component files** | `PascalCase` | `AgentDetailView.tsx`, `FleetView.tsx` |
| **Non-component files** (hooks, utils, types, machines) | `camelCase` | `useScrollPin.ts`, `chatTimeline.ts`, `types.ts` |

The rule in one sentence: **folders are always lowercase kebab, files are
cased by what they export.**

## Barrels are index.ts

The "public entry per module" rule from file-structure.md maps to an
`index.ts` barrel in TypeScript: wiring and re-exports only, no business
logic. Callers import from `'./thing'`, never `'./thing/leaf'`:

```ts
// good
import { recordExchange } from './conversation'

// avoid (leaks internal structure)
import { recordExchange } from './conversation/log'
```

## No dead code

Remove unused exports, events, context fields, and config the moment they stop being wired up.
