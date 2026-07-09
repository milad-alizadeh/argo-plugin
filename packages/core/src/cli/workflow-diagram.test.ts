import { describe, expect, it } from 'vitest'
import { defineWorkflow, registerWorkflow } from '../spec.js'
import { WorkflowNotFoundError } from './errors.js'
import { workflowDiagram } from './workflow-diagram.js'

describe('workflowDiagram', () => {
  it('throws WorkflowNotFoundError for an unregistered name', () => {
    expect(() => workflowDiagram(`no-such-diagram-workflow-${Math.random()}`)).toThrow(WorkflowNotFoundError)
  })

  it('renders a registered spec by name', () => {
    const name = `diagram-fixture-${Math.random()}`
    registerWorkflow(
      defineWorkflow({
        name,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: 'brief-check' },
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check', retries: 2 }
        ]
      })
    )

    const diagram = workflowDiagram(name)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).toMatch(/retry, budget 2/)
  })
})
