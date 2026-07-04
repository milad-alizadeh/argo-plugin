/**
 * Migration registry — versioned, idempotent reconcile steps for changes that
 * are NOT "re-derive a template" (dependency rewrites, config merges). Each
 * entry: { id, sinceVersion, description, detect(obj), computePatch(obj, ...) }.
 * `detect`/`computePatch` are pure over already-read JSON objects — the skill
 * does the fs reads/writes — mirroring figma-design-kit's tier0-rules split.
 *
 * Slice 1 ships the empty registry so the runner is pure infrastructure;
 * Slice 2 adds the first real entry (vendor-figma-design-kit-absolute-path).
 */
export const migrations = []
