import { requireFiniteOutput, requirePositive } from './validation.js';

// Closed-form and spectral elution profiles. No spatial grids or finite-difference stencils.
const GRID_POINTS = 4096;

/** Use this function to run an in-place iterative radix-2 complex FFT (sign −1 forward, +1 inverse). */
export function fft(re, im, sign = -1) {
    const n = re.length;
    if (n !== im.length || n & (n - 1)) throw new RangeError('FFT length must be a power of two.');
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const angle = sign * 2 * Math.PI / size;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        for (let start = 0; start < n; start += size) {
            let cr = 1;
            let ci = 0;
            for (let k = 0; k < size / 2; k++) {
                const a = start + k;
                const b = a + size / 2;
                const tr = re[b] * cr - im[b] * ci;
                const ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti;
                re[a] += tr; im[a] += ti;
                [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
            }
        }
    }
}

/** Use this function for the scaled complementary error function erfcx(x) = exp(x²)·erfc(x), x ≥ 0 (|rel. err| < 1.2e-7). */
export function erfcx(x) {
    if (!(x >= 0)) throw new RangeError('erfcx requires x ≥ 0.');
    const t = 1 / (1 + 0.5 * x);
    return t * Math.exp(-1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
        t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
        t * (-0.82215223 + t * 0.17087277)))))))));
}

/** Use this function for erfc(x) on the real line. */
export function erfc(x) {
    return x >= 0 ? erfcx(x) * Math.exp(-x * x) : 2 - erfcx(-x) * Math.exp(-x * x);
}

/** Use this function to wrap a sampled, unit-area detector profile with moments and interpolation. */
function tableProfile(start, step, values) {
    let area = 0;
    for (let i = 0; i < values.length; i++) {
        if (!(values[i] > 0)) values[i] = 0;
        area += values[i];
    }
    area *= step;
    requireFiniteOutput('Profile area', area);
    if (area <= 0) throw new RangeError('Profile has no positive signal.');
    let mean = 0;
    let apexIndex = 0;
    for (let i = 0; i < values.length; i++) {
        values[i] /= area;
        mean += (start + i * step) * values[i] * step;
        if (values[i] > values[apexIndex]) apexIndex = i;
    }
    let variance = 0;
    for (let i = 0; i < values.length; i++) variance += (start + i * step - mean) ** 2 * values[i] * step;
    const end = start + (values.length - 1) * step;
    const pdf = (time) => {
        const position = (time - start) / step;
        if (!(position >= 0) || position > values.length - 1) return 0;
        const i = Math.min(values.length - 2, Math.floor(position));
        const fraction = position - i;
        return values[i] * (1 - fraction) + values[i + 1] * fraction;
    };
    return { kind: 'table', start, step, values, mean, sigma: Math.sqrt(variance),
        apexTime: start + apexIndex * step, windowStart: start, windowEnd: end, pdf };
}

/** Use this function to describe a Gaussian detector profile. */
export function gaussianProfile(mean, sigma) {
    requirePositive('Peak width', sigma);
    const norm = 1 / (sigma * Math.sqrt(2 * Math.PI));
    return { kind: 'gaussian', mean, sigma, apexTime: mean,
        windowStart: Math.max(0, mean - 6 * sigma), windowEnd: mean + 6 * sigma,
        pdf: (time) => norm * Math.exp(-0.5 * ((time - mean) / sigma) ** 2) };
}

/** Use this function to invert a characteristic function φ(ω) = E[e^{iωT}] onto a uniform time grid. */
function invertCharacteristic(phi, start, step) {
    const n = GRID_POINTS;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let m = 0; m < n; m++) {
        const index = m < n / 2 ? m : m - n;
        const omega = 2 * Math.PI * index / (n * step);
        const [pr, pi] = phi(omega);
        const cr = Math.cos(-omega * start);
        const ci = Math.sin(-omega * start);
        re[m] = pr * cr - pi * ci;
        im[m] = pr * ci + pi * cr;
    }
    fft(re, im, -1);
    for (let j = 0; j < n; j++) re[j] /= n * step;
    return re;
}

/** Use this function to convolve a sampled profile with a zero-mean Gaussian of the given variance. */
function convolveGaussian(values, step, variance) {
    if (!(variance > 0)) return values;
    const n = values.length;
    const re = Float64Array.from(values);
    const im = new Float64Array(n);
    fft(re, im, -1);
    for (let m = 0; m < n; m++) {
        const index = m < n / 2 ? m : m - n;
        const omega = 2 * Math.PI * index / (n * step);
        const damping = Math.exp(-0.5 * variance * omega * omega);
        re[m] *= damping; im[m] *= damping;
    }
    fft(re, im, 1);
    for (let j = 0; j < n; j++) re[j] /= n;
    return re;
}

/**
 * Use this function for the linear lumped pore model (LDF) detector profile.
 * Transfer function: G(s) = exp(L(u − √(u² + 4D·g(s)))/(2D)), g(s) = s(1 + k·kEff/(s + kEff)),
 * inverted spectrally and multiplied by the extra-column Gaussian factor exp(−σ²ω²/2).
 */
