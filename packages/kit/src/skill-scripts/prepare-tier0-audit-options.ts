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
import { registryComponentNames } from '../design-kit/component-names.js'
import { findArgoJson } from '../config/argo-json.js'
import { TW_COLLECTION_FAMILY } from '../recipes/shadcn-tailwind/tier0-rules.js'

/**
 * Recipe-declared spacing/binding collection allowlist, keyed by the app's
 * `design.<app>.recipe` value (field bug fix, 2026-07-07 live D01 build) —
 * a fixed characteristic of the recipe's starter file, not per-project
 * config. `null`/unknown recipe gets no additional allowlist.
 */
const RECIPE_ADDITIONAL_ALLOWED_COLLECTION_NAMES: Record<string, string[]> = {
  'shadcn-tailwind': TW_COLLECTION_FAMILY
}

/**
 * Resolves each requested name to its registry `nodeId` (authoritative
 * targeting, field bug fix — a name-based sweep matched every same-named
 * node in the file, e.g. auditing "Card" also swept a container frame
 * literally named "Card"). A name with no registry entry falls through to
 * `unresolvedNames` — the sandbox-side name-lookup fallback in
 * `runTier0Audit`, for a target (a foundation frame/SCREEN) that has no
 * registry entry to resolve against.
 */
export function resolveComponentNodeIds(
  componentNames: string[],
  registry: any
): { componentNodeIds: string[]; unresolvedNames: string[] } {
  const components = registry?.components && typeof registry.components === 'object' ? registry.components : {}
  const componentNodeIds: string[] = []
  const unresolvedNames: string[] = []
  for (const name of componentNames) {
    const nodeId = components[name]?.nodeId
    if (typeof nodeId === 'string' && nodeId) {
      componentNodeIds.push(nodeId)
    } else {
      unresolvedNames.push(name)
    }
  }
  return { componentNodeIds, unresolvedNames }
}

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
export function findDesignBlock(cwd: string): Record<string, any> | null {
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
  const designBlock = findDesignBlock(cwd)
  const recipe = designBlock?.recipe ?? null
  const { componentNodeIds, unresolvedNames } = resolveComponentNodeIds(componentNames, registry)

  return {
    componentNodeIds,
    componentNames: unresolvedNames,
    compositeNames: registryComponentNames(registry),
    semanticCollectionName: designBlock?.semanticCollectionName ?? 'Semantic',
    additionalAllowedCollectionNames: (recipe && RECIPE_ADDITIONAL_ALLOWED_COLLECTION_NAMES[recipe]) ?? [],
    recipe
  }
}

/**
 * A typo'd or unrecognized flag (e.g. `--component-names` instead of
 * `--componentNames`) must not be silently swallowed into "no components
 * given" — that reads as a legitimate file-wide sweep and lets a named audit
 * run against an empty target, passing vacuously. Reject anything starting
 * with `--` that isn't a known flag before falling back to the sweep default.
 */
export function parseCliArgs(args: string[]): { componentNames: string[] } {
  const KNOWN_FLAGS = ['--componentNames']
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.includes(a))
  if (unknown.length > 0)
    throw new Error(`prepare-tier0-audit-options: unrecognized flag(s) ${unknown.join(', ')} — did you mean --componentNames?`)

  const namesIndex = args.indexOf('--componentNames')
  const componentNames = namesIndex === -1 ? [] : JSON.parse(args[namesIndex + 1])
  return { componentNames }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { componentNames } = parseCliArgs(process.argv.slice(2))
  const options = deriveTier0AuditOptions({ cwd: process.cwd(), componentNames })
  console.log(JSON.stringify(options))
}
