import { describe, it, expect } from 'vitest'
import { contentStartAlignmentViolations } from './geometry-rules.js'

function row(name: string, contentStartX: number, id = name) {
  return { name, children: [{ id, name: 'Content #content-start', x: contentStartX }] }
}

describe('contentStartAlignmentViolations', () => {
  it('passes 3 sibling rows with matching content-start x', () => {
    const rows = [row('Row 1', 24), row('Row 2', 24), row('Row 3', 24)]
    expect(contentStartAlignmentViolations(rows, 1)).toEqual([])
  })

  it('flags a row shifted by icon presence, citing that row\'s node id', () => {
    const rows = [row('Row 1', 24), row('Row 2', 40), row('Row 3', 24)]
    const violations = contentStartAlignmentViolations(rows, 1)
    expect(violations).toEqual([
      {
        rule: 'content-start-misaligned',
        nodeId: 'Row 2',
        detail: 'row "Row 2"\'s #content-start is at x=40, expected x=24 (matching its first sibling) — a conditional leading element likely shifted this row\'s content'
      }
    ])
  })

  it('passes a single row (nothing to compare)', () => {
    expect(contentStartAlignmentViolations([row('Row 1', 24)], 1)).toEqual([])
  })

  it('skips a row missing #content-start entirely, not a crash', () => {
    const rows = [row('Row 1', 24), { name: 'Row 2', children: [] }, row('Row 3', 24)]
    expect(contentStartAlignmentViolations(rows, 1)).toEqual([])
  })
})
