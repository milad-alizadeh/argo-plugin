import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  FIXTURES,
  materializeFixture,
  runArgo,
  fireBashPreToolUse,
  execFileSync,
  join,
} from './acidHelpers.mjs'

/**
 * Acid test, gate half (Slice 6): after `argo init`, a real hook fire through
 * `argo-hook bash-pretooluse` (the exact chain hooks.json dispatches) arms
 * per-app: the monorepo gate arms only for the configured app, its
 * design-block-less sibling stays inert, and the single-repo "." entry arms —
 * the council's "neither mode may be the untested one" bar.
 */

let dirs = []
const scratch = (fixture) => {
  const dir = materializeFixture(fixture)
  dirs.push(dir)
  runArgo(dir, ['init'])
  return dir
}

beforeEach(() => { dirs = [] })
afterEach(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })

function stageComponent(host, appRoot) {
  const dir = join(host, appRoot, 'src', 'components')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'Button.tsx'), 'export const Button = () => null')
  execFileSync('git', ['-C', host, 'add', '.'])
}

/** Satisfy the FULL bash-pretooluse chain for a screen commit: the staged
 * contract names the screen (coverage's C2 derivation) and both receipts are
 * fresh — spec-diff for design-commit-gate, per-screen coverage for
 * design-coverage-gate. */
function satisfyDesignGates(host, appRoot, screen = 'cockpit') {
  const designDir = join(host, appRoot, 'design')
  mkdirSync(join(designDir, 'contracts'), { recursive: true })
  writeFileSync(join(designDir, 'contracts', `${screen}.json`), JSON.stringify({ screen, figmaFileVersion: '42', regions: [] }))
  writeFileSync(join(designDir, 'spec-diff-receipt.json'), JSON.stringify({ recordedAt: Date.now(), exitCode: 0 }))
  writeFileSync(
    join(designDir, `coverage-receipt-${screen}.json`),
    JSON.stringify({ screen, producedBy: 'design-verifier', figmaFileVersion: '42', timestamp: Date.now(), clean: true }),
  )
  execFileSync('git', ['-C', host, 'add', '.'])
}

describe('acid: gate fire — monorepo', () => {
  it('ARMS for apps/a (configured design block): commit blocks without a spec-diff receipt', () => {
    const host = scratch(FIXTURES.monorepo)
    stageComponent(host, 'apps/a')
    const res = fireBashPreToolUse(host, 'git commit -m "feat: button"')
    expect(res.status).toBe(2)
    expect(res.stderr).toMatch(/spec-diff receipt/)
  })

  it('stays INERT for apps/b (no componentsPath in its design block)', () => {
    const host = scratch(FIXTURES.monorepo)
    stageComponent(host, 'apps/b')
    const res = fireBashPreToolUse(host, 'git commit -m "feat: button"')
    expect(res.status).toBe(0)
  })

  it('passes for apps/a once fresh receipts exist in apps/a/design', () => {
    const host = scratch(FIXTURES.monorepo)
    stageComponent(host, 'apps/a')
    satisfyDesignGates(host, 'apps/a')
    const res = fireBashPreToolUse(host, 'git commit -m "feat: button"')
    expect(res.status).toBe(0)
  })
})

describe('acid: gate fire — single-repo', () => {
  it('ARMS for the "." entry: commit blocks without a receipt, passes with one', () => {
    const host = scratch(FIXTURES.singleRepo)
    stageComponent(host, '.')
    const blocked = fireBashPreToolUse(host, 'git commit -m "feat: button"')
    expect(blocked.status).toBe(2)
    expect(blocked.stderr).toMatch(/spec-diff receipt/)

    satisfyDesignGates(host, '.')
    expect(fireBashPreToolUse(host, 'git commit -m "feat: button"').status).toBe(0)
  })

  it('non-component commits pass through untouched (armed repo, unrelated staged file)', () => {
    const host = scratch(FIXTURES.singleRepo)
    writeFileSync(join(host, 'README.md'), '# hi')
    execFileSync('git', ['-C', host, 'add', 'README.md'])
    expect(fireBashPreToolUse(host, 'git commit -m "docs: readme"').status).toBe(0)
  })
})
