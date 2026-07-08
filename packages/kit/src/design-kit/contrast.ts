/**
 * WCAG 2.1 relative-luminance + contrast-ratio pure math (fidelity-geometry-
 * verifier.md Slice 8). No Figma-specific shapes — reused across projects.
 */
type RGB = { r: number; g: number; b: number } // 0-255

function relativeLuminance({ r, g, b }: RGB): number {
  const chan = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** WCAG AA: 4.5:1 for normal text, 3:1 for large text (>=18pt or >=14pt bold). */
export function wcagContrastViolation(fg: RGB, bg: RGB, isLargeText: boolean): { rule: string; detail: string } | null {
  const ratio = contrastRatio(fg, bg)
  const threshold = isLargeText ? 3 : 4.5
  if (ratio >= threshold) return null
  return {
    rule: 'wcag-contrast-fail',
    detail: `contrast ratio ${ratio.toFixed(2)}:1 is below the WCAG AA threshold (${threshold}:1 for ${isLargeText ? 'large' : 'normal'} text)`
  }
}
