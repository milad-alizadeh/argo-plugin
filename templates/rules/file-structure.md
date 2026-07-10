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

- A file exceeds ~150 lines (machines and pure data files are exempt)
- A folder root has 5+ peer files that fall into natural sub-domains
- Two or more files in a folder share a prefix (e.g. `conversationLog.ts`,
  `conversationSwitch.ts`) — that prefix is the subfolder name

### Group by domain, not by file type

Folders are named by **what the code is for** (feature/domain), never by what
the files syntactically are (kind). `conversation/` (log, switch, persist,
title) beats `utils/` or `helpers/`.

**Kind-folders are banned:** never create `schemas/`, `types/`, `utils/`,
`helpers/`, `constants/`, `interfaces/`, `validators/`, `handlers/` as
grouping folders. They become junk drawers: touching one feature means
hopping across five kind-buckets, and deleting a feature leaves orphans in
each. A feature's schema, types, and validation live INSIDE that feature's
folder (as `registry/schema.ts`, not `schemas/registry.ts`).

The one sanctioned exception is a single small `lib/` (or `shared/`) folder
per module root for genuinely cross-cutting helpers used by 3+ sibling
domains. If a "shared" file has one consumer domain, it belongs in that
domain's folder instead.

The complementary file rule: **folder = domain, file = concept.** A file is
named after the one concept it owns (`gate.ts` = the gate contract,
`spec.ts` = the spec registry). A file named after a syntactic category
holding many unrelated concepts (`types.ts` accreting every type in the
module) is the same junk-drawer smell at file granularity; a small
colocated `types.ts` scoped to its own folder's domain is fine.

### Naming convention — folders vs files

| Thing | Case | Example |
|---|---|---|
| **Folders** (domain groupings) | `kebab-case` | `agent-detail/`, `mission-control/`, `settings/` |
| **Component files** | `PascalCase` | `AgentDetailView.tsx`, `FleetView.tsx` |
| **Non-component files** (hooks, utils, types, machines) | `camelCase` | `useScrollPin.ts`, `chatTimeline.ts`, `types.ts` |

The rule in one sentence: **folders are always lowercase kebab, files are cased by what they export.**

### Keep subfolders shallow

One level of nesting covers almost every case. A subfolder that itself has
a natural cluster gets one more level (e.g. `memory/recall/`). Never go
deeper than two levels below the module root without a documented reason.

### Barrel exports

Every subfolder exposes a clean barrel via `index.ts`. A caller should never
need to know the internal leaf path — import from the folder, not the leaf:

```ts
// good
import { recordExchange } from './conversation'

// avoid (leaks internal structure)
import { recordExchange } from './conversation/log'
```

The exception: when only one symbol from a leaf is needed and the barrel would
re-export a very large surface, a direct leaf import is acceptable.

### Apply this rule uniformly

This applies to every module in the codebase — brain/, agents/, ipc/, mcp/,
renderer/machines/, components/, etc. When you add new files to any folder,
check whether the folder now needs splitting.
