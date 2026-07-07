/**
 * P4a instance-presence pre-check (design-process-simplification.md, 2026-07-07):
 * the cheap deterministic completeness catch that replaced the retired
 * region-coverage gate WITHOUT a frozen contract. It answers one question, for
 * free, before any LLM spend: did the builder actually build the components it
 * DECLARED for this screen as real, non-hollow instances?
 *
 * The declared list is the `argo-screen` manifest block the builder writes into
 * the screen frame's Dev Mode annotation (the human-visible "which components"
 * note — Figma's own best practice for design intent). Reading it
 * DETERMINISTICALLY to grade the builder is legitimate: the LLM-circularity ban
 * (a checker grading the plan against itself) is on the P4b advisory pass, not
 * on a structural presence check. P4a is ADVISORY-LOUD — it fails loud so the
 * agent fixes or the human overrides at the ship call; it is NOT wired into any
 * commit/stop hook (tier-0 stays the ONE hard gate).
 *
 * PURE: no fs/Figma/network. The skill captures the annotation text + the built
 * frame's instance inventory via `use_figma` and feeds both here.
 */

import { normalizeComponentName } from './kit-inventory.js'

/** One declared line: a registry component key, optional `xN` cardinality. */
export type ManifestEntry = { name: string; count?: number }

/**
 * A node from the built screen's instance inventory (captured live via
 * `use_figma`). `componentName` is the resolved main-component name for an
 * INSTANCE; `childCount` distinguishes a populated instance from an empty shell.
 */
export type BuiltNode = { name: string; type: string; componentName?: string; childCount?: number }

export type PresenceStatus = 'present' | 'MISSING' | 'HOLLOW' | 'UNREGISTERED' | 'skipped'
export type PresenceResult = {
  name: string
  declaredCount?: number
  builtCount: number
  status: PresenceStatus
  warning?: string
}

const FENCE = /```argo-screen\s*\n([\s\S]*?)```/i

/**
 * Extracts the `argo-screen` fenced block from an annotation's labelMarkdown
 * (or several joined) and parses each line into a `{ name, count }` entry.
 * Comment lines (`#…`) and blanks are skipped. A trailing `xN` token sets
 * cardinality (`x0` = deliberately absent — e.g. an empty rail with zero
 * session cards). Returns `[]` when no block is present (an un-annotated screen
 * simply has nothing to check — P4a is advisory, never a fail-closed gate).
 */
export function parseScreenManifest(annotationText: string | null | undefined): ManifestEntry[] {
  if (!annotationText) return []
  const block = FENCE.exec(annotationText)
  if (!block) return []
  const entries: ManifestEntry[] = []
  for (const raw of block[1].split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const tokens = line.split(/\s+/)
    const name = tokens[0]
    const countToken = tokens.slice(1).find((t) => /^x\d+$/i.test(t))
    const entry: ManifestEntry = { name }
    if (countToken) entry.count = Number(countToken.slice(1))
    entries.push(entry)
  }
  return entries
}

/**
 * Classifies each declared component against the built frame's instances:
 * - `present`   — ≥1 populated INSTANCE resolves to the declared component.
 * - `MISSING`   — no instance and no traced look-alike frame.
 * - `HOLLOW`    — no populated instance, but a same-named node exists that is
 *                 either a traced non-instance frame (the anti-recreation smell
 *                 this check exists for) or an empty instance shell.
 * - `UNREGISTERED` — the declared name is not in `registry.json` (typo or an
 *                 unbuilt master). Only flagged when a non-empty registry is
 *                 supplied; an empty/absent registry fails open (skipped-name).
 * - `skipped`   — declared `x0` (deliberately absent); presence not required.
 *
 * Cardinality is advisory: a shortfall (declared `x3`, built 2) stays `present`
 * with a `warning`, never a failure (presence-only, per the settled design).
 */
export function classifyInstancePresence(
  manifest: ManifestEntry[],
  built: BuiltNode[] = [],
  registryNames: string[] = []
): PresenceResult[] {
  const registrySet = new Set(registryNames.map(normalizeComponentName))
  const hasRegistry = registrySet.size > 0

  const populatedInstances = new Map<string, number>()
  const tracedFrames = new Set<string>()
  for (const node of built) {
    const resolved = normalizeComponentName(node.componentName ?? node.name)
    if (node.type === 'INSTANCE' && (node.childCount ?? 0) > 0) {
      populatedInstances.set(resolved, (populatedInstances.get(resolved) ?? 0) + 1)
    } else {
      tracedFrames.add(normalizeComponentName(node.name))
    }
  }

  return manifest.map((entry) => {
    const declared = normalizeComponentName(entry.name)
    const builtCount = populatedInstances.get(declared) ?? 0

    if (hasRegistry && !registrySet.has(declared)) {
      return { name: entry.name, declaredCount: entry.count, builtCount, status: 'UNREGISTERED' }
    }

    if (entry.count === 0) {
      const result: PresenceResult = { name: entry.name, declaredCount: 0, builtCount, status: 'skipped' }
      if (builtCount > 0) result.warning = `declared x0 (absent) but ${builtCount} instance(s) present`
      return result
    }

    if (builtCount > 0) {
      const result: PresenceResult = { name: entry.name, declaredCount: entry.count, builtCount, status: 'present' }
      if (typeof entry.count === 'number' && builtCount < entry.count) {
        result.warning = `cardinality ${builtCount} built, expected ${entry.count}`
      }
      return result
    }

    const status: PresenceStatus = tracedFrames.has(declared) ? 'HOLLOW' : 'MISSING'
    return { name: entry.name, declaredCount: entry.count, builtCount, status }
  })
}

/**
 * Groups a classification into the advisory report. `clean` is false when any
 * declared component is MISSING, HOLLOW, or UNREGISTERED — the agent must fix
 * or the human must consciously override at ship. `skipped`/`present` (incl.
 * cardinality warnings) never affect `clean`.
 */
export function summarizeInstancePresence(results: PresenceResult[]) {
  const byStatus = (status: PresenceStatus) => results.filter((r) => r.status === status).map((r) => r.name)
  const MISSING = byStatus('MISSING')
  const HOLLOW = byStatus('HOLLOW')
  const UNREGISTERED = byStatus('UNREGISTERED')
  const warnings = results.filter((r) => r.warning).map((r) => ({ name: r.name, warning: r.warning as string }))
  return {
    present: byStatus('present'),
    skipped: byStatus('skipped'),
    MISSING,
    HOLLOW,
    UNREGISTERED,
    warnings,
    clean: MISSING.length === 0 && HOLLOW.length === 0 && UNREGISTERED.length === 0
  }
}
