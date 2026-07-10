import { describe, expect, it } from 'vitest'
import { definePlaybook } from '../../../core/index.js'
import { componentEditSpec } from './component-edit.js'

describe('componentEditSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(componentEditSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(componentEditSpec.stages.map((s) => s.name)).toEqual(['edit', 'review', 'registry-card', 'instance-impact'])
    for (const stage of componentEditSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('every designer output gets a blind fresh-eyes review before its card lands', () => {
    const review = componentEditSpec.stages.find((s) => s.name === 'review')
    expect(review?.gate).toBe('fresh-eyes-review')
    expect(review?.allows).toEqual(['figma-read'])
    expect(componentEditSpec.stages.find((s) => s.name === 'registry-card')?.requires).toContain('review')
  })
})
