#!/usr/bin/env node
/**
 * The figma-audit Node wrapper (SKILL.md §"Procedure" step 3): derives the
 * options object the agent passes into the `use_figma` call that runs
 * `runTier0Audit`, folding in the project's live composite-name set —
 * `design/registry.json`'s component keys — as `compositeNames`, the
 * existing-name set `compositeRegionNamingViolation` (Option B, advisory)
 * checks a screen's plain FRAMEs against. The sandbox can't read a committed
 * file itself (kit-awareness.md §"Enforcement"'s same constraint), so this
 * has to happen Node-side, before the call, exactly like
 * `record-audit-receipt.js`'s post-hoc reads of the same file.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { registryComponentNames } from '../design-kit/kit-inventory.js'

function readOptionalJson(path) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function deriveTier0AuditOptions({ cwd, componentNames = [] } = {}) {
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  return { componentNames, compositeNames: registryComponentNames(registry) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const namesIndex = args.indexOf('--componentNames')
  const componentNames = namesIndex === -1 ? [] : JSON.parse(args[namesIndex + 1])
  const options = deriveTier0AuditOptions({ cwd: process.cwd(), componentNames })
  console.log(JSON.stringify(options))
}
