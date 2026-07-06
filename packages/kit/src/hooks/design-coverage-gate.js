#!/usr/bin/env node
/**
 * Design coverage gate (PreToolUse on Bash, `git commit` only). The P5 half
 * of build-design-workflow.md's completeness gate: a commit touching a
 * screen's built component code may only land with a fresh, clean,
 * non-compose, screen-matched `design/coverage-receipt-<screen>.json` —
 * never an LLM's narration that "the region diff came back clean", and
 * never a stale receipt from a DIFFERENT screen (C2 fix — the ruling's top
 * silent-failure risk was a clean receipt from screen N passing the gate
 * for screen N+1). Mirrors design-commit-gate.js's receipt-gate shape
 * exactly; this is the coverage half, not the spec-diff half.
 *
 * SELF-SCOPING: arms whenever `design/config.json` exists — same contract
 * as design-commit-gate.js, independent of `.argo/build-mode.json`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeBlock } from './lib/gate-block.js'

/**
 * The gate's decision logic — moved to the kit module (region-contract.js)
 * so it lives alongside `screenMatchesReceipt` (C2's screen cross-check) and
 * `deriveExpectedScreensFromStagedFiles`, and is unit-tested there, off-
 * Figma; re-exported here unchanged so this file's own export surface
 * doesn't move.
 */
export {
  evaluateCoverageReceipt,
  coverageReceiptFilename,
  deriveExpectedScreensFromStagedFiles
} from '../design-kit/region-contract.js'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { evaluateCoverageReceipt, coverageReceiptFilename, deriveExpectedScreensFromStagedFiles } = await import(
    '../design-kit/region-contract.js'
  )

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

  const [expectedScreen] = deriveExpectedScreensFromStagedFiles(stagedFiles)
  const receiptPath = join(cwd, 'design', coverageReceiptFilename(expectedScreen ?? ''))
  if (!expectedScreen || !existsSync(receiptPath))
    block('commit touches built component code with no matching per-screen coverage receipt — run record-coverage-receipt.mjs first')

  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const contractPath = join(cwd, 'design', 'contracts', `${receipt.screen}.json`)
  const contractFigmaFileVersion = existsSync(contractPath)
    ? JSON.parse(readFileSync(contractPath, 'utf8'))?.figmaFileVersion
    : undefined

  const decision = evaluateCoverageReceipt(receipt, { expectedScreen, contractFigmaFileVersion })
  if (!decision.ok) block(decision.reason)

  process.exit(0)
}
