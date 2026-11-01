import { calculateHydrodynamics } from './hydrodynamics.js';
import { calculateRetentionFactor } from './retention.js';
import { DISPERSION_MODELS, estimateVanDeemterTerms } from './kinetics.js';
import { calculateTransport, gaussianIntensity } from './transport.js';

/** Use this function to run the coupled isocratic pipeline for one system and solute. */
export function calculateSolutePhysics(system, solute) {
    if (!system || !solute) throw new TypeError('A system and solute are required.');
    const flow = calculateHydrodynamics(system);
    const terms = estimateVanDeemterTerms(solute.molarVolume, system.viscosity,
        system.temperature, system.particleSize, system);
    const k = calculateRetentionFactor({ ...solute, organicFraction: system.organicFraction,
        phaseModifier: system.phaseModifier, solventModifier: system.solventModifier });
    const { plateHeight } = DISPERSION_MODELS.vanDeemter.calculate({ velocity: flow.u, ...terms });
    return { ...flow, ...terms, k, ...calculateTransport({ columnLength: system.columnLength,
        u: flow.u, k, plateHeight, extraColumnVariance: system.extraColumnVariance }) };
}

export { gaussianIntensity };
