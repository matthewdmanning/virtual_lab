import assert from "node:assert/strict";
import { peakArea, peakMoments } from "../apps/hplc-simulator/analysis.js";

/** Use this function to assert |actual − expected| ≤ relative·|expected| + absolute. */
export function close(actual, expected, relative = 1e-9, absolute = 0) {
  assert.ok(Number.isFinite(actual), `${actual} is not finite`);
  assert.ok(
    Math.abs(actual - expected) <= relative * Math.abs(expected) + absolute,
    `${actual} ≠ ${expected} (rel ${relative}, abs ${absolute})`,
  );
}

/** Use this function to run a Simulation to completion and return per-solute { times, signal } series. */
export function runToEnd(sim, interval = 0.25) {
  const series = sim.solutes.map(() => ({ times: [], signal: [] }));
  const collect = () =>
    sim.drainSamples().forEach((samples, i) => {
      for (const { time, intensity } of samples) {
        series[i].times.push(time);
        series[i].signal.push(intensity);
      }
    });
  while (!sim.finished) {
    sim.advance(interval);
    collect();
  }
  collect();
  return series;
}

/** Use this function to get area, centroid and variance of one detector series via the analysis module. */
export function seriesMoments({ times, signal }) {
  const { centroid, variance } = peakMoments(times, signal);
  return { area: peakArea(times, signal), centroid, variance };
}

/** Use this function to build an in-memory Storage (getItem/setItem/removeItem/clear). */
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    map,
  };
}
