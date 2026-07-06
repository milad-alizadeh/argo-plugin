import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { recordAuditReceipt } from './record-audit-receipt.js'

describe('recordAuditReceipt', () => {
  it('writes design/audit-receipt.json with the violation count and timestamp', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-receipt-'))
    try {
      const receipt = recordAuditReceipt({ componentNames: ['Button'], violations: [] }, { cwd, now: 123 })
      expect(receipt.violationCount).toBe(0)
      expect(receipt.timestamp).toBe(123)
      const onDisk = JSON.parse(readFileSync(join(cwd, 'design', 'audit-receipt.json'), 'utf8'))
      expect(onDisk).toEqual(receipt)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  // Council ruling Q7 (overnight review, 2026-07-05): the receipt is
  // HARD-only — advisory findings live in the sweep report, never in
  // violationCount, or an advisory-only run blocks the stop gate (the D05
  // red-gate incident: 3 advisory stroke-scale hits ended the night red).
  it('excludes advisory-severity findings from violationCount (hard-only receipt)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-receipt-'))
    try {
      const receipt = recordAuditReceipt(
        {
          componentNames: ['Button'],
          violations: [
            { severity: 'advisory', rule: 'stroke-scale-mismatch', detail: 'x' },
            { severity: 'hard', rule: 'unbound-fill', detail: 'y' }
          ]
        },
        { cwd, now: 123 }
      )
      expect(receipt.violationCount).toBe(1)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('folds an unwaived kit-name-collision into violationCount (kit-awareness)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-receipt-'))
    try {
      mkdirSync(join(cwd, 'design'), { recursive: true })
      writeFileSync(
        join(cwd, 'design', 'kit-inventory.json'),
        JSON.stringify({ components: [{ name: 'Collapsible', aliases: ['accordion'] }] })
      )
      const receipt = recordAuditReceipt({ componentNames: ['Collapsible'], violations: [] }, { cwd, now: 123 })
      expect(receipt.violationCount).toBe(1)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('clears a kit-name-collision when design/waivers.json carries a matching kit-shadow entry', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-receipt-'))
    try {
      mkdirSync(join(cwd, 'design'), { recursive: true })
      writeFileSync(
        join(cwd, 'design', 'kit-inventory.json'),
        JSON.stringify({ components: [{ name: 'Collapsible', aliases: ['accordion'] }] })
      )
      writeFileSync(
        join(cwd, 'design', 'waivers.json'),
        JSON.stringify([{ type: 'kit-shadow', component: 'Collapsible', kitCandidate: 'Collapsible', reason: 'needs a custom trigger icon' }])
      )
      const receipt = recordAuditReceipt({ componentNames: ['Collapsible'], violations: [] }, { cwd, now: 123 })
      expect(receipt.violationCount).toBe(0)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  // figma-audit dogfooding, 2026-07-06 (argo-v2 tier-0 sweep): a monorepo
  // runs this from the app root (e.g. `apps/desktop`, per figma-audit/
  // SKILL.md's documented cwd), but `.argo/design-guard.json` is repo-global
  // and lives at the git toplevel, one or more levels above `cwd`. Reading
  // the guard state relative to the SAME `cwd` used for `design/` silently
  // missed the file, defaulting `writeCounterAtAudit` to 0 — which then
  // could never match the real (non-zero) repo-global write count, leaving
  // design-guard-stop.js permanently blocked. The fix is repo-root-aware.
  it('reads .argo/design-guard.json from the git repo root, not the app-scoped cwd', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'tier0-audit-receipt-monorepo-'))
    try {
      execFileSync('git', ['-C', repoRoot, 'init', '-q'])
      const appRoot = join(repoRoot, 'apps', 'desktop')
      mkdirSync(appRoot, { recursive: true })
      mkdirSync(join(repoRoot, '.argo'), { recursive: true })
      writeFileSync(join(repoRoot, '.argo', 'design-guard.json'), JSON.stringify({ writeCount: 175 }))

      const receipt = recordAuditReceipt({ componentNames: [], violations: [] }, { cwd: appRoot, now: 123 })

      expect(receipt.writeCounterAtAudit).toBe(175)
      const onDisk = JSON.parse(readFileSync(join(appRoot, 'design', 'audit-receipt.json'), 'utf8'))
      expect(onDisk).toEqual(receipt)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
