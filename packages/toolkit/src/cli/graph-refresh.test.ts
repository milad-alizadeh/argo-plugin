import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGraphRefresh } from './graph-refresh.js'

/**
 * `argo graph refresh` — the ported templates/graphify/refresh-graph.sh:
 * SINGLE WRITER (main only, never a linked worktree, on-device), workspace
 * auto-discovery via graphify-out/ dirs, deterministic update
 * (PYTHONHASHSEED=0), degradable labeling, dated-backup pruning, and a
 * pathspec-scoped commit that never sweeps in an unrelated dirty index.
 */

// bin/argo.js is a hand-written launcher that dispatches to dist/cli/*.js
// (never the sibling .ts source) — requires `bun run build` before this test.
const ARGO_BIN = fileURLToPath(new URL('../../bin/argo.js', import.meta.url))

let host: string
let fakeBin: string | undefined

function git(args: string[], cwd = host) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/** A fake `graphify` CLI on PATH that records its invocations. */
function installFakeGraphify({ labelExit = 0 } = {}) {
  fakeBin = join(host, '.fake-bin')
  mkdirSync(fakeBin, { recursive: true })
  const script = join(fakeBin, 'graphify')
  writeFileSync(
    script,
    `#!/bin/sh
echo "$1 cwd=$(pwd) hashseed=\${PYTHONHASHSEED:-unset}" >> "${host}/graphify-calls.log"
if [ "$1" = "update" ]; then
  mkdir -p graphify-out
  date +%s%N > graphify-out/graph.json 2>/dev/null || python3 -c 'import time; print(time.time())' > graphify-out/graph.json
fi
if [ "$1" = "label" ]; then exit ${labelExit}; fi
exit 0
`
  )
  chmodSync(script, 0o755)
}

function refresh(opts: Record<string, unknown> = {}) {
  return runGraphRefresh({
    cwd: host,
    env: { ...process.env, PATH: fakeBin ? `${fakeBin}:${process.env.PATH}` : process.env.PATH },
    ...opts,
  })
}

function calls() {
  const log = join(host, 'graphify-calls.log')
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
}

beforeEach(() => {
  fakeBin = undefined
  host = mkdtempSync(join(tmpdir(), 'argo-graph-refresh-'))
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'test'])
  git(['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(host, 'README'), 'seed')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'seed'])
})

afterEach(() => {
  rmSync(host, { recursive: true, force: true })
})

describe('single-writer guards', () => {
  it('skips (ok, no throw) when graphify is not installed', () => {
    const report = refresh({ env: { ...process.env, PATH: '/usr/bin:/bin' } })
    expect(report.skipped).toBe('graphify-not-installed')
  })

  it('skips on a non-main branch', () => {
    installFakeGraphify()
    git(['checkout', '-q', '-b', 'feature'])
    const report = refresh()
    expect(report.skipped).toBe('not-on-main')
    expect(calls()).toHaveLength(0)
  })

  it('skips inside a linked worktree even when it has main checked out', () => {
    installFakeGraphify()
    git(['checkout', '-q', '-b', 'primary-parked']) // free `main` for the worktree
    const wt = join(host, '.wt')
    git(['worktree', 'add', '-q', wt, 'main'])
    const report = refresh({ cwd: wt })
    expect(report.skipped).toBe('in-worktree')
    expect(calls()).toHaveLength(0)
  })
})

describe('refresh + scoped commit', () => {
  it('updates deterministically, labels, and commits ONLY the graph artifacts', () => {
    installFakeGraphify()
    // an unrelated file the user staged mid-task — must never be swept in
    writeFileSync(join(host, 'unrelated.txt'), 'wip')
    git(['add', 'unrelated.txt'])

    const report: any = refresh()
    expect(report.skipped).toBeUndefined()
    expect(report.workspaces).toEqual(['.'])
    expect(report.committed).toBe(true)
    expect(calls().some((l) => l.startsWith('update') && l.includes('hashseed=0'))).toBe(true)
    expect(calls().some((l) => l.startsWith('label'))).toBe(true)

    const lastMsg = git(['log', '-1', '--pretty=%s'])
    expect(lastMsg).toBe('chore(graphify): refresh knowledge graph')
    const committedFiles = git(['show', '--name-only', '--pretty=format:', 'HEAD'])
    expect(committedFiles).toContain('graphify-out/graph.json')
    expect(committedFiles).not.toContain('unrelated.txt')
    // the unrelated staged file survives, still staged
    expect(git(['diff', '--cached', '--name-only'])).toContain('unrelated.txt')
  })

  it('reports committed: false when the graph did not change', () => {
    installFakeGraphify()
    refresh()
    // freeze the fake's output so the second run produces an identical graph
    const graph = join(host, 'graphify-out', 'graph.json')
    const frozen = readFileSync(graph, 'utf8')
    writeFileSync(
      join(fakeBin!, 'graphify'),
      `#!/bin/sh\nif [ "$1" = "update" ]; then mkdir -p graphify-out; printf '%s\\n' '${frozen.trim()}' > graphify-out/graph.json; fi\nexit 0\n`
    )
    const report: any = refresh()
    expect(report.committed).toBe(false)
  })

  it('degrades (still refreshes and commits) when labeling fails', () => {
    installFakeGraphify({ labelExit: 1 })
    const report: any = refresh()
    expect(report.committed).toBe(true)
    expect(report.labelDegraded).toEqual(['.'])
  })
})

describe('workspace discovery', () => {
  it('refreshes every dir with a seeded graphify-out/, skipping node_modules', () => {
    installFakeGraphify()
    for (const ws of ['apps/a', 'apps/b', 'node_modules/dep']) {
      mkdirSync(join(host, ws, 'graphify-out'), { recursive: true })
    }
    const report: any = refresh()
    expect(report.workspaces).toEqual(['apps/a', 'apps/b'])
    const updates = calls().filter((l) => l.startsWith('update'))
    expect(updates).toHaveLength(2)
    expect(updates.some((l) => l.includes('/apps/a'))).toBe(true)
    expect(updates.some((l) => l.includes('node_modules'))).toBe(false)
  })

  it('prunes dated backup dirs older than 14 days, keeps recent ones', () => {
    installFakeGraphify()
    const old = join(host, 'graphify-out', '2020-01-01')
    const recent = join(host, 'graphify-out', '2099-01-01')
    mkdirSync(old, { recursive: true })
    mkdirSync(recent, { recursive: true })
    const ancient = new Date('2020-01-01')
    utimesSync(old, ancient, ancient)
    refresh()
    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
  })
})

describe('CLI wiring', () => {
  it('`argo graph refresh` runs (self-guarded skip off main) and exits 0', () => {
    git(['checkout', '-q', '-b', 'feature'])
    const res = spawnSync(process.execPath, [ARGO_BIN, 'graph', 'refresh'], {
      cwd: host,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(0)
    expect(JSON.parse(res.stdout).skipped).toBe('not-on-main')
  })

  it('`argo graph <unknown>` fails loud', () => {
    const res = spawnSync(process.execPath, [ARGO_BIN, 'graph', 'nonsense'], {
      cwd: host,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toMatch(/refresh/)
  })
})
