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
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

function block(reason) {
  process.stderr.write(`Red-proof gate: BLOCKED — ${reason}\n`)
  process.exit(2)
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
if (typeof command !== 'string' || !/\bgit\b[^\n;|&]*\bcommit\b/.test(command)) process.exit(0)

const cwd = hook?.cwd
if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0)

const markerPath = join(cwd, '.argo', 'build-mode.json')
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
  proof = JSON.parse(readFileSync(join(cwd, '.argo', 'red-proof.json'), 'utf8'))
} catch {
  block(`no red-proof receipt for slice "${mode.slice}" — run the test red, implement, run it green, write .argo/red-proof.json`)
}

if (proof?.slice !== mode.slice)
  block(`receipt is for slice "${proof?.slice}", current slice is "${mode.slice}" — stale receipt, re-prove`)
if (typeof proof.testFile !== 'string' || !existsSync(join(cwd, proof.testFile)))
  block(`receipt's testFile "${proof?.testFile}" does not exist`)
if (typeof proof.redExit !== 'number' || proof.redExit === 0)
  block(`redExit must be a non-zero exit code (got ${proof?.redExit}) — the test never failed first`)
if (proof.greenExit !== 0)
  block(`greenExit must be 0 (got ${proof?.greenExit}) — the test does not pass`)
if (typeof proof.recordedAt !== 'number') block('receipt has no recordedAt timestamp')

// Receipt must postdate HEAD — otherwise it already justified an earlier commit.
let headTime = 0
try {
  headTime =
    parseInt(execFileSync('git', ['-C', cwd, 'log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim(), 10) * 1000
} catch {
  headTime = 0 // no commits yet — nothing to postdate
}
if (proof.recordedAt <= headTime)
  block('receipt predates HEAD — it already landed a commit; re-prove for this slice')

process.exit(0)
