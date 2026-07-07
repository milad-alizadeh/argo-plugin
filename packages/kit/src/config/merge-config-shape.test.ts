import { describe, it, expect } from 'vitest'
import { mergeConfigShape } from './merge-config-shape.js'

describe('mergeConfigShape', () => {
  it('adds a top-level key missing on disk, using the template placeholder', () => {
    const shape = { recipe: '{{RECIPE_NAME}}', newTop: '{{NEW}}' }
    const existing = { recipe: 'shadcn-tailwind' }
    const { merged, addedKeys } = mergeConfigShape(shape, existing)
    expect(merged.newTop).toBe('{{NEW}}')
    expect(merged.recipe).toBe('shadcn-tailwind') // preserved
    expect(addedKeys).toContain('newTop')
  })

  it('preserves an existing value even when it differs from the placeholder', () => {
    const shape = { semanticCollectionName: '{{SEMANTIC_COLLECTION_NAME}}' }
    const existing = { semanticCollectionName: 'Semantic' }
    const { merged, addedKeys } = mergeConfigShape(shape, existing)
    expect(merged.semanticCollectionName).toBe('Semantic')
    expect(addedKeys).toEqual([])
  })

  it('never deletes a key present on disk but absent from the shape (forward-compat)', () => {
    const shape = { recipe: '{{R}}' }
    const existing = { recipe: 'x', recipeConfig: { figma: { customField: 'keep-me' } } }
    const { merged } = mergeConfigShape(shape, existing)
    expect(merged.recipeConfig.figma.customField).toBe('keep-me')
  })

  it('merges nested objects per-key without clobbering existing nested values', () => {
    const shape = { recipeConfig: { figma: { kitLibraryFileKey: '{{KIT}}', newField: '{{NEW}}' } } }
    const existing = { recipeConfig: { figma: { kitLibraryFileKey: 'abc123' } } }
    const { merged, addedKeys } = mergeConfigShape(shape, existing)
    expect(merged.recipeConfig.figma.kitLibraryFileKey).toBe('abc123') // preserved
    expect(merged.recipeConfig.figma.newField).toBe('{{NEW}}') // added
    expect(addedKeys).toContain('recipeConfig.figma.newField')
  })

  it('treats a wholly-missing config as all-added, without throwing', () => {
    const shape = { recipe: '{{R}}', recipeConfig: { figma: { kitLibraryFileKey: '{{KIT}}' } } }
    const { merged, addedKeys } = mergeConfigShape(shape, undefined)
    expect(merged.recipe).toBe('{{R}}')
    expect(addedKeys).toContain('recipe')
    expect(addedKeys).toContain('recipeConfig')
  })
})
