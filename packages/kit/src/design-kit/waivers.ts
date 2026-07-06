type Waiver = Record<string, any>

/**
 * D15: the gate re-fails when observed values depart the waiver's pinned
 * figmaValue/codeValue pair — a waiver only excuses the exact drift it
 * documented, not any future drift on the same property.
 */
export function checkWaiver(waiver: Waiver, observedFigmaValue: unknown, observedCodeValue: unknown) {
  const pass = waiver.figmaValue === observedFigmaValue && waiver.codeValue === observedCodeValue
  return { pass, waiver }
}

/**
 * D15/D23: drops any waiver whose sourceVersion no longer matches the caller-supplied
 * current design-source version — e.g. design-upgrade passes the kit.lock version after
 * a kit re-import for the external-kit recipe; other recipes supply their own pin.
 *
 * `type: 'kit-shadow'` waivers (kit-awareness) are exempt: they document a
 * design decision (a component intentionally shadows a kit candidate), not a
 * design-source pin, and carry no `sourceVersion` field to compare — they
 * coexist in the same `design/waivers.json` array as tier-0 waivers without
 * being swept up by this version check.
 */
export function invalidateWaivers(waivers: Waiver[], currentSourceVersion: string) {
  const valid: Waiver[] = []
  const invalidated: Waiver[] = []
  for (const waiver of waivers) {
    if (waiver.type === 'kit-shadow' || waiver.sourceVersion === currentSourceVersion) valid.push(waiver)
    else invalidated.push(waiver)
  }
  return { valid, invalidated }
}
