#!/usr/bin/env node
/**
 * `argo design register-screen --node <id> --name <slug>` — manual registration
 * of a top-level screen frame as a first-class `kind:"screen"` entry in
 * `design/registry.json`. Screens are plain FRAME nodes, which (unlike
 * components/styles/variables) are NOT PublishableMixin and so carry no
 * `description` field — the `@code-owned:` marker-in-description model cannot be
 * reused verbatim. Screen identity therefore lives on a Dev Mode `@screen`
 * annotation (frames support AnnotationsMixin); this verb mirrors that annotation
 * into the registry so the tier-0 audit exempts the screen's own artboard from
 * the 3 rules it structurally always trips (non-code-friendly-name,
 * missing-auto-layout, non-semantic-binding), and so screens are addressable via
 * `registry-lookup --kind screen`.
 *
 * `figma-create`/`design-screen` call this on screen create (after setting the
 * `@screen` annotation); a human can also run it, or add the JSON line directly.
 * pull-registry syncs live `@screen` annotations into the same entry shape, so a
 * repeated run is idempotent. Writes only; no hook consumes its exit code.
 */

import { readDesignJsonOrRebuild, writeDesignJson } from './lib/write-design-json.js'

export type ScreenEntry = {
  nodeId: string
  kind: 'screen'
  status: string
}

/**
 * Pure upsert of a `kind:"screen"` entry keyed by `name`. Preserves any extras
 * already on an existing entry (notes a human added), overwrites nodeId/kind and
 * defaults status to the existing value or "audit-clean" (a registered screen's
 * resting state — its artboard false positives are exempt, so "clean" holds).
 */
export function upsertScreenEntry(
  registry: { components?: Record<string, any> },
  { nodeId, name, status }: { nodeId: string; name: string; status?: string }
): { components: Record<string, any> } {
  const components = { ...(registry.components ?? {}) }
  const prev = components[name] ?? {}
  components[name] = {
    ...prev,
    nodeId,
    kind: 'screen',
    status: status ?? prev.status ?? 'audit-clean'
  }
  return { ...registry, components }
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const USAGE = `register-screen — register a top-level screen frame in design/registry.json.

Writes/updates a { nodeId, kind:"screen", status } entry keyed by --name. Screen
frames have no description field, so screen identity lives on a Dev Mode @screen
annotation; this mirrors it into the registry (tier-0 exempts a registered
screen's own artboard, and registry-lookup --kind screen lists them).

Usage:
  register-screen --node <nodeId> --name <slug> [--status <status>] [--cwd <path>]

Flags:
  --node    the top-level frame's Figma nodeId (required).
  --name    registry key / screen slug (required).
  --status  registry status (default: audit-clean).
  --cwd     repo/workspace dir holding design/registry.json (default: cwd).
  --help,-h show this help.`

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    process.exit(0)
  }
  const nodeId = flagValue(args, '--node')
  const name = flagValue(args, '--name')
  const status = flagValue(args, '--status')
  const cwd = flagValue(args, '--cwd') ?? process.cwd()
  if (!nodeId || !name) {
    process.stderr.write('register-screen: --node <nodeId> and --name <slug> are both required\n')
    process.exit(1)
  }
  const registry = readDesignJsonOrRebuild<{ components?: Record<string, any> }>(cwd, 'registry.json', {
    rebuild: () => ({ components: {} })
  })
  const merged = upsertScreenEntry(registry, { nodeId, name, ...(status ? { status } : {}) })
  writeDesignJson(cwd, 'registry.json', merged)
  process.stderr.write(`register-screen: registered "${name}" → ${nodeId} (kind:screen, status:${merged.components[name].status})\n`)
  console.log(JSON.stringify({ name, nodeId, kind: 'screen', status: merged.components[name].status }))
}
