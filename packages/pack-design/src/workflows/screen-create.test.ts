import { describe, expect, it } from 'vitest'
import { defineWorkflow, renderWorkflowDiagram } from '@argohq/core'
import { screenCreateSpec } from './screen-create.js'

describe('screenCreateSpec', () => {
  it('is accepted by defineWorkflow without validation errors', () => {
    expect(() => defineWorkflow(screenCreateSpec)).not.toThrow()
  })

  it('is a flat stage list in the documented order, no branch field anywhere', () => {
    expect(screenCreateSpec.stages.map((s) => s.name)).toEqual(['brief', 'missing-components', 'build', 'review', 'registry-sync'])
    for (const stage of screenCreateSpec.stages) {
      expect(stage).not.toHaveProperty('branch')
    }
  })

  it('renders retry/fix-round loops and NO human-gate (decision diamond) nodes', () => {
    const diagram = renderWorkflowDiagram(screenCreateSpec)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).not.toMatch(/\{.*\}/) // mermaid's diamond/decision node syntax
    expect(diagram).toMatch(/build --\>\|retry, budget 2\| build/)
    expect(diagram).toMatch(/build --\>\|fix round, up to 2\| build/)
    expect(diagram).toMatch(/review --\>\|fix round, up to 1\| review/)
    expect(diagram).toMatch(/review --\>\|retry, budget 1\| review/)
  })
})
