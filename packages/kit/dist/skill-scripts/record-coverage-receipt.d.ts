#!/usr/bin/env node
export declare function buildCoverageReceipt({ contract, builtRegions, dispositions, producedBy, now }: {
    contract: {
        screen: string;
        figmaFileVersion: string;
        regions: any[];
    };
    builtRegions: any[];
    dispositions: any[];
    producedBy: string;
    now?: number;
}): {
    screen: string;
    producedBy: string;
    figmaFileVersion: string;
    timestamp: number;
    summary: {
        present: string[];
        deferred: string[];
        UNACCOUNTED: string[];
        MISSING: string[];
        warnings: {
            name: string;
            path: string;
            warning: string | undefined;
        }[];
        clean: boolean;
    };
    clean: boolean;
};
export { coverageReceiptFilename } from '../design-kit/region-contract.js';
//# sourceMappingURL=record-coverage-receipt.d.ts.map