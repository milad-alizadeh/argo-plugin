#!/usr/bin/env node
export declare function lintRegionCoverage(contract: {
    regions: {
        name: string;
    }[];
}, dispositions: {
    region: string;
    disposition: string;
}[]): {
    ok: boolean;
    unaccounted: string[];
};
//# sourceMappingURL=region-coverage.d.ts.map