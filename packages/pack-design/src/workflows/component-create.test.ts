import { describe, expect, it } from 'vitest'
import { defineWorkflow } from '@argohq/core'
import { componentCreateSpec } from './component-create.js'

describe('componentCreateSpec', () => {
  it('is accepted by defineWorkflow without validation errors', () => {
    expect(() => defineWorkflow(componentCreateSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(componentCreateSpec.stages.map((s) => s.name)).toEqual(['exists-check', 'build', 'annotate', 'registry-card'])
    for (const stage of componentCreateSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })
})
