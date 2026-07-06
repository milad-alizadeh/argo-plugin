#!/usr/bin/env node
/**
 * Design contract-freeze gate (PreToolUse on Bash, `git commit` only).
 *
 * Closes the gap the efficiency ruling's C3c freeze lint left open:
 * `lintContractFreeze` was pure, unit-tested, and exposed as
 * `argo design lint-contract-freeze`, but NO hook ever invoked it — so a frozen
 * region-contract could silently drift in the very commit that grades against
 * it (the a63c7cc regression the ruling names), with nothing but the
 * design-screen LLM's discipline to run the lint by hand. The coverage gate
 * reads the contract's `figmaFileVersion` but never compares the region set
 * across versions; that is this gate's job.
 *
 * For every staged `design/contracts/<screen>.json`, it compares HEAD's
 * committed contract (previous) against the staged blob (next) via
 * `lintContractFreeze`: a region-set/field drift with no `figmaFileVersion`
 * bump BLOCKS. A brand-new contract (no HEAD blob) and a drift that DOES bump
 * the version pass — exactly the pure function's contract.
 *
 * SELF-SCOPING like design-commit-gate: inert unless `.claude/argo.json` exists
 * up the tree AND a contract file is actually staged.
 */

import { execFileSync } from 'node:child_process'
import { makeBlock } from './lib/gate-block.js'
import { findArgoJson } from '../config/argo-json.js'
import { lintContractFreeze } from '../design-kit/region-contract.js'

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
if (!found) process.exit(0) // no .claude/argo.json up the tree — inert

let stagedFiles: string[]
try {
  stagedFiles = execFileSync('git', ['-C', found.repoRoot, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
} catch {
  process.exit(0) // not a git repo — nothing staged to gate
}

// Region-contracts live at `<app.root>/design/contracts/<screen>.json`; staged
// paths are repo-root-relative, so a monorepo app's contract is matched too.
const contracts = stagedFiles.filter((f) => /(?:^|\/)design\/contracts\/[^/]+\.json$/.test(f))
if (contracts.length === 0) process.exit(0)

function gitShow(repoRoot: string, ref: string): string | null {
  try {
    return execFileSync('git', ['-C', repoRoot, 'show', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null // no such blob (first freeze, or a staged deletion)
  }
}

const block = makeBlock('Design contract-freeze gate')

for (const path of contracts) {
  const nextRaw = gitShow(found.repoRoot, `:${path}`) // the staged blob — what the commit will land
  if (nextRaw == null) continue // staged deletion, or unreadable — nothing to freeze-check
  let next: any
  try {
    next = JSON.parse(nextRaw)
  } catch {
    continue // malformed staged contract — not this gate's concern (other tooling catches it)
  }

  let previous: any = undefined
  const prevRaw = gitShow(found.repoRoot, `HEAD:${path}`) // previously committed contract, or null on first freeze
  if (prevRaw != null) {
    try {
      previous = JSON.parse(prevRaw)
    } catch {
      previous = undefined // unparseable history — treat as a first freeze rather than crash
    }
  }

  const result = lintContractFreeze(previous, next)
  if (!result.ok)
    block(`${result.reason} — bump figmaFileVersion or revert the region change before committing (${path})`)
}

process.exit(0)
