export declare class PlaywrightReporter {
    private storage;
    private modules;
    private unhandledErrors;
    constructor(options?: {
        storage?: {
            saveTest: (contents: string) => Promise<void>;
        };
        projectRoot?: string;
    });
    printsToStdio(): boolean;
    onTestEnd(test: any, result: any): void;
    onError(error: any): void;
    onEnd(result: any): Promise<void>;
}
//# sourceMappingURL=PlaywrightReporter.d.ts.map