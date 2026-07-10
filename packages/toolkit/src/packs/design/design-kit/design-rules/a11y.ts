import { rgb as wcagContrastRatio } from 'wcag-contrast'
import type { AnyNode, Violation } from './types.js'

const MIN_TOUCH_TARGET_PX = 24 // WCAG 2.5.8 target-size AA minimum

/**
 * Universal per-node check: interactivity comes from the node's own
 * prototype `reactions` (a real Plugin-API signal) — no role tag, no config.
 * Kit-instance internals are exempt (their sizing is the kit's, not ours).
 */
export function touchTargetViolation(node: AnyNode): Violation | null {
  if (node.insideInstance) return null
  if (!((node.reactions?.length ?? 0) > 0)) return null
  if (node.width >= MIN_TOUCH_TARGET_PX && node.height >= MIN_TOUCH_TARGET_PX) return null
  return {
    rule: 'touch-target-too-small',
    detail: `"${node.name}" has prototype interactions but is ${node.width}x${node.height}px — below the ${MIN_TOUCH_TARGET_PX}x${MIN_TOUCH_TARGET_PX}px WCAG 2.5.8 minimum`
  }
}

const to255 = (c: { r: number; g: number; b: number }): [number, number, number] => [
  Math.round(c.r * 255),
  Math.round(c.g * 255),
  Math.round(c.b * 255)
]

/**
 * Universal per-node WCAG AA text-contrast check — the ratio math is the
 * `wcag-contrast` npm package (spec formula, not hand-rolled); only the
 * Figma-side background resolution is ours (`ancestorSolidFill`, threaded
 * down the walk from the nearest ancestor with a fully-opaque solid fill).
 * Deterministic-or-skip: no resolvable solid background, a semi-transparent
 * fill, or any compositing ambiguity means SKIP, never guess — a wrong
 * hard violation costs more than a missed advisory.
 */
export function textContrastViolation(node: AnyNode): Violation | null {
  if (node.insideInstance) return null
  if (node.type !== 'TEXT') return null
  const bg = node.ancestorSolidFill
  if (!bg || bg.type !== 'SOLID' || bg.visible === false || (bg.opacity ?? 1) < 1) return null
  if (!Array.isArray(node.fills)) return null // figma.mixed — skip, never guess
  const fill = node.fills.find((f: any) => f?.type === 'SOLID' && f.visible !== false)
  if (!fill || (fill.opacity ?? 1) < 1) return null
  if (typeof node.fontSize !== 'number') return null // figma.mixed sizes — skip
  const ratio = wcagContrastRatio(to255(fill.color), to255(bg.color))
  const isLargeText = node.fontSize >= 24
  const threshold = isLargeText ? 3 : 4.5
  if (ratio >= threshold) return null
  return {
    rule: 'wcag-contrast-fail',
    detail: `"${node.name}" text contrast ${ratio.toFixed(2)}:1 is below the WCAG AA threshold (${threshold}:1 for ${isLargeText ? 'large' : 'normal'} text)`
  }
}
