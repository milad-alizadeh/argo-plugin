/**
 * design doc decision 1's presentation-regen seam: a component's API shape
 * (variant props + enum values) changing routes to owner review instead of
 * silent regen. `VariantMatrix` is the same shape the slim
 * `RegistryEntrySchema.variantMatrix` field stores.
 */
export type VariantMatrix = Record<string, string[]>

export type VariantShapeDiff = {
  changed: boolean
  added: string[]
  removed: string[]
  renamed: [string, string][]
}

function sameValueSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sorted = (values: string[]) => [...values].sort()
  const [sa, sb] = [sorted(a), sorted(b)]
  return sa.every((value, i) => value === sb[i])
}

export function diffVariantShape(previous: VariantMatrix, current: VariantMatrix): VariantShapeDiff {
  const removedKeys = Object.keys(previous).filter((key) => !(key in current))
  const addedKeys = Object.keys(current).filter((key) => !(key in previous))

  const renamed: [string, string][] = []
  const removed: string[] = []
  const added: string[] = []
  const consumedAdded = new Set<string>()

  for (const oldKey of removedKeys) {
    const match = addedKeys.find((newKey) => !consumedAdded.has(newKey) && sameValueSet(previous[oldKey], current[newKey]))
    if (match) {
      renamed.push([oldKey, match])
      consumedAdded.add(match)
    } else {
      removed.push(oldKey)
    }
  }
  for (const newKey of addedKeys) {
    if (!consumedAdded.has(newKey)) added.push(newKey)
  }

  const sharedValueChanged = Object.keys(previous)
    .filter((key) => key in current)
    .some((key) => !sameValueSet(previous[key], current[key]))

  const changed = added.length > 0 || removed.length > 0 || renamed.length > 0 || sharedValueChanged

  return { changed, added, removed, renamed }
}
