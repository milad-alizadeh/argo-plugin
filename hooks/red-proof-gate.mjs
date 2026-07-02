#!/usr/bin/env node
/**
 * Red-proof gate (PreToolUse on Bash, `git commit` only). tdd-guard enforces ORDER
 * (no implementation before a failing test); this gate enforces the RECEIPT — a slice
 * may only land with machine-checkable proof that its test failed before the
 * implementation existed and passes now. It reads exit codes a real test run wrote,
 * never prose (the one gate that worked in the retired build-slices workflow).
 *
 * SELF-SCOPING: entirely inert unless `.argo/build-mode.json` exists in the session
 * cwd — the build-plan skill writes that marker per slice and removes it when the
 * build ends. Normal interactive commits, other projects, other sessions: exit 0,
 * always. Inside a gated build it is fail-closed: malformed marker or receipt → BLOCK.
 *
 * Expects `.argo/red-proof.json` written by the builder after the green run:
 *   { "slice": "<id>", "testFile": "<path>", "redExit": <non-zero>, "greenExit": 0,
 *     "recordedAt": <epoch ms> }
 * The receipt must name the CURRENT slice (from build-mode.json) and be newer than
 * HEAD — so a receipt can never be reused across slices or commits.
 *
 * Exit 0 → allow. Exit 2 → block, reason on stderr.
 *
 * TRUST BOUNDARY: the build-mode marker and the red-proof receipt are
 * SELF-ATTESTED by the gated builder session — nothing here is written by an
 * independent runner. This gate verifies shape, freshness, slice-match, and
 * staged-diff consistency; it catches a sloppy/forgetful agent, not a
 * determined forger. Full provenance would require a runner-written receipt
 * (deliberate non-goal for now).
 *
 * ALIAS SCOPE: commit detection matches the literal `commit` subcommand and the
 * common `ci` alias. Exotic user-defined git aliases are out of scope — builder
 * sessions don't configure aliases; this gate catches sloppiness, not adversaries.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const MAX_CLOCK_SKEW_MS = 30 * 1000 // a receipt dated further ahead than this → BLOCK

function block(reason) {
  process.stderr.write(`Red-proof gate: BLOCKED — ${reason}\n`)
  process.exit(2)
}

/**
 * Resolve the EFFECTIVE git repo dir a commit command targets, so gating follows
 * -C / --git-dir redirection rather than trusting the hook's reported cwd
 * verbatim — otherwise a commit could target a gated worktree from an
 * unguarded cwd (bypass) or blame an unrelated gated cwd for a commit that
 * actually lands elsewhere (false-arm).
 *
 * Precedence: --work-tree wins; else --git-dir's parent (strip trailing
 * /.git); else sequential -C resolution; else the hook's own cwd.
 */
function effectiveRepoDir(command, cwd) {
  const flagValue = (re) => {
    const m = re.exec(command)
    return m ? (m[2] ?? m[3] ?? m[4]) : null
  }

  let dir = cwd
  const cRe = /(?:^|\s)-C\s+("([^"]+)"|'([^']+)'|(\S+))/g
  let m
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

  return dir
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
  process.exit(0) // not enforcing outside a gated build; malformed input here ≠ a build
}

const command = hook?.tool_input?.command
if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\b(commit|ci)\b/.test(command)) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const repoDir = effectiveRepoDir(command, cwd)
const markerPath = join(repoDir, '.argo', 'build-mode.json')
if (!existsSync(markerPath)) process.exit(0) // not a gated build — inert

// From here on: gated build → fail closed.
let mode
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

let proof
try {
  proof = JSON.parse(readFileSync(join(repoDir, '.argo', 'red-proof.json'), 'utf8'))
} catch {
  block(`no red-proof receipt for slice "${mode.slice}" — run the test red, implement, run it green, write .argo/red-proof.json`)
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

// The red test itself must be part of THIS commit — build-plan lands one commit per
// slice, and the slice's red test is always staged alongside its implementation.
let stagedFiles = []
try {
  stagedFiles = execFileSync('git', ['-C', repoDir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
} catch {
  stagedFiles = []
}
if (!stagedFiles.includes(proof.testFile))
  block(`receipt's testFile "${proof.testFile}" is not staged in this commit — the red test must land with its slice`)

process.exit(0)
