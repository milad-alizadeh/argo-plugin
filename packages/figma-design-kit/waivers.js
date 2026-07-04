/**
 * D15: the gate re-fails when observed values depart the waiver's pinned
 * figmaValue/codeValue pair — a waiver only excuses the exact drift it
 * documented, not any future drift on the same property.
 */
export function checkWaiver(waiver, observedFigmaValue, observedCodeValue) {
  const pass = waiver.figmaValue === observedFigmaValue && waiver.codeValue === observedCodeValue
  return { pass, waiver }
}

/**
 * D15: drops any waiver whose kitLockVersion no longer matches the current
 * kit.lock version — used by design-upgrade after a kit re-import.
 */
export function invalidateWaivers(waivers, currentKitLockVersion) {
  const valid = []
  const invalidated = []
  for (const waiver of waivers) {
    if (waiver.kitLockVersion === currentKitLockVersion) valid.push(waiver)
    else invalidated.push(waiver)
  }
  return { valid, invalidated }
}
