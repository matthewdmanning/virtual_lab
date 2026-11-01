import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../apps/hplc-simulator/simulation.js';

const system = {
    columnLength: 0.1,
    columnDiameter: 0.0046,
    particleSize: 5e-6,
    porosity: 0.4,
    viscosity: 0.001,
    temperature: 298.15,
    flowRate: 1e-8,
    organicFraction: 0.5,
    phaseModifier: 1,
    solventModifier: 1
};

const solutes = [
    { id: 'a', name: 'A', logP: 1, molarVolume: 100, mass: 12 },
    { id: 'b', name: 'B', logP: 2, molarVolume: 120, mass: 7 }
];

/** Use this function to finish a Simulation in bounded chunks; inputs are a Simulation
 * and elapsed chunk size; depends on Simulation.advance and drainSamples. */
function run(simulation, chunks = 0.25) {
    while (!simulation.finished) simulation.advance(Math.min(chunks, simulation.duration - simulation.time));
    return simulation.drainSamples();
}

/** Use this function to collect incremental detector output; inputs are a Simulation
 * and chunk size; depends on Simulation.advance and drainSamples. */
function drainRegularly(simulation, chunk = 0.1) {
    const drained = simulation.solutes.map(() => []);
    while (!simulation.finished) {
        simulation.advance(Math.min(chunk, simulation.duration - simulation.time));
        simulation.drainSamples().forEach((samples, index) => drained[index].push(...samples));
    }
    simulation.drainSamples().forEach((samples, index) => drained[index].push(...samples));
    return drained;
}

test('continuous mode uses SI physics, captures apex, and conserves Gaussian mass', () => {
    const simulation = new Simulation({ system, solutes, detectorIntervalSeconds: 0.01 });
    assert.equal(simulation.positions.length, 0);
    assert.equal(simulation.soluteIndices.length, 0);
    const samples = run(simulation);
    assert.ok(samples.every((series) => series.some((sample) => sample.intensity > 0)));
    simulation.solutes.forEach((solute, index) => {
        const area = samples[index].slice(1).reduce((sum, sample, position) => {
            const previous = samples[index][position];
            return sum + (sample.time - previous.time) * (sample.intensity + previous.intensity) / 2;
        }, 0);
        assert.ok(Math.abs(area - solutes[index].mass) < 0.02);
        assert.ok(samples[index].some((sample) => sample.time === solute.tr));
    });
});

test('fixed physical stepping is invariant to advance partitioning', () => {
    const one = new Simulation({ system, solutes, seed: 42, mode: 'stochastic', particleCount: 400 });
    const two = new Simulation({ system, solutes, seed: 42, mode: 'stochastic', particleCount: 400 });
    const oneSamples = run(one, 0.25);
    const twoSamples = run(two, 0.1);
    assert.deepEqual(Array.from(one.positions), Array.from(two.positions));
    assert.deepEqual(oneSamples, twoSamples);
});

test('stochastic mode is repeatable and conserves per-solute mass', () => {
    const first = new Simulation({ system, solutes, seed: 7, mode: 'stochastic', particleCount: 2000 });
    const second = new Simulation({ system, solutes, seed: 7, mode: 'stochastic', particleCount: 2000 });
    const firstSamples = run(first);
    const secondSamples = run(second);
    assert.deepEqual(firstSamples, secondSamples);
    firstSamples.forEach((series, index) => {
        const area = series.reduce((sum, sample) => sum + sample.intensity * first.detectorIntervalSeconds, 0) +
            first.remainingMass[index];
        assert.ok(Math.abs(area - solutes[index].mass) < 1e-9);
    });
});

test('stochastic arrival moments agree with analytical retention and width', () => {
    const simulation = new Simulation({
        system, solutes: [solutes[0]], seed: 17, mode: 'stochastic', particleCount: 5000,
        stepSeconds: 0.005
    });
    const samples = run(simulation)[0];
    const weights = samples.map((sample) => sample.intensity * simulation.detectorIntervalSeconds);
    const mass = weights.reduce((sum, value) => sum + value, 0);
    const mean = samples.reduce((sum, sample, index) => sum + sample.time * weights[index], 0) / mass;
    const variance = samples.reduce((sum, sample, index) => sum + (sample.time - mean) ** 2 * weights[index], 0) / mass;
    const { tr, sigma } = simulation.solutes[0];
    assert.ok(Math.abs(mean - tr) < sigma * 0.35, `mean=${mean} tr=${tr} sigma=${sigma}`);
    assert.ok(Math.abs(Math.sqrt(variance) - sigma) < sigma * 0.35,
        `width=${Math.sqrt(variance)} sigma=${sigma}`);
});

test('extra-column delay and regular draining remain deterministic', () => {
    const delayedSystem = { ...system, extraColumnVariance: 0.02 };
    const one = new Simulation({ system: delayedSystem, solutes, seed: 11,
        mode: 'stochastic', particleCount: 1000 });
    const two = new Simulation({ system: delayedSystem, solutes, seed: 11,
        mode: 'stochastic', particleCount: 1000 });
    const oneSamples = run(one);
    const twoSamples = drainRegularly(two);
    oneSamples.forEach((series, index) => {
        assert.deepEqual(series, twoSamples[index].sort((a, b) => a.time - b.time));
    });
});

test('configuration, measured LSS, and completion validation is explicit', () => {
    assert.throws(() => new Simulation({ system, solutes: [{ ...solutes[0], id: 'a' }, { ...solutes[1], id: 'a' }] }), /Duplicate/);
    assert.throws(() => new Simulation({ system, solutes, mode: 'gpu' }), /mode/);
    assert.throws(() => new Simulation({ system, solutes, stepSeconds: 0 }), /stepSeconds/);
    assert.throws(() => new Simulation({ system, solutes, stepSeconds: 1e-20 }), /stepSeconds/);
    assert.throws(() => new Simulation({ system, solutes, detectorIntervalSeconds: 1e-20 }), /ceiling/);
    assert.throws(() => new Simulation({ system, solutes, particleCount: 1, mode: 'stochastic' }), /at least/);
    const measured = new Simulation({ system, solutes: [{ id: 'measured', name: 'M', logKw: 2, S: 3, molarVolume: 100 }] });
    assert.ok(measured.solutes[0].k > 0);
    const simulation = new Simulation({ system, solutes });
    run(simulation);
    assert.equal(simulation.finished, true);
    assert.equal(simulation.time, simulation.duration);
    assert.deepEqual(simulation.drainSamples(), [[], []]);
});


test('continuous samples are invariant to incremental draining and frame partitions', () => {
    const full = new Simulation({ system, solutes });
    const frames = new Simulation({ system, solutes });
    assert.deepEqual(drainRegularly(frames, 1 / 60), run(full));
});
