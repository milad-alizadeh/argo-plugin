#!/usr/bin/env node
/**
 * Design-guard record (PostToolUse on the Figma `use_figma` write tool).
 *
 * SELF-SCOPING: entirely inert unless `design/config.json` exists at the
 * session's git toplevel (the design pack marker, same contract session-
 * context.mjs's designSetupNudge already uses) — unlike the build-mode gates,
 * this is NOT scoped to `.argo/build-mode.json`: a Figma write matters
 * whether or not a gated build is running, so it arms in every session type
 * a design pack is installed in.
 *
 * Detects write-shaped calls cheaply: presence of the `use_figma` tool call
 * at all is enough (false positives on read-only scripts are acceptable —
 * the receipt requirement below is idempotent, a clean re-audit costs
 * nothing). Records a monotonically increasing write counter in
 * `.argo/design-guard.json`, and injects additionalContext reminding that a
 * clean tier-0 audit receipt is now owed for the touched components.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const FIGMA_WRITE_TOOL = 'mcp__plugin_figma_figma__use_figma'

function resolveRepoRoot(cwd) {
  try {
    const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    if (top) return top
  } catch {
    /* not a git repo — fall back to cwd */
  }
  return cwd
}

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
  process.exit(0) // malformed stdin — inert
}

if (hook?.hook_event_name !== 'PostToolUse' || hook?.tool_name !== FIGMA_WRITE_TOOL) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const repoRoot = resolveRepoRoot(cwd)
const designConfigPath = join(repoRoot, 'design', 'config.json')
if (!existsSync(designConfigPath)) process.exit(0) // design pack not installed — inert

const statePath = join(repoRoot, '.argo', 'design-guard.json')
let state = { writeCount: 0 }
if (existsSync(statePath)) {
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    state = { writeCount: 0 } // corrupt state — recover rather than crash
  }
}

const writeCount = (typeof state.writeCount === 'number' ? state.writeCount : 0) + 1
mkdirSync(join(repoRoot, '.argo'), { recursive: true })
writeFileSync(statePath, JSON.stringify({ writeCount, lastWriteAt: Date.now() }))

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        'Design guard: a Figma write just happened. A clean tier-0 audit receipt ' +
        '(design/audit-receipt.json, violationCount 0, matching this write count) is now owed ' +
        'for the touched components before this work can be declared done — run /argo:figma-audit.'
    }
  })
)
process.exit(0)
