import { describe, expect, it } from 'vitest'
import { definePlaybook } from '../../../core/index.js'
import { screenEditSpec } from './screen-edit.js'

describe('screenEditSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(screenEditSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(screenEditSpec.stages.map((s) => s.name)).toEqual([
      'update-brief',
      'component-impact',
      'targeted-edits',
      'review'
    ])
    for (const stage of screenEditSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('updates the brief before any targeted edit stage (verify-contract-first ordering)', () => {
    expect(screenEditSpec.stages[0].name).toBe('update-brief')
    expect(screenEditSpec.stages[1].requires).toContain('update-brief')
  })

  it('component-impact can spawn component runs but never write to Figma itself', () => {
    const impact = screenEditSpec.stages.find((s) => s.name === 'component-impact')
    expect(impact?.allows).toContain('playbook-start')
    expect(impact?.allows).not.toContain('figma-write')
    expect(screenEditSpec.stages.find((s) => s.name === 'targeted-edits')?.requires).toContain('component-impact')
  })

  it('component-impact allows registry-read (its documented job is diffing the updated brief against the registry/kit)', () => {
    const impact = screenEditSpec.stages.find((s) => s.name === 'component-impact')
    expect(impact?.allows).toContain('registry-read')
  })
})
