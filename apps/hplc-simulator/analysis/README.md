# Source-independent chromatography analysis

The public interface is [`../analysis.js`](../analysis.js), implementing the
[analysis guide](../../../analysis-guide.md). All functions are synchronous,
deterministic, and leave inputs unchanged. There are no simulation-state, DOM,
Chart.js, PubChem, file, or network dependencies. Shared numeric validation is
the only dependency outside this analysis directory.

## Numeric metrics

| Function | Inputs / interpretation |
| --- | --- |
| `retentionFactor(tr, t0)` | `(tr − t0)/t0`; matching time units; permits unretained `k = 0` |
| `selectivityFactor(k1, k2)` | Larger positive factor divided by smaller; undefined for `k = 0` |
| `theoreticalPlateCount(tr, width, { method })` | `sigma` (default), `fwhm` (guide's coefficient 5.545), or `baseline` (16) |
| `plateHeight(length, plates)` | HETP in the caller's length unit |
| `resolution(tr1, tr2, width1, width2)` | Observed separation using **baseline** widths, not FWHM |
| `theoreticalResolution(plates, alpha, k)` | Guide's approximate resolution; k is the later analyte's retention factor |
| `tailingFactor(front, back)` | Widths from apex to crossings at **5%** height |
| `asymmetryFactor(front, back)` | Widths from apex to crossings at **10%** height |
| `signalToNoise(height, noiseSD)` | Height above baseline divided by supplied baseline standard deviation |
| `detectionLimits(noiseSD, slope, { detectionRatio, quantitationRatio })` | LOD/LOQ in calibration concentration units; thresholds default to 3 and 10 |

Widths and retention times must share a unit. No particular seconds/minutes or
metres/millimetres convention is built in. Noise and calibration slope must use
the same detector response convention. Positive noise and calibration slope are
required; zero noise does not imply an infinite measurable S/N. Non-finite values,
invalid domains, and nonrepresentable results are rejected.

## Sampled peaks

Pass two equal-length ordinary or typed numeric arrays: strictly increasing
`times` and corresponding `signal`, with at least two samples. Sampling may be
irregular. `baseline` can be a finite scalar (default zero) or an equal-length
numeric array for a drifting baseline. Adapt your source outside this module:
CSV rows, measured traces, or simulation `{time,intensity}` records all become
the same pair of numeric arrays.

```js
import { analyzePeak, resolution } from './apps/hplc-simulator/analysis.js';

const result = analyzePeak(
    [0, 1, 2, 3, 4],
    [0, 1, 3, 1, 0],
    { voidTime: 1, columnLength: 0.15 }
);
// result.retentionTime === 2; result.retentionFactor === 1
const separation = resolution(120, 140, 8, 12); // 2
```

- `peakArea(times, signal, { baseline })` uses signed trapezoidal integration;
  result units are signal × time. Negative baseline-corrected noise remains
  signed rather than being silently clipped into a positive area bias.
- `peakMoments(times, signal, { baseline })` returns `area`, `centroid`, `variance`
  and `sigma` for a **non-negative** corrected peak. It integrates the
  piecewise-linear curve's moments exactly, rather than treating uneven samples
  as equal weights. Negative corrected data must be preprocessed explicitly;
  this module does not guess a noise-removal rule.
- `peakWidth(times, signal, { fraction, baseline })` linearly interpolates the
  nearest crossings around the first highest peak. `fraction` defaults to 0.5.
  Returns crossing times, front/back widths, and total width. A missing crossing
  or total width is `null`; a truncated window is not extrapolated.
- `analyzePeak(times, signal, options)` combines moments, observed apex, FWHM,
  5%/10% widths, tailing, asymmetry, and moment-based plate count. Supply `voidTime`
  for k and `columnLength` for HETP; otherwise those metrics are `null`.

An all-zero corrected peak has zero area/height and null apex, moments, widths,
and efficiency metrics. A contiguous flat maximum uses its time midpoint.
`analyzePeak` shares the non-negative requirement of `peakMoments`.

Select an isolated peak window before calling these functions. They do not
detect all peaks in a chromatogram, deconvolve overlaps, infer baseline or noise,
identify compounds, fit calibration curves, or convert area to concentration
without calibration. Moments and plate count describe the **observed window**;
truncation, extra-column variance, and overlapping peaks affect those estimates.
Use the independently measured baseline width for observed resolution; a
Gaussian does not have an exact finite baseline crossing.

The guide's typical k/shape/resolution ranges are interpretation guidance, not
hard rejection thresholds or automatic instrument-health diagnoses.

## Checks

`npm test` covers guide formulas, Gaussian/triangular/asymmetric/flat peaks,
nonuniform sampling, baseline subtraction, typed arrays, incomplete/zero peaks,
time translation, numerical errors, and simulation-sample interoperability.
`npm run build` includes the analysis module and guide in the static Pages artifact.
