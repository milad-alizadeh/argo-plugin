/**
 * `design-rules-check` gate — pack-design's wrap of the existing design-rules
 * rules/audit logic (playbook-engine-phase1.md Slice 9, step 25) behind
 * core's `Gate` interface.
 *
 * Per the design doc, this gate "reads Figma directly, never a
 * working-agent self-report" — the actual Figma read (bundling the design-rules
 * audit script and dispatching it through `use_figma`) is real-MCP-only
 * plumbing not available in this repo/task, so it is accepted as an
 * injected `readFigma` function. Production wiring supplies a real
 * implementation that drives `use_figma`; tests fake it. Either way, the
 * gate — not the working agent — is what calls it, and `GateInput.artifacts`
 * (which a working agent's `produces` can populate) is never consulted for
 * violations.
 *
 * Violation *evaluation* reuses the real, unit-tested predicate from
 * `packages/toolkit/src/recipes/shadcn-tailwind/design-rules.ts`
 * (`nonSemanticBindingViolation` — the shadcn-tailwind recipe's design-rules rule
 * over Figma variable bindings). The gate also calls the real
 * `bundleDesignRulesAuditForRecipe` from `packages/toolkit/src/skill-scripts/
 * bundle-design-rules-audit.ts` to produce the audit bundle + its content-hash
 * receipt — the same receipt the live figma-audit procedure produces — and
 * surfaces that receipt as the verdict's `evidence`, per the test contract
 * ("evidence points at the audit receipt").
 */
import { nonSemanticBindingViolation, TW_COLLECTION_FAMILY } from '../recipes/shadcn-tailwind/design-rules.js'
import { bundleDesignRulesAuditForRecipe } from '../skill-scripts/bundle-design-rules-audit.js'
import type { Finding, Gate, GateInput, GateVerdict } from '../../../core/index.js'

/** Mirrors `design-rules.ts`'s local `Variable` shape — the Figma Plugin API's variable binding, marshaled to a plain object. */
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
  /** Passed through to `bundleDesignRulesAuditForRecipe` — must resolve `@argohq/toolkit` from its own `node_modules`. Defaults to `process.cwd()`. */
  cwd?: string
  /** Recipe key for `bundleDesignRulesAuditForRecipe`'s recipe-specific entry (e.g. `'shadcn-tailwind'`). */
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

      const receipt = bundleDesignRulesAuditForRecipe({ cwd, recipe })

      return {
        passed: findings.length === 0,
        findings,
        evidence: [
          `design-rules-audit-bundle:${receipt.bundlePath}`,
          `design-rules-audit-hash:${receipt.hash}`
        ]
      }
    }
  }
}
