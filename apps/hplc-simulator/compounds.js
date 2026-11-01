const compounds = [
    { name: "Caffeine", logP: -0.1 },
    { name: "Aspirin", logP: 1.2 },
    { name: "Ibuprofen", logP: 3.97 },
    { name: "Acetaminophen", logP: 0.46 },
    { name: "Naproxen", logP: 3.18 },
    { name: "Theophylline", logP: -0.02 },
    { name: "Warfarin", logP: 2.7 }
];

/** Use this constant when the simulation needs a network-independent compound catalog. */
export const DEFAULT_COMPOUNDS = Object.freeze(compounds.map(compound => Object.freeze({
    cid: null,
    name: compound.name,
    logP: compound.logP,
    molecularWeight: null,
    molarVolume: null,
    curated: true,
    category: "General Compounds"
})));
