const DEFAULT_COLOR_EPSILON = 1

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

function to8Bit(v) {
  return Math.round(clamp01(v) * 255)
}

function linearToSrgb(c) {
  const clamped = clamp01(c)
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// Oklab/Oklch <-> sRGB per Björn Ottosson's reference matrices:
// https://bottosson.github.io/posts/oklab/
function oklchToSrgb(L, C, hueDegrees) {
  const hueRadians = (hueDegrees * Math.PI) / 180
  const a = C * Math.cos(hueRadians)
  const b = C * Math.sin(hueRadians)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.701614701 * s

  return {
    r: linearToSrgb(rLinear),
    g: linearToSrgb(gLinear),
    b: linearToSrgb(bLinear)
  }
}

function srgbToOklch({ r, g, b }) {
  const rLinear = srgbToLinear(r)
  const gLinear = srgbToLinear(g)
  const bLinear = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * rLinear + 0.5363325363 * gLinear + 0.0514459929 * bLinear)
  const m = Math.cbrt(0.2119034982 * rLinear + 0.6806995451 * gLinear + 0.1073969566 * bLinear)
  const s = Math.cbrt(0.0883024619 * rLinear + 0.2817188376 * gLinear + 0.6299787005 * bLinear)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const C = Math.sqrt(A * A + B * B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360

  return { L, C, H }
}

function parseHex(hex) {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255
  }
}

const NUMBER_TOKEN = '-?[\\d.]+(?:e-?\\d+)?'
const OKLCH_PATTERN = new RegExp(
  `oklch\\(\\s*(${NUMBER_TOKEN})(%)?\\s+(${NUMBER_TOKEN})\\s+(${NUMBER_TOKEN})\\s*\\)`
)

function parseOklch(css) {
  const match = css.match(OKLCH_PATTERN)
  if (!match) throw new Error(`unrecognized oklch() syntax: ${css}`)
  const [, lightness, percentSign, chroma, hue] = match
  // CSS Color 4's oklch() writes lightness as a percentage of the 0..1 range
  // (e.g. "63.7%"); a bare number is already in that 0..1 range.
  const L = percentSign ? parseFloat(lightness) / 100 : parseFloat(lightness)
  return oklchToSrgb(L, parseFloat(chroma), parseFloat(hue))
}

function parseCssColor(css) {
  const trimmed = css.trim()
  if (trimmed.startsWith('#')) return parseHex(trimmed)
  if (trimmed.startsWith('oklch(')) return parseOklch(trimmed)
  throw new Error(`unsupported css color syntax: ${css}`)
}

/**
 * Compares a Figma Plugin API color ({r,g,b,a} floats in [0,1]) against a
 * CSS color (hex or oklch()), both normalized to 8-bit sRGB per channel.
 */
export function compareColor(figmaRGBA, cssColor, { epsilon = DEFAULT_COLOR_EPSILON } = {}) {
  const figma8 = {
    r: to8Bit(figmaRGBA.r),
    g: to8Bit(figmaRGBA.g),
    b: to8Bit(figmaRGBA.b)
  }
  const cssRgb = parseCssColor(cssColor)
  const css8 = { r: to8Bit(cssRgb.r), g: to8Bit(cssRgb.g), b: to8Bit(cssRgb.b) }

  const delta = {
    r: Math.abs(figma8.r - css8.r),
    g: Math.abs(figma8.g - css8.g),
    b: Math.abs(figma8.b - css8.b)
  }
  const maxDelta = Math.max(delta.r, delta.g, delta.b)

  return { pass: maxDelta <= epsilon, delta, maxDelta, epsilon }
}

/** Byte-exact comparison for radius/spacing/border/font-size. */
export function comparePxInteger(figmaValue, cssValue) {
  const delta = Math.abs(figmaValue - cssValue)
  return { pass: delta === 0, delta }
}

/** HUG dimensions get a stated tolerance; fixed dimensions pass tolerance=0 for an exact match. */
export function compareHugDimension(figmaValue, renderedValue, tolerance = 0) {
  const delta = Math.abs(figmaValue - renderedValue)
  return { pass: delta <= tolerance, delta, tolerance }
}

export { srgbToOklch, oklchToSrgb }
