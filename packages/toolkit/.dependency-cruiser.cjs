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
