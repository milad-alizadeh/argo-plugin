/**
 * Migration registry — versioned, idempotent reconcile steps for changes that
 * are NOT "re-derive a template" (dependency rewrites, config merges). Each
 * entry: { id, sinceVersion, description, detect(obj, ctx), computePatch(obj, planFor, ctx) }.
 * `detect`/`computePatch` are pure over already-read JSON objects — the skill
 * does the fs reads/writes and the actual vendoring copy — mirroring
 * figma-design-kit's tier0-rules split.
 */

// A dependency value pointing at an absolute plugin-cache path, e.g.
// file:/Users/x/.claude/plugins/cache/argo/argo/0.10.1/packages/figma-design-kit
const ABSOLUTE_CACHE = /^file:.*\/plugins\/cache\/argo\/argo\/[^/]+\/packages\//
// A relative vendored path, e.g. file:./design/vendor/figma-design-kit — only
// off-convention (worth rewriting) on a workspace host.
const RELATIVE_VENDOR = /^file:\.{0,2}\/.*design\/vendor\//

function shouldRewrite(value, ctx) {
  if (typeof value !== 'string') return false
  if (ABSOLUTE_CACHE.test(value)) return true
  if (ctx?.isWorkspace && RELATIVE_VENDOR.test(value)) return true
  return false
}

const DEP_SECTIONS = ['dependencies', 'devDependencies']

export const migrations = [
  {
    id: 'vendor-figma-design-kit-absolute-path',
    sinceVersion: '0.11.0',
    description:
      'Rewrite an in-plugin package dependency that points at an absolute plugin-cache path ' +
      '(file:/…/.claude/plugins/cache/argo/argo/<version>/packages/…) — machine-specific and ' +
      'version-pinned — to a vendored dependency: workspace:* on a monorepo host, or a relative ' +
      'file:./design/vendor/<pkg> otherwise (per resolveVendorPlan). On a workspace host it also ' +
      'converts an off-convention relative file:./design/vendor/ dep to workspace:*. NB: detect ' +
      'keys on the plugin-cache path shape — revisit if Claude Code changes its cache layout.',
    detect(pkgJson, ctx = {}) {
      for (const section of DEP_SECTIONS) {
        const deps = pkgJson?.[section]
        if (!deps) continue
        for (const value of Object.values(deps)) if (shouldRewrite(value, ctx)) return true
      }
      return false
    },
    /**
     * @param planFor (pkgName) => { depSpecifier } — from resolveVendorPlan,
     *   so the caller injects the workspace-vs-file decision.
     * @returns patched clone, or null if nothing matched.
     */
    computePatch(pkgJson, planFor, ctx = {}) {
      let changed = false
      const patched = JSON.parse(JSON.stringify(pkgJson))
      for (const section of DEP_SECTIONS) {
        const deps = patched[section]
        if (!deps) continue
        for (const [name, value] of Object.entries(deps)) {
          if (shouldRewrite(value, ctx)) {
            deps[name] = planFor(name).depSpecifier
            changed = true
          }
        }
      }
      return changed ? patched : null
    }
  }
]
