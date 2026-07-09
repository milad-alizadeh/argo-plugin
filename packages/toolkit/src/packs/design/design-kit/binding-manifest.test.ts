import { describe, it, expect } from 'vitest'
import {
  BindingManifestSchema,
  ConfusablePairsSchema,
  validateBindingManifest
} from './binding-manifest.js'

const registry = {
  components: {
    PlaybooksSection: { nodeId: '1:1', kind: 'custom', whenToUse: 'The playbooks tree section of a session detail screen.' },
    TreeNode: { nodeId: '1:2', kind: 'custom', whenToUse: 'A single tree row primitive.' },
    EvidencePanel: { nodeId: '1:3', kind: 'custom', whenToUse: 'Citation evidence display.' },
    DiffViewer: { nodeId: '1:4', kind: 'custom', whenToUse: 'Code diff display.' },
    TerminalPanel: { nodeId: '1:5', kind: 'custom' } // no whenToUse → Ask-first
  }
}

const confusablePairs = {
  pairs: [
    {
      components: ['PlaybooksSection', 'TreeNode'],
      rule: 'Use PlaybooksSection for the playbooks region; never hand-assemble it from TreeNode primitives.'
    },
    {
      components: ['EvidencePanel', 'DiffViewer'],
      rule: 'Citations use EvidencePanel; DiffViewer is only for code diffs.'
    }
  ]
}

const row = (over: Record<string, unknown> = {}) => ({
  requirement: 'FEAT-R1',
  component: 'DiffViewer',
  purpose: 'shows the file diff for the selected change',
  justification: 'code diff region, not a citation — EvidencePanel does not apply',
  ...over
})

