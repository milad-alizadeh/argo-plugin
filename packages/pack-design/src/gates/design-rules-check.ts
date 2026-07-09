/**
 * `design-rules-check` gate — pack-design's wrap of the existing tier0
 * rules/audit logic (workflow-engine-phase1.md Slice 9, step 25) behind
 * core's `Gate` interface.
 *
 * Per the design doc, this gate "reads Figma directly, never a
 * working-agent self-report" — the actual Figma read (bundling the tier0
 * audit script and dispatching it through `use_figma`) is real-MCP-only
 * plumbing not available in this repo/task, so it is accepted as an
 * injected `readFigma` function. Production wiring supplies a real
 * implementation that drives `use_figma`; tests fake it. Either way, the
 * gate — not the working agent — is what calls it, and `GateInput.artifacts`
 * (which a working agent's `produces` can populate) is never consulted for
 * violations.
 *
 * Violation *evaluation* reuses the real, unit-tested predicate from
 * `packages/kit/src/recipes/shadcn-tailwind/tier0-rules.ts`
 * (`nonSemanticBindingViolation` — the shadcn-tailwind recipe's tier-0 rule
 * over Figma variable bindings). The gate also calls the real
 * `bundleTier0AuditForRecipe` from `packages/kit/src/skill-scripts/
 * bundle-tier0-audit.ts` to produce the audit bundle + its content-hash
 * receipt — the same receipt the live figma-audit procedure produces — and
 * surfaces that receipt as the verdict's `evidence`, per the test contract
 * ("evidence points at the audit receipt").
 */
import { nonSemanticBindingViolation, TW_COLLECTION_FAMILY } from '@argohq/kit/design-kit/shadcn-tailwind/tier0-rules'
import { bundleTier0AuditForRecipe } from '@argohq/kit/skill-scripts/bundle-tier0-audit'
import type { Finding, Gate, GateInput, GateVerdict } from '@argohq/core'

/** Mirrors `tier0-rules.ts`'s local `Variable` shape — the Figma Plugin API's variable binding, marshaled to a plain object. */
export interface FigmaVariableBinding {
  remote?: boolean
  key?: string
  collectionName?: string | null
  /** Carried through for findings/debugging; not read by the rule itself. */
  nodeId?: string
  nodeName?: string
}

export interface FigmaAuditReading {
  /** Variable bindings discovered by reading the live Figma file — never a working-agent self-report. */
  bindings: FigmaVariableBinding[]
}

/**
 * The Figma-reading capability, injected. Receives the gate's `GateInput`
 * (target + settings — never `input.artifacts`, which is agent-writable) and
 * returns the bindings found live in Figma.
 */
export type ReadFigmaFn = (input: GateInput) => Promise<FigmaAuditReading>

export interface DesignRulesCheckOptions {
  readFigma: ReadFigmaFn
  /** Passed through to `bundleTier0AuditForRecipe` — must resolve `@argohq/kit` from its own `node_modules`. Defaults to `process.cwd()`. */
  cwd?: string
  /** Recipe key for `bundleTier0AuditForRecipe`'s recipe-specific entry (e.g. `'shadcn-tailwind'`). */
  recipe?: string | null
  semanticCollectionName?: string
  additionalAllowedCollectionNames?: string[]
}

export function createDesignRulesCheckGate(options: DesignRulesCheckOptions): Gate {
  const {
    readFigma,
    cwd = process.cwd(),
    recipe = 'shadcn-tailwind',
    semanticCollectionName = 'Semantic',
    additionalAllowedCollectionNames = TW_COLLECTION_FAMILY
  } = options

  return {
    name: 'design-rules-check',

    async check(input: GateInput): Promise<GateVerdict> {
      const reading = await readFigma(input)

      const findings: Finding[] = []
      for (const binding of reading.bindings) {
        const violation = nonSemanticBindingViolation(binding, semanticCollectionName, additionalAllowedCollectionNames)
        if (violation) {
          findings.push({
            message: `${violation.rule}: ${violation.detail}${binding.nodeName ? ` (${binding.nodeName})` : ''}`,
            detail: { rule: violation.rule, binding }
          })
        }
      }

      const receipt = bundleTier0AuditForRecipe({ cwd, recipe })

      return {
        passed: findings.length === 0,
        findings,
        evidence: [
          `tier0-audit-bundle:${receipt.bundlePath}`,
          `tier0-audit-hash:${receipt.hash}`
        ]
      }
    }
  }
}
