/**
 * Writes the dep as `link:@argohq/toolkit` (dev-phase link protocol; release
 * swaps to a caret version) at the workspace root (monorepo) or the single
 * package.json. Design keys in `.argo/config.json` are seeded INERT (no
 * componentsPath) so the commit gates cannot arm until setup-design fills
 * the block; user-edited fields survive via mergeConfigShape. `.gitignore`
 * gets the deny-by-default `.argo/` block since that dir also holds secrets
 * and session-local files, so the ignore is never narrowed to a subdir.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { mergeConfigShape } from '../config/merge-config-shape.js'
import { argoConfigPath, GITIGNORE_BLOCK } from '../config/argo-paths.js'

const KIT_DEP_LINE = 'link:@argohq/toolkit'

// The plugin's own repo is the PRODUCER, not a consumer of its marketplace
// release: adding the link: dep would make the toolkit workspace depend on
// itself, and self-enabling argo@argo would load the released cache over the
// local source under development.
function isArgoPluginRepo(hostRoot: string): boolean {
  const manifest = join(hostRoot, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifest)) return false
  try {
    return readJson(manifest).name === 'argo'
  } catch {
    return false
  }
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

/** Expand a package.json `workspaces` field (array or { packages }) against the host tree. */
function expandWorkspaces(hostRoot: string, workspaces: string[] | { packages?: string[] } | undefined): string[] {
  const patterns = Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? [])
  const apps: string[] = []
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2)
      const baseDir = join(hostRoot, base)
      if (!existsSync(baseDir)) continue
      for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(baseDir, entry.name, 'package.json'))) {
          apps.push(`${base}/${entry.name}`)
        }
      }
    } else if (existsSync(join(hostRoot, pattern, 'package.json'))) {
      apps.push(pattern)
    }
  }
  return apps.sort()
}

export function runInit({ hostRoot, marketplaceSource }: { hostRoot: string; marketplaceSource?: { source: string; repo?: string } }) {
  if (!hostRoot) throw new Error('runInit: hostRoot is required')
  const pkgPath = join(hostRoot, 'package.json')
  if (!existsSync(pkgPath)) throw new Error(`runInit: no package.json at ${hostRoot}`)
  const pkg = readJson(pkgPath)

  const isMonorepo = pkg.workspaces != null
  const apps = isMonorepo ? expandWorkspaces(hostRoot, pkg.workspaces) : ['.']
  const selfRepo = isArgoPluginRepo(hostRoot)

  const depAlreadyPresent = pkg.dependencies?.['@argohq/toolkit'] === KIT_DEP_LINE
  if (!selfRepo && !depAlreadyPresent) {
    pkg.dependencies = { ...pkg.dependencies, '@argohq/toolkit': KIT_DEP_LINE }
    writeJson(pkgPath, pkg)
  }

  if (!selfRepo) {
    const settingsPath = join(hostRoot, '.claude', 'settings.json')
    const settings = existsSync(settingsPath) ? readJson(settingsPath) : {}
    settings.enabledPlugins = { ...settings.enabledPlugins, 'argo@argo': true }
    if (marketplaceSource) {
      settings.extraKnownMarketplaces = {
        ...settings.extraKnownMarketplaces,
        argo: { source: marketplaceSource },
      }
    }
    writeJson(settingsPath, settings)
  }

  const argoJsonPath = argoConfigPath(hostRoot)
  const shape = {
    landing: 'pr',
    design: Object.fromEntries(apps.map((app) => [app, {}])),
  }
  const existing = existsSync(argoJsonPath) ? readJson(argoJsonPath) : undefined
  const { merged, addedKeys } = mergeConfigShape(shape, existing)
  writeJson(argoJsonPath, merged)

  // Order matters within the block (`/.argo/*` before the re-includes), so
  // missing lines append in GITIGNORE_BLOCK order rather than sorted.
  const gitignorePath = join(hostRoot, '.gitignore')
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
  const presentLines = new Set(gitignore.split('\n').map((l) => l.trim()))
  const missing = GITIGNORE_BLOCK.filter((line) => !presentLines.has(line))
  if (missing.length > 0) {
    const prefix = gitignore.length === 0 || gitignore.endsWith('\n') ? gitignore : `${gitignore}\n`
    writeFileSync(gitignorePath, `${prefix}${missing.join('\n')}\n`)
  }

  return {
    mode: isMonorepo ? 'monorepo' : 'single-repo',
    apps,
    depAlreadyPresent,
    addedKeys,
    selfRepo,
  }
}
