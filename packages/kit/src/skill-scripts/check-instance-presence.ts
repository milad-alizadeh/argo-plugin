#!/usr/bin/env node
/**
 * P4a instance-presence check (design-screen SKILL.md §4): the Node wrapper the
 * skill runs after composing a screen. The sandbox can't read a committed file,
 * so registry.json is read here Node-side; the built-frame instance inventory
 * and the frame's `argo-screen` annotation text are captured live via
 * `use_figma` and passed in as CLI data.
 *
 * ADVISORY-LOUD: exits non-zero when the result is not clean (a declared
 * component is MISSING/HOLLOW/UNREGISTERED) so the agent notices and fixes or
 * the human overrides at ship — but NO hook consumes this exit code, so it
 * never hard-blocks a commit or session end (tier-0 stays the one hard gate).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { registryComponentNames } from '../design-kit/kit-inventory.js'
import {
  parseScreenManifest,
  classifyInstancePresence,
  summarizeInstancePresence,
  type BuiltNode
} from '../design-kit/screen-manifest.js'

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function checkInstancePresence({
  cwd,
  annotationText,
  built = []
}: {
  cwd: string
  annotationText?: string
  built?: BuiltNode[]
}) {
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  const manifest = parseScreenManifest(annotationText)
  const results = classifyInstancePresence(manifest, built, registryComponentNames(registry))
  return { manifest, results, summary: summarizeInstancePresence(results) }
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const annotationText = flagValue(args, '--manifest') ?? ''
  const builtRaw = flagValue(args, '--built')
  let built: BuiltNode[] = []
  if (builtRaw) {
    try {
      built = JSON.parse(builtRaw)
    } catch {
      process.stderr.write('argo P4a: --built is not valid JSON\n')
      process.exit(2)
    }
  }

  const { manifest, summary } = checkInstancePresence({ cwd: process.cwd(), annotationText, built })

  if (manifest.length === 0) {
    process.stderr.write('argo P4a: no argo-screen manifest block on the frame — nothing to check (advisory)\n')
    console.log(JSON.stringify({ manifest, summary }))
    process.exit(0)
  }

  const lines: string[] = []
  for (const name of summary.MISSING) lines.push(`  - ${name}: MISSING (no instance on frame)`)
  for (const name of summary.HOLLOW) lines.push(`  - ${name}: HOLLOW (traced frame or empty instance shell)`)
  for (const name of summary.UNREGISTERED) lines.push(`  - ${name}: UNREGISTERED (not in registry.json)`)
  for (const w of summary.warnings) lines.push(`  - ${w.name}: WARN ${w.warning}`)

  if (summary.clean) {
    process.stderr.write(`argo P4a: instance-presence clean (${summary.present.length} present, ${summary.skipped.length} skipped)\n`)
    for (const line of lines) process.stderr.write(`${line}\n`)
  } else {
    process.stderr.write('argo P4a: instance-presence NOT clean — fix or override at ship:\n')
    for (const line of lines) process.stderr.write(`${line}\n`)
  }

  console.log(JSON.stringify({ manifest, summary }))
  process.exit(summary.clean ? 0 : 1)
}
