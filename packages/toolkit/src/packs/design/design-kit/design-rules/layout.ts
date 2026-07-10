import type { AnyNode, Violation } from './types.js'

/**
 * A screen's top-level frame must exactly match the project's canonical
 * viewport (opt-in config; skipped entirely when unconfigured, non-breaking
 * for a project that hasn't set it). `isScreenFrame` is marshaled by the
 * walker: true only for the top-level node of a walk whose owning page
 * matches isDesignPageName, never for a descendant or a component-definition
 * frame. Catches a screen that ships at the wrong height because the canvas
 * was grown to fit content instead of fitting content into the canvas.
 */
export function screenViewportMismatchViolation(
  node: AnyNode,
  { isScreenFrame, viewport }: { isScreenFrame: boolean; viewport?: { width: number; height: number } }
): Violation | null {
  if (!isScreenFrame || !viewport) return null
  if (node.width === viewport.width && node.height === viewport.height) return null
  return {
    rule: 'screen-viewport-mismatch',
    detail: `screen frame is ${node.width}x${node.height}, expected ${viewport.width}x${viewport.height} (project canonical viewport)`
  }
}

export function missingAutoLayoutViolation(node: AnyNode): Violation | null {
  // Kit internals structure their own layout — not ours to Auto-Layout.
  if (node.insideInstance) return null
  // A registered screen's own top-level artboard is exempt: a 1440x900 screen
  // frame is a fixed canvas, not a stacked-content container. isScreenFrame is
  // set from registry membership by the walker, frame-only — descendants are
  // still gated.
  if (node.isScreenFrame) return null
  // An instance's layoutMode mirrors its main component — locally-authored
  // components are already audited at their definition, and kit-library
  // instances (single-vector icon leaves especially) structurally cannot have
  // Auto Layout enabled on the instance. Flagging them forced authors to
  // detach kit instances to pass the gate, losing swap/update propagation.
  if ((node.type === 'FRAME' || node.type === 'COMPONENT') && node.layoutMode === 'NONE') {
    // A frame whose children are ALL absolutely positioned (a deliberate
    // backdrop / orb-scene / overlay layer) gains nothing from Auto Layout —
    // requiring it there is rigidity, not hygiene.
    const children: AnyNode[] = node.children ?? []
    // Explicit zero-child check, not implied via .every()'s vacuous pass — a
    // leaf shape has nothing to lay out.
    if (children.length === 0) return null
    if (children.every((c) => c?.layoutPositioning === 'ABSOLUTE')) return null
    return { rule: 'missing-auto-layout', detail: 'frame-like node has no Auto Layout' }
  }
  return null
}
