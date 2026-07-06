/**
 * Figma line-height unit -> CSS line-height, per the design doc's
 * per-property conversion table (D20).
 */
export declare function convertLineHeight(figmaValue: number, unit: string): string;
/** Figma letter-spacing (% of font size) -> em and px. */
export declare function convertLetterSpacing(percentValue: number, fontSize: number): {
    em: number;
    px: number;
};
/**
 * Figma layoutSizing ('FIXED' | 'HUG' | 'FILL') -> which dimension check
 * applies. HUG feeds compareHugDimension's tolerance; FIXED requires an
 * exact match (tolerance 0); FILL is container-dependent and not directly
 * comparable, so it's skipped.
 */
export declare function resolveBoxModel(layoutSizing: string, { hugTolerance }?: {
    hugTolerance?: number;
}): {
    checkType: 'fixed' | 'hug' | 'skip';
    tolerance: number | null;
};
//# sourceMappingURL=conversion-table.d.ts.map