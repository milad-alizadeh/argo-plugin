import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineWorkflow, PackUnavailableError, renderWorkflowDiagram, workflowStart } from '@argohq/core'
import { designToCodeSpec } from './design-to-code.js'

describe('designToCodeSpec', () => {
  it('is accepted by defineWorkflow without validation errors', () => {
    expect(() => defineWorkflow(designToCodeSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(designToCodeSpec.stages.map((s) => s.name)).toEqual(['metadata-reads', 'resolve-imports', 'code-handoff'])
    for (const stage of designToCodeSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('renders with NO human-gate (decision diamond) nodes', () => {
    const diagram = renderWorkflowDiagram(designToCodeSpec)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).not.toMatch(/\{.*\}/) // mermaid's diamond/decision node syntax
  })

  it('carries handsOffToPack: "pack-code" on its terminal stage only (audit 2.4 soft seam)', () => {
    const [first, second, terminal] = designToCodeSpec.stages
    expect(first.handsOffToPack).toBeUndefined()
    expect(second.handsOffToPack).toBeUndefined()
    expect(terminal.handsOffToPack).toBe('pack-code')
  })

  describe('workflowStart refusal (Slice 4 assertPackAvailable, via Slice 5 workflowStart)', () => {
    let stateRoot: string
    let cwd: string

    beforeEach(() => {
      stateRoot = mkdtempSync(join(tmpdir(), 'argo-design-to-code-state-'))
      cwd = mkdtempSync(join(tmpdir(), 'argo-design-to-code-cwd-'))
    })

    afterEach(() => {
      rmSync(stateRoot, { recursive: true, force: true })
      rmSync(cwd, { recursive: true, force: true })
    })

    function writeConfig(packs: Record<string, boolean>): void {
      const argoDir = join(cwd, '.argo')
      mkdirSync(argoDir, { recursive: true })
      writeFileSync(join(argoDir, 'config.json'), JSON.stringify({ packs }))
    }

    it('throws PackUnavailableError naming pack-code when pack-code is disabled/absent', () => {
      writeConfig({ 'pack-design': true }) // pack-code absent -> deny-by-default

      expect(() => workflowStart({ name: 'design-to-code', target: 'fixture-screen' }, { cwd, stateRoot })).toThrow(PackUnavailableError)
      expect(() => workflowStart({ name: 'design-to-code', target: 'fixture-screen' }, { cwd, stateRoot })).toThrow(/pack-code/)
    })

    it('does not throw when pack-code is "enabled" (a stub config entry — pack-code has no real workflow yet)', () => {
      writeConfig({ 'pack-design': true, 'pack-code': true })

      expect(() => workflowStart({ name: 'design-to-code', target: 'fixture-screen' }, { cwd, stateRoot })).not.toThrow()
    })
  })
})
