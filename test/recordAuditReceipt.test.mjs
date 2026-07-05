import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordAuditReceipt } from '../scripts/record-audit-receipt.mjs'

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
})
