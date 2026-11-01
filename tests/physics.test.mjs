import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHydrodynamics, calculateRetentionFactor, calculateSolutePhysics,
    calculateTransport, gaussianIntensity } from '../apps/hplc-simulator/physics-models.js';
import { calculateMolecularDiffusion } from '../apps/hplc-simulator/physics-models.js';
import { updatePhysicsFromPressure } from '../apps/hplc-simulator/experimental/update-physics-from-pressure.js';
import { ChromatographyGPU } from '../apps/hplc-simulator/experimental/webgpu-compute.js';

const system = { columnLength: 0.15, columnDiameter: 0.0046, porosity: 0.4,
    particleSize: 5e-6, viscosity: 0.001, temperature: 298,
    flowRate: 1e-6 / 60, organicFraction: 0.5 };

test('flow-specified hydrodynamics preserves SI Darcy/interstitial distinction', () => {
    const flow = calculateHydrodynamics(system);
    assert.equal(flow.flowRate, system.flowRate);
    assert.ok(Math.abs(flow.t0 - flow.voidVolume / system.flowRate) < 1e-12);
    assert.ok(Math.abs(flow.u - system.flowRate /
        (Math.PI * (system.columnDiameter / 2) ** 2 * system.porosity)) < 1e-12);
    const custom = calculateHydrodynamics({ ...system, flowRate: undefined,
        pressureDrop: 1e7, flowModel: { permeability: () => 1e-10 } });
    assert.ok(custom.u > 0);
    assert.throws(() => calculateHydrodynamics({ ...system, flowRate: 0 }), RangeError);
});

test('measured LSS coefficients drive retention independently of LogP', () => {
    assert.equal(calculateRetentionFactor({ organicFraction: 0.5, logKw: 3, S: 4 }), 10);
    const result = calculateSolutePhysics(system, { logKw: 3, S: 4, molarVolume: 140 });
    assert.equal(result.k, 10);
    assert.ok(result.tr > result.t0);
});

test('pressure, column length and molecular size propagate independently through the pipeline', () => {
    const solute = { logKw: 1, S: 2, molarVolume: 140 };
    const reference = calculateSolutePhysics(system, solute);
    const longer = calculateSolutePhysics({ ...system, columnLength: 0.3 }, solute);
    assert.equal(longer.tr, reference.tr * 2);
    assert.equal(longer.N, reference.N * 2);
    assert.ok(Math.abs(longer.sigma / reference.sigma - Math.sqrt(2)) < 1e-12);
    const larger = calculateSolutePhysics(system, { ...solute, molarVolume: 280 });
    assert.equal(larger.tr, reference.tr);
    assert.ok(larger.D_m < reference.D_m);
    assert.notEqual(larger.N, reference.N);
    const pressure = { ...system, flowRate: undefined, pressureDrop: 1e7 };
    assert.equal(calculateHydrodynamics({ ...pressure, pressureDrop: 2e7 }).u,
        calculateHydrodynamics(pressure).u * 2);
});

test('transport moments retain extra-column variance and reject overflow', () => {
    const result = calculateTransport({ columnLength: 0.15, u: 0.01, k: 1,
        plateHeight: 1e-4, extraColumnVariance: 4 });
    assert.ok(Math.abs(result.sigma ** 2 - (result.sigmaColumn ** 2 + 4)) < 1e-12);
    assert.throws(() => calculateTransport({ columnLength: Number.MAX_VALUE,
        u: Number.MIN_VALUE, k: Number.MAX_VALUE, plateHeight: Number.MIN_VALUE }), RangeError);
    assert.throws(() => gaussianIntensity(0, 0, Number.MIN_VALUE, Number.MAX_VALUE), RangeError);
});

test('diffusion and pressure adapter validate numeric domains and retain both coefficients', () => {
    assert.ok(calculateMolecularDiffusion(140, 0.001, 298) > 0);
    assert.throws(() => calculateMolecularDiffusion(140, 0.001, 298,
        { associationFactor: -1 }), RangeError);
    let params;
    const result = updatePhysicsFromPressure({ ...system, flowRate: undefined,
        pressureDrop: 1e7, A: 8e-6, B: 1e-8, C: 1e-3, k: 2, dt: 1e-4, dz: 1e-3,
        gpuSim: { updateParams(...values) { params = values; } } });
    assert.equal(params[0], result.u / 3);
    assert.equal(params[1], result.D_L / 3);
});

test('GPU adapter rejects unstable steps before browser initialization', () => {
    assert.throws(() => new ChromatographyGPU(1), RangeError);
    const gpu = new ChromatographyGPU();
    assert.throws(() => gpu.updateParams(1, 1, 1, 0.1), RangeError);
    assert.throws(() => gpu.updateParams(1, 1, 0.001, 0.1), Error);
});
