export declare const codeToDesignSpec: {
    name: string;
    stages: ({
        name: string;
        allows: string[];
        gate: string;
        skill: string;
        session: "fresh";
        requires?: undefined;
        retries?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        gate: string;
        retries: number;
        skill?: undefined;
        session?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        gate?: undefined;
        skill?: undefined;
        session?: undefined;
        retries?: undefined;
    })[];
};
//# sourceMappingURL=code-to-design.d.ts.map