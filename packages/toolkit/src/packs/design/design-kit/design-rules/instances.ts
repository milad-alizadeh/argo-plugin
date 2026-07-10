import type { AnyNode, Violation } from './types.js'

export function handDrawnIconViolation(node: AnyNode): Violation | null {
  if (node.type === 'VECTOR' && !node.insideInstance) {
    return {
      rule: 'hand-drawn-icon',
      detail: "raw vector glyph outside any library instance — use the design system's icon components"
    }
  }
  return null
}

/**
 * Kit components are used AS-IS: a DENYLIST of the specific illegal edits, not
 * an allowlist — a hard gate's false-positive/false-negative costs are
 * asymmetric (detach-and-edit-icons vs. one visual-review catch), so it fails
 * OPEN: an override outside this list (e.g. `rotation`, `boundVariables`)
 * passes, and only vector geometry, the cornerRadius family, and `effects`
 * hard-fail here.
 *
 * `strokeWeight` (and its per-side/join/cap siblings) is deliberately NOT in
 * this denylist. Figma records a proportional icon rescale as a
 * `strokeWeight` override on the instance; a live library carries that
 * override on every correctly-rescaled icon. Denying it unconditionally would
 * hard-fail every correctly-rescaled icon. strokeWeight legality is owned
 * solely by `strokeScaleViolation`'s proportionality check, never this list.
 *
 * The walker marshals `isRemoteInstance` from getMainComponentAsync().remote
 * and `overriddenFields` from InstanceNode.overrides.
 */
const DENIED_KIT_INSTANCE_OVERRIDE_FIELDS = [
  // geometry
  'vectorPaths',
  'vectorNetwork',
  'relativeTransform',
  // cornerRadius family
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'cornerSmoothing',
  // effects
  'effects'
]

export function kitInstanceOverrideViolation(node: AnyNode): Violation | null {
  if (node.type !== 'INSTANCE' || !node.isRemoteInstance) return null
  const hit = (node.overriddenFields ?? []).find((f: string) => DENIED_KIT_INSTANCE_OVERRIDE_FIELDS.includes(f))
  if (hit) {
    return {
      rule: 'kit-instance-override',
      detail: `kit instance overrides "${hit}" — geometry/corner-radius/effects edits on kit internals are never legal`
    }
  }
  return null
}

/** node.hasMainComponent is resolved by the walker via node.getMainComponentAsync(). */
export function detachedInstanceViolation(node: AnyNode): Violation | null {
  if (node.type === 'INSTANCE' && !node.hasMainComponent) {
    return { rule: 'detached-instance', detail: 'instance has no resolvable main component' }
  }
  return null
}

/**
 * Mechanical false-positive discriminator: a violation on a node that
 * resolves to a kit main component (a remote instance, or a node inside one)
 * whose only overrides are size/fill/stroke is presumptively a GATE BUG, not
 * a real hygiene defect — the designer never touched anything else on that
 * node. Tagging is mechanical (never self-graded by the agent reporting it),
 * and does NOT license detaching or editing kit internals.
 */
const POSSIBLE_FALSE_POSITIVE_OVERRIDE_FIELDS = ['width', 'height', 'fills', 'strokes', 'fillStyleId', 'strokeStyleId']

export function possibleGateFalsePositiveTag(node: AnyNode): boolean {
  if (!node.isRemoteInstance && !node.insideInstance) return false
  const overridden = node.overriddenFields ?? []
  if (overridden.length === 0) return false
  return overridden.every((f: string) => POSSIBLE_FALSE_POSITIVE_OVERRIDE_FIELDS.includes(f))
}

const STROKE_SCALE_TOLERANCE = 0.15

/**
 * Flags an icon-like remote instance (a lucide icon — a 24x24 frame wrapping
 * one VECTOR at strokeWeight 2, per the observed live shape) whose resolved
 * strokeWeight doesn't track its rescale ratio — the walker marshals the
 * plain shape `{ instanceSize, nativeSize, resolvedStrokeWeight,
 * baseStrokeWeight }`. The ratio only holds when the instance was rescaled
 * proportionally (Figma's sanctioned "Scale" tool); a width/height-only
 * resize leaves the original stroke weight in place, producing a visually
 * chunky/thin glyph. ±15% tolerance absorbs legitimate rounding to a
 * whole-pixel stroke weight.
 */
export function strokeScaleViolation({
  instanceSize,
  nativeSize,
  resolvedStrokeWeight,
  baseStrokeWeight
}: {
  instanceSize: number
  nativeSize: number
  resolvedStrokeWeight: number
  baseStrokeWeight: number
}): Violation | null {
  if (!nativeSize) return null
  const expected = baseStrokeWeight * (instanceSize / nativeSize)
  if (expected === 0) return null
  const ratio = resolvedStrokeWeight / expected
  if (ratio < 1 - STROKE_SCALE_TOLERANCE || ratio > 1 + STROKE_SCALE_TOLERANCE) {
    return {
      rule: 'stroke-scale-mismatch',
      detail: `resolved strokeWeight ${resolvedStrokeWeight} does not track the instance's rescale ratio (expected ~${expected.toFixed(2)}) — the icon was likely resized, not rescaled proportionally`
    }
  }
  return null
}
