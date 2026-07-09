/**
 * Reconcile a host's on-disk `design.<app>` block (in `.argo/config.json`)
 * against the current template shape (category b, §2b): add any key the current shape has that's missing on
 * disk (with the template's placeholder value), **preserve every existing
 * value verbatim** (even if it differs from the placeholder), and **never
 * delete** a key present on disk but absent from the shape (forward-compat for
 * recipe-specific fields). Nested objects merge per-key, not whole-object
 * replace. Pure — the caller does the fs read/write.
 *
 * Returns { merged, addedKeys } — addedKeys is a list of dot-paths added, for
 * the update-mode skill to report to the user.
 */
export function mergeConfigShape(shape: Record<string, any>, existing: Record<string, any> | undefined) {
  const addedKeys: string[] = []
  const merged = mergeInto(shape, existing ?? {}, '', addedKeys)
  return { merged, addedKeys }
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function mergeInto(shape: Record<string, any>, existing: Record<string, any>, prefix: string, addedKeys: string[]): Record<string, any> {
  // start from the existing object so on-disk-only keys survive untouched
  const out: Record<string, any> = isPlainObject(existing) ? { ...existing } : {}
  for (const [key, shapeVal] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (!(key in out)) {
      out[key] = shapeVal
      addedKeys.push(path)
    } else if (isPlainObject(shapeVal) && isPlainObject(out[key])) {
      out[key] = mergeInto(shapeVal, out[key], path, addedKeys)
    }
    // else: an existing scalar/array value is preserved verbatim
  }
  return out
}
