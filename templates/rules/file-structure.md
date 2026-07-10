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

### Naming convention

Folders are named for their domain; files are named for the one concept they
own. Casing follows the language's own convention — the concrete tables live
in the per-language rule files (`typescript-style.md` for TS; snake_case
modules in Python; short lowercase package names in Go).

### Keep subfolders shallow

One level of nesting covers almost every case. A subfolder that itself has
a natural cluster gets one more level (e.g. `memory/recall/`). Never go
deeper than two levels below the module root without a documented reason.

### Public entry per module

Every module exposes ONE public entry that is its API; callers never import an
internal leaf. How that maps per language:

| Language | Module public entry | Privacy mechanism |
|---|---|---|
| TypeScript | `index.ts` barrel | convention + dependency linter |
| Python | package `__init__.py` re-exports (+ `__all__`) | `_underscore` names + import-linter |
| Go | the package itself (exported identifiers) | `internal/` directories (compiler-enforced) |

The exception: when only one symbol from a leaf is needed and the barrel would
re-export a very large surface, a direct leaf import is acceptable.

## Module boundaries — ports and adapters

Modules communicate through explicit contracts, never by reaching into each
other's internals (information hiding / dependency inversion).

- **A module's barrel IS its API.** Cross-module imports may only target
  another module's `index.ts` (or an explicitly exported entry file). Anything
  not re-exported from the barrel is private to the module.
- **Depend on ports, not implementations.** When module A needs behavior that
  module B provides, A defines or consumes an interface/registry (the port)
  and B registers into it (the adapter). A never imports B directly if B is a
  lower-trust or more specific layer (e.g. a domain pack, a provider adapter).
- **Layering is one-directional.** Generic/core layers must not import from
  specific layers (adapters, domain packs, app features). Specific layers may
  import the generic layer's public API. Two specific layers never import each
  other's internals; if they must talk, the shared contract moves into the
  generic layer.
- **Side-effect imports for registration happen in exactly ONE composition
  root** (the entry point that wires the app together), never scattered
  across consumers. Two call sites doing the same registration import is a
  boundary leak.
- **No god nodes.** A module with extreme fan-in (everything imports it),
  extreme fan-out (it imports everything), or both is a Single-Responsibility
  violation at graph scale — split it by responsibility. Sanctioned hubs
  (composition roots, barrels) are the only exception, and each must be
  explicitly declared in the boundary-lint allowlist with a one-line
  justification.
- **Enforce mechanically where the repo has lint infrastructure**: declare the
  layer rules in a dependency linter (dependency-cruiser or
  eslint-plugin-boundaries for TS, import-linter for Python, `internal/` +
  depguard for Go) so a new leak fails the build instead of relying on review.
  Wire the linter into the project's `lint` script (e.g. `eslint && lint:boundaries`)
  so a boundary leak fails the same gate as any other lint error — never a
  standalone skill or agent memory that can be skipped.

### Boundary-lint config pattern (TypeScript / dependency-cruiser)

A single **role map** is the config's source of truth: each top-level folder
of a module layer declares one role — `composition-root` | `infrastructure` |
`domain` | `shared` — and every forbidden rule derives from it, so adding a
role never means writing a new rule:

```js
const topLevelRoles = {
  bootstrap: 'composition-root',
  platform: 'infrastructure',
  domains: 'domain',
  lib: 'shared'
}
```

- **Composition root** may import anything (it's the wiring layer).
- **Infrastructure / composition-root** may import a domain only via that
  domain's `index.ts` barrel, never a domain leaf file.
- **A domain** may import another domain only via that domain's `index.ts`
  barrel; same-domain internal imports are unrestricted. dependency-cruiser
  v18 supports capture-group substitution — `from.path`'s `$1` substitutes
  into `to.pathNot` — so this rule is one entry, not one per domain pair:
  `from: { path: '^domains/([^/]+)/' }, to: { path: '^domains/', pathNot: ['^domains/$1/', '^domains/[^/]+/index\\.ts$'] }`.
- **Shared** imports nothing above it in the layer.
- **A structure-guard rule** fails lint on any import targeting a top-level
  folder absent from the role map, so a rogue folder can't silently escape
  the rules. Adding a legitimate new top-level folder = declare its role in
  the map in the same commit; an undeclared folder is a structure violation,
  not an oversight to grandfather.

The role names above (`composition-root`/`infrastructure`/`domain`/`shared`)
are the fixed vocabulary; the folder names inside `topLevelRoles` are NOT —
derive them from the host project's actual layout, and only gate a grouping
folder the project has actually adopted. Never write a rule for a layer or
folder that doesn't exist yet.

### Brownfield rollout — report-only, then grandfather

A fresh boundary-lint config against an existing codebase will surface
pre-existing violations. Never turn the gate on as a hard error against
those on day one:

1. Run the linter in report-only mode and record every current violation.
2. Grandfather each into a per-project waiver ignorelist (same shape as
   [Per-project waivers](#per-project-waivers-not-silent-exceptions) below:
   one rule + one path glob + one-line reason per entry).
3. Flip the gate on — it now fails only on **new** violations, not the
   inherited backlog.

Burning down the waiver list is a suggested follow-up, never a requirement of
turning the gate on.

### Per-project waivers, not silent exceptions

Real projects have justified violations (vendored code, a migration in
flight, a framework-imposed shape). Handle them the same way the design
gates do: a small, explicit ignorelist next to the lint config — each entry
scoped to one rule + one path glob, with a one-line reason. Never loosen the
rule globally, never scatter inline disable comments. An entry with no
reason, or one whose path no longer exists, is a defect. New projects start
with an empty list.

### Apply this rule uniformly

This applies to every module in the codebase — brain/, agents/, ipc/, mcp/,
renderer/machines/, components/, etc. When you add new files to any folder,
check whether the folder now needs splitting.
