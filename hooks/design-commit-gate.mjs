#!/usr/bin/env node
/**
 * Design commit gate (PreToolUse on Bash, `git commit` only). Applies the
 * red-proof/trust gates' RECEIPT principle to figma-to-code's D22 acceptance
 * gates: a commit touching generated component code may only land with a
 * fresh, passing spec-diff receipt — never an LLM's narration that "the
 * walker passed".
 *
 * SELF-SCOPING, DIFFERENT FROM red-proof/trust: arms whenever
 * `design/config.json` exists — NOT scoped to `.argo/build-mode.json`.
 * figma-to-code can legitimately run outside a gated build, and this
 * deterministic gate must still be mandatory there.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeBlock } from './lib/gate-block.mjs'

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

const block = makeBlock('Design commit gate')

const receiptPath = join(cwd, 'design', 'spec-diff-receipt.json')
if (!existsSync(receiptPath))
  block(`commit touches "${componentsPath}" with no spec-diff receipt — run the spec-diff walker (record-spec-diff-receipt.mjs) first`)

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (typeof receipt.exitCode !== 'number' || receipt.exitCode !== 0)
  block(`spec-diff walker exited non-zero (exitCode ${receipt?.exitCode}) — fix the drift and re-run`)

const age = Date.now() - receipt.recordedAt
if (age > 10 * 60 * 1000) block(`spec-diff receipt timestamp out of range (${Math.round(age / 1000)}s) — re-run required`)

process.exit(0)
