import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GateInput } from '@argohq/core'
import { createBriefCheckGate } from './brief-check.js'

describe('brief-check gate', () => {
  let dir: string

  beforeEach(() => {
    dir = mktempOrExplode()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function mktempOrExplode(): string {
    return mkdtempSync(join(tmpdir(), 'argo-brief-check-'))
  }

  const makeInput = (briefPath: string): GateInput => ({ target: 'onboarding-welcome', artifacts: { brief: briefPath }, settings: {} })

  it('fails when required sections are missing', async () => {
    const briefPath = join(dir, 'brief.md')
    writeFileSync(briefPath, '# Onboarding Welcome\n\n## Purpose\n\nGreets the user.\n')

    const gate = createBriefCheckGate({ cwd: dir })
    const verdict = await gate.check(makeInput('brief.md'))

    expect(verdict.passed).toBe(false)
    expect(verdict.findings.some((f) => f.message.includes('Sections'))).toBe(true)
    expect(verdict.findings.some((f) => f.message.includes('Acceptance Criteria'))).toBe(true)
  })

  it('passes a clean fixture with all required sections and valid referenced paths', async () => {
    const referenced = join(dir, 'component.tsx')
    writeFileSync(referenced, 'export const X = () => null\n')
    const briefPath = join(dir, 'brief.md')
    writeFileSync(
      briefPath,
      [
        '# Onboarding Welcome',
        '',
        '## Purpose',
        '',
        'Greets the user.',
        '',
        '## Sections',
        '',
        'Uses `component.tsx`.',
        '',
        '## Acceptance Criteria',
        '',
        'Renders without error.',
        ''
      ].join('\n')
    )

    const gate = createBriefCheckGate({ cwd: dir })
    const verdict = await gate.check(makeInput('brief.md'))

    expect(verdict.passed).toBe(true)
    expect(verdict.findings).toHaveLength(0)
    expect(verdict.evidence[0]).toMatch(/^brief:/)
  })

  it('fails when a referenced path does not exist in the repo (catches a hallucinated plan)', async () => {
    const briefPath = join(dir, 'brief.md')
    writeFileSync(
      briefPath,
      ['# Onboarding Welcome', '', '## Purpose', '', 'x', '', '## Sections', '', 'Uses `does-not-exist.tsx`.', '', '## Acceptance Criteria', '', 'x', ''].join(
        '\n'
      )
    )

    const gate = createBriefCheckGate({ cwd: dir })
    const verdict = await gate.check(makeInput('brief.md'))

    expect(verdict.passed).toBe(false)
    expect(verdict.findings.some((f) => f.message.includes('does-not-exist.tsx'))).toBe(true)
  })

  it('fails when no brief artifact was produced', async () => {
    const gate = createBriefCheckGate({ cwd: dir })
    const verdict = await gate.check({ target: 'x', artifacts: {}, settings: {} })

    expect(verdict.passed).toBe(false)
    expect(verdict.findings[0].message).toMatch(/no "brief" artifact produced/)
  })
})
