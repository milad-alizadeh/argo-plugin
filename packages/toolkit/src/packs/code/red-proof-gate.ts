#!/usr/bin/env node
/**
 * Enforces the RECEIPT, not order: a slice lands only with machine-checkable proof
 * (exit codes) its test failed then passed. Inert unless armed; fail-closed once armed.
 * Self-attested by the builder session, not an independent runner — catches sloppiness,
 * not a determined forger. Alias scope: matches `commit`/`ci` only.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildModePath, redProofPath } from '../../config/argo-paths.js'

const MAX_CLOCK_SKEW_MS = 30 * 1000 // a receipt dated further ahead than this → BLOCK

function block(reason: string): never {
  process.stderr.write(`Red-proof gate: BLOCKED — ${reason}\n`)
  process.exit(2)
}

/** Resolve the effective repo dir via -C/--git-dir/--work-tree, not raw cwd, so a redirected commit can't dodge the gate. */
function effectiveRepoDir(command: string, cwd: string): string {
  const flagValue = (re: RegExp) => {
    const m = re.exec(command)
    return m ? (m[2] ?? m[3] ?? m[4]) : null
  }

  let dir = cwd
  const cRe = /(?:^|\s)-C\s+("([^"]+)"|'([^']+)'|(\S+))/g
  let m: RegExpExecArray | null
  while ((m = cRe.exec(command))) {
    dir = resolve(dir, m[2] ?? m[3] ?? m[4])
  }

  const workTree = flagValue(/--work-tree(?:=|\s+)("([^"]+)"|'([^']+)'|(\S+))/)
  if (workTree) return resolve(dir, workTree)

  const gitDir = flagValue(/--git-dir(?:=|\s+)("([^"]+)"|'([^']+)'|(\S+))/)
  if (gitDir) {
    const resolved = resolve(dir, gitDir)
    return resolved.endsWith(`${sep}.git`) ? resolved.slice(0, -`${sep}.git`.length) : resolved
  }

  // Ascend to the repo toplevel: the marker lives at the root, but the hook's
  // cwd is wherever the shell sits — a commit from a subdirectory of an armed
  // repo must not slip past the gate.
  try {
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim()
    if (top) return top
  } catch {
    /* not a git repo — keep dir; the gate stays keyed to cwd */
  }
  return dir
}

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
  process.exit(0) // not enforcing outside a gated build; malformed input here ≠ a build
}

const command = hook?.tool_input?.command
if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\b(commit|ci)\b/.test(command)) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const repoDir = effectiveRepoDir(command, cwd)
const markerPath = buildModePath(repoDir)
if (!existsSync(markerPath)) process.exit(0) // not a gated build — inert

// From here on: gated build → fail closed.
let mode: any
try {
  mode = JSON.parse(readFileSync(markerPath, 'utf8'))
} catch {
  block('build-mode.json is unreadable/malformed (default-deny inside a gated build)')
}
if (typeof mode?.slice !== 'string' || mode.slice.length === 0)
  block('build-mode.json has no current slice id')

// Non-behavioral slice (tokens/config/pure styling): plan marked it testable:false —
// no red-green demanded, the commit may land on verify alone.
if (mode.testable === false) process.exit(0)

let proof: any
try {
  proof = JSON.parse(readFileSync(redProofPath(repoDir), 'utf8'))
} catch {
  block(`no red-proof receipt for slice "${mode.slice}" — run the test red, implement, run it green, write .argo/evidence/red-proof.json`)
}

if (proof?.slice !== mode.slice)
  block(`receipt is for slice "${proof?.slice}", current slice is "${mode.slice}" — stale receipt, re-prove`)
if (typeof proof.testFile !== 'string' || !existsSync(join(repoDir, proof.testFile)))
  block(`receipt's testFile "${proof?.testFile}" does not exist`)
if (typeof proof.redExit !== 'number' || proof.redExit === 0)
  block(`redExit must be a non-zero exit code (got ${proof?.redExit}) — the test never failed first`)
if (proof.greenExit !== 0)
  block(`greenExit must be 0 (got ${proof?.greenExit}) — the test does not pass`)
if (typeof proof.recordedAt !== 'number') block('receipt has no recordedAt timestamp')
// A receipt dated too far in the future (beyond a small clock-skew allowance) is
// never legitimate — reject it rather than let it justify commits indefinitely.
if (proof.recordedAt - Date.now() > MAX_CLOCK_SKEW_MS)
  block(`receipt is dated in the future (recordedAt ${new Date(proof.recordedAt).toISOString()}) — clock skew or a forged timestamp`)

// Receipt must postdate HEAD — otherwise it already justified an earlier commit.
let headTime = 0
try {
  headTime =
    parseInt(execFileSync('git', ['-C', repoDir, 'log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim(), 10) *
    1000
} catch {
  headTime = 0 // no commits yet — nothing to postdate
}
if (proof.recordedAt <= headTime)
  block('receipt predates HEAD — it already landed a commit; re-prove for this slice')

// The red test must be staged in THIS commit. PreToolUse fires before the command
// runs, so a compound `git add … && git commit` hasn't staged anything yet at check
// time — accept the testFile if the command's own text stages it.
let stagedFiles: string[] = []
try {
  stagedFiles = execFileSync('git', ['-C', repoDir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
} catch {
  stagedFiles = []
}
// The add only counts when `&&`-chained ahead of the commit in the same statement —
// a `;`-separated or `||`-joined mention is text, not execution.
const stagesInAddSegment = (seg: string) =>
  /\bgit\b[^\n]*\badd\b/.test(seg) &&
  (seg.includes(proof.testFile) || /\badd\b\s+(-A\b|--all\b|\.(\s|$))/.test(seg))
const commandStagesTestFile = command.split(/[;\n]+/).some((statement: string) => {
  const commitIdx = statement.search(/\bgit\b[^\n;|&]*\b(commit|ci)\b/)
  if (commitIdx === -1) return false
  const before = statement.slice(0, commitIdx)
  if (/\|\|/.test(before)) return false // || between add and commit: commit runs on FAILURE
  const segments = before.split(/&&/)
  return segments.some(stagesInAddSegment)
})
if (!stagedFiles.includes(proof.testFile) && !commandStagesTestFile)
  block(`receipt's testFile "${proof.testFile}" is not staged in this commit — the red test must land with its slice (stage it first, or stage it in the same command: git add <testFile> && git commit)`)

process.exit(0)
