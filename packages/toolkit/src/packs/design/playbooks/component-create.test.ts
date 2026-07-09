import { describe, expect, it } from 'vitest'
import { definePlaybook } from '../../../core/index.js'
import { componentCreateSpec } from './component-create.js'

describe('componentCreateSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(componentCreateSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(componentCreateSpec.stages.map((s) => s.name)).toEqual(['exists-check', 'build', 'annotate', 'registry-card'])
    for (const stage of componentCreateSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })
})
