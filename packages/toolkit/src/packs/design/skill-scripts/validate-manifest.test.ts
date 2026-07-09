import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runValidateManifest, parseCliArgs } from './validate-manifest.js'

const registry = {
  components: {
    PlaybooksSection: { nodeId: '1:1', kind: 'custom', whenToUse: 'playbooks tree region' },
    TreeNode: { nodeId: '1:2', kind: 'custom', whenToUse: 'single tree row primitive' }
  }
}
const pairs = {
  pairs: [{ components: ['PlaybooksSection', 'TreeNode'], rule: 'Use PlaybooksSection, never hand-assembled TreeNode primitives.' }]
}

function setup({ withPairs = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'validate-manifest-'))
  mkdirSync(join(cwd, 'design'), { recursive: true })
  writeFileSync(join(cwd, 'design', 'registry.json'), JSON.stringify(registry), 'utf8')
  if (withPairs) writeFileSync(join(cwd, 'design', 'confusable-pairs.json'), JSON.stringify(pairs), 'utf8')
  return cwd
}

function writeManifest(cwd: string, manifest: unknown) {
  const path = join(cwd, 'design', 'binding-manifest.json')
  writeFileSync(path, JSON.stringify(manifest), 'utf8')
  return path
}

describe('runValidateManifest (W2 skill-script wrapper)', () => {
  it('passes a clean, justified manifest against the on-disk registry + pairs table', () => {
    const cwd = setup()
    const path = writeManifest(cwd, {
      screen: 'D03',
      rows: [{ requirement: 'R1', component: 'PlaybooksSection', purpose: 'tree region', justification: 'the pair rule names it' }]
    })
    try {
      const result = runValidateManifest({ manifestPath: path, cwd })
      expect(result.blocked).toBe(false)
      expect(result.rows[0].tier).toBe('always')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('blocks an un-justified confusable-pair row, surfacing the committed rule text', () => {
    const cwd = setup()
    const path = writeManifest(cwd, {
      screen: 'D03',
      rows: [{ requirement: 'R1', component: 'TreeNode', purpose: 'tree rows' }]
    })
    try {
      const result = runValidateManifest({ manifestPath: path, cwd })
      expect(result.blocked).toBe(true)
      expect(result.rows[0].blocks[0]).toContain('never hand-assembled')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('works without a confusable-pairs.json (pairs table optional)', () => {
    const cwd = setup({ withPairs: false })
    const path = writeManifest(cwd, {
      screen: 'D03',
      rows: [{ requirement: 'R1', component: 'TreeNode', purpose: 'tree rows' }]
    })
    try {
      expect(runValidateManifest({ manifestPath: path, cwd }).blocked).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('throws (fail closed) when the manifest file is missing', () => {
    const cwd = setup()
    try {
      expect(() => runValidateManifest({ manifestPath: join(cwd, 'design', 'nope.json'), cwd })).toThrow(/REQUIRED before any use_figma/)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('throws when no design/registry.json exists (nothing real to validate against)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'validate-manifest-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    const path = writeManifest(cwd, { screen: 'D03', rows: [{ requirement: 'R1', component: 'X', purpose: 'p' }] })
    try {
      expect(() => runValidateManifest({ manifestPath: path, cwd })).toThrow(/registry\.json/)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('parseCliArgs', () => {
  it('parses --manifest and --cwd', () => {
    expect(parseCliArgs(['--manifest', 'design/binding-manifest.json', '--cwd', '/app'])).toEqual({
      manifestPath: 'design/binding-manifest.json',
      cwd: '/app'
    })
  })

  it('throws on unknown flags and surfaces --help', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow(/unrecognized/)
    expect(parseCliArgs(['--help'])).toEqual({ help: true })
  })

  it('parses --prd', () => {
    expect(parseCliArgs(['--manifest', 'm.json', '--prd', 'prd.md'])).toEqual({
      manifestPath: 'm.json',
      cwd: undefined,
      prdPath: 'prd.md'
    })
  })
})

describe('runValidateManifest --prd requirements coverage', () => {
  const prd = `
## Requirements

| ID      | Requirement                | Acceptance | Visible in build? |
| ------- | -------------------------- | ---------- | ----------------- |
| FEAT-R1 | tree region visible        | a          | yes               |
| FEAT-R2 | routing target indicator   | a          | yes               |
| FEAT-R3 | background job             | a          | no                |

## Feature→screen matrix

| Requirement | Disposition       |
| ----------- | ----------------- |
| FEAT-R1     | covered-by: D03   |
| FEAT-R2     | covered-by: D03   |
| FEAT-R3     | deferred: later   |
`

  it('blocks when a PRD requirement covered-by the screen has no manifest row, citing the id', () => {
    const cwd = setup()
    const prdPath = join(cwd, 'prd.md')
    writeFileSync(prdPath, prd, 'utf8')
    const path = writeManifest(cwd, {
      screen: 'D03',
      rows: [{ requirement: 'FEAT-R1', component: 'PlaybooksSection', purpose: 'tree region' }]
    })
    try {
      const result = runValidateManifest({ manifestPath: path, cwd, prdPath })
      expect(result.blocked).toBe(true)
      expect(result.uncoveredRequirements).toEqual(['FEAT-R2'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('passes when every covered-by requirement is referenced (Visible=no rows exempt)', () => {
    const cwd = setup()
    const prdPath = join(cwd, 'prd.md')
    writeFileSync(prdPath, prd, 'utf8')
    const path = writeManifest(cwd, {
      screen: 'D03',
      rows: [
        { requirement: 'FEAT-R1', component: 'PlaybooksSection', purpose: 'tree region', justification: 'the pair rule names it' },
        {
          requirement: 'FEAT-R2',
          component: 'TreeNode',
          purpose: 'indicator row',
          justification: 'indicator is a single row, not the assembled playbooks region'
        }
      ]
    })
    try {
      const result = runValidateManifest({ manifestPath: path, cwd, prdPath })
      expect(result.blocked).toBe(false)
      expect(result.uncoveredRequirements).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('throws (fail closed) when --prd points at a missing file', () => {
    const cwd = setup()
    const path = writeManifest(cwd, {
      screen: 'D03',
      rows: [{ requirement: 'R1', component: 'PlaybooksSection', purpose: 'p' }]
    })
    try {
      expect(() => runValidateManifest({ manifestPath: path, cwd, prdPath: join(cwd, 'nope.md') })).toThrow(/PRD/)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
