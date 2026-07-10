/**
 * Instance-presence check: every INSTANCE in a composed screen's tree must
 * resolve to a `design/registry.json` entry — no declared list to author, no
 * fenced list syntax, no cardinality bookkeeping.
 *
 * PURE: no fs/Figma/network. The skill captures the built frame's flat
 * instance inventory via a single live read and feeds it here alongside the
 * registry entries read Node-side.
 */

import { normalizeComponentName } from './component-names.js'

/** A node from the built screen's instance inventory (captured live via `use_figma`). */
export type BuiltInstance = { nodeId: string; name: string; type: string }

/** The subset of a registry entry this check needs to resolve against. */
export type RegistryLookupEntry = { nodeId: string; name: string }

export type PresenceStatus = 'resolved' | 'unresolved'
export type PresenceResult = { nodeId: string; name: string; status: PresenceStatus }

/**
 * For every INSTANCE node in `builtInstances`, resolve by `nodeId` against
 * the registry first (authoritative), falling back to `normalizeComponentName`
 * name match only when the nodeId lookup misses — never the reverse (name-
 * first), since a nodeId collision is impossible and a name collision (two
 * components sharing a normalized name) is not.
 */
export function resolveInstancePresence(
  builtInstances: BuiltInstance[],
  registryEntries: RegistryLookupEntry[]
): PresenceResult[] {
  const byNodeId = new Map(registryEntries.map((entry) => [entry.nodeId, entry]))
  const byName = new Map(registryEntries.map((entry) => [normalizeComponentName(entry.name), entry]))

  return builtInstances
    .filter((node) => node.type === 'INSTANCE')
    .map((node) => {
      const resolved = byNodeId.has(node.nodeId) || byName.has(normalizeComponentName(node.name))
      return { nodeId: node.nodeId, name: node.name, status: resolved ? 'resolved' : 'unresolved' }
    })
}

/**
 * `clean` is false when any instance is `unresolved`. There is no declared
 * list to be missing FROM anymore — an instance either resolves against the
 * registry or it doesn't. (A registry entry no instance resolved to is NOT
 * this check's concern — that's `registry-reconcile`'s `registry-unregistered`
 * job, run at sync time over the whole file, not per-screen.)
 */
export function summarizeInstancePresence(results: PresenceResult[]) {
  const resolved = results.filter((r) => r.status === 'resolved').map((r) => r.name)
  const unresolved = results.filter((r) => r.status === 'unresolved').map((r) => r.name)
  return { resolved, unresolved, clean: unresolved.length === 0 }
}
