/** Repo-global state must resolve from the real repo root, not a monorepo
 * app-scoped `cwd`, or guard-state reads silently miss and permanently block. */
import { execFileSync } from 'node:child_process'

export function resolveRepoRoot(cwd: string): string {
  try {
    const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    if (top) return top
  } catch {
    /* not a git repo, fall back to cwd */
  }
  return cwd
}
