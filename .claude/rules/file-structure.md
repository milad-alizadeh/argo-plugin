---
paths:
  - "packages/**/*.ts"
---

# File Structure Rules

## Folder-split hygiene — extract before you dump

When a file approaches 150 lines or a folder root accumulates 5+ peer files
doing related things, extract into a subfolder. Do this proactively as part of
authoring a feature, not as a follow-up cleanup task.

### The split pattern

`thing.ts` → `thing/` folder:

```
thing/
  index.ts       # orchestrator only: wires sub-units together, barrel re-exports
  partA.ts       # one focused unit
  partB.ts       # one focused unit
```

`index.ts` is the **orchestrator** — wiring and re-exports only. No business
logic lives in index.ts; that belongs in named leaf files. Callers import from
`'./thing'` and TypeScript resolves to `thing/index.ts` automatically — zero
import churn for existing importers.

### When to extract

- A file exceeds ~150 lines (pure data files are exempt)
- A folder root has 5+ peer files that fall into natural sub-domains
- Two or more files in a folder share a prefix (e.g. `registry-pull.ts`,
  `registry-reconcile.ts`) — that prefix is the subfolder name

### Group by domain, not by file type

Subfolders are named by **what they do** (domain), not by what they are
(type). `audit/` (rules, walker, comparator) beats `utils/` or `helpers/`.

### This repo's domain seams (`packages/toolkit/src/`)

New code goes under the existing domain folder, never as a new flat peer at
`src/` root:

- `core/` — playbook engine (spec, state, gate, judge)
- `packs/design/` — design playbooks, AI gates, design-kit, recipes, walkers,
  skill-scripts
- `packs/code/` — code gates (red-proof, trust, test-smell, format-on-write) +
  reporters
- `adapter-claude/` — Claude Code glue (hooks, session, permission gates)
- `cli/` — argo CLI subcommands · `config/` — config resolution · `lib/` —
  shared plumbing

### Naming convention — folders vs files

| Thing | Case | Example |
|---|---|---|
| **Folders** (domain groupings) | `kebab-case` | `design-kit/`, `skill-scripts/` |
| **Non-component files** (modules, types, tests) | `kebab-case` (this repo's existing convention) | `red-proof-gate.ts`, `conversion-table.ts` |

### Keep subfolders shallow

One level of nesting covers almost every case. A subfolder that itself has
a natural cluster gets one more level. Never go deeper than two levels below
the module root without a documented reason.

### Barrel exports

Every subfolder exposes a clean barrel via `index.ts`. A caller should never
need to know the internal leaf path — import from the folder, not the leaf:

```ts
// good
import { runAudit } from './audit'

// avoid (leaks internal structure)
import { runAudit } from './audit/walker'
```

The exception: when only one symbol from a leaf is needed and the barrel would
re-export a very large surface, a direct leaf import is acceptable. Known hard
exception: browser-bundled walkers import comparator/conversion-table leafs
directly, never the design-kit barrel (the barrel pulls zod, which breaks the
vite optimizer).

### Apply this rule uniformly

This applies to every module in the repo. When you add new files to any
folder, check whether the folder now needs splitting.
