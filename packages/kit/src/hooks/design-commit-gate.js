#!/usr/bin/env node
/**
 * Design commit gate (PreToolUse on Bash, `git commit` only). Applies the
 * red-proof/trust gates' RECEIPT principle to figma-to-code's D22 acceptance
 * gates: a commit touching generated component code may only land with a
 * fresh, passing spec-diff receipt — never an LLM's narration that "the
 * walker passed".
 *
 * SELF-SCOPING, DIFFERENT FROM red-proof/trust: arms per-app from
 * `.claude/argo.json`'s `design.<app>` blocks (decision 8's dual-mode
 * resolution — the old `design/config.json`-presence arming silently
 * no-oped per-app in monorepos), NOT scoped to `.argo/build-mode.json`.
 * figma-to-code can legitimately run outside a gated build, and this
 * deterministic gate must still be mandatory there.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeBlock } from './lib/gate-block.js'
import { findArgoJson, armedDesignApps } from '../config/argo-json.js'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
  })
}

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

const found = findArgoJson(cwd)
if (!found) process.exit(0) // no .claude/argo.json up the tree — inert

let stagedFiles
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
  const receiptPath = join(app.designDir, 'spec-diff-receipt.json')
  if (!existsSync(receiptPath))
    block(`commit touches "${app.appKey}"'s "${app.block.componentsPath}" with no spec-diff receipt — run the spec-diff walker (argo design record-spec-diff-receipt) first`)

  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  if (typeof receipt.exitCode !== 'number' || receipt.exitCode !== 0)
    block(`spec-diff walker exited non-zero (exitCode ${receipt?.exitCode}) — fix the drift and re-run`)

  const age = Date.now() - receipt.recordedAt
  if (age > 10 * 60 * 1000) block(`spec-diff receipt timestamp out of range (${Math.round(age / 1000)}s) — re-run required`)
}

process.exit(0)
