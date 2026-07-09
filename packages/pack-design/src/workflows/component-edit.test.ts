import { describe, expect, it } from 'vitest'
import { defineWorkflow } from '@argohq/core'
import { componentEditSpec } from './component-edit.js'

describe('componentEditSpec', () => {
  it('is accepted by defineWorkflow without validation errors', () => {
    expect(() => defineWorkflow(componentEditSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(componentEditSpec.stages.map((s) => s.name)).toEqual(['edit', 'card-refresh', 'instance-impact-scan'])
    for (const stage of componentEditSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })
})
