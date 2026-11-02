import { requireFinite, requireFiniteOutput } from './validation.js';

// Framework 3/4/9 retention. Units: organic fraction 0–1, pressure Pa, molar volume change m³/mol, K.
export const GAS_CONSTANT = 8.314462618;
/** Reference solute for the hydrophobic-subtraction model (HSM). */
export const HSM_REFERENCE = Object.freeze({ name: 'ethylbenzene', logP: 3.15 });
export const RETENTION_MODELS = Object.freeze(['lss', 'hsm', 'lser']);
const HSM_TERMS = Object.freeze([['eta', 'H'], ['sigma', 'S'], ['beta', 'A'], ['alpha', 'B'], ['kappa', 'C']]);
const LSER_TERMS = Object.freeze([['E', 'e'], ['S', 's'], ['A', 'a'], ['B', 'b'], ['V', 'v']]);

/** Use this function to resolve LSS coefficients from measured values or the empirical LogP correlation. */
export function lssCoefficients({ logP, logKw, S, phaseModifier = 1, solventModifier = 1 }) {
    if (logKw === undefined || S === undefined) {
        requireFinite('LogP', logP);
        requireFinite('Phase modifier', phaseModifier);
        requireFinite('Solvent modifier', solventModifier);
        if (phaseModifier <= 0 || solventModifier <= 0) {
            throw new RangeError('Retention modifiers must be positive.');
        }
        logKw ??= logP * 0.8 * phaseModifier;
        S ??= (3 + logP * 0.5) * solventModifier;
    }
    if (!Number.isFinite(logKw) || !Number.isFinite(S) || S < 0) {
        throw new RangeError('LSS coefficients must be finite and S non-negative.');
    }
    return { logKw, S };
}

/** Use this function to validate an organic fraction. */
function requireFraction(organicFraction) {
    if (!Number.isFinite(organicFraction) || organicFraction < 0 || organicFraction > 1) {
        throw new RangeError('Organic fraction must lie between 0 and 1.');
    }
}

/** Use this function to turn log k into a positive finite k. */
function positiveK(logK) {
    const k = 10 ** logK;
    requireFiniteOutput('Retention factor', k);
    if (k <= 0) throw new RangeError('Retention factor must be positive.');
    return k;
}

/** Use this function to calculate an isocratic LSS retention factor from measured LSS or LogP inputs. */
export function calculateRetentionFactor(input) {
    requireFraction(input.organicFraction);
    const { logKw, S } = lssCoefficients(input);
    return positiveK(logKw - S * input.organicFraction);
}

/** Use this function to evaluate one descriptor dot product; terms map solute keys to column keys. */
function descriptorSum(solute, column, terms, label) {
    if (!solute || !column) throw new TypeError(`${label} descriptors are required.`);
    let sum = 0;
    for (const [soluteKey, columnKey] of terms) {
        requireFinite(`${label} solute ${soluteKey}`, solute[soluteKey]);
        requireFinite(`${label} column ${columnKey}`, column[columnKey]);
        sum += solute[soluteKey] * column[columnKey];
    }
    return sum;
}

/**
 * Use this function for Snyder–Dolan HSM retention:
 * log(k/kEB) = η'H − σ'S* + β'A + α'B + κ'C, with kEB from LSS using ethylbenzene LogP.
 */
export function calculateHsmRetention({ organicFraction, hsm, columnHsm,
    phaseModifier = 1, solventModifier = 1 }) {
    requireFraction(organicFraction);
    const kEB = calculateRetentionFactor({ organicFraction, logP: HSM_REFERENCE.logP,
        phaseModifier, solventModifier });
    const signed = { ...columnHsm, S: -columnHsm?.S };
    return positiveK(Math.log10(kEB) + descriptorSum(hsm, signed, HSM_TERMS, 'HSM'));
}

/** Use this function for Abraham LSER retention: log k = c + eE + sS + aA + bB + vV. */
export function calculateLserRetention({ lser, lserSystem }) {
    requireFinite('LSER system c', lserSystem?.c);
    return positiveK(lserSystem.c + descriptorSum(lser, lserSystem, LSER_TERMS, 'LSER'));
}

/** Use this function for framework 9 pressure retention: k(P) = k0·exp(−ΔVm·P/(RT)). */
export function pressureRetentionFactor({ molarVolumeChange, pressure, temperature }) {
    requireFinite('Molar volume change', molarVolumeChange);
    requireFinite('Pressure', pressure);
    if (!Number.isFinite(temperature) || temperature <= 0) throw new RangeError('Temperature must be positive.');
    const factor = Math.exp(-molarVolumeChange * pressure / (GAS_CONSTANT * temperature));
    requireFiniteOutput('Pressure retention factor', factor);
    return factor;
}

/**
 * Use this function to calculate k for the selected retention model at one organic fraction.
 * system.retentionModel: 'lss' (default), 'hsm' or 'lser'; system.pressureRetention adds k(P)
 * at mean column pressure ΔP/2 above the outlet.
 */
export function calculateModelRetention(system, solute, organicFraction = system.organicFraction) {
    const model = system.retentionModel ?? 'lss';
    let k;
    if (model === 'lss') {
        k = calculateRetentionFactor({ ...solute, organicFraction,
            phaseModifier: system.phaseModifier, solventModifier: system.solventModifier });
    } else if (model === 'hsm') {
        k = calculateHsmRetention({ organicFraction, hsm: solute.hsm, columnHsm: system.columnHsm,
            phaseModifier: system.phaseModifier, solventModifier: system.solventModifier });
    } else if (model === 'lser') {
        k = calculateLserRetention({ lser: solute.lser, lserSystem: system.lserSystem });
    } else {
        throw new RangeError(`Unknown retention model: ${model}`);
    }
    if (system.pressureRetention) {
        k *= pressureRetentionFactor({ molarVolumeChange: system.pressureRetention.molarVolumeChange,
            pressure: system.meanPressure ?? 0, temperature: system.temperature });
        requireFiniteOutput('Retention factor', k);
    }
    return k;
}
