/**
 * Binding manifest: the pre-build decision artifact a designer emits before
 * any composition — one row per screen requirement, mapping requirement to
 * registry component, variant/states, and purpose.
 *
 * Three-tier guardrail, decided mechanically per row:
 *  - `always`    — names an existing registry component with `whenToUse`
 *                  guidance. Proceed.
 *  - `ask-first` — the component exists but has no `whenToUse` to match
 *                  against, so the row BLOCKS until a human confirms
 *                  (`humanApproved`).
 *  - `never`     — names a component absent from the registry (an invented
 *                  name). Always blocks; only a human adds components.
 *
 * Confusable pairs: a committed, hand-authored table of components that get
 * confused for one another. A row whose component sits in a pair must carry
 * an explicit `justification`, or it blocks with the pair's rule text.
 */
import { z } from 'zod'

export const BindingManifestRowSchema = z.object({
  /** PRD requirement id (`<feature>-R1`) or region name this row realizes. */
  requirement: z.string().min(1),
  /** EXACT registry component name — validated against design/registry.json. */
  component: z.string().min(1),
  /** Variant selection, e.g. `state=expanded` — optional. */
  variant: z.string().optional(),
  /** States this instance must show (default/hover/empty/...). */
  states: z.array(z.string()).optional(),
  /** Purpose in ONE clause — why this component realizes this requirement. */
  purpose: z.string().min(1),
  /** Explicit choice justification. Required when the component sits in a confusable pair. */
  justification: z.string().optional(),
  /** Alternate candidates considered for the highest-risk row (optional). */
  alternatesConsidered: z.array(z.string()).optional(),
  /** Set true ONLY after the human answered an Ask-first stop-and-ask. */
  humanApproved: z.boolean().optional()
})

export const BindingManifestSchema = z.object({
  screen: z.string().min(1),
  wave: z.string().optional(),
  rows: z.array(BindingManifestRowSchema).min(1)
})

export const ConfusablePairSchema = z.object({
  components: z.array(z.string().min(1)).min(2),
  rule: z.string().min(1)
})

/** Committed table of components that get confused for one another. */
export const ConfusablePairsSchema = z.object({
  pairs: z.array(ConfusablePairSchema)
})

export type ManifestRowTier = 'always' | 'ask-first' | 'never'

export interface ValidatedManifestRow {
  requirement: string
  component: string
  tier: ManifestRowTier
  /** Confusable-pair rule texts that apply to this row (informational). */
  confusablePairsHit: string[]
  /** Blocking findings — non-empty means this row blocks the build. */
  blocks: string[]
}

export interface ManifestValidationResult {
  blocked: boolean
  schemaErrors: string[]
  rows: ValidatedManifestRow[]
  /** Requirement ids that no manifest row references. Non-empty blocks; empty when `requiredRequirements` was omitted. */
  uncoveredRequirements: string[]
}

function normalizeRequirementRef(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Validates a binding manifest: schema, then component existence, then
 * confusable-pair justification, then tier. Registry/pairs arrive as parsed
 * JSON — callers own the file reads.
 */
export function validateBindingManifest(
  manifest: unknown,
  {
    registry,
    confusablePairs,
    requiredRequirements
  }: {
    registry: any
    confusablePairs?: unknown
    /** Requirements this screen must realize; each must be referenced by a manifest row or it blocks. Omitted disables the check. */
    requiredRequirements?: { id: string }[]
  }
): ManifestValidationResult {
  const parsed = BindingManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    return {
      blocked: true,
      schemaErrors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      rows: [],
      uncoveredRequirements: []
    }
  }

  const pairsParsed = ConfusablePairsSchema.safeParse(confusablePairs)
  const pairs = pairsParsed.success ? pairsParsed.data.pairs : []
  const components =
    registry?.components && typeof registry.components === 'object' ? (registry.components as Record<string, any>) : {}

  const rows: ValidatedManifestRow[] = parsed.data.rows.map((row) => {
    const entry = components[row.component]
    const blocks: string[] = []
    const confusablePairsHit = pairs.filter((p) => p.components.includes(row.component)).map((p) => p.rule)

    let tier: ManifestRowTier
    if (!entry || typeof entry.nodeId !== 'string') {
      tier = 'never'
      blocks.push(
        `"${row.component}" does not exist in design/registry.json — inventing a component name is Never-tier; ` +
          `bind an existing component (argo design registry-lookup) or escalate to the human.`
      )
    } else if (typeof entry.whenToUse === 'string' && entry.whenToUse.trim() !== '') {
      tier = 'always'
    } else {
      tier = 'ask-first'
      if (row.humanApproved !== true) {
        blocks.push(
          `"${row.component}" exists but carries no whenToUse guidance to match against — Ask-first tier: ` +
            `STOP AND ASK the human to confirm this binding before any use_figma composition ` +
            `(record the answer as humanApproved: true on this row).`
        )
      }
    }

    if (tier !== 'never' && confusablePairsHit.length > 0 && !(row.justification && row.justification.trim() !== '')) {
      blocks.push(
        `"${row.component}" sits in a known confusable pair and this row has no explicit justification — ` +
          `STOP AND ASK / justify against the pair rule(s): ${confusablePairsHit.join(' | ')}`
      )
    }

    return { requirement: row.requirement, component: row.component, tier, confusablePairsHit, blocks }
  })

  const rowRefs = parsed.data.rows.map((r) => normalizeRequirementRef(r.requirement))
  const uncoveredRequirements = (requiredRequirements ?? [])
    .filter(({ id }) => {
      const key = normalizeRequirementRef(id)
      return key !== '' && !rowRefs.some((ref) => ref === key || ref.includes(key))
    })
    .map(({ id }) => id)

  return {
    blocked: rows.some((r) => r.blocks.length > 0) || uncoveredRequirements.length > 0,
    schemaErrors: [],
    rows,
    uncoveredRequirements
  }
}