export function lumpedPoreProfile({ columnLength: L, u, axialDispersion: D, k, kEff, extraVariance = 0 }) {
    for (const [name, value] of Object.entries({ L, u, D, kEff })) requirePositive(name, value);
    if (!(k >= 0)) throw new RangeError('Retention factor must be non-negative.');
    const mean = L * (1 + k) / u;
    const sigma = Math.sqrt(2 * D * L * (1 + k) ** 2 / u ** 3 + 2 * k * L / (u * kEff) + extraVariance);
    const start = Math.max(0, mean - 10 * sigma);
    const step = (mean + 25 * sigma - start) / (GRID_POINTS - 1);
    const phi = (omega) => {
        // s = −iω; g(s) = s(1 + k·kEff/(s + kEff)).
        const denRe = kEff;
        const denIm = -omega;
        const denAbs = denRe * denRe + denIm * denIm;
        const fracRe = k * kEff * denRe / denAbs;
        const fracIm = -k * kEff * denIm / denAbs;
        const gRe = omega * fracIm;
        const gIm = -omega * (1 + fracRe);
        const zRe = u * u + 4 * D * gRe;
        const zIm = 4 * D * gIm;
        const modulus = Math.hypot(zRe, zIm);
        const rootRe = Math.sqrt((modulus + zRe) / 2);
        const rootIm = Math.sign(zIm) * Math.sqrt(Math.max(0, (modulus - zRe) / 2));
        const expRe = L * (u - rootRe) / (2 * D) - 0.5 * extraVariance * omega * omega;
        const expIm = -L * rootIm / (2 * D);
        const magnitude = Math.exp(expRe);
        return [magnitude * Math.cos(expIm), magnitude * Math.sin(expIm)];
    };
    return tableProfile(start, step, invertCharacteristic(phi, start, step));
}

/**
 * Use this function for the Cole–Hopf solution of U_t + U·U_x = D·U_xx with initial pulse M·δ(x):
 * U = √(D/πt)·e^{−ξ²}/(1/expm1(R) + erfc(ξ)/2), ξ = x/√(4Dt), R = M/(2D). Overflow-safe for large R.
 */
export function burgersPulse(x, t, D, M) {
    const xi = x / Math.sqrt(4 * D * t);
    const scale = Math.sqrt(D / (Math.PI * t));
    const R = M / (2 * D);
    if (R < 1e-12) return M * Math.exp(-xi * xi) / Math.sqrt(4 * Math.PI * D * t);
    const logExpm1R = R > 30 ? R + Math.log1p(-Math.exp(-R)) : Math.log(Math.expm1(R));
    if (xi >= 0) return scale / (Math.exp(xi * xi - logExpm1R) + erfcx(xi) / 2);
    return scale * Math.exp(-xi * xi) / (Math.exp(-logExpm1R) + erfc(xi) / 2);
}

/**
 * Use this function for the weakly nonlinear Langmuir equilibrium-dispersive profile.
 * q' ≈ a(1 − 2bc) gives c_t + (w0 + w1c)c_z = D'c_zz; U = w1·c solves Burgers' equation, whose
 * Cole–Hopf solution for a pulse of area M is U = √(D'/πt)·e^{−ξ²}/(1/expm1(R) + erfc(ξ)/2),
 * ξ = x/√(4D't), R = M/(2D'), x = z − w0·t. Valid while b·c ≪ 1.
 */
export function langmuirProfile({ columnLength: L, u, dispersion: DL, k, langmuirB, amount,
    mobileArea, extraVariance = 0 }) {
    for (const [name, value] of Object.entries({ L, u, DL, langmuirB, mobileArea })) requirePositive(name, value);
    if (!(k > 0)) throw new RangeError('Langmuir isotherm needs a positive retention factor.');
    if (!(amount >= 0)) throw new RangeError('Injected amount must be non-negative.');
    const w0 = u / (1 + k);
    const w1 = 2 * u * k * langmuirB / (1 + k) ** 2;
    const Dp = DL / (1 + k);
    const M = w1 * amount / (mobileArea * (1 + k));
    const R = M / (2 * Dp);
    requireFiniteOutput('Langmuir loading', R);
    const tr = L / w0;
    const sigma = Math.sqrt(2 * Dp * tr) / w0;
    // Shock-front arrival: w0·t + √(2Mt) = L.
    const root = (-Math.sqrt(2 * M) + Math.sqrt(2 * M + 4 * w0 * L)) / (2 * w0);
    const extraSigma = Math.sqrt(extraVariance);
    const start = Math.max(1e-9 * tr, root * root - 10 * sigma - 8 * extraSigma);
    const step = (tr + 12 * sigma + 8 * extraSigma - start) / (GRID_POINTS - 1);
    const values = new Float64Array(GRID_POINTS);
    for (let i = 0; i < GRID_POINTS; i++) {
        const t = start + i * step;
        const x = L - w0 * t;
        // Below R = 1e-12 the pulse is the linear (Gaussian) limit; M itself may be zero.
        values[i] = R < 1e-12
            ? Math.exp(-x * x / (4 * Dp * t)) / Math.sqrt(4 * Math.PI * Dp * t)
            : burgersPulse(x, t, Dp, M);
    }
    const profile = tableProfile(start, step, convolveGaussian(values, step, extraVariance));
    return { ...profile, loading: R };
}
