/**
 * `argo update` — the deterministic half of /argo:update (amended 2026-07-06):
 * re-emit `.claude/argo.json` skeleton defaults while preserving every
 * user-edited field via mergeConfigShape. The dev-phase `link:@argohq/kit`
 * dep line is version-less, so there is nothing to bump here; there are no
 * migrations of any kind (owner no-legacy ruling). Generated design-pack
 * files (walker shims etc.) are re-emitted by /argo:setup-design's own
 * update mode, which the umbrella skill invokes after this.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeConfigShape } from '../config/merge-config-shape.js'

/** Must match runInit's skeleton — one source of default shape per mode. */
function skeletonShape(existingDesignKeys) {
  return {
    landing: 'pr',
    design: Object.fromEntries(existingDesignKeys.map((k) => [k, {}])),
  }
}

export function runUpdate({ hostRoot } = {}) {
  if (!hostRoot) throw new Error('runUpdate: hostRoot is required')
  const argoJsonPath = join(hostRoot, '.claude', 'argo.json')
  if (!existsSync(argoJsonPath)) {
    throw new Error(`runUpdate: no .claude/argo.json at ${hostRoot} — run argo init first`)
  }
  const existing = JSON.parse(readFileSync(argoJsonPath, 'utf8'))
  const designKeys = Object.keys(existing.design ?? { '.': {} })
  const { merged, addedKeys } = mergeConfigShape(skeletonShape(designKeys), existing)
  writeFileSync(argoJsonPath, `${JSON.stringify(merged, null, 2)}\n`)
  return { addedKeys }
}
