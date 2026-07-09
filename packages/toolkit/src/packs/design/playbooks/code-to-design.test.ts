import { describe, expect, it } from 'vitest'
import { definePlaybook, renderPlaybookDiagram } from '../../../core/index.js'
import { componentEditSpec } from './component-edit.js'
import { codeToDesignSpec } from './code-to-design.js'

describe('codeToDesignSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(codeToDesignSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(codeToDesignSpec.stages.map((s) => s.name)).toEqual(['drift-detect', 'patch-mirror', 'card-refresh', 'instance-impact-check'])
    for (const stage of codeToDesignSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('renders with NO human-gate (decision diamond) nodes', () => {
    const diagram = renderPlaybookDiagram(codeToDesignSpec)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).not.toMatch(/\{.*\}/) // mermaid's diamond/decision node syntax
  })

  it('mirrors (does not duplicate) component-edit.ts\'s instance-impact-scan stage shape', () => {
    const mirrored = codeToDesignSpec.stages.find((s) => s.name === 'instance-impact-check')!
    const original = componentEditSpec.stages.find((s) => s.name === 'instance-impact-scan')!

    expect(mirrored.allows).toEqual(original.allows)
    expect(mirrored.gate).toBeUndefined()
    expect(original.gate).toBeUndefined()
  })
})
