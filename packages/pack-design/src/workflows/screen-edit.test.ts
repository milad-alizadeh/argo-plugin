import { describe, expect, it } from 'vitest'
import { defineWorkflow } from '@argohq/core'
import { screenEditSpec } from './screen-edit.js'

describe('screenEditSpec', () => {
  it('is accepted by defineWorkflow without validation errors', () => {
    expect(() => defineWorkflow(screenEditSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(screenEditSpec.stages.map((s) => s.name)).toEqual(['update-brief', 'targeted-edits', 'review'])
    for (const stage of screenEditSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('updates the brief before any targeted edit stage (verify-contract-first ordering)', () => {
    expect(screenEditSpec.stages[0].name).toBe('update-brief')
    expect(screenEditSpec.stages[1].requires).toContain('update-brief')
  })
})
