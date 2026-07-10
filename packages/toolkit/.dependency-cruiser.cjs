/**
 * Module-boundary lint (templates/rules/file-structure.md "ports and
 * adapters"): the generic core layer and the Claude adapter layer must never
 * reach into a domain pack, and the adapter layer must never import a pack
 * directly either — packs register into core's ports, they are never
 * imported by name from a lower-trust/more-specific layer.
 *
 * Cruises `dist/` (the compiled output, plain ESM JS, same folder shape as
 * `src/`) rather than `src/` directly: dependency-cruiser's TypeScript
 * transpiler only supports `typescript@>=2.0.0 <6.0.0`, and this package
 * builds with `typescript@^6.0.3` — cruising the already-compiled JS sidesteps
 * that version ceiling entirely. Requires `bun run build` first (the `depcruise`
 * script does this).
 *
 * Declared composition hub (file-structure rule requires naming any sanctioned
 * exception, not just enforcing the general boundary): `dist/register-installed-packs.js`
 * (`src/register-installed-packs.ts`) is the single sanctioned pack-loading hub —
 * it lives outside `core/`, `adapter-claude/`, and `packs/` precisely so it can
 * import `dist/packs/**` directly (registering playbook specs and gates) without
 * tripping the boundary rules below. Every other module reaches packs only
 * through it; `core-no-register-installed-packs` below stops core reaching in
 * directly instead (pack attribution is core-owned via `registerPlaybook(spec, pack)` /
 * `getPlaybookPack`, not read back off this hub).
 */
module.exports = {
  forbidden: [
    {
      name: 'core-no-adapter-claude',
      severity: 'error',
      comment: 'dist/core/** (src/core/**) may not import dist/adapter-claude/**',
      from: { path: '^dist/core' },
      to: { path: '^dist/adapter-claude' }
    },
    {
      name: 'core-no-packs',
      severity: 'error',
      comment: 'dist/core/** (src/core/**) may not import dist/packs/**',
      from: { path: '^dist/core' },
      to: { path: '^dist/packs' }
    },
    {
      name: 'core-no-register-installed-packs',
      severity: 'error',
      comment:
        'dist/core/** (src/core/**) may not import dist/register-installed-packs.js — core owns pack attribution itself (registerPlaybook(spec, pack) / getPlaybookPack), it never reads back off the pack-loading hub',
      from: { path: '^dist/core' },
      to: { path: '^dist/register-installed-packs\\.js$' }
    },
    {
      name: 'adapter-claude-no-packs',
      severity: 'error',
      comment:
        'dist/adapter-claude/** (src/adapter-claude/**) may not import dist/packs/** (register via register-installed-packs.js instead)',
      from: { path: '^dist/adapter-claude' },
      to: { path: '^dist/packs' }
    },
    {
      name: 'packs-no-adapter-claude',
      severity: 'error',
      comment: 'dist/packs/** (src/packs/**) may not import dist/adapter-claude/**',
      from: { path: '^dist/packs' },
      to: { path: '^dist/adapter-claude' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.js$' }
  }
}
