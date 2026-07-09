/**
 * Binding manifest (design-phase-quality-plan.md W1/W2/W6/W7): the pre-build
 * DECISION artifact a designer emits BEFORE any `use_figma` composition —
 * one row per screen requirement, `requirement → registry component →
 * variant/states → purpose-in-one-clause`. Machine artifact, written to the
 * app's `design/<wave>/binding-manifest.json`; the `validate-manifest`
 * skill-script verb is the independent check ON the decision (W2) that runs
 * before pixels — relocating the component-choice decision upstream is only
 * a win if something checks it there.
 *
 * Three-tier guardrail (W7), decided mechanically per row:
 *  - `always`   — the row names an existing registry component that carries
 *                 `whenToUse` guidance. Proceed.
 *  - `ask-first` — the component exists but has NO `whenToUse` to match
 *                 against: not decidable by lookup, so the row BLOCKS with a
 *                 stop-and-ask until the human confirms (`humanApproved`).
 *  - `never`    — the row names a component absent from `design/registry.json`
 *                 (an invented name). Always blocks; only a human adds
 *                 components to the roster.
 *
 * Confusable pairs (W6): `design/confusable-pairs.json` is a committed,
 * hand-authored table mined from REAL blind-verify rejections (never guessed)
 * — per observed confused pair, one contrastive use-X-not-Y rule. Any manifest
 * row whose component sits in a pair must carry an explicit `justification`
 * naming why this side of the pair is right, or the row blocks with the
 * pair's rule text.
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
  /**
   * Explicit choice justification. REQUIRED when the component sits in a
   * confusable pair (W6); also where the highest-risk row records its top-2
   * candidate comparison (W1's folded #3 core).
   */
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

/** `design/confusable-pairs.json` — committed like registry.json. */
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
}

/**
 * The W2 lint, pure and unit-testable: schema → existence (registry) →
 * confusable-pair justification → W7 tier. Registry/pairs arrive as parsed
 * JSON (the CLI wrapper owns the file reads, mirroring registry-lookup).
 */
export function validateBindingManifest(
  manifest: unknown,
  { registry, confusablePairs }: { registry: any; confusablePairs?: unknown }
): ManifestValidationResult {
  const parsed = BindingManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    return {
      blocked: true,
      schemaErrors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      rows: []
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

  return { blocked: rows.some((r) => r.blocks.length > 0), schemaErrors: [], rows }
}
