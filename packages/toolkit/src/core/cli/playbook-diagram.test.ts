import { describe, expect, it } from 'vitest'
import { definePlaybook, registerPlaybook } from '../spec.js'
import { PlaybookNotFoundError } from './errors.js'
import { playbookDiagram } from './playbook-diagram.js'

describe('playbookDiagram', () => {
  it('throws PlaybookNotFoundError for an unregistered name', () => {
    expect(() => playbookDiagram(`no-such-diagram-playbook-${Math.random()}`)).toThrow(PlaybookNotFoundError)
  })

  it('renders a registered spec by name', () => {
    const name = `diagram-fixture-${Math.random()}`
    registerPlaybook(
      definePlaybook({
        name,
        stages: [
          { name: 'brief', allows: ['file-edit'], gate: 'brief-check' },
          { name: 'build', allows: ['file-edit'], gate: 'design-rules-check', retries: 2 }
        ]
      })
    )

    const diagram = playbookDiagram(name)

    expect(diagram).toContain('flowchart TD')
    expect(diagram).toMatch(/retry, budget 2/)
  })
})
