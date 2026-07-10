# argo-plugin

The argo plugin: a portable engineering way-of-working for Claude Code. Skills +
agent roles + hooks (this checkout carries no executable JS; hooks dispatch to the
host-installed `@argohq/toolkit` via `npx --no-install --offline`). The deterministic
half is `@argohq/toolkit` (`packages/toolkit`).

## Stack facts

- **Package manager:** bun. Monorepo (`workspaces: ["packages/*"]`). Install from repo
  root, never inside a workspace.
- **Toolkit source:** `packages/toolkit/src` (TypeScript, compiled to `dist/` via tsc).
  `bin/argo.js` is the CLI entry. Hooks live in `src/hooks/`, gates in `src/packs/*/`,
  the Claude adapter in `src/adapter-claude/`, core state/config/permissions in
  `src/core/`.
- **Tests:** `npx vitest run` from repo root. Co-located (`*.test.ts` next to subject).
- **Boundaries:** `dependency-cruiser` (`packages/toolkit/.dependency-cruiser.cjs`) —
  run `node ./node_modules/.bin/depcruise dist --config .dependency-cruiser.cjs` from
  `packages/toolkit`.
- **TDD:** enforced by probity (`probity.config.ts`) where wired; gated builds also
  carry red-proof + trust commit gates.
- **Posture index:** `argo status --host-root .` reports TDD / boundary / LSP posture
  vs on-disk reality.

## Code questions — query the graph FIRST

`packages/toolkit/src/graphify-out/graph.json` is a committed structural graph (896
nodes: call + dependency edges). For "where does X live", "what calls Y", "what
depends on Z", architecture — query it before grep. Run from `packages/toolkit/src`
(node paths are relative to that scan root):

- `graphify query "<question>"` — broad BFS context
- `graphify explain "<Symbol>"` — one node + neighbors
- `graphify path "<A>" "<B>"` — how two symbols connect

It is structural-only (no semantic community labels — that needs an LLM key argo's
no-metered-key rule bans), so fall back to grep for exact-token lookups and for the
markdown skill/agent/template surfaces the graph doesn't cover.
