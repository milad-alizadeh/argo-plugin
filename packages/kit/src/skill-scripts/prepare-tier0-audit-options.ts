#!/usr/bin/env node
/**
 * The figma-audit Node wrapper (SKILL.md §"Procedure" step 3): derives the
 * FULL options object the agent passes into the `use_figma` call that runs
 * `runTier0Audit` — every project-specific value the bundled entry needs,
 * as DATA (kit-extraction restructure: killed the {{…}}-slot/splice model —
 * nothing project-specific is ever baked into a committed audit script
 * again; it all flows through this object at call time instead).
 *
 * The sandbox can't read a committed file itself (kit-awareness.md
 * §"Enforcement"'s same constraint), so this has to happen Node-side, before
 * the call, exactly like `record-audit-receipt.js`'s post-hoc reads of the
 * same files.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { registryComponentNames } from '../design-kit/kit-inventory.js'
import { findArgoJson } from '../config/argo-json.js'

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * The app's `design.<app>` block in `.claude/argo.json` for the app rooted
 * at `cwd` — matched by resolved `root`, falling back to the sole entry when
 * there's exactly one (single-repo project, `design["."]`). Returns null
 * when no argo.json/design block is found (unconfigured project) — every
 * caller below treats that as "use the mechanism's own defaults".
 */
function findDesignBlock(cwd: string): Record<string, any> | null {
  const found = findArgoJson(cwd)
  const entries = Object.entries(found?.config?.design ?? {})
  if (entries.length === 0) return null

  const resolvedCwd = resolve(cwd)
  const matched = entries.find(([, block]: [string, any]) => resolve(found!.repoRoot, block?.root ?? '.') === resolvedCwd)
  if (matched) return matched[1] as Record<string, any>
  return entries.length === 1 ? (entries[0][1] as Record<string, any>) : null
}

export function deriveTier0AuditOptions({ cwd, componentNames = [] }: { cwd: string; componentNames?: string[] }) {
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  const kitLock = readOptionalJson(join(cwd, 'design', 'kit.lock'))
  const designBlock = findDesignBlock(cwd)

  return {
    componentNames,
    compositeNames: registryComponentNames(registry),
    semanticCollectionName: designBlock?.semanticCollectionName ?? 'Semantic',
    recipe: designBlock?.recipe ?? null,
    kitPatches: readOptionalJson(join(cwd, 'design', 'kit-patches.json')) ?? {},
    kitVariableKeys: Array.isArray(kitLock?.variableKeys) ? kitLock.variableKeys : [],
    retiredKitVariableKeys: Array.isArray(kitLock?.retiredVariableKeys) ? kitLock.retiredVariableKeys : []
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const namesIndex = args.indexOf('--componentNames')
  const componentNames = namesIndex === -1 ? [] : JSON.parse(args[namesIndex + 1])
  const options = deriveTier0AuditOptions({ cwd: process.cwd(), componentNames })
  console.log(JSON.stringify(options))
}
