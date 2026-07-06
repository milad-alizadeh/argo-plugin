/**
 * Pure string generation (no I/O, no bun build) — the entry source
 * `bundleTier0Audit` bundles. `recipe` is the app's `design.<app>.recipe`
 * value (e.g. `'shadcn-tailwind'`); `null`/unknown ⇒ mechanism-only entry, no
 * recipe checks (matches the `baseSource: none` no-op contract).
 */
export declare function generateTier0AuditEntry(recipe: string | null): string;
/**
 * Bundles an entry module (from `generateTier0AuditEntry`) into a single
 * self-contained, import/export-free script runnable in Figma's `use_figma`
 * Plugin API sandbox. Writes the entry to a temp file INSIDE `cwd` so
 * `@argohq/kit` resolves exactly as it does from the host project's real
 * `node_modules`, bundles with `bun build --bundle --format=esm`, restores
 * the bare-completion-value convention (see `makeExportForBundling`), then
 * verifies the result is actually sandbox-runnable: zero `import`/`export`
 * statements, under `maxChars` (use_figma's 50,000-char cap).
 */
export declare function bundleTier0Audit(entrySource: string, { cwd, maxChars }: {
    cwd: string;
    maxChars?: number;
}): string;
/**
 * The skill-facing entry point: generates the recipe-appropriate entry,
 * bundles it, and caches the result at `outPath` (default a per-recipe file
 * under the OS tmpdir — never the host project's `design/` dir; nothing
 * audit-related is committed to the project). The cache key is the
 * generated entry source itself (deterministic per recipe/kit version), not
 * a project file's content hash — there is no project source file to hash
 * anymore.
 */
export declare function bundleTier0AuditForRecipe({ cwd, recipe, outPath, maxChars }: {
    cwd: string;
    recipe?: string | null;
    outPath?: string;
    maxChars?: number;
}): {
    bundled: string;
    bundlePath: string;
    cached: boolean;
};
//# sourceMappingURL=bundle-tier0-audit.d.ts.map