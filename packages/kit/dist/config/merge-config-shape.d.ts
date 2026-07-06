/**
 * Reconcile a host's on-disk `design.<app>` block (in `.claude/argo.json`)
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
export declare function mergeConfigShape(shape: Record<string, any>, existing: Record<string, any> | undefined): {
    merged: Record<string, any>;
    addedKeys: string[];
};
//# sourceMappingURL=merge-config-shape.d.ts.map