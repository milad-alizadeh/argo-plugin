#!/usr/bin/env node
/**
 * Shared writer for design-guard's deterministic receipts (extracted from
 * record-audit-receipt.mjs, which already exercises this exact write shape
 * under test): writes a JSON file under the host project's `design/`
 * directory, creating it if needed. Both `recordAuditReceipt` and
 * `recordSpecDiffReceipt` persist their receipts through this one function
 * so there is a single place that owns the `design/<file>` write contract.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function writeDesignJson(cwd, filename, data) {
  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(join(cwd, 'design', filename), JSON.stringify(data, null, 2))
}
