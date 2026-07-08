import { describe, it, expect } from 'vitest'
import {
  contentStartAlignmentViolations,
  railAnchorSpanViolation,
  interRowContinuityViolations,
  indentAndRowConsistencyViolations,
  loadBearingVisibilityViolations,
  crossAxisAnchorOffsetViolations
} from './geometry-rules.js'

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

describe('interRowContinuityViolations', () => {
  it('flags a 40px gap against a 16px itemSpacing + 1px tolerance', () => {
    const rows = [
      { id: 'row-1', name: 'Row 1', y: 0, height: 24 },
      { id: 'row-2', name: 'Row 2', y: 64, height: 24 }
    ]
    expect(interRowContinuityViolations(rows, 16, 1)).toEqual([
      { rule: 'rail-continuity-gap', nodeId: 'row-2', detail: 'gap of 40px between row "Row 1" and "Row 2" exceeds the configured itemSpacing (16px) + tolerance' }
    ])
  })

  it('passes a gap of exactly itemSpacing', () => {
    const rows = [
      { id: 'row-1', name: 'Row 1', y: 0, height: 24 },
      { id: 'row-2', name: 'Row 2', y: 40, height: 24 }
    ]
    expect(interRowContinuityViolations(rows, 16, 1)).toEqual([])
  })
})

describe('indentAndRowConsistencyViolations', () => {
  it('flags a same-depth row indented +8px', () => {
    const rowsByDepth = new Map([
      [0, [
        { id: 'row-1', name: 'Row 1', x: 24, height: 32 },
        { id: 'row-2', name: 'Row 2', x: 32, height: 32 }
      ]]
    ])
    expect(indentAndRowConsistencyViolations(rowsByDepth, 1)).toEqual([
      { rule: 'indent-inconsistent', nodeId: 'row-2', detail: 'depth 0 row "Row 2" is indented to x=32, expected x=24 (matching its depth siblings)' }
    ])
  })

  it('flags a same-depth row 4px taller', () => {
    const rowsByDepth = new Map([
      [0, [
        { id: 'row-1', name: 'Row 1', x: 24, height: 32 },
        { id: 'row-2', name: 'Row 2', x: 24, height: 36 }
      ]]
    ])
    expect(indentAndRowConsistencyViolations(rowsByDepth, 1)).toEqual([
      { rule: 'row-height-inconsistent', nodeId: 'row-2', detail: 'depth 0 row "Row 2" has height 36, expected 32' }
    ])
  })

  it('passes matching x and height at the same depth', () => {
    const rowsByDepth = new Map([
      [0, [
        { id: 'row-1', name: 'Row 1', x: 24, height: 32 },
        { id: 'row-2', name: 'Row 2', x: 24, height: 32 }
      ]]
    ])
    expect(indentAndRowConsistencyViolations(rowsByDepth, 1)).toEqual([])
  })
})

describe('loadBearingVisibilityViolations', () => {
  const clipper = { name: 'Clipper', clipsContent: true, x: 0, y: 0, width: 100, height: 100 }
  const nonClipper = { name: 'NonClipper', clipsContent: false, x: 0, y: 0, width: 100, height: 100 }

  it('passes a visible, opaque, unclipped node', () => {
    const node = { id: 'n1', name: 'Icon #anchor', visible: true, opacity: 1, x: 10, y: 10, width: 10, height: 10 }
    expect(loadBearingVisibilityViolations([{ node, ancestors: [clipper] }])).toEqual([])
  })

  it('flags visible: false', () => {
    const node = { id: 'n1', name: 'Icon #anchor', visible: false, opacity: 1, x: 10, y: 10, width: 10, height: 10 }
    expect(loadBearingVisibilityViolations([{ node, ancestors: [] }])).toEqual([
      { rule: 'load-bearing-node-hidden', nodeId: 'n1', detail: '"Icon #anchor" is role-tagged but visible === false' }
    ])
  })

  it('flags opacity: 0 on the node itself', () => {
    const node = { id: 'n1', name: 'Icon #anchor', visible: true, opacity: 0, x: 10, y: 10, width: 10, height: 10 }
    expect(loadBearingVisibilityViolations([{ node, ancestors: [] }])).toEqual([
      { rule: 'load-bearing-node-transparent', nodeId: 'n1', detail: '"Icon #anchor" resolves to effective opacity 0' }
    ])
  })

  it('flags opacity: 0 on an ancestor only (compounding)', () => {
    const node = { id: 'n1', name: 'Icon #anchor', visible: true, opacity: 1, x: 10, y: 10, width: 10, height: 10 }
    const transparentAncestor = { name: 'Wrapper', opacity: 0 }
    expect(loadBearingVisibilityViolations([{ node, ancestors: [transparentAncestor] }])).toEqual([
      { rule: 'load-bearing-node-transparent', nodeId: 'n1', detail: '"Icon #anchor" resolves to effective opacity 0' }
    ])
  })

  it('flags a node positioned outside a clipsContent: true ancestor bounds', () => {
    const node = { id: 'n1', name: 'Icon #anchor', visible: true, opacity: 1, x: 150, y: 10, width: 10, height: 10 }
    expect(loadBearingVisibilityViolations([{ node, ancestors: [clipper] }])).toEqual([
      { rule: 'load-bearing-node-clipped', nodeId: 'n1', detail: '"Icon #anchor" falls outside its clipping ancestor "Clipper"\'s bounds' }
    ])
  })

  it('passes a node positioned outside a NON-clipping ancestor bounds', () => {
    const node = { id: 'n1', name: 'Icon #anchor', visible: true, opacity: 1, x: 150, y: 10, width: 10, height: 10 }
    expect(loadBearingVisibilityViolations([{ node, ancestors: [nonClipper] }])).toEqual([])
  })
})

function offsetRow(name: string, rowY: number, anchorY: number, id = `${name}-anchor`) {
  return { name, y: rowY, children: [{ id, name: 'Dot #anchor', y: anchorY }] }
}

describe('crossAxisAnchorOffsetViolations', () => {
  it('passes matching relative offsets across 3 rows', () => {
    const rows = [offsetRow('Row 1', 0, 8), offsetRow('Row 2', 40, 48), offsetRow('Row 3', 80, 88)]
    expect(crossAxisAnchorOffsetViolations(rows, 1)).toEqual([])
  })

  it('flags one row whose anchor sits 3px lower relative to its own row top', () => {
    const rows = [offsetRow('Row 1', 0, 8), offsetRow('Row 2', 40, 51), offsetRow('Row 3', 80, 88)]
    const violations = crossAxisAnchorOffsetViolations(rows, 1)
    expect(violations).toEqual([
      { rule: 'anchor-cross-axis-offset', nodeId: 'Row 2-anchor', detail: 'row "Row 2"\'s #anchor sits 11px from its row top, expected 8px (matching its siblings)' }
    ])
  })

  it('skips rows with no anchor tag, []', () => {
    const rows = [offsetRow('Row 1', 0, 8), { name: 'Row 2', y: 40, children: [] }]
    expect(crossAxisAnchorOffsetViolations(rows, 1)).toEqual([])
  })
})
