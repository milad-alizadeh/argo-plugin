import { describe, expect, it } from 'vitest'
import { definePlaybook } from '../../../core/index.js'
import { componentEditSpec } from './component-edit.js'

describe('componentEditSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(componentEditSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(componentEditSpec.stages.map((s) => s.name)).toEqual(['edit', 'card-refresh', 'instance-impact-scan'])
    for (const stage of componentEditSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })
})
