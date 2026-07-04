/**
 * Decide WHERE a vendored (unpublished, in-plugin) package goes in a host repo
 * and HOW its dependency is wired (§2f). Pure over already-read manifest
 * objects — the skill does the fs detection and the actual copy/write.
 *
 * @param rootPkg   the host's ROOT `package.json` object (parsed)
 * @param pkgName   the package being vendored (e.g. "figma-design-kit")
 * @param opts.pnpmWorkspace  true if a pnpm-workspace.yaml exists (the skill
 *                  detects the file; this fn stays pure)
 * @returns { mode: 'workspace' | 'file', packageDir, depSpecifier }
 *   - workspace host → vendor to `<packageDir>/<pkgName>` (e.g. packages/),
 *     dependency is `workspace:*` (matches the host's existing convention)
 *   - non-workspace host → vendor to `design/vendor/<pkgName>`, dependency is
 *     a relative `file:./design/vendor/<pkgName>`
 *
 * Errs toward the always-resolvable `file:` default when a workspace can't be
 * proven — never emits a `workspace:*` a non-workspace host can't resolve.
 */
export function resolveVendorPlan(rootPkg, pkgName, opts = {}) {
  const wsField = rootPkg?.workspaces
  const globs = Array.isArray(wsField) ? wsField : Array.isArray(wsField?.packages) ? wsField.packages : []
  const isWorkspace = globs.length > 0 || opts.pnpmWorkspace === true

  if (isWorkspace) {
    return { mode: 'workspace', packageDir: pickPackagesDir(globs), depSpecifier: 'workspace:*' }
  }
  return { mode: 'file', packageDir: 'design/vendor', depSpecifier: `file:./design/vendor/${pkgName}` }
}

/** Prefer a `packages/*` glob; else the leading dir of the first glob containing a slash-star; else `packages`. */
function pickPackagesDir(globs) {
  if (globs.some((g) => g === 'packages/*' || g.startsWith('packages/'))) return 'packages'
  const first = globs.find((g) => g.includes('/*'))
  if (first) return first.replace(/\/\*.*$/, '')
  return 'packages'
}
