import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
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
})
