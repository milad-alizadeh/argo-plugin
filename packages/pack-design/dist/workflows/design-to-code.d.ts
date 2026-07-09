export declare const designToCodeSpec: {
    name: string;
    stages: ({
        name: string;
        allows: string[];
        skill: string;
        session: "fresh";
        requires?: undefined;
        handsOffToPack?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        skill?: undefined;
        session?: undefined;
        handsOffToPack?: undefined;
    } | {
        name: string;
        requires: string[];
        allows: string[];
        handsOffToPack: string;
        skill?: undefined;
        session?: undefined;
    })[];
};
//# sourceMappingURL=design-to-code.d.ts.map