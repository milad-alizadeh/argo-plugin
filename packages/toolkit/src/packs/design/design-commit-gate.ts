#!/usr/bin/env node
/**
 * Design commit gate (PreToolUse on Bash, `git commit` only). Applies the
 * red-proof/trust gates' RECEIPT principle to figma-to-code's D22 acceptance
 * gates: a commit touching generated component code may only land with a
 * fresh, passing spec-diff receipt — never an LLM's narration that "the
 * walker passed".
 *
 * SELF-SCOPING, DIFFERENT FROM red-proof/trust: arms per-app from
 * `.argo/config.json`'s `design.<app>` blocks (decision 8's dual-mode
 * resolution — the old `design/config.json`-presence arming silently
 * no-oped per-app in monorepos), NOT scoped to `.argo/evidence/build-mode.json`.
 * figma-to-code can legitimately run outside a gated build, and this
 * deterministic gate must still be mandatory there.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeBlock } from '../../lib/hook-lib/gate-block.js'
import { findArgoJson, armedDesignApps, codeOwnedCodePaths, gatedComponentFiles } from '../../config/argo-json.js'
import { workingTreeDriftDigest } from './skill-scripts/session-guard/record-spec-diff-receipt.js'

function readStdin(): Promise<string> {
  return new Promise((resolvePromise) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolvePromise(data))
  })
}

const raw = await readStdin().catch(() => '')
let hook: any
try {
  hook = JSON.parse(raw)
} catch {
  process.exit(0)
}

const command = hook?.tool_input?.command
if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\b(commit|ci)\b/.test(command)) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const found = findArgoJson(cwd)
if (!found) process.exit(0) // no .argo/config.json up the tree — inert

let stagedFiles: string[]
try {
  stagedFiles = execFileSync('git', ['-C', found.repoRoot, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
} catch {
  process.exit(0) // not a git repo — nothing staged to gate
}

const armed = armedDesignApps(found, stagedFiles)
if (armed.length === 0) process.exit(0)

const block = makeBlock('Design commit gate')

for (const app of armed) {
  // Code-owned component files (a Three.js scene, a live terminal — Figma holds
  // only a screenshot) have no spec to diff against, so they never owe a
  // spec-diff receipt, mirroring the design-rules and figma-to-code exemptions. A
  // commit touching ONLY code-owned component files under this app's
  // componentsPath is not gated.
  let registry: unknown
  try {
    registry = JSON.parse(readFileSync(join(app.designDir, 'registry.json'), 'utf8'))
  } catch {
    registry = undefined
  }
  if (gatedComponentFiles(app, codeOwnedCodePaths(registry)).length === 0) continue

  const receiptPath = join(app.designDir, 'spec-diff-receipt.json')
  if (!existsSync(receiptPath))
    block(`commit touches "${app.appKey}"'s "${app.block.componentsPath}" with no spec-diff receipt — run the spec-diff walker (argo design record-spec-diff-receipt) first`)

  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  if (typeof receipt.exitCode !== 'number' || receipt.exitCode !== 0)
    block(`spec-diff walker exited non-zero (exitCode ${receipt?.exitCode}) — fix the drift and re-run`)

  const age = Date.now() - receipt.recordedAt
  if (age > 10 * 60 * 1000) block(`spec-diff receipt timestamp out of range (${Math.round(age / 1000)}s) — re-run required`)

  // Freshness-by-timestamp alone lets a stale-but-timely receipt be reused
  // after further edits (record the receipt, edit more, commit within the
  // 10-minute window). Binding to the repo's total drift-from-HEAD digest
  // (computed identically by record-spec-diff-receipt) catches any content
  // change since the walker actually ran, staged or not.
  const currentDigest = workingTreeDriftDigest(dirname(app.designDir))
  if (receipt.stagedDigest !== currentDigest)
    block('staged diff has changed since the spec-diff receipt was recorded — re-run the walker (argo design record-spec-diff-receipt)')
}

process.exit(0)
