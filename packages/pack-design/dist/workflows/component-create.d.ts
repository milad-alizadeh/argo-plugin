export declare const componentCreateSpec: {
    name: string;
    stages: ({
        name: string;
        allows: string[];
        skill: string;
        session: "fresh";
        requires?: undefined;
        gate?: undefined;
        retries?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        skill: string;
        session: "fresh";
        gate?: undefined;
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
        skill?: undefined;
        session?: undefined;
        gate?: undefined;
        retries?: undefined;
    })[];
};
//# sourceMappingURL=component-create.d.ts.map