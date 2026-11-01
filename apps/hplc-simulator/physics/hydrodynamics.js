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

/** Use this function to calculate interstitial velocity and void-time geometry from either flow or pressure. */
export function calculateHydrodynamics({ columnLength, columnDiameter, porosity,
    particleSize, viscosity, pressureDrop, flowRate, flowModel }) {
    if ([columnLength, columnDiameter, porosity].some((value) => !Number.isFinite(value)) ||
        columnLength <= 0 || columnDiameter <= 0 || porosity <= 0 || porosity >= 1) {
        throw new RangeError('Column geometry and porosity are invalid.');
    }
    const area = Math.PI * (columnDiameter / 2) ** 2;
    requireFiniteOutput('Column area', area);
    const superficialVelocity = flowRate === undefined
        ? calculateSuperficialVelocity({ pressureDrop, viscosity, columnLength,
            particleSize, porosity, flowModel })
        : (() => {
            requirePositive('Flow rate', flowRate);
            const velocity = flowRate / area;
            requireFiniteOutput('Superficial velocity', velocity);
            return velocity;
        })();
    const u = superficialVelocity / porosity;
    const voidVolume = area * columnLength * porosity;
    const t0 = columnLength / u;
    for (const [name, value] of Object.entries({ u, superficialVelocity, voidVolume, t0 })) {
        requireFiniteOutput(name, value);
    }
    return { u, superficialVelocity, flowRate: superficialVelocity * area,
        voidVolume, t0, phaseRatio: (1 - porosity) / porosity };
}
