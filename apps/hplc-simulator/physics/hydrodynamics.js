import { requireFinite, requireFiniteOutput, requirePositive } from './validation.js';

// Framework 1: permeability and superficial (Darcy) velocity, in SI units.
export const FLOW_MODELS = Object.freeze({
    kozenyCarman: Object.freeze({
        id: 'kozeny-carman',
        label: 'Kozeny-Carman',
        permeability({ particleSize, porosity }) {
            return (particleSize ** 2 * porosity ** 3) /
                (180 * (1 - porosity) ** 2);
        }
    }),
    simpleDarcy: Object.freeze({
        id: 'simple-darcy',
        label: 'Darcy (constant permeability)',
        permeability({ particleSize }) {
            return particleSize ** 2 / 180;
        }
    })
});

/** Use this function to derive Darcy velocity from pressure, viscosity, geometry, and permeability. */
export function calculateSuperficialVelocity({
    pressureDrop,
    viscosity,
    columnLength,
    particleSize,
    porosity,
    flowModel = FLOW_MODELS.kozenyCarman
}) {
    for (const [name, value] of Object.entries({ pressureDrop, viscosity,
        columnLength, particleSize, porosity })) requireFinite(name, value);
    if (pressureDrop <= 0 || viscosity <= 0 || columnLength <= 0 || particleSize <= 0 ||
        porosity <= 0 || porosity >= 1) {
        throw new RangeError('Flow model inputs are outside their valid ranges.');
    }
    if (!flowModel || typeof flowModel.permeability !== 'function') {
        throw new TypeError('A flow permeability model is required.');
    }
    const permeability = flowModel.permeability({ particleSize, porosity });
    requireFiniteOutput('Permeability', permeability);
    if (permeability <= 0) throw new RangeError('Permeability must be positive.');
    const superficialVelocity = pressureDrop * permeability / (viscosity * columnLength);
    requireFiniteOutput('Superficial velocity', superficialVelocity);
    if (superficialVelocity <= 0) throw new RangeError('Superficial velocity must be positive.');
    return superficialVelocity;
}

/** Use this function to evaluate permeability for one flow model and validated geometry. */
function permeabilityOf(flowModel, particleSize, porosity) {
    const model = flowModel ?? FLOW_MODELS.kozenyCarman;
    if (typeof model.permeability !== 'function') throw new TypeError('A flow permeability model is required.');
    const permeability = model.permeability({ particleSize, porosity });
    requireFiniteOutput('Permeability', permeability);
    if (permeability <= 0) throw new RangeError('Permeability must be positive.');
    return permeability;
}

/**
 * Use this function to calculate interstitial velocity and void-time geometry from either flow or pressure.
 * Framework 9 compressibility (Pa⁻¹) uses ρ = ρout(1 + χ(P − Pout)) with Darcy flow and constant viscosity:
 * outlet superficial velocity = B0(ΔP + χΔP²/2)/(ηL); t0 = εB0((1 + χΔP)³ − 1)/(3χηu²).
 * `u` is then the mean interstitial velocity L/t0; `flowRate` is the outlet volumetric flow.
 */
export function calculateHydrodynamics({ columnLength, columnDiameter, porosity,
    particleSize, viscosity, pressureDrop, flowRate, flowModel, compressibility = 0 }) {
    if ([columnLength, columnDiameter, porosity].some((value) => !Number.isFinite(value)) ||
        columnLength <= 0 || columnDiameter <= 0 || porosity <= 0 || porosity >= 1) {
        throw new RangeError('Column geometry and porosity are invalid.');
    }
    if (!Number.isFinite(compressibility) || compressibility < 0) {
        throw new RangeError('Compressibility must be finite and non-negative.');
    }
    const area = Math.PI * (columnDiameter / 2) ** 2;
    requireFiniteOutput('Column area', area);
    let superficialVelocity;
    let drop = pressureDrop;
    if (flowRate === undefined) {
        superficialVelocity = calculateSuperficialVelocity({ pressureDrop, viscosity, columnLength,
            particleSize, porosity, flowModel });
    } else {
        requirePositive('Flow rate', flowRate);
        superficialVelocity = flowRate / area;
        requireFiniteOutput('Superficial velocity', superficialVelocity);
    }
    let t0;
    if (compressibility > 0) {
        requirePositive('Viscosity', viscosity);
        requirePositive('Particle size', particleSize);
        const permeability = permeabilityOf(flowModel, particleSize, porosity);
        if (flowRate === undefined) {
            requirePositive('Pressure drop', pressureDrop);
            superficialVelocity *= 1 + compressibility * pressureDrop / 2;
        } else {
            const q = superficialVelocity * viscosity * columnLength / permeability;
            drop = Math.expm1(0.5 * Math.log1p(2 * compressibility * q)) / compressibility;
        }
        const expansion = Math.expm1(3 * Math.log1p(compressibility * drop)) / (3 * compressibility);
        t0 = porosity * permeability * expansion / (viscosity * superficialVelocity ** 2);
    }
    const u = t0 === undefined ? superficialVelocity / porosity : columnLength / t0;
    const voidVolume = area * columnLength * porosity;
    t0 ??= columnLength / u;
    for (const [name, value] of Object.entries({ u, superficialVelocity, voidVolume, t0 })) {
        requireFiniteOutput(name, value);
    }
    return { u, superficialVelocity, flowRate: superficialVelocity * area,
        voidVolume, t0, phaseRatio: (1 - porosity) / porosity,
        pressureDrop: drop, area };
}
