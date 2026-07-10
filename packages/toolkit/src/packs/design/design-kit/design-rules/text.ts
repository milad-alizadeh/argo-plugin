import type { AnyNode, Violation } from './types.js'

/**
 * Requires a text node to carry a defined shared text style (a preset from
 * the type ramp) — a raw `fontSize`/`lineHeight` variable binding is NOT
 * sufficient. A preset text style bundles size, line-height, weight and
 * letter-spacing as one reusable decision, keeping typography consistent.
 * `textStyleId` is `figma.mixed` (an object) when mixed across a range, and
 * `''` when unset, so only a non-empty string counts as "styled".
 */
export function textStyleRequiredViolation(node: AnyNode): Violation | null {
  // Kit internals carry the kit's own text styling — not ours to restyle.
  if (node.insideInstance) return null
  if (!('fontName' in node)) return null
  const hasTextStyle = typeof node.textStyleId === 'string' && node.textStyleId !== ''
  if (hasTextStyle) return null
  const boundRaw = Boolean(node.boundVariables?.fontSize || node.boundVariables?.lineHeight)
  return {
    rule: 'text-style-required',
    detail: boundRaw
      ? 'text node binds raw fontSize/lineHeight variables instead of a defined text style; apply a preset text style from the type ramp'
      : 'text node has no defined text style; apply a preset text style from the type ramp'
  }
}

/**
 * Deny the CONFIGURATION, not a computed overflow (same R10 denylist
 * economics as kitInstanceOverrideViolation: a hard gate's false-positive
 * cost is asymmetric, and there is no cheap, reliable Plugin-API signal
 * for "is this text ACTIVELY overflowing right now" without a mutating
 * resize-and-measure round trip, which this walker does not perform).
 * `textTruncation: 'ENDING'` means Figma silently clips this label to an
 * ellipsis whenever the rendered content doesn't fit its box, a
 * landmine for any future content change (a longer label, a
 * localization, a font substitution): a label can silently ship clipped
 * (e.g. "Runnin" instead of "Running") with no other signal. The fix is
 * never truncation: auto-resize the text or size the
 * box to the content.
 */
export function textTruncationViolation(node: AnyNode): Violation | null {
  if (node.type !== 'TEXT') return null
  if (node.textTruncation !== 'ENDING') return null
  return {
    rule: 'text-truncation',
    detail: 'text node is configured to truncate ("textTruncation: ENDING"), content can silently clip; auto-resize the text or size its box to the content instead'
  }
}

/**
 * Style-hygiene advisory: authored copy never carries an em dash. Inspects
 * TEXT.characters only — layer/component names are naming-convention
 * territory, not copy. `—` spelled as an escape so the character can't be
 * silently normalized away by an editor touching this file.
 */
export function emDashViolation(node: AnyNode): Violation | null {
  if (node.type === 'TEXT' && typeof node.characters === 'string' && node.characters.includes('—')) {
    return { rule: 'em-dash-in-text', detail: 'text contains an em dash; use a period, comma, colon, or · instead' }
  }
  return null
}

export function implicitLineHeightViolation(node: AnyNode): Violation | null {
  if ('lineHeight' in node && node.lineHeight?.unit === 'AUTO') {
    return { rule: 'implicit-line-height', detail: 'text node uses implicit AUTO line-height; must be explicit (D20)' }
  }
  return null
}

/** Whitespace-normalized form used for copy-deck tracing: canvas line-wraps and stray padding never fail a trace. */
function normalizeCopy(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Untraced copy: every TEXT node's content must trace to a copy-deck entry or
 * a registry component's documented default string. Mechanism, not judgment:
 * `copyAllowedStrings` is derived Node-side (wave copy-deck artifacts
 * flattened, plus every registry entry's `defaultStrings`) — when it is
 * absent (no copy deck in the project), the rule is INERT, so a project that
 * never adopted decks sees zero change.
 *
 * Deliberately NOT `insideInstance`-exempt: a kit master's un-overridden
 * placeholder label ("Button") leaking into a composed screen IS the
 * stale-copy defect class this rule exists to catch — the legal path for a
 * default is documenting it as a `defaultStrings` entry on the component's
 * registry entry. Letter-free content (counts, times, `+12 / -3`) is a data
 * slot, not authored copy, and is skipped deterministically.
 *
 * PROVENANCE CONTRACT (the seam this rule cannot see on its own): the copy
 * deck is authored from the BRIEF/PRD ONLY, BEFORE any canvas read. Never
 * add deck entries to make existing canvas text pass — a deck authored FROM
 * the canvas launders stale clone text ("builder · routing" shipped twice
 * this way) straight through this check. Canvas text with no deck entry is
 * a defect to FIX (retitle to deck copy), never an entry to add.
 */
export function untracedCopyViolation(
  node: AnyNode,
  { copyAllowedStrings }: { copyAllowedStrings?: string[] | null }
): Violation | null {
  if (!copyAllowedStrings || copyAllowedStrings.length === 0) return null
  if (node.type !== 'TEXT') return null
  const content = typeof node.characters === 'string' ? normalizeCopy(node.characters) : ''
  if (content === '') return null
  if (!/[a-zA-Z]/.test(content)) return null
  const allowed = new Set(copyAllowedStrings.map(normalizeCopy))
  if (allowed.has(content)) return null
  return {
    rule: 'untraced-copy',
    detail: `text "${content.length > 60 ? `${content.slice(0, 57)}...` : content}" traces to no copy deck entry and no registry defaultStrings entry; author it in the wave's copy deck (shared strings by key), or document it as the component's canonical default`
  }
}
