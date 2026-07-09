export declare const screenEditSpec: {
    name: string;
    stages: ({
        name: string;
        allows: string[];
        produces: string[];
        gate: string;
        session: "fresh";
        requires?: undefined;
        skill?: undefined;
        repeat?: undefined;
        maxRounds?: undefined;
        retries?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        produces: string[];
        gate: string;
        skill: string;
        session: "warm";
        repeat: string;
        maxRounds: number;
        retries: number;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        gate: string;
        maxRounds: number;
        retries: number;
        produces?: undefined;
        session?: undefined;
        skill?: undefined;
        repeat?: undefined;
    })[];
};
//# sourceMappingURL=screen-edit.d.ts.map