import type { Gate } from '@argohq/core';
export interface FigmaRgba {
    r: number;
    g: number;
    b: number;
    a?: number;
}
/** What the gate's own capture step returns — a fresh render, never the working agent's. */
export interface CapturedRender {
    /** URI of the screenshot this check captured itself (for evidence only). */
    uri: string;
    /** Sampled colors from the fresh render, keyed by the same element names as `figmaColors`. */
    colors: Record<string, FigmaRgba>;
}
/** The screenshot-capture capability, injected (fake in tests; production wires a real fresh-render capture). Takes no artifact input — it is not handed anything the working agent produced. */
export type CaptureScreenshotFn = () => Promise<CapturedRender>;
export interface DesignMatchesCodeOptions {
    captureScreenshot: CaptureScreenshotFn;
    epsilon?: number;
}
export declare function createDesignMatchesCodeGate(options: DesignMatchesCodeOptions): Gate;
//# sourceMappingURL=design-matches-code.d.ts.map