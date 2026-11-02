import {
  requireFinite,
  requireFiniteOutput,
  requirePositive,
} from "../physics/validation.js";
import {
  retentionFactor,
  theoreticalPlateCount,
  plateHeight,
  tailingFactor,
  asymmetryFactor,
} from "./metrics.js";

/** Use this function to validate numeric time/signal arrays and subtract a scalar
 * or per-sample baseline; depends on requireFinite and requireFiniteOutput. */
function prepareSignal(times, signal, baseline) {
  const numericArray = (value) =>
    Array.isArray(value) ||
    (ArrayBuffer.isView(value) && !(value instanceof DataView));
  if (
    !numericArray(times) ||
    !numericArray(signal) ||
    times.length < 2 ||
    times.length !== signal.length
  ) {
    throw new TypeError(
      "Time and signal must be equal-length numeric arrays with at least two samples.",
    );
  }
  const baselineArray = numericArray(baseline);
  if (baselineArray && baseline.length !== times.length)
    throw new RangeError("Baseline length must match signal.");
  if (!baselineArray) requireFinite("Baseline", baseline);
  const values = new Float64Array(signal.length);
  for (let i = 0; i < times.length; i++) {
    requireFinite("Sample time", times[i]);
    requireFinite("Signal", signal[i]);
    if (
      i &&
      (!(times[i] > times[i - 1]) || !Number.isFinite(times[i] - times[i - 1]))
    ) {
      throw new RangeError(
        "Sample times must be strictly increasing with finite intervals.",
      );
    }
    const base = baselineArray ? baseline[i] : baseline;
    requireFinite("Baseline", base);
    values[i] = signal[i] - base;
    requireFiniteOutput("Baseline-corrected signal", values[i]);
  }
  return values;
}

/** Use this function to locate the first positive apex and center a contiguous
 * flat top; inputs are validated times/corrected values; no project dependencies. */
function findApex(times, values) {
  let index = 0;
  for (let i = 1; i < values.length; i++)
    if (values[i] > values[index]) index = i;
  if (values[index] <= 0)
    return { time: null, height: 0, first: index, last: index };
  let last = index;
  while (last + 1 < values.length && values[last + 1] === values[index]) last++;
  return {
    time: times[index] + (times[last] - times[index]) / 2,
    height: values[index],
    first: index,
    last,
  };
}

/** Use this function to integrate signed baseline-corrected signal on irregular
 * times; inputs share one time unit, baseline is a number/array; depends on prepareSignal. */
export function peakArea(times, signal, { baseline = 0 } = {}) {
  const values = prepareSignal(times, signal, baseline);
  let area = 0;
  for (let i = 1; i < times.length; i++) {
    area += (times[i] - times[i - 1]) * (values[i - 1] / 2 + values[i] / 2);
  }
  requireFiniteOutput("Peak area", area);
  return area;
}

/** Use this function to calculate area-weighted centroid/variance for an isolated
 * non-negative corrected peak on numeric times; baseline is scalar/array;
 * depends on prepareSignal and numeric output validation. */
export function peakMoments(times, signal, { baseline = 0 } = {}) {
  const values = prepareSignal(times, signal, baseline);
  if (values.some((value) => value < 0)) {
    throw new RangeError(
      "Peak moments require non-negative baseline-corrected signal; preprocess noise explicitly.",
    );
  }
  let area = 0;
  let firstMoment = 0;
  const offset = 1 / (2 * Math.sqrt(3));
  // Two-point Gauss quadrature is exact for the piecewise-linear signal's
  // first and second moments. Centering avoids cancellation at large time offsets.
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    const mid = times[i - 1] - times[0] + dt / 2;
    const left = values[i - 1] * (0.5 + offset) + values[i] * (0.5 - offset);
    const right = values[i - 1] * (0.5 - offset) + values[i] * (0.5 + offset);
    area += dt * (values[i - 1] / 2 + values[i] / 2);
    firstMoment +=
      (dt / 2) * (left * (mid - dt * offset) + right * (mid + dt * offset));
  }
  requireFiniteOutput("Peak area", area);
  requireFiniteOutput("First moment", firstMoment);
  if (area === 0)
    return { area: 0, centroid: null, variance: null, sigma: null };
  const meanOffset = firstMoment / area;
  let secondMoment = 0;
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    const mid = times[i - 1] - times[0] + dt / 2 - meanOffset;
    const left = values[i - 1] * (0.5 + offset) + values[i] * (0.5 - offset);
    const right = values[i - 1] * (0.5 - offset) + values[i] * (0.5 + offset);
    secondMoment +=
      (dt / 2) *
      (left * (mid - dt * offset) ** 2 + right * (mid + dt * offset) ** 2);
  }
  const centroid = times[0] + meanOffset;
  const variance = secondMoment / area;
  requireFiniteOutput("Peak centroid", centroid);
  requireFiniteOutput("Peak variance", variance);
  return { area, centroid, variance, sigma: Math.sqrt(variance) };
}

