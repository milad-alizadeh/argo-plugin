import { describe, expect, it } from 'vitest'
import { definePlaybook } from '../../../core/index.js'
import { componentCreateSpec } from './component-create.js'

describe('componentCreateSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(componentCreateSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(componentCreateSpec.stages.map((s) => s.name)).toEqual(['exists-check', 'build', 'annotate', 'review', 'registry-card'])
    for (const stage of componentCreateSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('exists-check allows registry-read (it reads the registry to look up an existing card)', () => {
    const existsCheck = componentCreateSpec.stages.find((s) => s.name === 'exists-check')
    expect(existsCheck?.allows).toContain('registry-read')
  })

  it('annotate allows figma-write and figma-read (it writes the set-root description in Figma)', () => {
    const annotate = componentCreateSpec.stages.find((s) => s.name === 'annotate')
    expect(annotate?.allows).toContain('figma-write')
    expect(annotate?.allows).toContain('figma-read')
  })
})
