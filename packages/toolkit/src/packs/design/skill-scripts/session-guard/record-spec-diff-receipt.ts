#!/usr/bin/env node
/**
 * Computes the deterministic `design/spec-diff-receipt.json` shape. The
 * design-commit-gate requires a fresh, passing receipt before a commit
 * touching generated component code (the `componentsPath` in the app's
 * `design.<app>` block in `.argo/config.json`) can land. This pure function
 * only shapes the receipt; the CLI entry point below runs the spec-diff
 * walker and persists the receipt via `writeDesignJson`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export function recordSpecDiffReceipt(
  exitCode: number,
  { now = Date.now(), stagedDigest }: { now?: number; stagedDigest?: string } = {}
) {
  return { recordedAt: now, exitCode, ...(stagedDigest !== undefined ? { stagedDigest } : {}) }
}

/**
 * Hashes the repo's total drift from HEAD (staged + unstaged combined) so
 * design-commit-gate can detect a receipt reused after further edits: a
 * fresh, passing receipt only proves nothing has changed since the walker
 * ran if this digest at commit time still matches. Recomputed identically at
 * record time and at gate time, so any edit (staged or not) after the walker
 * ran shifts the digest and the stale receipt is refused. `git diff HEAD`
 * fails on an unborn branch (no commits yet); `--cached` + worktree diff is
 * the equivalent for that case.
 *
 * Scoped to `dir` (the app root — record-spec-diff-receipt runs from it, and
 * design-commit-gate resolves it per armed app) and excludes `design/**`:
 * that directory holds this and every other gate's receipts/contracts
 * (coverage receipts, contract JSON), written and staged alongside the real
 * component change right before commit. Without the exclusion, staging any
 * of those after the digest was recorded would shift it, making every
 * receipt self-invalidating.
 */
const DESIGN_DIR_PATHSPEC = ':(exclude)design/**'

export function workingTreeDriftDigest(dir: string): string {
  let diff: string
  try {
    diff = execFileSync('git', ['diff', 'HEAD', '--', '.', DESIGN_DIR_PATHSPEC], { encoding: 'utf8', cwd: dir })
  } catch {
    diff =
      execFileSync('git', ['diff', '--cached', '--', '.', DESIGN_DIR_PATHSPEC], { encoding: 'utf8', cwd: dir }) +
      execFileSync('git', ['diff', '--', '.', DESIGN_DIR_PATHSPEC], { encoding: 'utf8', cwd: dir })
  }
  return createHash('sha256').update(diff).digest('hex')
}

// The walker's own `describe` blocks (walkers/spec-diff.ts) are titled
// `spec-diff: <storyFile>` — the one signature only a real run of
// runSpecDiffWalker can produce (the default vitest reporter prints suite
// titles to stdout/stderr). Any passing command's exit code used to be
// accepted on faith; requiring this signature in the captured output proves
// the walker actually executed rather than, say, a no-op or a typo'd path
// that collected zero test files.
const WALKER_SIGNATURE = /spec-diff: /

export function walkerEvidencePresent(output: string): boolean {
  return WALKER_SIGNATURE.test(output)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { spawnSync } = await import('node:child_process')
  const { writeDesignJson } = await import('../lib/write-design-json.js')

  const args = process.argv.slice(2)
  const sepIndex = args.indexOf('--')
  const command = sepIndex !== -1 ? args.slice(sepIndex + 1) : []
  if (command.length === 0) {
    console.error('record-spec-diff-receipt: usage: argo design record-spec-diff-receipt -- <test command...>')
    process.exit(1)
  }
  const result = spawnSync(command[0], command.slice(1), { encoding: 'utf8', cwd: process.cwd() })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  const exitCode = result.status ?? 1

  if (!walkerEvidencePresent(output)) {
    console.error(
      'record-spec-diff-receipt: REFUSED — command output carries no "spec-diff: <storyFile>" signature, so the spec-diff walker never ran; no receipt was written'
    )
    process.exit(1)
  }

  let stagedDigest: string | undefined
  try {
    stagedDigest = workingTreeDriftDigest(process.cwd())
  } catch {
    stagedDigest = undefined // not a git repo — the commit gate is inert there anyway
  }

  const receipt = recordSpecDiffReceipt(exitCode, { stagedDigest })
  writeDesignJson(process.cwd(), 'spec-diff-receipt.json', receipt)
  console.log(JSON.stringify(receipt))
  process.exit(exitCode)
}
