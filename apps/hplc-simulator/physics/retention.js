import { requireFinite, requireFiniteOutput } from './validation.js';

// Framework 3. LogP is an empirical fallback for missing measured LSS coefficients.
/** Use this function to calculate an isocratic retention factor from measured LSS or LogP inputs. */
export function calculateRetentionFactor({ organicFraction, logP, logKw, S,
    phaseModifier = 1, solventModifier = 1 }) {
    if (!Number.isFinite(organicFraction) || organicFraction < 0 || organicFraction > 1) {
        throw new RangeError('Organic fraction must lie between 0 and 1.');
    }
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
    const k = 10 ** (logKw - S * organicFraction);
    requireFiniteOutput('Retention factor', k);
    if (k <= 0) throw new RangeError('Retention factor must be positive.');
    return k;
}
