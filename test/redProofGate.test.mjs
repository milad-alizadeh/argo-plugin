import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(new URL('../hooks/red-proof-gate.mjs', import.meta.url))

function runGate(stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [GATE], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

function armBuildMode(cwd, over = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  writeFileSync(
    join(cwd, '.argo', 'build-mode.json'),
    JSON.stringify({ plan: 'p.md', slice: 's2', testable: true, requiresLaunch: false, ...over }),
  )
}

function writeProof(cwd, over = {}) {
  mkdirSync(join(cwd, '.argo'), { recursive: true })
  const testFile = 'sample.spec.ts'
  writeFileSync(join(cwd, testFile), '// spec')
  writeFileSync(
    join(cwd, '.argo', 'red-proof.json'),
    JSON.stringify({ slice: 's2', testFile, redExit: 1, greenExit: 0, recordedAt: Date.now(), ...over }),
  )
}

/** Init a git repo (if needed) and stage the receipt's testFile, mirroring a real
 * build-plan commit where the slice's red test always lands staged alongside it. */
function stageTestFile(cwd, dir = cwd, testFile = 'sample.spec.ts') {
  execFileSync('git', ['-C', dir, 'init', '-q'])
  execFileSync('git', ['-C', dir, 'add', testFile])
}

describe('red-proof gate — commit-scoped, marker-armed, receipts not narration', () => {
  let cwd
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'argo-redproof-')) })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))
  const commitInput = (command = 'git commit -m "feat: s2"') =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd })

  // ── scoping: inert outside a gated build ────────────────────────────────────
  it('PASS: no build-mode marker → inert (normal commits unaffected)', async () => {
    expect((await runGate(commitInput())).code).toBe(0)
  })

  it('PASS: non-commit command → inert even when armed', async () => {
    armBuildMode(cwd)
    expect((await runGate(commitInput('git status'))).code).toBe(0)
  })

  it('BLOCK: `git ci` (the common commit alias) is recognized as a commit', async () => {
    armBuildMode(cwd)
    const r = await runGate(commitInput('git ci -m "feat: s2"'))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no red-proof receipt/)
  })

  it('PASS: malformed hook stdin → inert (cannot locate a build to gate)', async () => {
    expect((await runGate('not json')).code).toBe(0)
  })

  // ── the exemption: non-behavioral slices skip red-green, not verify ─────────
  it('PASS: slice marked testable:false needs no red proof (token/config/styling slices)', async () => {
    armBuildMode(cwd, { testable: false })
    expect((await runGate(commitInput())).code).toBe(0)
  })

  // ── green path ───────────────────────────────────────────────────────────────
  it('PASS: well-formed receipt for the current slice (red non-zero, green zero, fresh)', async () => {
    armBuildMode(cwd)
    writeProof(cwd)
    stageTestFile(cwd)
    expect((await runGate(commitInput())).code).toBe(0)
  })

  it('PASS: compound `git add <testFile> && git commit` — the command itself stages the red test (PreToolUse fires before staging happens)', async () => {
    armBuildMode(cwd)
    writeProof(cwd)
    execFileSync('git', ['-C', cwd, 'init', '-q']) // repo exists, testFile NOT staged yet
    const r = await runGate(commitInput('git add sample.spec.ts src/impl.ts && git commit -m "feat: s2"'))
    expect(r.code).toBe(0)
  })

  it('BLOCK: text mention of `git add` in a segment that never executes does not count (checkpoint finding: `false && git add t; git commit`)', async () => {
    armBuildMode(cwd)
    writeProof(cwd)
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    const r = await runGate(commitInput('false && git add sample.spec.ts; git commit -m "feat: s2"'))
    expect(r.code).toBe(2)
  })

  it('BLOCK: hook cwd in a SUBDIRECTORY of the armed repo still gates (marker at repo root, commit from repo/sub/)', async () => {
    armBuildMode(cwd)
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    mkdirSync(join(cwd, 'sub'), { recursive: true })
    const r = await runGate(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "feat: s2"' },
        cwd: join(cwd, 'sub'),
      }),
    )
    expect(r.code).toBe(2) // armed at the repo root — a subdir cwd must not disarm the gate
  })

  // ── fail closed once armed ───────────────────────────────────────────────────
  it('BLOCK: armed behavioral slice with no receipt at all', async () => {
    armBuildMode(cwd)
    const r = await runGate(commitInput())
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/no red-proof receipt/)
  })

  it('BLOCK: receipt names a different slice (no reuse across slices)', async () => {
    armBuildMode(cwd, { slice: 's3' })
    writeProof(cwd) // proof says s2
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: redExit of 0 — the test never failed first (vacuous-test smoking gun)', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { redExit: 0 })
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: greenExit non-zero — the test does not actually pass', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { greenExit: 1 })
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: receipt points at a test file that does not exist', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { testFile: 'ghost.spec.ts' })
    expect((await runGate(commitInput())).code).toBe(2)
  })

  it('BLOCK: malformed build-mode marker while armed (default-deny)', async () => {
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(join(cwd, '.argo', 'build-mode.json'), '{ nope')
    expect((await runGate(commitInput())).code).toBe(2)
  })

  // ── directory redirection: -C / --git-dir / --work-tree ─────────────────────
  it('BLOCK: hook cwd is unguarded but `-C <dir>` redirects the commit to an armed dir', async () => {
    const unguardedCwd = mkdtempSync(join(tmpdir(), 'argo-redproof-unguarded-'))
    armBuildMode(cwd) // marker lives in the -C target, not the hook's own cwd
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `git -C ${cwd} commit -m "feat: s2"` },
      cwd: unguardedCwd,
    })
    const result = await runGate(payload)
    rmSync(unguardedCwd, { recursive: true, force: true })
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/no red-proof receipt/)
  })

  it('PASS: `-C <dir>` redirect resolves the receipt and testFile lookup, not just the marker', async () => {
    const unguardedCwd = mkdtempSync(join(tmpdir(), 'argo-redproof-unguarded-'))
    armBuildMode(cwd)
    writeProof(cwd) // receipt + testFile live in the -C target, not hook.cwd
    stageTestFile(cwd)
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `git -C ${cwd} commit -m "feat: s2"` },
      cwd: unguardedCwd,
    })
    const result = await runGate(payload)
    rmSync(unguardedCwd, { recursive: true, force: true })
    expect(result.code).toBe(0)
  })

  it('BLOCK: `-C <dir>` redirect checks HEAD-time against the -C target repo, not hook.cwd', async () => {
    const unguardedCwd = mkdtempSync(join(tmpdir(), 'argo-redproof-unguarded-'))
    armBuildMode(cwd)
    writeProof(cwd, { recordedAt: Date.now() - 60_000 }) // predates the -C target's HEAD below
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    execFileSync('git', ['-C', cwd, 'add', '.'])
    execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first'])
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `git -C ${cwd} commit -m "feat: s2"` },
      cwd: unguardedCwd, // not a git repo — if this were used for HEAD-time, headTime would fall back to 0 and wrongly pass
    })
    const result = await runGate(payload)
    rmSync(unguardedCwd, { recursive: true, force: true })
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/predates HEAD/)
  })

  it('BLOCK: `--git-dir=<dir>/.git` redirects to that dir\'s parent as the effective repo', async () => {
    const targetCwd = mkdtempSync(join(tmpdir(), 'argo-redproof-gitdir-'))
    armBuildMode(targetCwd)
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `git --git-dir=${targetCwd}/.git commit -m "feat: s2"` },
      cwd,
    })
    const result = await runGate(payload)
    rmSync(targetCwd, { recursive: true, force: true })
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/no red-proof receipt/)
  })

  it('BLOCK: `--work-tree=<dir>` wins over --git-dir as the effective repo', async () => {
    const targetCwd = mkdtempSync(join(tmpdir(), 'argo-redproof-worktree-'))
    armBuildMode(targetCwd)
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `git --work-tree=${targetCwd} --git-dir=${cwd}/.git commit -m "feat: s2"` },
      cwd,
    })
    const result = await runGate(payload)
    rmSync(targetCwd, { recursive: true, force: true })
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/no red-proof receipt/)
  })

  // ── the red test must be staged in the commit it justifies ──────────────────
  it('BLOCK: receipt testFile exists but is not staged in this commit', async () => {
    armBuildMode(cwd)
    writeProof(cwd) // writes sample.spec.ts on disk but never `git add`s it
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    const r = await runGate(commitInput())
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/staged/)
  })

  // ── clock-skew ceiling: a receipt can't be dated arbitrarily far in the future ──
  it('regression: gate must go RED on a future-dated receipt beyond the clock-skew allowance', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { recordedAt: Date.now() + 60_000 }) // 60s ahead — beyond the 30s allowance
    const r = await runGate(commitInput())
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/future/)
  })

  it('regression: receipt predating HEAD must not land a second commit', async () => {
    armBuildMode(cwd)
    writeProof(cwd, { recordedAt: Date.now() - 60_000 })
    // a commit AFTER the receipt was recorded — the receipt already had its commit
    execFileSync('git', ['-C', cwd, 'init', '-q'])
    execFileSync('git', ['-C', cwd, 'add', '.'], {})
    execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first'])
    const r = await runGate(commitInput())
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/predates HEAD/)
  })
})
