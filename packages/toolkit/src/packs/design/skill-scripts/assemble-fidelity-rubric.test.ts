import { describe, it, expect } from 'vitest'
import { assembleFidelityRubric, shouldSpawnFidelityVerifier } from './assemble-fidelity-rubric.js'

describe('assembleFidelityRubric', () => {
  it('merges the category template criteria with brief-named requirements, preserving order', () => {
    const template = {
      category: 'list',
      criteria: [{ id: 'icon-identity', prompt: 'Does the leading icon match its semantic meaning?', requiresZoomedCrop: true }]
    }
    const briefRequirements = [{ id: 'hover-affordance', prompt: 'Is a hovered row visually distinct?' }]

    expect(assembleFidelityRubric(template, briefRequirements)).toEqual({
      category: 'list',
      criteria: [
        { id: 'icon-identity', prompt: 'Does the leading icon match its semantic meaning?', requiresZoomedCrop: true },
        { id: 'hover-affordance', prompt: 'Is a hovered row visually distinct?', requiresZoomedCrop: false }
      ]
    })
  })

  it('does not de-dup a duplicate id across template and brief (YAGNI — left to the human rubric author)', () => {
    const template = { category: 'button', criteria: [{ id: 'contrast', prompt: 'A', requiresZoomedCrop: false }] }
    const briefRequirements = [{ id: 'contrast', prompt: 'B' }]

    const rubric = assembleFidelityRubric(template, briefRequirements)
    expect(rubric.criteria).toHaveLength(2)
    expect(rubric.criteria.map((c) => c.id)).toEqual(['contrast', 'contrast'])
  })
})

describe('shouldSpawnFidelityVerifier (cost lever: zero criteria never spawns the VLM)', () => {
  it('is false when the template has zero criteria and no brief requirements', () => {
    const rubric = assembleFidelityRubric({ category: 'button', criteria: [] }, [])
    expect(shouldSpawnFidelityVerifier(rubric)).toBe(false)
  })

  it('is true when the template has at least one criterion', () => {
    const rubric = assembleFidelityRubric({ category: 'list', criteria: [{ id: 'a', prompt: 'A', requiresZoomedCrop: false }] }, [])
    expect(shouldSpawnFidelityVerifier(rubric)).toBe(true)
  })

  it('is true when only the brief adds a requirement', () => {
    const rubric = assembleFidelityRubric({ category: 'button', criteria: [] }, [{ id: 'a', prompt: 'A' }])
    expect(shouldSpawnFidelityVerifier(rubric)).toBe(true)
  })
})
