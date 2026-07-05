#!/usr/bin/env node
/**
 * Design coverage gate (PreToolUse on Bash, `git commit` only). The P5 half
 * of build-design-workflow.md's completeness gate: a commit touching a
 * screen's built component code may only land with a fresh, clean,
 * non-compose `design/coverage-receipt.json` — never an LLM's narration
 * that "the region diff came back clean". Mirrors design-commit-gate.mjs's
 * receipt-gate shape exactly; this is the coverage half, not the spec-diff
 * half.
 *
 * SELF-SCOPING: arms whenever `design/config.json` exists — same contract
 * as design-commit-gate.mjs, independent of `.argo/build-mode.json`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeBlock } from './lib/gate-block.mjs'

const STALE_MS = 10 * 60 * 1000

/**
 * The gate's decision logic, factored out so it's unit-testable without
 * spawning the hook or touching a filesystem. `contractFigmaFileVersion` is
 * the frozen contract's own stamp (`design/contracts/<screen>.json`) — a
 * receipt whose `figmaFileVersion` disagrees is stale against its own
 * source, even if it was recorded seconds ago.
 * @param {{screen?: string, producedBy?: string, figmaFileVersion?: string, timestamp?: number, clean?: boolean}} receipt
 * @param {{contractFigmaFileVersion?: string, now?: number}} [options]
 */
export function evaluateCoverageReceipt(receipt, { contractFigmaFileVersion, now = Date.now() } = {}) {
  if (!receipt) return { ok: false, reason: 'no coverage receipt found' }
  if (receipt.producedBy === 'compose') {
    return { ok: false, reason: 'coverage receipt was produced by "compose" — P4\'s self-check is advisory-only, never the receipt of record' }
  }
  if (!receipt.clean) {
    return { ok: false, reason: 'coverage receipt is not clean (UNACCOUNTED or MISSING regions present)' }
  }
  if (contractFigmaFileVersion !== undefined && receipt.figmaFileVersion !== contractFigmaFileVersion) {
    return {
      ok: false,
      reason: `coverage receipt figmaFileVersion "${receipt.figmaFileVersion}" does not match the contract's "${contractFigmaFileVersion}" — stale, re-run required`
    }
  }
  const age = now - receipt.timestamp
  if (typeof receipt.timestamp !== 'number' || age > STALE_MS) {
    return { ok: false, reason: `coverage receipt timestamp out of range (${Math.round(age / 1000)}s) — re-run required` }
  }
  return { ok: true }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = await readStdin().catch(() => '')
  let hook
  try {
    hook = JSON.parse(raw)
  } catch {
    process.exit(0)
  }

  const command = hook?.tool_input?.command
  if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\b(commit|ci)\b/.test(command)) process.exit(0)

  const cwd = hook?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

  const designConfigPath = join(cwd, 'design', 'config.json')
  if (!existsSync(designConfigPath)) process.exit(0) // no design pack — inert

  const config = JSON.parse(readFileSync(designConfigPath, 'utf8'))
  const componentsPath = config?.componentsPath

  const stagedFiles = execFileSync('git', ['-C', cwd, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  const prefix = componentsPath.endsWith('/') ? componentsPath : `${componentsPath}/`
  const touchesComponents = stagedFiles.some((f) => f === componentsPath || f.startsWith(prefix))
  if (!touchesComponents) process.exit(0)

  const block = makeBlock('Design coverage gate')

  const receiptPath = join(cwd, 'design', 'coverage-receipt.json')
  if (!existsSync(receiptPath))
    block('commit touches built component code with no coverage receipt — run record-coverage-receipt.mjs first')

  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const contractPath = join(cwd, 'design', 'contracts', `${receipt.screen}.json`)
  const contractFigmaFileVersion = existsSync(contractPath)
    ? JSON.parse(readFileSync(contractPath, 'utf8'))?.figmaFileVersion
    : undefined

  const decision = evaluateCoverageReceipt(receipt, { contractFigmaFileVersion })
  if (!decision.ok) block(decision.reason)

  process.exit(0)
}
