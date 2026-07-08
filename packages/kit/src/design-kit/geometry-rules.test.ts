import { describe, it, expect } from 'vitest'
import { contentStartAlignmentViolations, railAnchorSpanViolation } from './geometry-rules.js'

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

function anchorRow(name: string, y: number, height = 16) {
  return { name, children: [{ id: `${name}-anchor`, name: 'Dot #anchor', y, height }] }
}

function railTree(rootAnchor: { y: number; height: number }, rail: { y: number; height: number }, rows: any[]) {
  return {
    name: 'List',
    children: [
      { id: 'root-anchor', name: 'Root Anchor #anchor', y: rootAnchor.y, height: rootAnchor.height },
      { id: 'rail', name: 'Connector #rail', y: rail.y, height: rail.height },
      ...rows
    ]
  }
}

describe('railAnchorSpanViolation', () => {
  const rootAnchor = { y: 0, height: 16 } // center at y=8
  const rows = [anchorRow('Row 1', 40), anchorRow('Row 2', 80), anchorRow('Row 3', 120)] // last center at y=128

  it('passes an exact match (rail spans parent-anchor-center to last-anchor-center)', () => {
    const tree = railTree(rootAnchor, { y: 8, height: 120 }, rows)
    expect(railAnchorSpanViolation(tree, rows, 1)).toBeNull()
  })

  it('flags a rail 3px short (undershoot), citing both ranges', () => {
    const tree = railTree(rootAnchor, { y: 11, height: 117 }, rows)
    const violation = railAnchorSpanViolation(tree, rows, 1)
    expect(violation).toEqual({
      rule: 'rail-anchor-span-mismatch',
      nodeId: 'rail',
      detail: 'rail spans y=11..128, expected y=8..128 (parent anchor to last-child anchor center) — overshoot or undershoot'
    })
  })

  it('flags a rail 3px long (overshoot)', () => {
    const tree = railTree(rootAnchor, { y: 8, height: 123 }, rows)
    const violation = railAnchorSpanViolation(tree, rows, 1)
    expect(violation?.rule).toBe('rail-anchor-span-mismatch')
  })

  it('passes null when no #rail tag is present (missing-role-tags owns that gap)', () => {
    const tree = { name: 'List', children: [{ id: 'root-anchor', name: 'Root Anchor #anchor', y: 0, height: 16 }, ...rows] }
    expect(railAnchorSpanViolation(tree, rows, 1)).toBeNull()
  })
})