/** Use this function to measure nearest left/right crossings around the first
 * highest peak; fraction is in (0,1), baseline is scalar/array, times set units;
 * depends on prepareSignal, findApex, and numeric validation. */
export function peakWidth(
  times,
  signal,
  { fraction = 0.5, baseline = 0 } = {},
) {
  requirePositive("Peak-height fraction", fraction);
  if (fraction >= 1)
    throw new RangeError("Peak-height fraction must be below one.");
  const values = prepareSignal(times, signal, baseline);
  const apex = findApex(times, values);
  const level = apex.height * fraction;
  let leftTime = null;
  let rightTime = null;
  if (apex.height > 0) {
    for (let i = apex.first - 1; i >= 0; i--) {
      if (values[i] <= level) {
        const change = values[i + 1] - values[i];
        requireFiniteOutput("Crossing signal difference", change);
        leftTime =
          times[i] + ((level - values[i]) / change) * (times[i + 1] - times[i]);
        break;
      }
    }
    for (let i = apex.last + 1; i < values.length; i++) {
      if (values[i] <= level) {
        const change = values[i - 1] - values[i];
        requireFiniteOutput("Crossing signal difference", change);
        rightTime =
          times[i - 1] +
          ((values[i - 1] - level) / change) * (times[i] - times[i - 1]);
        break;
      }
    }
  }
  const frontWidth = leftTime === null ? null : apex.time - leftTime;
  const backWidth = rightTime === null ? null : rightTime - apex.time;
  const width =
    leftTime === null || rightTime === null ? null : rightTime - leftTime;
  for (const value of [leftTime, rightTime, frontWidth, backWidth, width]) {
    if (value !== null) requireFiniteOutput("Peak crossing/width", value);
  }
  return { fraction, level, leftTime, rightTime, frontWidth, backWidth, width };
}

/** Use this function to summarize one preselected non-negative corrected peak;
 * inputs are time/signal arrays, scalar/array baseline, optional voidTime and
 * columnLength in consistent units; depends on the peak and scalar metric functions. */
export function analyzePeak(
  times,
  signal,
  { baseline = 0, voidTime, columnLength } = {},
) {
  if (voidTime !== undefined) requirePositive("Void time", voidTime);
  if (columnLength !== undefined)
    requirePositive("Column length", columnLength);
  const values = prepareSignal(times, signal, baseline);
  const apex = findApex(times, values);
  const moments = peakMoments(times, values);
  const half = peakWidth(times, values);
  const five = peakWidth(times, values, { fraction: 0.05 });
  const ten = peakWidth(times, values, { fraction: 0.1 });
  const plates =
    apex.time > 0 && moments.sigma > 0
      ? theoreticalPlateCount(apex.time, moments.sigma)
      : null;
  return {
    retentionTime: apex.time,
    height: apex.height,
    ...moments,
    retentionFactor:
      apex.time === null || voidTime === undefined
        ? null
        : retentionFactor(apex.time, voidTime),
    fwhm: half.width,
    widths: { half, fivePercent: five, tenPercent: ten },
    tailingFactor:
      five.width === null
        ? null
        : tailingFactor(five.frontWidth, five.backWidth),
    asymmetryFactor:
      ten.width === null
        ? null
        : asymmetryFactor(ten.frontWidth, ten.backWidth),
    plateCount: plates,
    plateHeight:
      columnLength === undefined || plates === null
        ? null
        : plateHeight(columnLength, plates),
  };
}
