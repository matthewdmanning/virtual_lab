import assert from 'node:assert/strict';
import test from 'node:test';
import { peakArea, peakMoments, peakWidth, analyzePeak } from '../apps/hplc-simulator/analysis.js';
import { Simulation } from '../apps/hplc-simulator/simulation.js';
import { DEFAULT_SYSTEM } from '../apps/hplc-simulator/simulator-config.js';

/** Use this function to compare a measured quantity with its independent analytic
 * expectation; inputs are numbers and absolute tolerance; depends on node:assert. */
function near(actual, expected, tolerance = 1e-8) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('irregular triangular samples have exact area and continuous moments', () => {
    const times = [0, 0.5, 1.5, 2, 3.3, 4];
    const signal = times.map(time => time <= 2 ? time : 4 - time);
    const before = [...signal];
    near(peakArea(times, signal), 4);
    const moments = peakMoments(new Float64Array(times), new Float32Array([0, 0.5, 1.5, 2, 0.7, 0]));
    near(moments.centroid, 2, 1e-7);
    near(moments.variance, 2 / 3, 1e-7);
    near(peakWidth(times, signal).width, 2);
    assert.deepEqual(signal, before);
    const translated = peakMoments(times.map(time => time + 1e9), signal);
    near(translated.centroid, 1e9 + 2, 1e-6);
    near(translated.variance, 2 / 3, 1e-7);
});

test('Gaussian peak analysis recovers guide metrics after a sloping baseline', () => {
    const times = Array.from({ length: 1001 }, (_, index) => index / 50);
    const baseline = times.map(time => 3 + time / 10);
    const signal = times.map((time, index) => baseline[index] + 7 * Math.exp(-0.5 * ((time - 10) / 2) ** 2));
    const result = analyzePeak(times, signal, { baseline, voidTime: 2, columnLength: 0.15 });
    near(result.retentionTime, 10);
    near(result.height, 7);
    near(result.area, 7 * 2 * Math.sqrt(2 * Math.PI), 0.0001);
    near(result.centroid, 10);
    near(result.sigma, 2, 0.00002);
    near(result.fwhm, 4 * Math.sqrt(2 * Math.log(2)), 0.0001);
    near(result.tailingFactor, 1);
    near(result.asymmetryFactor, 1);
    near(result.retentionFactor, 4);
    near(result.plateCount, 25, 0.001);
    near(result.plateHeight, 0.15 / 25, 1e-7);
});

test('flat apex, asymmetric widths, and incomplete/absent peaks stay explicit', () => {
    const flat = analyzePeak([0, 1, 2, 3, 4], [0, 1, 1, 1, 0]);
    assert.equal(flat.retentionTime, 2);
    assert.equal(flat.fwhm, 3);
    const skewed = analyzePeak([0, 1, 3], [0, 2, 0]);
    near(skewed.asymmetryFactor, 2);
    near(skewed.tailingFactor, 1.5);
    const clipped = analyzePeak([0, 1, 2], [0, 1, 2]);
    assert.equal(clipped.fwhm, null);
    assert.equal(clipped.tailingFactor, null);
    assert.equal(clipped.widths.half.rightTime, null);
    const empty = analyzePeak([0, 1, 2], [0, 0, 0]);
    assert.equal(empty.retentionTime, null);
    assert.equal(empty.plateCount, null);
    assert.equal(empty.sigma, null);
    assert.equal(empty.area, 0);
});

test('signed integration is separate from nonnegative peak moments', () => {
    assert.equal(peakArea([0, 1, 2], [1, 0, 1], { baseline: 1 }), -1);
    assert.throws(() => peakMoments([0, 1, 2], [1, 0, 1], { baseline: 1 }), /non-negative/);
    assert.throws(() => peakArea([0, 1], [0, NaN]), /finite/);
    assert.throws(() => peakArea([0, 0], [0, 1]), /increasing/);
    assert.throws(() => peakArea([0, 1], [0, 1], { baseline: [0] }), /length/);
    assert.throws(() => peakArea([0, 1], [0]), /equal-length/);
    assert.throws(() => peakWidth([0, 1], [0, 1], { fraction: 1 }), /below one/);
    assert.throws(() => peakArea([0, 2], [Number.MAX_VALUE, Number.MAX_VALUE]), /numeric range/);
    assert.throws(() => peakWidth([-Number.MAX_VALUE, 0, Number.MAX_VALUE], [0, 1, 0],
        { fraction: 0.1 }), /numeric range/);
});

test('simulation samples use the same numeric interface as independent measurements', () => {
    const run = new Simulation({ system: DEFAULT_SYSTEM,
        solutes: [{ id: 'standard', logKw: 0, S: 0, molarVolume: 100 }] });
    while (!run.finished) run.advance(Math.min(0.25, run.duration - run.time));
    const points = run.drainSamples()[0];
    const result = analyzePeak(points.map(point => point.time), points.map(point => point.intensity),
        { voidTime: run.solutes[0].t0, columnLength: DEFAULT_SYSTEM.columnLength });
    near(result.retentionTime, run.solutes[0].tr);
    near(result.retentionFactor, 1);
    near(result.area, 100, 0.02);
    assert.ok(Math.abs(result.plateCount / run.solutes[0].N - 1) < 0.01);
});
