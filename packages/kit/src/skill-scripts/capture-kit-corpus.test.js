import { describe, it, expect } from 'vitest'
import { buildKitCorpus } from './capture-kit-corpus.js'

describe('buildKitCorpus', () => {
  it('shapes a corpus with a capturedFrom header, pristine, and inverse sets', () => {
    const pristine = [{ id: '1:1', type: 'INSTANCE' }]
    const inverse = { 'detached-instance': { id: '1:2', type: 'INSTANCE' } }
    expect(buildKitCorpus({ pristine, inverse, semanticModes: ['Light', 'Dark'] }, { capturedFrom: 'test-capture' })).toEqual({
      capturedFrom: 'test-capture',
      semanticModes: ['Light', 'Dark'],
      pristine,
      inverse
    })
  })
})
