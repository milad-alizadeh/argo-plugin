export declare const componentEditSpec: {
    name: string;
    stages: ({
        name: string;
        allows: string[];
        gate: string;
        skill: string;
        session: "fresh";
        retries: number;
        requires?: undefined;
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
//# sourceMappingURL=component-edit.d.ts.map