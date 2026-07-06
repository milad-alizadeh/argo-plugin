/**
 * Component-category enum (design-memory-placement.md A1): a closed,
 * project-defined set of category names, config-driven rather than a
 * speculative fixed taxonomy. `figma-create`'s placement step resolves a
 * component's target Auto-Layout shelf as a pure function of this enum;
 * `figma-audit`'s reconcile sweep validates a live category against it.
 */
export declare const DEFAULT_COMPONENT_CATEGORIES: string[];
/** Reads `componentCategories` from a parsed `design.<app>` block (`.claude/argo.json`), falling back to the thin default enum when a project sets none. */
export declare function resolveComponentCategories(config: {
    componentCategories?: unknown;
} | null | undefined): string[];
/**
 * Validates a `componentCategories` value: must be a non-empty array of
 * unique, non-empty strings. Returns `{ valid, errors }` rather than
 * throwing — setup-design surfaces `errors` directly to the user.
 */
export declare function validateComponentCategories(categories: unknown): {
    valid: boolean;
    errors: string[];
};
/** Whether `category` is a member of the project's configured enum. */
export declare function isCategoryInEnum(category: string, categories: string[]): boolean;
//# sourceMappingURL=component-categories.d.ts.map