#!/usr/bin/env node
/**
 * Deterministic registry lookup (cold-start optimization). `design/registry.json`
 * grows with the project, and most of its bytes are per-component `notes` +
 * `variantMatrix` prose an agent never needs to RESOLVE a component. A raw
 * whole-file `Read` therefore burns thousands of tokens for a roster, and ad hoc
 * grep/jq is unshared and error-prone. This verb reads the file Node-side and
 * emits only the compact resolution index `{ name, nodeId, kind, status,
 * adopted }`, so a cold-start agent gets the full roster (or a filtered subset)
 * in one small deterministic call — mirrors the `check-instance-presence`
 * wrapper's read-registry-Node-side shape.
 *
 * Read-only, never mutates; no hook consumes its exit code.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface RegistryIndexEntry {
  name: string
  nodeId: string
  kind?: string
  status?: string
  adopted?: boolean
  /** `@when-to-use:` usage guidance — small text that belongs in the resolution index. */
  whenToUse?: string
}

export type LookupResult = RegistryIndexEntry | { name: string; missing: true }

/**
 * Project the registry's `components` map into the compact index, optionally
 * filtered. `names` = exact match, request order preserved, misses surfaced
 * explicitly. `search` = case-insensitive substring over names. With neither,
 * every component carrying a `nodeId` is returned.
 */
export function lookupRegistry(
  registry: any,
  { names, search, kind }: { names?: string[]; search?: string; kind?: string }
): LookupResult[] {
  const components =
    registry?.components && typeof registry.components === 'object' ? (registry.components as Record<string, any>) : {}

  const compact = (name: string, entry: any): RegistryIndexEntry => ({
    name,
    nodeId: entry.nodeId,
    ...(entry.kind !== undefined ? { kind: entry.kind } : {}),
    ...(entry.status !== undefined ? { status: entry.status } : {}),
    ...(entry.adopted !== undefined ? { adopted: entry.adopted } : {}),
    ...(entry.whenToUse !== undefined ? { whenToUse: entry.whenToUse } : {})
  })

  // `if (names)` not `names.length > 0`: an explicit empty list means "resolve
  // nothing" and must yield [], distinct from `names` absent (full index).
  if (names) {
    return names.map((name) => {
      const entry = components[name]
      return entry && typeof entry.nodeId === 'string' ? compact(name, entry) : { name, missing: true as const }
    })
  }

  let all = Object.entries(components)
    .filter(([, entry]) => typeof entry?.nodeId === 'string')
    .map(([name, entry]) => compact(name, entry))

  // `--kind` narrows to one classification (e.g. `--kind screen` lists screens).
  if (kind) all = all.filter((e) => e.kind === kind)
  if (search) {
    const needle = search.toLowerCase()
    return all.filter((e) => e.name.toLowerCase().includes(needle))
  }
  return all
}

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export interface CliArgs {
  names?: string[]
  search?: string
  kind?: string
  cwd?: string
  help?: boolean
}

export function parseCliArgs(args: string[]): CliArgs {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const KNOWN_FLAGS = ['--names', '--search', '--kind', '--cwd']
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.includes(a))
  if (unknown.length > 0)
    throw new Error(`registry-lookup: unrecognized flag(s) ${unknown.join(', ')} — known: --names, --search, --kind, --cwd, --help`)

  const value = (name: string) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const namesRaw = value('--names')
  const search = value('--search')
  const kind = value('--kind')
  const cwd = value('--cwd')
  return {
    ...(namesRaw ? { names: JSON.parse(namesRaw) } : {}),
    ...(search ? { search } : {}),
    ...(kind ? { kind } : {}),
    ...(cwd ? { cwd } : {})
  }
}

const USAGE = `registry-lookup — deterministic, compact lookup of design/registry.json.

Emits only { name, nodeId, kind, status, adopted, whenToUse } per component (strips the
heavy notes/variantMatrix prose) so a cold-start agent resolves components in one
small call instead of a whole-file Read.

Usage:
  registry-lookup [--cwd <path>] [--names '<json-array>'] [--search <substr>] [--kind <k>]

Flags:
  --names   JSON array of exact component names; misses reported as {name,missing:true}.
  --search  case-insensitive substring filter over component names.
  --kind    filter to one classification (kit | custom | code-owned | screen); e.g. --kind screen lists screens.
  --cwd     repo/workspace dir holding design/registry.json (default: cwd).
  --help,-h show this help.

With no --names/--search, prints the full compact index.`

export function registryLookup({ cwd, names, search, kind }: { cwd: string; names?: string[]; search?: string; kind?: string }) {
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  return lookupRegistry(registry, { names, search, kind })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let parsed: CliArgs
  try {
    parsed = parseCliArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    process.exit(2)
  }
  if (parsed.help) {
    console.log(USAGE)
  } else {
    const results = registryLookup({ cwd: parsed.cwd ?? process.cwd(), names: parsed.names, search: parsed.search, kind: parsed.kind })
    console.log(JSON.stringify(results))
  }
}
