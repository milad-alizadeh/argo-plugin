/**
 * design doc decision 8: layered staleness detector — file version bump ->
 * variable-defs snapshot diff -> node-tree walk vs registry, flagging
 * orphans. Pure functions only; the calling skill gathers live snapshots via
 * use_figma/REST and passes plain objects in (same split as tier0-audit.ts's
 * Plugin-API/pure-function boundary).
 *
 * Per-node `updated_at` (published-library components only) is deliberately
 * not read here — this project's components are local/unpublished, so that
 * REST field is never exposed; building that path now would be speculative
 * (YAGNI until a published-library project exists).
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
