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
 * D15/D23: drops any waiver whose sourceVersion no longer matches the caller-supplied
 * current design-source version — e.g. design-upgrade passes the kit.lock version after
 * a kit re-import for the external-kit recipe; other recipes supply their own pin.
 */
export function invalidateWaivers(waivers, currentSourceVersion) {
  const valid = []
  const invalidated = []
  for (const waiver of waivers) {
    if (waiver.sourceVersion === currentSourceVersion) valid.push(waiver)
    else invalidated.push(waiver)
  }
  return { valid, invalidated }
}
