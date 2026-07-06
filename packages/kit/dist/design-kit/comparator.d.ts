type Rgb = {
    r: number;
    g: number;
    b: number;
};
type Oklch = {
    L: number;
    C: number;
    H: number;
};
declare function oklchToSrgb(L: number, C: number, hueDegrees: number): Rgb;
declare function srgbToOklch({ r, g, b }: Rgb): Oklch;
/**
 * Compares a Figma Plugin API color ({r,g,b,a} floats in [0,1]) against a
 * CSS color (hex or oklch()), both normalized to 8-bit sRGB per channel.
 */
export declare function compareColor(figmaRGBA: {
    r: number;
    g: number;
    b: number;
    a?: number;
}, cssColor: string, { epsilon }?: {
    epsilon?: number;
}): {
    pass: boolean;
    delta: {
        r: number;
        g: number;
        b: number;
    };
    maxDelta: number;
    epsilon: number;
};
/** Byte-exact comparison for radius/spacing/border/font-size. */
export declare function comparePxInteger(figmaValue: number, cssValue: number): {
    pass: boolean;
    delta: number;
};
/** HUG dimensions get a stated tolerance; fixed dimensions pass tolerance=0 for an exact match. */
export declare function compareHugDimension(figmaValue: number, renderedValue: number, tolerance?: number): {
    pass: boolean;
    delta: number;
    tolerance: number;
};
export { srgbToOklch, oklchToSrgb };
//# sourceMappingURL=comparator.d.ts.map