import { calculateSuperficialVelocity } from '../physics/hydrodynamics.js';
import { DISPERSION_MODELS } from '../physics/kinetics.js';
import { requireFinite, requireFiniteOutput } from '../physics/validation.js';

/** Use this function to adapt pressure-derived SI transport coefficients to an initialized GPU solver. */
export function updatePhysicsFromPressure({
    pressureDrop,
    particleSize,
    porosity,
    viscosity,
    columnLength,
    A,
    B,
    C,
    k = 0,
    dt,
    dz,
    gpuSim,
    flowModel,
    dispersionModel = DISPERSION_MODELS.vanDeemter
}) {
    const inputs = { pressureDrop, particleSize, porosity, viscosity, columnLength,
        A, B, C, k, dt, dz };
    for (const [name, value] of Object.entries(inputs)) requireFinite(name, value);
    if (!gpuSim || typeof gpuSim.updateParams !== 'function') {
        throw new TypeError('Physics parameters and a GPU simulator are required.');
    }
    if (pressureDrop <= 0 || particleSize <= 0 || porosity <= 0 || porosity >= 1 ||
        viscosity <= 0 || columnLength <= 0 || k < 0 || dt <= 0 || dz <= 0) {
        throw new RangeError('Physics parameters must be positive and porosity must be below 1.');
    }
    if (!dispersionModel || typeof dispersionModel.calculate !== 'function') {
        throw new TypeError('A dispersion model is required.');
    }
    const superficialVelocity = calculateSuperficialVelocity({ pressureDrop, viscosity,
        columnLength, particleSize, porosity, flowModel });
    const u = superficialVelocity / porosity;
    const { plateHeight, dispersion: D_L } = dispersionModel.calculate({ velocity: u, A, B, C });
    const retainedVelocity = u / (1 + k);
    const retainedDispersion = D_L / (1 + k);
    for (const [name, value] of Object.entries({ u, D_L, plateHeight,
        retainedVelocity, retainedDispersion })) requireFiniteOutput(name, value);
    const stability = retainedVelocity * dt / dz +
        2 * retainedDispersion * dt / (dz * dz);
    if (!Number.isFinite(stability) || stability > 1) {
        throw new RangeError('Retained GPU transport parameters are unstable for this dt and dz.');
    }
    gpuSim.updateParams(retainedVelocity, retainedDispersion, dt, dz);
    return { u, D_L, H: plateHeight };
}
