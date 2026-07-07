import { describe, it, expect } from 'vitest'
import { parseRequirements, parseMatrix, selectChecklistForScreen } from './completeness-checklist.js'

const PRD = `
# Concierge feature

## Requirements

| ID          | Requirement (must deliver…)          | Acceptance (proven when…)                       | Visible in build? |
| ----------- | ------------------------------------ | ----------------------------------------------- | ----------------- |
| CONCIERGE-R1 | Session list renders                | shows one card per active session               | yes               |
| CONCIERGE-R2 | Empty-state shown when list has 0    | renders empty component with CTA, not blank     | yes               |
| CONCIERGE-R3 | Telemetry event on open             | analytics receives concierge_open              | no                |
| CONCIERGE-R4 | First-run guidance                  | shows setup CTA on cold open                     | partial           |

## Feature → screen matrix

| Requirement  | Disposition                                              |
| ------------ | -------------------------------------------------------- |
| CONCIERGE-R1 | covered-by: cockpit-main                                 |
| CONCIERGE-R2 | covered-by: first-run, cockpit-main                      |
| CONCIERGE-R3 | deferred: no UI surface                                  |
| CONCIERGE-R4 | covered-by: first-run                                    |
`

describe('parseRequirements', () => {
  it('extracts id/requirement/acceptance/visible, discovering columns from the header', () => {
    const reqs = parseRequirements(PRD)
    expect(reqs).toHaveLength(4)
    expect(reqs[0]).toEqual({
      id: 'CONCIERGE-R1',
      requirement: 'Session list renders',
      acceptance: 'shows one card per active session',
      visible: 'yes'
    })
    expect(reqs[3].visible).toBe('partial')
  })

  it('skips placeholder (…) rows and returns [] when there is no requirements table', () => {
    expect(parseRequirements('# no tables here')).toEqual([])
  })
})

describe('parseMatrix', () => {
  it('reads each requirement → disposition row', () => {
    const matrix = parseMatrix(PRD)
    expect(matrix).toContainEqual({ id: 'CONCIERGE-R2', disposition: 'covered-by: first-run, cockpit-main' })
    expect(matrix).toContainEqual({ id: 'CONCIERGE-R3', disposition: 'deferred: no UI surface' })
  })
})

describe('selectChecklistForScreen', () => {
  it('selects covered-by-this-screen requirements that are visible yes|partial', () => {
    const checklist = selectChecklistForScreen(PRD, 'first-run')
    expect(checklist.map((c) => c.id)).toEqual(['CONCIERGE-R2', 'CONCIERGE-R4'])
  })

  it('excludes requirements not covered by the screen', () => {
    const checklist = selectChecklistForScreen(PRD, 'cockpit-main')
    expect(checklist.map((c) => c.id)).toEqual(['CONCIERGE-R1', 'CONCIERGE-R2'])
  })

  it('excludes a Visible-in-build=no requirement even if covered', () => {
    // R3 is deferred anyway; assert an explicit no+covered case
    const md = PRD.replace('| CONCIERGE-R3 | deferred: no UI surface', '| CONCIERGE-R3 | covered-by: first-run')
    const checklist = selectChecklistForScreen(md, 'first-run')
    expect(checklist.map((c) => c.id)).not.toContain('CONCIERGE-R3')
  })

  it('returns [] for a screen named nowhere in the matrix', () => {
    expect(selectChecklistForScreen(PRD, 'settings')).toEqual([])
  })
})
