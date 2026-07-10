/**
 * Refresh the graphify knowledge graph, then commit it.
 *
 * SINGLE WRITER: refreshes only on `main`, never inside a linked worktree
 * (worktrees read main's graph, never write it, so parallel builds can't race
 * on graph.json), on-device (labeling spawns the local `claude` via
 * graphify's claude-cli backend — subscription auth, no API key; without it
 * labels degrade to placeholders, never crash).
 *
 * Works for both a single-app repo and a monorepo: refreshes every workspace
 * that has a seeded graphify-out/ (skipping node_modules/.git), falling back
 * to the repo root when none is seeded yet.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const GRAPH_PATHSPECS = [
  ':(glob)**/graphify-out/graph.json',
  ':(glob)**/graphify-out/graph.html',
  ':(glob)**/graphify-out/GRAPH_REPORT.md',
  ':(glob)**/graphify-out/.graphify_labels.json',
]

const PRUNE_AFTER_DAYS = 14
const DATED_BACKUP = /^\d{4}-\d{2}-\d{2}$/

export function runGraphRefresh({ cwd = process.cwd(), env = process.env }: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const sh = (cmd: string, args: string[], opts: Record<string, unknown> = {}) =>
    spawnSync(cmd, args, { cwd, encoding: 'utf8', env, ...opts })

  if (sh('sh', ['-c', 'command -v graphify']).status !== 0) {
    return { skipped: 'graphify-not-installed' }
  }

  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout?.trim()
  if (branch !== 'main') return { skipped: 'not-on-main', branch }

  const gitDir = sh('git', ['rev-parse', '--git-dir']).stdout?.trim() ?? ''
  if (gitDir.includes('/worktrees/')) return { skipped: 'in-worktree' }

  const repoRoot = sh('git', ['rev-parse', '--show-toplevel']).stdout?.trim()
  if (!repoRoot) return { skipped: 'not-a-git-repo' }

  const workspaces = discoverWorkspaces(repoRoot)
  const labelDegraded: string[] = []

  for (const ws of workspaces) {
    const wsDir = join(repoRoot, ws)
    // run from the workspace so graphify's CWD-relative writes stay inside
    // <ws>/graphify-out/ and don't litter a stray dir at the repo root
    const run = (args: string[], extraEnv: Record<string, string> = {}) =>
      spawnSync('graphify', args, { cwd: wsDir, encoding: 'utf8', env: { ...env, ...extraEnv }, stdio: 'inherit' })

    run(['update', '.', '--force'], { PYTHONHASHSEED: '0' })
    const label = run(['label', '.', '--missing-only', '--backend=claude-cli'])
    if (label.status !== 0) labelDegraded.push(ws)

    pruneDatedBackups(join(wsDir, 'graphify-out'))
  }

  // Stage only the durable artifacts, and commit scoped to the graphify
  // pathspec — a dirty index elsewhere (e.g. files the user staged mid-task
  // when the post-merge hook fires) must never be swept in. add/commit are
  // fatal on an unmatched pathspec, so add one spec at a time and commit the
  // explicit staged file list.
  const gitAtRoot = (args: string[], extraEnv: Record<string, string> = {}) =>
    spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', env: { ...env, ...extraEnv } })
  for (const spec of GRAPH_PATHSPECS) gitAtRoot(['add', '--', spec])
  const staged = (gitAtRoot(['diff', '--cached', '--name-only', '--', ...GRAPH_PATHSPECS]).stdout ?? '')
    .split('\n')
    .filter(Boolean)
  let committed = false
  let commitError: string | undefined
  if (staged.length) {
    const commit = gitAtRoot(['commit', '-m', 'chore(graphify): refresh knowledge graph', '--', ...staged], {
      LEFTHOOK: '0',
    })
    committed = commit.status === 0
    if (!committed) commitError = (commit.stderr || commit.stdout || 'git commit failed').trim()
  }

  return { workspaces, committed, ...(commitError ? { commitError } : {}), labelDegraded }
}

/** Dirs containing a graphify-out/ (repo-root-relative, sorted), else ['.']. */
function discoverWorkspaces(repoRoot: string): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      // .claude holds linked worktrees (each a full repo copy) — never workspaces
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.claude') continue
      const full = join(dir, entry.name)
      if (entry.name === 'graphify-out') {
        found.push(relative(repoRoot, dir) || '.')
        continue
      }
      walk(full)
    }
  }
  walk(repoRoot)
  return found.length ? [...new Set(found)].sort() : ['.']
}

/** graphify snapshots one dated backup dir per day and never cleans up. */
function pruneDatedBackups(graphifyOut: string): void {
  if (!existsSync(graphifyOut)) return
  const cutoff = Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000
  for (const entry of readdirSync(graphifyOut, { withFileTypes: true })) {
    if (!entry.isDirectory() || !DATED_BACKUP.test(entry.name)) continue
    const full = join(graphifyOut, entry.name)
    try {
      if (statSync(full).mtimeMs < cutoff) rmSync(full, { recursive: true, force: true })
    } catch {
      /* a backup dir vanishing mid-scan is fine */
    }
  }
}
