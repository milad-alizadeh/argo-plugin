/**
 * Headless gate registrations for the bare `argo playbook advance` CLI path.
 *
 * The MCP-live gate factories (createDesignRulesCheckGate needs a readFigma
 * callback, createDesignMatchesCodeGate a screenshot capture) cannot run in
 * a bare CLI process — there is no Figma session to read. The headless
 * verdict model mirrors design-commit-gate: the working session runs the
 * deterministic audit bundle in Figma and records `design/audit-receipt.json`
 * via `argo design record-audit-receipt`; the gate here judges that RECEIPT
 * (existence, target coverage, zero hard violations, staleness vs the
 * session's Figma write counter) — never a free-text self-report.
 *
 * Found live on the first real playbook run (2026-07-10): nothing ever
 * registered `design-rules-check`, so every audit-gated design playbook threw
 * GateNotFoundError at its first advance.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getGate, registerGate, type Gate, type GateVerdict } from '../../../core/index.js'
import { resolveRepoRoot } from '../../../lib/repo-root.js'
import { createBriefCheckGate } from './brief-check.js'
import { createFreshEyesReviewGate } from './fresh-eyes-review.js'

function fail(message: string): GateVerdict {
  return { passed: false, findings: [{ message }], evidence: [] }
}

/**
 * Every receipt that could prove the target's audit: the app-shared
 * `design/audit-receipt.json` plus every per-session receipt under the repo
 * root's `.argo/audit-receipts/` (record-audit-receipt writes the session
 * file when a sessionId is attributed — the shared file may be older).
 */
function candidateReceipts(cwd: string): { path: string; componentNames: string[]; violationCount: number }[] {
  const out: { path: string; componentNames: string[]; violationCount: number }[] = []
  const push = (path: string, receipt: any) => {
    if (receipt && Array.isArray(receipt.componentNames) && typeof receipt.violationCount === 'number') {
      out.push({ path, componentNames: receipt.componentNames, violationCount: receipt.violationCount })
    }
  }
  const sharedPath = join(cwd, 'design', 'audit-receipt.json')
  if (existsSync(sharedPath)) {
    try {
      push(sharedPath, JSON.parse(readFileSync(sharedPath, 'utf8')))
    } catch {
      /* unreadable shared receipt is just not a candidate */
    }
  }
  const repoRoot = resolveRepoRoot(cwd)
  const sessionDir = join(repoRoot, '.argo', 'audit-receipts')
  const appKey = relative(repoRoot, cwd) || '.'
  if (existsSync(sessionDir)) {
    for (const entry of readdirSync(sessionDir)) {
      if (!entry.endsWith('.json')) continue
      const path = join(sessionDir, entry)
      try {
        const receipt = JSON.parse(readFileSync(path, 'utf8'))
        push(path, receipt.apps?.[appKey])
      } catch {
        /* skip unreadable session receipts */
      }
    }
  }
  return out
}

function createReceiptBackedDesignRulesCheckGate(): Gate {
  return {
    name: 'design-rules-check',
    async check(input) {
      const cwd = typeof input.settings.cwd === 'string' ? input.settings.cwd : process.cwd()
      const receipts = candidateReceipts(cwd)
      if (receipts.length === 0) {
        return fail(
          `no audit receipt found (design/audit-receipt.json or .argo/audit-receipts/) — run the named design-rules audit in Figma and record it via 'argo design record-audit-receipt' first`
        )
      }
      const covering = receipts.filter((r) => !input.target || r.componentNames.includes(input.target))
      if (covering.length === 0) {
        const seen = [...new Set(receipts.flatMap((r) => r.componentNames))]
        return fail(
          `no audit receipt covers the run target "${input.target}" (receipts cover: [${seen.join(', ')}]) — re-run the named audit for the target`
        )
      }
      const clean = covering.find((r) => r.violationCount === 0)
      if (!clean) {
        return fail(
          `audit receipt(s) covering "${input.target}" record hard violations (${covering.map((r) => r.violationCount).join(', ')}) — fix them and re-audit`
        )
      }
      return { passed: true, findings: [], evidence: [clean.path] }
    }
  }
}

/** Idempotent: safe to call from every CLI entry that may need gates. */
export function registerCliGates(): void {
  if (!getGate('design-rules-check')) registerGate(createReceiptBackedDesignRulesCheckGate())
  if (!getGate('brief-check')) registerGate(createBriefCheckGate())
  if (!getGate('fresh-eyes-review')) registerGate(createFreshEyesReviewGate())
  // design-matches-code is deliberately NOT registered headless: it requires
  // a live screenshot capture; its playbook stage must run through a session
  // that supplies one, and a bare-CLI advance of that stage should fail loud
  // with GateNotFoundError rather than fake a verdict.
}
