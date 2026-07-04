import { describe, it, expect } from 'vitest'
import {
  nonSemanticBindingViolation,
  retiredFileKeyBindingViolation,
  kitPatchesConformanceViolations
} from '../packages/figma-design-kit-shadcn-tailwind/tier0-rules.js'

describe('nonSemanticBindingViolation', () => {
  const KIT_FILE_KEY = 'kit-file-key'

  it('passes a kit-sourced variable', () => {
    const variable = { remote: true, key: `${KIT_FILE_KEY}:1:2`, variableCollectionId: 'coll1' }
    expect(nonSemanticBindingViolation(variable, KIT_FILE_KEY)).toBeNull()
  })

  it('passes a Semantic (non-kit, collection-bound) variable', () => {
    const variable = { remote: false, key: 'local:1:2', variableCollectionId: 'semantic-coll' }
    expect(nonSemanticBindingViolation(variable, KIT_FILE_KEY)).toBeNull()
  })

  it('flags a variable that is neither kit-sourced nor Semantic', () => {
    const variable = { remote: false, key: 'local:1:2', variableCollectionId: null }
    expect(nonSemanticBindingViolation(variable, KIT_FILE_KEY)).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a non-Semantic variable outside the kit library'
    })
  })

  it('uses the project-configured Semantic collection name in the message', () => {
    const variable = { remote: false, key: 'local:1:2', variableCollectionId: null }
    expect(nonSemanticBindingViolation(variable, KIT_FILE_KEY, 'Theme')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a non-Theme variable outside the kit library'
    })
  })
})

describe('retiredFileKeyBindingViolation', () => {
  it('flags a variable bound to a retired kit library file key', () => {
    const variable = { remote: true, key: 'old-kit-key:1:2' }
    expect(retiredFileKeyBindingViolation(variable, ['old-kit-key'])).toEqual({
      rule: 'retired-file-key-binding',
      detail: 'bound variable resolves to a retired kit library file key "old-kit-key"'
    })
  })

  it('passes a variable bound to the current kit key', () => {
    const variable = { remote: true, key: 'current-kit-key:1:2' }
    expect(retiredFileKeyBindingViolation(variable, ['old-kit-key'])).toBeNull()
  })

  it('passes when there are no retired keys', () => {
    const variable = { remote: true, key: 'current-kit-key:1:2' }
    expect(retiredFileKeyBindingViolation(variable, [])).toBeNull()
  })
})

describe('kitPatchesConformanceViolations', () => {
  it('flags a modified kit-copy node not recorded in kit-patches.json', () => {
    const modifiedNodes = [{ component: 'Button', file: 'button.tsx' }]
    expect(kitPatchesConformanceViolations(modifiedNodes, {})).toEqual([
      { rule: 'kit-patches-conformance', detail: 'edit to kit copy "Button"/"button.tsx" is not recorded in kit-patches.json' }
    ])
  })

  it('passes a modified node recorded in kit-patches.json', () => {
    const modifiedNodes = [{ component: 'Button', file: 'button.tsx' }]
    const kitPatches = { Button: ['button.tsx'] }
    expect(kitPatchesConformanceViolations(modifiedNodes, kitPatches)).toEqual([])
  })

  it('passes when there are no modified nodes', () => {
    expect(kitPatchesConformanceViolations([], {})).toEqual([])
  })
})
