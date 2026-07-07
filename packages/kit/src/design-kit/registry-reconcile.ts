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

import { isWireframePageName } from './tier0-rules.js'

type LiveComponent = { name: string; nodeId: string; pageName?: string }
type RegistryEntry = { name: string; nodeId: string; nodeIdResolves?: boolean }
type Violation = { rule: string; detail: string }

/** Sandbox pages never generate registry-hygiene noise (design doc decision 4). */
export function isScratchPageName(pageName: string): boolean {
  return pageName.startsWith('Scratch')
}

/** A section-separator page: name begins with 2+ dash/box-dash chars ('---', '------', '──── Wireframes ────'). */
export function isDividerPageName(pageName: string): boolean {
  return /^[─-]{2,}/.test(pageName.trim())
}

/**
 * Per-name exclusion of a project's OWN canonical pages (file-structure.md's
 * page order) and divider/sandbox pages. Used as a within-band safety filter
 * by `kitPageNames`, not as the primary kit/not-kit decision (that is
 * positional, see `kitPageNames`).
 */
export function isKitPageName(pageName: string): boolean {
  if (pageName === 'Custom Components' || pageName === 'Foundations' || pageName === 'Screens') return false
  if (isWireframePageName(pageName)) return false // Cover + W\d{2}
  if (/^D\d{2}(\b|\s)/.test(pageName)) return false // D\d{2} hi-fi groups
  if (isScratchPageName(pageName)) return false
  if (isDividerPageName(pageName)) return false
  return true
}

/**
 * Positional kit-page classifier. The shadcn starter groups its reusable
 * primitives in the FIRST divider-delimited band: pages before the first
 * separator are project/doc pages (Cover, Custom Components, Screens); the
 * pages between the first and second separator are the primitives; everything
 * from the second separator onward is the starter's demo sections
 * (Examples/Blocks/Charts) and icon libraries (Lucide/Tabler/... Icons).
 *
 * Returns page INDICES, not names, and MUST be positional: the starter reuses
 * primitive names for demo pages (this file has `Calendar`, `Sidebar`, and
 * `Tooltip` as BOTH a real primitive page AND a later demo page), so a
 * name-keyed result cannot tell the kit-band `Calendar` from the demo-band
 * `Calendar` — both share the string. A name allowlist would separately need
 * the per-file page list this project refuses to carry as config. Fails
 * closed: a file with no divider structure yields no kit pages (better than
 * enumerating every icon-library page as kit, which produced ~14k bogus
 * entries before this fix).
 */
export function kitPageIndices(orderedPageNames: string[]): Set<number> {
  const firstDivider = orderedPageNames.findIndex(isDividerPageName)
  if (firstDivider === -1) return new Set()
  let end = orderedPageNames.length
  for (let i = firstDivider + 1; i < orderedPageNames.length; i++) {
    if (isDividerPageName(orderedPageNames[i])) {
      end = i
      break
    }
  }
  const kit = new Set<number>()
  for (let i = firstDivider + 1; i < end; i++) {
    if (isKitPageName(orderedPageNames[i])) kit.add(i)
  }
  return kit
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
    if (!isPascalCaseComponentName(live.name)) {
      violations.push({
        rule: 'component-name-not-pascal',
        detail: `component "${live.name}" must be PascalCase to match its React component name (e.g. "${toPascalCase(live.name)}")`
      })
    }
  }

  return violations
}

type VariantPropertyDefinition = { type: string; variantOptions?: string[] }

/** Mirrors tier0-rules.ts's variantNamingViolations' read of the same node shape. */
export function extractVariantMatrix(
  componentPropertyDefinitions: Record<string, VariantPropertyDefinition> = {}
): Record<string, string[]> {
  const matrix: Record<string, string[]> = {}
  for (const [propName, def] of Object.entries(componentPropertyDefinitions)) {
    if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) matrix[propName] = def.variantOptions
  }
  return matrix
}

/** Icon components (lucide/*) and demo furniture keep their own naming conventions. */
const PASCAL_EXEMPT_PREFIXES = ['lucide/', 'demo/']

export function isPascalCaseComponentName(name: string): boolean {
  if (PASCAL_EXEMPT_PREFIXES.some((p) => name.startsWith(p))) return true
  return /^[A-Z][A-Za-z0-9]*$/.test(name)
}

type LiveKitComponent = {
  name: string
  nodeId: string
  componentPropertyDefinitions?: Record<string, VariantPropertyDefinition>
  /** Native Figma component description, owner addendum (registry-covers-kit.md). */
  description?: string
}
type LeanKitEntry = {
  nodeId: string
  kind: 'kit'
  status: 'draft'
  lastSyncedAt: string
  variantMatrix: Record<string, string[]>
  description?: string
}

/**
 * Entries for kit components the registry has never seen, never
 * overwrites an EXISTING kit entry's status/lastSyncedAt (that stays the
 * pre-existing decision-8 staleness sweep's job, which already runs
 * file-wide over every registry entry regardless of kind); this only
 * fills the gap for a component with no entry at all. status: 'draft'
 * (never audited, never synced before), figma-create's own upsert is
 * the only writer of 'audit-clean', and only after its own self-audit.
 */
export function buildKitRegistryEntries(
  { liveKitComponents, existingNames }: { liveKitComponents: LiveKitComponent[]; existingNames: Set<string> },
  now: string
): Record<string, LeanKitEntry> {
  const entries: Record<string, LeanKitEntry> = {}
  for (const c of liveKitComponents) {
    if (existingNames.has(c.name)) continue
    if (PASCAL_EXEMPT_PREFIXES.some((p) => c.name.startsWith(p))) continue
    entries[c.name] = {
      nodeId: c.nodeId,
      kind: 'kit',
      status: 'draft',
      lastSyncedAt: now,
      variantMatrix: extractVariantMatrix(c.componentPropertyDefinitions),
      ...(c.description ? { description: c.description } : {})
    }
  }
  return entries
}

function toPascalCase(name: string): string {
  return name
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
