import { calculateMolecularDiffusion, DIFFUSION_DEFAULTS } from './diffusion.js';
import { requireFiniteOutput, requirePositive } from './validation.js';

export const VAN_DEEMTER_DEFAULTS = Object.freeze({
    ...DIFFUSION_DEFAULTS,
    packingFactor: 0.8,
    obstructionFactor: 0.7,
    massTransferFactor: 0.1
});

/** Use this function to estimate molar volume in cm³/mol from molecular weight and density. */
export function estimateMolarVolume(molecularWeight, density = 1000) {
    requirePositive('Molecular weight', molecularWeight);
    requirePositive('Density', density);
    const molarVolume = molecularWeight / (density / 1000);
    requireFiniteOutput('Molar volume', molarVolume);
    return molarVolume;
}

/** Use this function to calculate Van Deemter A/B/C terms from solute diffusion and packing options. */
export function estimateVanDeemterTerms(molarVolume, viscosity, tempK, particleSize, options = {}) {
    requirePositive('Molar volume', molarVolume);
    requirePositive('Viscosity', viscosity);
    requirePositive('Temperature', tempK);
    requirePositive('Particle size', particleSize);
    const D_m = calculateMolecularDiffusion(molarVolume, viscosity, tempK, options);
    const lambda = options.packingFactor ?? VAN_DEEMTER_DEFAULTS.packingFactor;
    const gamma = options.obstructionFactor ?? VAN_DEEMTER_DEFAULTS.obstructionFactor;
    const c_k = options.massTransferFactor ?? VAN_DEEMTER_DEFAULTS.massTransferFactor;
    for (const [name, value] of Object.entries({ packingFactor: lambda,
        obstructionFactor: gamma, massTransferFactor: c_k })) {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError('Van Deemter factors must be finite and non-negative.');
        }
    }
    const A = 2 * lambda * particleSize;
    const B = 2 * gamma * D_m;
    const C = c_k * particleSize ** 2 / D_m;
    for (const [name, value] of Object.entries({ A, B, C })) requireFiniteOutput(name, value);
    return { A, B, C, D_m };
}

/** Use this function to evaluate a dispersion model at one positive interstitial velocity. */
export const DISPERSION_MODELS = Object.freeze({
    vanDeemter: Object.freeze({
        id: 'van-deemter',
        calculate({ velocity, A, B, C }) {
            requirePositive('Velocity', velocity);
            for (const [name, value] of Object.entries({ A, B, C })) {
                if (!Number.isFinite(value) || value < 0) {
                    throw new RangeError('Van Deemter terms must be finite and non-negative.');
                }
            }
            const plateHeight = A + B / velocity + C * velocity;
            requireFiniteOutput('Plate height', plateHeight);
            if (plateHeight <= 0) throw new RangeError('Plate height must be positive.');
            const dispersion = plateHeight * velocity / 2;
            requireFiniteOutput('Axial dispersion', dispersion);
            return { plateHeight, dispersion };
        }
    })
});
