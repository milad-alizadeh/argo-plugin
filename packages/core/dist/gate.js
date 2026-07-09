const gates = new Map();
/** Throws if a gate with the same `name` is already registered. */
export function registerGate(gate) {
    if (gates.has(gate.name)) {
        throw new Error(`Gate "${gate.name}" is already registered`);
    }
    gates.set(gate.name, gate);
}
export function getGate(name) {
    return gates.get(name);
}
//# sourceMappingURL=gate.js.map