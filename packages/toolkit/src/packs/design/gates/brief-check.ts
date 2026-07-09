/**
 * `brief-check` gate — structural lint for prose-artifact briefs (screen-create
 * step 29 / screen-edit step 32), per the design doc's "Prose-artifact gates
 * (`plan-check`, `brief-check`) are structural lint ONLY in phase 1: required
 * sections present, every slice/section names its files and test criteria,
 * every referenced path exists in the repo (catches hallucinated plans). No
 * AI quality judge — that's where gate false positives come from; quality is
 * covered upstream by grilling."
 *
 * This is deliberately NOT one of Slice 9's three gates (`design-rules-check`/
 * `fresh-eyes-review`/`design-matches-code`) — it is new, minimal plumbing
 * added here because `screen-create`/`screen-edit` reference it by name and
 * phase 1 has no gate registered under that name yet. Kept intentionally
 * small: markdown heading presence + referenced-path existence, nothing that
 * judges prose quality.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Finding, Gate, GateInput, GateVerdict } from '../../../core/index.js'

export interface BriefCheckOptions {
  /** Required section headings (matched case-insensitively as a markdown heading). Defaults to a minimal brief shape. */
  requiredSections?: string[]
  /** Base directory referenced paths are resolved against. Defaults to `process.cwd()`. */
  cwd?: string
  /** Key into `GateInput.artifacts` holding the brief file's path/URI. Defaults to `'brief'`. */
  artifactKey?: string
}

const DEFAULT_REQUIRED_SECTIONS = ['Purpose', 'Sections', 'Acceptance Criteria']

/** Extracts inline-code-quoted, file-path-shaped tokens (e.g. `` `src/foo.ts` ``) from brief prose — the "every referenced path exists" check. */
function extractReferencedPaths(content: string): string[] {
  const matches = content.matchAll(/`([\w./-]+\.[A-Za-z0-9]+)`/g)
  return [...matches].map((m) => m[1])
}

export function createBriefCheckGate(options: BriefCheckOptions = {}): Gate {
  const { requiredSections = DEFAULT_REQUIRED_SECTIONS, cwd = process.cwd(), artifactKey = 'brief' } = options

  return {
    name: 'brief-check',

    async check(input: GateInput): Promise<GateVerdict> {
      const briefPath = input.artifacts[artifactKey]
      if (!briefPath) {
        return {
          passed: false,
          findings: [{ message: `brief-check: no "${artifactKey}" artifact produced` }],
          evidence: []
        }
      }

      const absPath = resolve(cwd, briefPath)
      if (!existsSync(absPath)) {
        return {
          passed: false,
          findings: [{ message: `brief-check: brief file not found at ${briefPath}`, detail: { briefPath } }],
          evidence: []
        }
      }

      const content = readFileSync(absPath, 'utf8')
      const findings: Finding[] = []

      for (const section of requiredSections) {
        const heading = new RegExp(`^#{1,6}\\s+${section}\\s*$`, 'im')
        if (!heading.test(content)) {
          findings.push({ message: `brief-check: missing required section "${section}"`, detail: { section } })
        }
      }

      for (const refPath of extractReferencedPaths(content)) {
        if (!existsSync(resolve(cwd, refPath))) {
          findings.push({ message: `brief-check: referenced path does not exist: ${refPath}`, detail: { refPath } })
        }
      }

      return {
        passed: findings.length === 0,
        findings,
        evidence: [`brief:${absPath}`]
      }
    }
  }
}
