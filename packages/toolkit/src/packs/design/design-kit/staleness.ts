/**
 * Layered staleness detector: file version bump -> variable-defs snapshot
 * diff -> node-tree walk vs registry, flagging orphans. Pure functions only;
 * the calling skill gathers live snapshots via use_figma/REST and passes
 * plain objects in.
 *
 * Per-node `updated_at` (published-library components only) is deliberately
 * not read here — this project's components are local/unpublished, so that
 * REST field is never exposed; building that path now would be speculative.
 */

export function diffVariableDefs(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): { changed: string[] } {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)])
  const changed: string[] = []
  for (const key of keys) {
    if (previous[key] !== current[key]) changed.push(key)
  }
  return { changed }
}

export function classifyNodeDrift({
  registryEntries = [],
  liveNodeIds = []
}: {
  registryEntries?: { nodeId: string }[]
  liveNodeIds?: string[]
}): { orphaned: string[] } {
  const live = new Set(liveNodeIds)
  const orphaned = registryEntries.filter((entry) => !live.has(entry.nodeId)).map((entry) => entry.nodeId)
  return { orphaned }
}

export type StalenessClassification = 'in-sync' | 'presentation-drift' | 'api-drift' | 'orphaned'

/**
 * Whether a per-entry staleness result should DRIVE a sync/re-audit
 * (`actionable`) or is mere noise to report and ignore (`advisory`). Raw
 * (un-adopted) kit is the vendored mirror nothing in the project instances —
 * drift on it (a starter refresh, a stock-kit tweak) must never stamp
 * `out-of-sync` or pull the master into the hard gate. Adopted kit, custom,
 * and code-owned stay actionable. Pure.
 */
export function stalenessActionability(
  entry: { kind?: string; adopted?: boolean },
  classification: StalenessClassification
): 'in-sync' | 'advisory' | 'actionable' {
  if (classification === 'in-sync') return 'in-sync'
  if (isRawUnadoptedKit(entry)) return 'advisory'
  return 'actionable'
}

/**
 * True for a raw (un-adopted) kit registry entry: stock library content
 * nothing in the project instances, the vendored mirror, not an authored
 * surface. Adoption (`adopted: true`, derived by figma-sync's reconcile
 * walk) is the SCOPE filter — only kit that a project surface actually
 * instances is hard-gated. Shared by every raw-kit-advisory scoping site so
 * the predicate can't drift between them.
 */
export function isRawUnadoptedKit(entry: { kind?: string; adopted?: boolean } | null | undefined): boolean {
  return entry?.kind === 'kit' && entry?.adopted !== true
}

export function classifyStaleness({
  fileVersionChanged,
  variableDrift,
  nodeDrift,
  variantShapeChanged
}: {
  fileVersionChanged: boolean
  variableDrift: { changed: string[] }
  nodeDrift: { orphaned: string[] }
  variantShapeChanged: boolean
}): StalenessClassification {
  if (nodeDrift.orphaned.length > 0) return 'orphaned'
  if (variantShapeChanged) return 'api-drift'
  if (fileVersionChanged || variableDrift.changed.length > 0) return 'presentation-drift'
  return 'in-sync'
}
