/**
 * `design-rules-check` gate — wraps the existing design-rules audit logic
 * behind core's `Gate` interface. Reads Figma directly via an injected
 * `readFigma` (real-MCP-only plumbing, faked in tests); `GateInput.artifacts`
 * is agent-writable and is never consulted for violations.
 */
import { nonSemanticBindingViolation, TW_COLLECTION_FAMILY } from '../recipes/shadcn-tailwind/design-rules.js'
import { bundleDesignRulesAuditForRecipe } from '../skill-scripts/audit/bundle-design-rules-audit.js'
import type { Finding, Gate, GateInput, GateVerdict } from '../../../core/index.js'

/** The Figma Plugin API's variable binding, marshaled to a plain object. */
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
  /** Must resolve `@argohq/toolkit` from its own `node_modules`. Defaults to `process.cwd()`. */
  cwd?: string
  /** Recipe-specific entry key (e.g. `'shadcn-tailwind'`). */
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
