import { describe, expect, it } from 'vitest'
import { renderPlaybookDiagram } from './diagram.js'
import { definePlaybook } from './spec.js'

describe('renderPlaybookDiagram', () => {
  it('renders a labeled retry-loop edge for a stage with retries', () => {
    const spec = definePlaybook({
      name: 'retry-fixture',
      stages: [{ name: 'build', allows: ['file-edit'], gate: 'design-rules-check', retries: 2 }]
    })

    const diagram = renderPlaybookDiagram(spec)

    expect(diagram).toMatch(/build --\>\|retry, budget 2\| build/)
  })

  it('renders no repeat annotation for a spec with no `repeat` field', () => {
    const spec = definePlaybook({
      name: 'no-repeat-fixture',
      stages: [{ name: 'build', allows: ['file-edit'], gate: 'design-rules-check' }]
    })

    const diagram = renderPlaybookDiagram(spec)

    expect(diagram).not.toMatch(/repeat/)
  })

  it('annotates a stage with `repeat` set', () => {
    const spec = definePlaybook({
      name: 'repeat-fixture',
      stages: [{ name: 'build', allows: ['file-edit'], gate: 'design-rules-check', repeat: 'section' }]
    })

    const diagram = renderPlaybookDiagram(spec)

    expect(diagram).toMatch(/repeat: section/)
  })

  it('never renders a decision diamond shape (audit 1.5 — no runtime-decision branch nodes)', () => {
    const spec = definePlaybook({
      name: 'no-diamonds-fixture',
      stages: [
        { name: 'brief', allows: ['file-edit'], gate: 'brief-check' },
        { name: 'build', allows: ['file-edit'], gate: 'design-rules-check', retries: 2 },
        { name: 'review', allows: ['file-edit'], gate: 'fresh-eyes-review', maxRounds: 1 }
      ]
    })

    const diagram = renderPlaybookDiagram(spec)

    expect(diagram).not.toMatch(/\{.*\}/) // mermaid's diamond/decision node syntax
    expect(diagram).toContain('flowchart LR')
    expect(diagram).toMatch(/brief --\>\|gate: brief-check\| build/)
    expect(diagram).toMatch(/build --\>\|gate: design-rules-check\| review/)
    expect(diagram).toMatch(/build --\>\|retry, budget 2\| build/)
    expect(diagram).toMatch(/review --\>\|fix round, up to 1\| review/)
  })
})
