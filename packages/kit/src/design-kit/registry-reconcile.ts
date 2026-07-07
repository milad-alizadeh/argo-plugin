/**
 * design-memory-placement.md A3: the figma-sync registry-reconcile sweep
 * already traverses every top-level COMPONENT/COMPONENT_SET on Custom
 * Components — this diffs that same live list against `registry.json`,
 * catching drift the per-task incremental upsert can't see on its own (a
 * crashed agent that never reached its final upsert, a human rename). Both
 * findings are advisory (never block a commit) and self-correct on the next
 * `figma-create` upsert. The nodeId-heal step ("re-resolve + persist any
 * entry whose nodeId moved") is a live-Figma-only concern (the walker must
 * call `getNodeByIdAsync`/`findAll`) and is documented, not implemented,
 * here — see `skills/figma-sync/SKILL.md`.
 *
 * `category` was dropped from the schema (design-system-reset-overhaul.md
 * Slice 4, decision 4's flat registry) — `registry-miscategorized` had
 * nothing left to compare and is deleted, not softened.
 */

type LiveComponent = { name: string; nodeId: string; pageName?: string }
type RegistryEntry = { name: string; nodeId: string; nodeIdResolves?: boolean }
type Violation = { rule: string; detail: string }

/** Sandbox pages never generate registry-hygiene noise (design doc decision 4). */
export function isScratchPageName(pageName: string): boolean {
  return pageName.startsWith('Scratch')
}

export function reconcileRegistrySweep({
  liveComponents = [],
  registryEntries = []
}: { liveComponents?: LiveComponent[]; registryEntries?: RegistryEntry[] } = {}): Violation[] {
  const violations: Violation[] = []
  const registryByName = new Map(registryEntries.map((e) => [e.name, e]))

  for (const entry of registryEntries) {
    const nodeIdResolves = entry.nodeIdResolves !== false
    if (!nodeIdResolves && !liveComponents.some((c) => c.name === entry.name)) {
      violations.push({
        rule: 'registry-orphan',
        detail: `registry entry "${entry.name}" nodeId no longer resolves and no live component with that name was found`
      })
    }
  }

  for (const live of liveComponents) {
    if (live.pageName && isScratchPageName(live.pageName)) continue
    const entry = registryByName.get(live.name)
    if (!entry) {
      violations.push({ rule: 'registry-unregistered', detail: `live component "${live.name}" has no registry entry` })
    }
  }

  return violations
}
