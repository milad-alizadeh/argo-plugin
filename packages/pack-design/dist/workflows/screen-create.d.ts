export declare const screenCreateSpec: {
    name: string;
    stages: ({
        name: string;
        allows: string[];
        produces: string[];
        gate: string;
        skill: string;
        session: "fresh";
        requires?: undefined;
        repeat?: undefined;
        maxRounds?: undefined;
        retries?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        skill: string;
        session: "fresh";
        produces?: undefined;
        gate?: undefined;
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
        skill?: undefined;
        session?: undefined;
        repeat?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        produces?: undefined;
        gate?: undefined;
        skill?: undefined;
        session?: undefined;
        repeat?: undefined;
        maxRounds?: undefined;
        retries?: undefined;
    })[];
};
//# sourceMappingURL=screen-create.d.ts.map