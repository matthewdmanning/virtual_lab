import assert from "node:assert/strict";
import test from "node:test";
import {
  asymmetryFactor,
  detectionLimits,
  plateHeight,
  resolution,
  retentionFactor,
  selectivityFactor,
  signalToNoise,
  tailingFactor,
  theoreticalPlateCount,
  theoreticalResolution,
} from "../apps/hplc-simulator/analysis/metrics.js";

test("retention, selectivity, plates, and HETP follow guide equations", () => {
  assert.equal(retentionFactor(120, 60), 1);
  assert.equal(retentionFactor(60, 60), 0);
  assert.equal(selectivityFactor(2, 4), 2);
  assert.equal(selectivityFactor(4, 2), 2);
  assert.equal(theoreticalPlateCount(100, 2), 2500);
  assert.equal(theoreticalPlateCount(100, 2, { method: "fwhm" }), 13862.5);
  assert.equal(theoreticalPlateCount(100, 2, { method: "baseline" }), 40000);
  assert.ok(Math.abs(plateHeight(0.15, 3000) - 0.00005) < 1e-12);
});

test("resolution and peak-shape metrics are symmetric or directed as defined", () => {
  assert.equal(resolution(100, 110, 4, 6), 2);
  assert.equal(resolution(110, 100, 4, 6), 2);
  assert.equal(
    theoreticalResolution(10000, 2, 4),
    (Math.sqrt(10000) / 4) * (1 / 2) * (4 / 5),
  );
  assert.equal(tailingFactor(2, 2), 1);
  assert.equal(tailingFactor(2, 6), 2);
  assert.equal(asymmetryFactor(2, 6), 3);
  assert.equal(
    resolution(0, Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE),
    1,
  );
  assert.equal(tailingFactor(Number.MAX_VALUE, Number.MAX_VALUE), 1);
});

test("signal and detection metrics preserve zero signal and supplied calibration", () => {
  assert.equal(signalToNoise(0, 2), 0);
  assert.equal(signalToNoise(8, 2), 4);
  assert.deepEqual(detectionLimits(2, 4), { lod: 1.5, loq: 5 });
  assert.deepEqual(detectionLimits(Number.MAX_VALUE, Number.MAX_VALUE), {
    lod: 3,
    loq: 10,
  });
  assert.deepEqual(
    detectionLimits(2, 4, { detectionRatio: 2, quantitationRatio: 6 }),
    { lod: 1, loq: 3 },
  );
});

test("metrics reject impossible domains and arithmetic overflow", () => {
  assert.throws(() => retentionFactor(59, 60), RangeError);
  assert.throws(
    () => retentionFactor(Number.MAX_VALUE, Number.MIN_VALUE),
    RangeError,
  );
  assert.throws(() => selectivityFactor(0, 2), RangeError);
  assert.throws(
    () => theoreticalPlateCount(10, 2, { method: "area" }),
    RangeError,
  );
  assert.throws(
    () => theoreticalPlateCount(Number.MAX_VALUE, Number.MIN_VALUE),
    RangeError,
  );
  assert.throws(() => plateHeight(1, 0), RangeError);
  assert.throws(() => resolution(1, 2, 0, 1), RangeError);
  assert.throws(() => resolution(-1, 2, 1, 1), RangeError);
  assert.throws(() => theoreticalResolution(10, 0.9, 2), RangeError);
  assert.throws(() => tailingFactor(-1, 1), RangeError);
  assert.throws(() => asymmetryFactor(1, 0), RangeError);
  assert.throws(() => signalToNoise(-1, 1), RangeError);
  assert.throws(() => signalToNoise(1, 0), RangeError);
  assert.throws(
    () => detectionLimits(1, 1, { detectionRatio: 10, quantitationRatio: 3 }),
    RangeError,
  );
  assert.throws(
    () => detectionLimits(Number.MAX_VALUE, Number.MIN_VALUE),
    RangeError,
  );
});
