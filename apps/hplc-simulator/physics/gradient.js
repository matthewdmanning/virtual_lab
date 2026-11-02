import { requireFiniteOutput, requirePositive } from './validation.js';

// Framework 8: linear-gradient LSS elution. Two solvers:
// 'lss-closed-form' evaluates the glossary §8 equations; 'band-integration' integrates the band ODE (no grid).
export const GRADIENT_SOLVERS = Object.freeze(['lss-closed-form', 'band-integration']);

/** Use this function to build the programmed organic fraction Φ(τ) and its slope, τ measured from gradient start. */
export function gradientProgram({ initialFraction, finalFraction, gradientTime }) {
    for (const value of [initialFraction, finalFraction]) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError('Gradient fractions must lie between 0 and 1.');
        }
    }
    requirePositive('Gradient time', gradientTime);
    const slope = (finalFraction - initialFraction) / gradientTime;
    return {
        fraction: (tau) => tau <= 0 ? initialFraction
            : tau >= gradientTime ? finalFraction : initialFraction + slope * tau,
        slope: (tau) => tau > 0 && tau < gradientTime ? slope : 0
    };
}

/**
 * Use this function to integrate band position z and spatial variance σz² for an LSS solute:
 * dz/dt = u/(1+k), dσz²/dt = 2D_L/(1+k) + 2σz²·∂v/∂z, ∂v/∂z = −S·ln10·k·Φ'(τ)/(1+k)²,
 * with Φ at (z, t) = program(t − tD − z/u). Returns elution time, temporal σ (no extra-column),
 * retention at elution, gradient steepness b and compression G relative to isocratic elution at k_e.
 */
export function integrateGradientElution({ columnLength: L, u, plateHeight: H, logKw, S,
    retentionMultiplier = 1, dwellTime = 0, program, gradientTime, deltaFraction }) {
    for (const [name, value] of Object.entries({ L, u, H, retentionMultiplier })) requirePositive(name, value);
    if (!Number.isFinite(logKw) || !Number.isFinite(S) || S < 0) throw new RangeError('LSS coefficients are invalid.');
    if (!Number.isFinite(dwellTime) || dwellTime < 0) throw new RangeError('Dwell time must be non-negative.');
    const DL = H * u / 2;
    const kAt = (z, t) => retentionMultiplier * 10 ** (logKw - S * program.fraction(t - dwellTime - z / u));
    const derivative = (t, [z, variance]) => {
        const tau = t - dwellTime - z / u;
        const k = kAt(z, t);
        const dvdz = -S * Math.LN10 * k * program.slope(tau) / (1 + k) ** 2;
        return [u / (1 + k), 2 * DL / (1 + k) + 2 * variance * dvdz];
    };
    let t = 0;
    let state = [0, 0];
    for (let steps = 0; steps < 2e6; steps++) {
        const k = kAt(state[0], t);
        const dt = Math.min(L * (1 + k) / (400 * u), gradientTime / 400,
            dwellTime > 0 ? dwellTime / 50 : Infinity);
        const k1 = derivative(t, state);
        const k2 = derivative(t + dt / 2, state.map((v, i) => v + dt / 2 * k1[i]));
        const k3 = derivative(t + dt / 2, state.map((v, i) => v + dt / 2 * k2[i]));
        const k4 = derivative(t + dt, state.map((v, i) => v + dt * k3[i]));
        const next = state.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
        if (next[0] >= L) {
            const fraction = (L - state[0]) / (next[0] - state[0]);
            const time = t + fraction * dt;
            const variance = state[1] + fraction * (next[1] - state[1]);
            const kElution = kAt(L, time);
            const sigma = Math.sqrt(variance) * (1 + kElution) / u;
            const t0 = L / u;
            const isocraticSigma = t0 * (1 + kElution) / Math.sqrt(L / H);
            const result = { tr: time, sigma, kElution, compression: sigma / isocraticSigma,
                steepness: S * deltaFraction * t0 / gradientTime,
                initialK: kAt(0, 0), dwellTime };
            for (const [name, value] of Object.entries(result)) requireFiniteOutput(name, value);
            return result;
        }
        state = next;
        t += dt;
    }
    throw new RangeError('Solute does not elute within the integration limit; raise the final organic fraction.');
}

/** Use this function for the classic no-dwell LSS gradient retention time (Snyder): t0/b·log10(2.303·k0·b + 1) + t0. */
export function snyderGradientRetentionTime({ t0, k0, b }) {
    return t0 / b * Math.log10(2.303 * k0 * b + 1) + t0;
}

/**
 * Use this function for the glossary §8 closed-form LSS gradient framework:
 * b = S·ΔΦ·t0/tG; k̄ ≈ 1/(2.303·b); t_R = (t0/b)·log10[2.303·b·k0·(t0 − tD)/t0 + 1] + t0 + tD;
 * G = ((1 + p + p²/3)/(1 + p))^½ with p = 2.303·b·k0.
 * Band width combines §7 σt = t_R/√N, evaluated isocratically at k̄ (t_R = t0(1 + k̄)), with G.
 */
export function closedFormGradientElution({ columnLength: L, u, plateHeight: H, k0, S,
    deltaFraction, gradientTime, dwellTime = 0 }) {
    for (const [name, value] of Object.entries({ L, u, H, k0, S, gradientTime })) requirePositive(name, value);
    if (!Number.isFinite(dwellTime) || dwellTime < 0) throw new RangeError('Dwell time must be non-negative.');
    if (!Number.isFinite(deltaFraction) || deltaFraction <= 0) {
        throw new RangeError('The closed-form gradient needs a rising organic fraction.');
    }
    const t0 = L / u;
    const b = S * deltaFraction * t0 / gradientTime;
    const argument = 2.303 * b * k0 * (t0 - dwellTime) / t0 + 1;
    if (!(argument > 0)) throw new RangeError('Dwell time is outside the closed-form gradient equation range.');
    const tr = t0 / b * Math.log10(argument) + t0 + dwellTime;
    const kElution = 1 / (2.303 * b);
    const p = 2.303 * b * k0;
    const compression = Math.sqrt((1 + p + p * p / 3) / (1 + p));
    const sigma = compression * t0 * (1 + kElution) / Math.sqrt(L / H);
    const result = { tr, sigma, kElution, compression, steepness: b, initialK: k0, dwellTime };
    for (const [name, value] of Object.entries(result)) requireFiniteOutput(name, value);
    return result;
}
