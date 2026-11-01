import { requireFiniteOutput, requirePositive } from './validation.js';

// Framework 7, with optional framework 9 extra-column temporal variance.
/** Use this function to combine retention, plate height, and extra-column variance into transport moments. */
export function calculateTransport({ columnLength, u, k, plateHeight, extraColumnVariance = 0 }) {
    requirePositive('Column length', columnLength);
    requirePositive('Interstitial velocity', u);
    requirePositive('Plate height', plateHeight);
    if (!Number.isFinite(k) || !Number.isFinite(extraColumnVariance) ||
        k < 0 || extraColumnVariance < 0) {
        throw new RangeError('Transport inputs are outside their physical ranges.');
    }
    const t0 = columnLength / u;
    const tr = t0 * (1 + k);
    const N = columnLength / plateHeight;
    const H = plateHeight;
    const D_L = plateHeight * u / 2;
    const soluteVelocity = u / (1 + k);
    const soluteDispersion = plateHeight * u / (2 * (1 + k));
    const sigmaZ = columnLength / Math.sqrt(N);
    const columnVariance = tr ** 2 / N;
    const sigmaColumn = Math.sqrt(columnVariance);
    const sigma = Math.sqrt(columnVariance + extraColumnVariance);
    for (const [name, value] of Object.entries({ t0, tr, N, D_L, soluteVelocity,
        soluteDispersion, sigmaZ, sigmaColumn, sigma })) requireFiniteOutput(name, value);
    if (N <= 0) throw new RangeError('Plate count must be positive.');
    return { t0, tr, N, H, D_L, soluteVelocity, soluteDispersion,
        sigmaZ, sigmaColumn, sigma };
}

/** Use this function to evaluate a Gaussian detector signal while preserving injected mass. */
export function gaussianIntensity(time, tr, sigma, mass = 100) {
    if ([time, tr, sigma, mass].some((value) => !Number.isFinite(value)) ||
        sigma <= 0 || mass < 0) {
        throw new RangeError('Gaussian inputs must have positive width and non-negative mass.');
    }
    const intensity = mass / (sigma * Math.sqrt(2 * Math.PI)) *
        Math.exp(-0.5 * ((time - tr) / sigma) ** 2);
    requireFiniteOutput('Gaussian intensity', intensity);
    return intensity;
}
