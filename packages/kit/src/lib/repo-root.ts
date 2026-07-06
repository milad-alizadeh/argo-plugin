/**
 * Shared git-toplevel resolver. Design-guard's hooks (design-guard-record.js,
 * design-guard-stop.js) each carried an identical copy of this — `.argo/
 * design-guard.json` is repo-global, so anything reading/writing it needs
 * the real repo root, not whatever `cwd` a session or skill script happens
 * to run from (a monorepo app root like `apps/desktop`, not the repo root,
 * per figma-audit/SKILL.md's documented `cwd`).
 *
 * record-audit-receipt.js hit this same problem from the write side
 * (figma-audit dogfooding, 2026-07-06): it read `.argo/design-guard.json`
 * relative to the SAME `cwd` used for `design/audit-receipt.json` (which
 * must be the app root, matching where design-guard-stop.js looks for the
 * receipt). In a monorepo those two paths diverge — the guard-state read
 * silently missed, defaulting `writeCounterAtAudit` to 0, which then could
 * never match the real (repo-global, non-zero) write count and left the
 * stop gate permanently blocked. This resolver is the fix: callers keep
 * `cwd` for their own app-scoped paths and use `resolveRepoRoot(cwd)` only
 * for the repo-global guard state.
 */
import { execFileSync } from 'node:child_process'

export function resolveRepoRoot(cwd: string): string {
  try {
    const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    if (top) return top
  } catch {
    /* not a git repo — fall back to cwd */
  }
  return cwd
}
