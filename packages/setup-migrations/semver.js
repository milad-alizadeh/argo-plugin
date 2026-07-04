/**
 * Compare two three-part `major.minor.patch` version strings numerically.
 * Returns <0 if a<b, 0 if equal, >0 if a>b. Part-wise numeric compare — a
 * lexical string compare would wrongly rank "0.9.0" above "0.10.0". No semver
 * dependency is added (none exists in this repo); three-part is all the
 * plugin's own versioning uses.
 */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}
