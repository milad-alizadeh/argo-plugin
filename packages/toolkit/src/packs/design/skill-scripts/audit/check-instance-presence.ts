#!/usr/bin/env node
// ADVISORY-LOUD: exits non-zero when an instance fails to resolve against the
// registry, but no hook consumes this exit code — it never hard-blocks (design-rules
// stays the one hard gate).

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveInstancePresence, summarizeInstancePresence, type BuiltInstance, type RegistryLookupEntry } from '../../design-kit/instance-presence.js'

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function registryLookupEntries(registry: any): RegistryLookupEntry[] {
  const components = registry?.components && typeof registry.components === 'object' ? registry.components : {}
  return Object.entries(components as Record<string, { nodeId?: string }>)
    .filter(([, entry]) => typeof entry?.nodeId === 'string')
    .map(([name, entry]) => ({ nodeId: entry.nodeId as string, name }))
}

export function checkInstancePresence({ cwd, built = [] }: { cwd: string; built?: BuiltInstance[] }) {
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  const results = resolveInstancePresence(built, registryLookupEntries(registry))
  return { results, summary: summarizeInstancePresence(results) }
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const builtRaw = flagValue(args, '--built')
  let built: BuiltInstance[] = []
  if (builtRaw) {
    try {
      built = JSON.parse(builtRaw)
    } catch {
      process.stderr.write('argo P4a: --built is not valid JSON\n')
      process.exit(2)
    }
  }

  const { summary } = checkInstancePresence({ cwd: process.cwd(), built })

  const lines: string[] = []
  for (const name of summary.unresolved) lines.push(`  - ${name}: unresolved (no registry entry by nodeId or name)`)

  if (summary.clean) {
    process.stderr.write(`argo P4a: instance-presence clean (${summary.resolved.length} resolved)\n`)
  } else {
    process.stderr.write('argo P4a: instance-presence NOT clean — fix or override at ship:\n')
    for (const line of lines) process.stderr.write(`${line}\n`)
  }

  console.log(JSON.stringify({ summary }))
  process.exit(summary.clean ? 0 : 1)
}