describe('BindingManifestSchema', () => {
  it('accepts a manifest with requirement→component→variant→purpose rows', () => {
    const manifest = {
      screen: 'D03-playbook-detail',
      rows: [
        {
          requirement: 'FEAT-R1',
          component: 'PlaybooksSection',
          variant: 'state=expanded',
          states: ['default', 'hover'],
          purpose: 'renders the playbook tree',
          justification: 'the registry names this the playbooks-region solution'
        }
      ]
    }
    expect(BindingManifestSchema.safeParse(manifest).success).toBe(true)
  })

  it('rejects a row without a purpose clause', () => {
    const manifest = { screen: 's', rows: [{ requirement: 'R1', component: 'X' }] }
    expect(BindingManifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('rejects a manifest with no rows', () => {
    expect(BindingManifestSchema.safeParse({ screen: 's', rows: [] }).success).toBe(false)
  })
})

describe('ConfusablePairsSchema', () => {
  it('accepts pairs of 2+ components with rule text', () => {
    expect(ConfusablePairsSchema.safeParse(confusablePairs).success).toBe(true)
  })

  it('rejects a pair with fewer than 2 components', () => {
    expect(ConfusablePairsSchema.safeParse({ pairs: [{ components: ['A'], rule: 'x' }] }).success).toBe(false)
  })
})

describe('validateBindingManifest', () => {
  const manifest = (rows: any[]) => ({ screen: 'D03', rows })

  it('passes a clean manifest: existing components, whenToUse present, confusables justified', () => {
    const result = validateBindingManifest(manifest([row()]), { registry, confusablePairs })
    expect(result.blocked).toBe(false)
    expect(result.rows[0].tier).toBe('always')
    expect(result.rows[0].blocks).toEqual([])
  })

  it('Never tier: a row naming a component absent from the registry BLOCKS', () => {
    const result = validateBindingManifest(manifest([row({ component: 'InventedThing', justification: undefined })]), {
      registry,
      confusablePairs
    })
    expect(result.blocked).toBe(true)
    expect(result.rows[0].tier).toBe('never')
    expect(result.rows[0].blocks[0]).toMatch(/does not exist in design\/registry\.json/)
  })

  it('Ask-first tier: an existing component with no whenToUse BLOCKS with a stop-and-ask message', () => {
    const result = validateBindingManifest(manifest([row({ component: 'TerminalPanel', justification: undefined })]), {
      registry,
      confusablePairs
    })
    expect(result.blocked).toBe(true)
    expect(result.rows[0].tier).toBe('ask-first')
    expect(result.rows[0].blocks[0]).toMatch(/STOP AND ASK/)
  })

  it('Ask-first tier clears with humanApproved: true (the human answered the ask)', () => {
    const result = validateBindingManifest(
      manifest([row({ component: 'TerminalPanel', humanApproved: true, justification: undefined })]),
      { registry, confusablePairs }
    )
    expect(result.blocked).toBe(false)
    expect(result.rows[0].tier).toBe('ask-first')
  })

  it('confusable-pair row without justification BLOCKS and surfaces the pair rule text', () => {
    const result = validateBindingManifest(manifest([row({ justification: undefined })]), { registry, confusablePairs })
    expect(result.blocked).toBe(true)
    expect(result.rows[0].blocks[0]).toMatch(/EvidencePanel/)
    expect(result.rows[0].blocks[0]).toMatch(/only for code diffs/)
  })

  it('confusable-pair row with explicit justification passes', () => {
    const result = validateBindingManifest(manifest([row()]), { registry, confusablePairs })
    expect(result.blocked).toBe(false)
  })

  it('a non-confusable, whenToUse-carrying component needs no justification', () => {
    const result = validateBindingManifest(
      manifest([{ requirement: 'R2', component: 'PlaybooksSection', purpose: 'tree region' }]),
      { registry, confusablePairs: { pairs: [] } }
    )
    expect(result.blocked).toBe(false)
    expect(result.rows[0].tier).toBe('always')
  })

  it('missing confusable-pairs table is fine (no pairs to apply), the rest still validates', () => {
    const result = validateBindingManifest(manifest([row({ justification: undefined })]), { registry })
    expect(result.blocked).toBe(false)
  })

  it('a malformed manifest reports a schema error instead of throwing', () => {
    const result = validateBindingManifest({ screen: 'D03' }, { registry, confusablePairs })
    expect(result.blocked).toBe(true)
    expect(result.schemaErrors.length).toBeGreaterThan(0)
  })

  it('one blocked row blocks the whole manifest even when siblings are clean', () => {
    const result = validateBindingManifest(manifest([row(), row({ requirement: 'R9', component: 'Nope', justification: undefined })]), {
      registry,
      confusablePairs
    })
    expect(result.blocked).toBe(true)
    expect(result.rows[0].blocks).toEqual([])
    expect(result.rows[1].blocks.length).toBe(1)
  })
})

describe('requirements coverage (manifest coverage lint)', () => {
  const manifest = (rows: any[]) => ({ screen: 'D03', rows })
  const checklist = [
    { id: 'FEAT-R1', requirement: 'diff visible', acceptance: 'a', visible: 'yes' },
    { id: 'FEAT-R2', requirement: 'routing target indicator', acceptance: 'a', visible: 'yes' }
  ]

  it('blocks when a checklist requirement is referenced by no manifest row, citing the row id', () => {
    const result = validateBindingManifest(manifest([row()]), { registry, confusablePairs, requiredRequirements: checklist })
    expect(result.blocked).toBe(true)
    expect(result.uncoveredRequirements).toEqual(['FEAT-R2'])
  })

  it('passes when every checklist requirement is referenced by at least one row', () => {
    const result = validateBindingManifest(
      manifest([
        row(),
        {
          requirement: 'FEAT-R2',
          component: 'PlaybooksSection',
          purpose: 'routing indicator region',
          justification: 'assembled playbooks region, not a single row'
        }
      ]),
      { registry, confusablePairs, requiredRequirements: checklist }
    )
    expect(result.blocked).toBe(false)
    expect(result.uncoveredRequirements).toEqual([])
  })

  it('matches requirement references tolerantly (normalized, id embedded in a longer reference)', () => {
    const result = validateBindingManifest(
      manifest([row({ requirement: 'feat r1 (header diff)' }), row({ requirement: 'FEAT-R2 · indicator' })]),
      { registry, confusablePairs, requiredRequirements: checklist }
    )
    expect(result.uncoveredRequirements).toEqual([])
  })

  it('no requiredRequirements option → coverage check inert, result carries an empty list', () => {
    const result = validateBindingManifest(manifest([row()]), { registry, confusablePairs })
    expect(result.blocked).toBe(false)
    expect(result.uncoveredRequirements).toEqual([])
  })
})
