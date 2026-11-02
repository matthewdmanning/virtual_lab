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

/** Editable Knox coefficients; typical well-packed-column values, not measured constants. */
export const KNOX_DEFAULTS = Object.freeze({ A: 1, B: 2, C: 0.05 });

/** Use this function to require finite, non-negative model coefficients. */
function requireCoefficients(label, values) {
    for (const value of Object.values(values)) {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError(`${label} terms must be finite and non-negative.`);
        }
    }
}

/** Use this function to minimise a smooth unimodal function of log10(x) by golden-section search. */
function minimiseLog(f, low = -6, high = 6) {
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = low;
    let b = high;
    for (let i = 0; i < 200 && b - a > 1e-12; i++) {
        const c = b - ratio * (b - a);
        const d = a + ratio * (b - a);
        if (f(10 ** c) < f(10 ** d)) b = d; else a = c;
    }
    return 10 ** ((a + b) / 2);
}

/** Use this function to finish a dispersion result with D_L and reduced (Knox) coordinates. */
function finish({ velocity, plateHeight, axialPlateHeight, optimumVelocity, minimumPlateHeight,
    particleSize, D_m }) {
    requireFiniteOutput('Plate height', plateHeight);
    if (plateHeight <= 0) throw new RangeError('Plate height must be positive.');
    const dispersion = plateHeight * velocity / 2;
    requireFiniteOutput('Axial dispersion', dispersion);
    const reduced = particleSize > 0 && D_m > 0
        ? { reducedVelocity: velocity * particleSize / D_m, reducedPlateHeight: plateHeight / particleSize }
        : {};
    return { plateHeight, dispersion, axialPlateHeight, optimumVelocity, minimumPlateHeight, ...reduced };
}

/**
 * Use this registry to evaluate a dispersion model at one positive interstitial velocity.
 * Van Deemter: H = A + B/u + Cu; u_opt = √(B/C); H_min = A + 2√(BC).
 * Knox: h = Aν^⅓ + B/ν + Cν with ν = u·dp/Dm, H = h·dp; ν_opt is found numerically.
 * axialPlateHeight excludes the mass-transfer term, for kinetic transport models.
 */
export const DISPERSION_MODELS = Object.freeze({
    vanDeemter: Object.freeze({
        id: 'van-deemter',
        calculate({ velocity, A, B, C, particleSize, D_m }) {
            requirePositive('Velocity', velocity);
            for (const value of [A, B, C]) {
                if (!Number.isFinite(value) || value < 0) {
                    throw new RangeError('Van Deemter terms must be finite and non-negative.');
                }
            }
            const optimumVelocity = B > 0 && C > 0 ? Math.sqrt(B / C) : undefined;
            return finish({ velocity, particleSize, D_m,
                plateHeight: A + B / velocity + C * velocity,
                axialPlateHeight: A + B / velocity,
                optimumVelocity,
                minimumPlateHeight: optimumVelocity === undefined ? undefined : A + 2 * Math.sqrt(B * C) });
        }
    }),
    knox: Object.freeze({
        id: 'knox',
        calculate({ velocity, particleSize, D_m, knox = KNOX_DEFAULTS }) {
            requirePositive('Velocity', velocity);
            requirePositive('Particle size', particleSize);
            requirePositive('Molecular diffusion', D_m);
            requireCoefficients('Knox', { A: knox.A, B: knox.B, C: knox.C });
            const h = (nu) => knox.A * Math.cbrt(nu) + knox.B / nu + knox.C * nu;
            const nu = velocity * particleSize / D_m;
            const nuOpt = knox.B > 0 && (knox.C > 0 || knox.A > 0) ? minimiseLog(h) : undefined;
            return finish({ velocity, particleSize, D_m,
                plateHeight: h(nu) * particleSize,
                axialPlateHeight: (knox.A * Math.cbrt(nu) + knox.B / nu) * particleSize,
                optimumVelocity: nuOpt === undefined ? undefined : nuOpt * D_m / particleSize,
                minimumPlateHeight: nuOpt === undefined ? undefined : h(nuOpt) * particleSize });
        }
    })
});

/** Use this function to look a dispersion model up by id ('van-deemter' or 'knox'). */
export function dispersionModel(id = 'van-deemter') {
    const model = Object.values(DISPERSION_MODELS).find((candidate) => candidate.id === id);
    if (!model) throw new RangeError(`Unknown dispersion model: ${id}`);
    return model;
}

/** Editable lumped-pore assumptions: intraparticle porosity and pore tortuosity. */
export const LUMPED_PORE_DEFAULTS = Object.freeze({ particlePorosity: 0.5, tortuosity: 2 });

/**
 * Use this function for the Glueckauf LDF coefficient 1/kEff = dp/(6kf) + dp²/(60Dp) (s⁻¹).
 * kf: Wilson–Geankoplis, Sh = (1.09/ε)(Re·Sc)^⅓ with Re·Sc = εu·dp/Dm; Dp = εp·Dm/τ.
 */
export function calculateLumpedPoreRate({ velocity, porosity, particleSize, D_m,
    particlePorosity = LUMPED_PORE_DEFAULTS.particlePorosity, tortuosity = LUMPED_PORE_DEFAULTS.tortuosity }) {
    for (const [name, value] of Object.entries({ velocity, porosity, particleSize, D_m,
        particlePorosity, tortuosity })) requirePositive(name, value);
    if (porosity >= 1 || particlePorosity >= 1) throw new RangeError('Porosities must be below 1.');
    const filmCoefficient = 1.09 / porosity * D_m / particleSize *
        Math.cbrt(porosity * velocity * particleSize / D_m);
    const poreDiffusion = particlePorosity * D_m / tortuosity;
    const rate = 1 / (particleSize / (6 * filmCoefficient) + particleSize ** 2 / (60 * poreDiffusion));
    requireFiniteOutput('LDF rate', rate);
    return { kEff: rate, filmCoefficient, poreDiffusion };
}
