const DEFAULT_HUG_TOLERANCE = 2

/**
 * Figma line-height unit -> CSS line-height, per the design doc's
 * per-property conversion table (D20).
 */
export function convertLineHeight(figmaValue: number, unit: string): string {
  if (unit === 'PERCENT') return String(figmaValue / 100)
  if (unit === 'PIXELS') return `${figmaValue}px`
  if (unit === 'AUTO') return 'normal'
  throw new Error(`unknown Figma line-height unit: ${unit}`)
}

/** Figma letter-spacing (% of font size) -> em and px. */
export function convertLetterSpacing(percentValue: number, fontSize: number): { em: number; px: number } {
  const em = percentValue / 100
  const px = em * fontSize
  return { em, px }
}

/**
 * Figma layoutSizing ('FIXED' | 'HUG' | 'FILL') -> which dimension check
 * applies. HUG feeds compareHugDimension's tolerance; FIXED requires an
 * exact match (tolerance 0); FILL is container-dependent and not directly
 * comparable, so it's skipped.
 */
export function resolveBoxModel(
  layoutSizing: string,
  { hugTolerance = DEFAULT_HUG_TOLERANCE }: { hugTolerance?: number } = {}
): { checkType: 'fixed' | 'hug' | 'skip'; tolerance: number | null } {
  if (layoutSizing === 'FIXED') return { checkType: 'fixed', tolerance: 0 }
  if (layoutSizing === 'HUG') return { checkType: 'hug', tolerance: hugTolerance }
  if (layoutSizing === 'FILL') return { checkType: 'skip', tolerance: null }
  throw new Error(`unknown Figma layoutSizing value: ${layoutSizing}`)
}
