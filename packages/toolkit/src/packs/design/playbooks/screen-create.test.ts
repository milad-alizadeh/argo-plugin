import { describe, expect, it } from 'vitest'
import { definePlaybook, renderPlaybookDiagram } from '../../../core/index.js'
import { screenCreateSpec } from './screen-create.js'

describe('screenCreateSpec', () => {
  it('is accepted by definePlaybook without validation errors', () => {
    expect(() => definePlaybook(screenCreateSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(screenCreateSpec.stages.map((s) => s.name)).toEqual(['brief', 'missing-components', 'build', 'review', 'registry-sync'])
    for (const stage of screenCreateSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('build stage allows file-edit (it writes the binding manifest file)', () => {
    const build = screenCreateSpec.stages.find((s) => s.name === 'build')
    expect(build?.allows).toContain('file-edit')
  })

  it('brief stage allows file-edit (it writes the brief file)', () => {
    const brief = screenCreateSpec.stages.find((s) => s.name === 'brief')
    expect(brief?.allows).toContain('file-edit')
  })

  it('renders retry/fix-round loops and NO human-gate (decision diamond) nodes', () => {
    const diagram = renderPlaybookDiagram(screenCreateSpec)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).not.toMatch(/\{.*\}/) // mermaid's diamond/decision node syntax
    expect(diagram).toMatch(/build --\>\|retry, budget 2\| build/)
    expect(diagram).toMatch(/build --\>\|fix round, up to 2\| build/)
    expect(diagram).toMatch(/review --\>\|fix round, up to 1\| review/)
    expect(diagram).toMatch(/review --\>\|retry, budget 1\| review/)
  })
})
