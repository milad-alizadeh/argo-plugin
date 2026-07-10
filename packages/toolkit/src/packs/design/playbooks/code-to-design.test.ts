import { describe, expect, it } from 'vitest'
import { definePlaybook, renderPlaybookDiagram } from '../../../core/index.js'
import { componentEditSpec } from './component-edit.js'
import { codeToDesignSpec } from './code-to-design.js'

describe('codeToDesignSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(codeToDesignSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(codeToDesignSpec.stages.map((s) => s.name)).toEqual([
      'drift-detect',
      'patch-mirror',
      'registry-card',
      'instance-impact-check',
      'review'
    ])
    for (const stage of codeToDesignSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('carries a fresh-eyes review stage matching the other design specs', () => {
    const review = codeToDesignSpec.stages.find((s) => s.name === 'review')
    expect(review?.gate).toBe('fresh-eyes-review')
    expect(review?.allows).toEqual(['figma-read'])
    expect(review?.maxRounds).toBe(1)
    expect(review?.retries).toBe(1)
    expect(review?.requires).toContain('instance-impact-check')
  })

  it('renders with NO human-gate (decision diamond) nodes', () => {
    const diagram = renderPlaybookDiagram(codeToDesignSpec)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).not.toMatch(/\{.*\}/) // mermaid's diamond/decision node syntax
  })

  it('mirrors (does not duplicate) component-edit.ts\'s instance-impact stage shape', () => {
    const mirrored = codeToDesignSpec.stages.find((s) => s.name === 'instance-impact-check')!
    const original = componentEditSpec.stages.find((s) => s.name === 'instance-impact')!

    expect(mirrored.allows).toEqual(original.allows)
    expect(mirrored.gate).toBeUndefined()
    expect(original.gate).toBeUndefined()
  })
})
