import { calculateHydrodynamics } from './hydrodynamics.js';
import { calculateModelRetention, lssCoefficients, pressureRetentionFactor } from './retention.js';
import { calculateLumpedPoreRate, dispersionModel, estimateVanDeemterTerms } from './kinetics.js';
import { calculateExtraColumnVariance, calculateTransport, gaussianIntensity } from './transport.js';
import { gradientProgram, integrateGradientElution } from './gradient.js';
import { gaussianProfile, langmuirProfile, lumpedPoreProfile } from './profiles.js';

export const TRANSPORT_MODELS = Object.freeze(['edm', 'lpm', 'langmuir']);

/** Use this function to derive the extra-column variance for one solute from system settings. */
function extraColumnFor(system, flow, D_m) {
    const lumped = system.extraColumnVariance ?? 0;
    if (!system.extraColumn) return lumped;
    return lumped + calculateExtraColumnVariance({ ...system.extraColumn, flowRate: flow.flowRate, D_m });
}

/**
 * Use this function to run the coupled pipeline for one system and solute.
 * Selections on `system`: flowModel, compressibility (F1/F9), retentionModel 'lss'|'hsm'|'lser' and
 * pressureRetention (F3/F4/F9), dispersionModel 'van-deemter'|'knox' (F5/F6), transportModel
 * 'edm'|'lpm'|'langmuir' (F7/mechanistic), gradient (F8), extraColumn (F9).
 * The result carries `profile` (detector pdf) and `particleModel` (stochastic transport).
 */
export function calculateSolutePhysics(system, solute) {
    if (!system || !solute) throw new TypeError('A system and solute are required.');
    const flow = calculateHydrodynamics(system);
    const meanPressure = Number.isFinite(flow.pressureDrop) ? flow.pressureDrop / 2 : 0;
    const terms = estimateVanDeemterTerms(solute.molarVolume, system.viscosity,
        system.temperature, system.particleSize, system);
    const dispersion = dispersionModel(system.dispersionModel).calculate({ velocity: flow.u, ...terms,
        particleSize: system.particleSize, knox: system.knox });
    const extraVariance = extraColumnFor(system, flow, terms.D_m);
    const retentionSystem = { ...system, meanPressure };
    const transportModel = system.transportModel ?? 'edm';
    if (!TRANSPORT_MODELS.includes(transportModel)) throw new RangeError(`Unknown transport model: ${transportModel}`);
    const base = { ...flow, ...terms, ...dispersion, meanPressure, transportModel,
        extraColumnVariance: extraVariance };

    if (system.gradient) {
        if ((system.retentionModel ?? 'lss') !== 'lss') {
            throw new RangeError('Gradient elution needs LSS retention (HSM/LSER describe one composition).');
        }
        if (transportModel !== 'edm') throw new RangeError('Gradient elution supports the EDM transport model.');
        const { logKw, S } = lssCoefficients({ ...solute, phaseModifier: system.phaseModifier,
            solventModifier: system.solventModifier });
        const multiplier = system.pressureRetention ? pressureRetentionFactor({
            molarVolumeChange: system.pressureRetention.molarVolumeChange,
            pressure: meanPressure, temperature: system.temperature }) : 1;
        const { finalFraction, gradientTime, dwellVolume = 0 } = system.gradient;
        const program = gradientProgram({ initialFraction: system.organicFraction, finalFraction, gradientTime });
        const elution = integrateGradientElution({ columnLength: system.columnLength, u: flow.u,
            plateHeight: dispersion.plateHeight, logKw, S, retentionMultiplier: multiplier,
            dwellTime: dwellVolume / flow.flowRate, program, gradientTime,
            deltaFraction: finalFraction - system.organicFraction });
        const moments = calculateTransport({ columnLength: system.columnLength, u: flow.u,
            k: elution.kElution, plateHeight: dispersion.plateHeight });
        const sigma = Math.sqrt(elution.sigma ** 2 + extraVariance);
        return { ...base, ...moments, k: elution.initialK, kElution: elution.kElution,
            tr: elution.tr, sigmaColumn: elution.sigma, sigma, gradient: elution,
            profile: gaussianProfile(elution.tr, sigma),
            particleModel: { kind: 'gradient', logKw, S, multiplier, program,
                dwellTime: elution.dwellTime, u: flow.u, dispersion: dispersion.dispersion } };
    }

    const k = calculateModelRetention(retentionSystem, solute);
    if (transportModel === 'lpm') {
        const pore = calculateLumpedPoreRate({ velocity: flow.u, porosity: system.porosity,
            particleSize: system.particleSize, D_m: terms.D_m, ...system.lumpedPore });
        const axialDispersion = dispersion.axialPlateHeight * flow.u / 2;
        const plateHeight = dispersion.axialPlateHeight +
            2 * flow.u * k / ((1 + k) ** 2 * pore.kEff);
        const moments = calculateTransport({ columnLength: system.columnLength, u: flow.u, k,
            plateHeight, extraColumnVariance: extraVariance });
        const profile = lumpedPoreProfile({ columnLength: system.columnLength, u: flow.u,
            axialDispersion, k, kEff: pore.kEff, extraVariance });
        return { ...base, ...moments, ...pore, k, plateHeight, axialDispersion, profile,
            particleModel: { kind: 'lpm', u: flow.u, axialDispersion, k, kEff: pore.kEff } };
    }
    const moments = calculateTransport({ columnLength: system.columnLength, u: flow.u, k,
        plateHeight: dispersion.plateHeight, extraColumnVariance: extraVariance });
    if (transportModel === 'langmuir') {
        const langmuir = system.langmuir ?? {};
        const amount = langmuir.sampleConcentration * langmuir.injectionVolume;
        const profile = langmuirProfile({ columnLength: system.columnLength, u: flow.u,
            dispersion: dispersion.dispersion, k, langmuirB: langmuir.b, amount,
            mobileArea: flow.area * system.porosity, extraVariance });
        return { ...base, ...moments, k, tr: profile.mean, sigma: profile.sigma,
            loading: profile.loading, profile, particleModel: { kind: 'sampled' } };
    }
    return { ...base, ...moments, k, profile: gaussianProfile(moments.tr, moments.sigma),
        particleModel: { kind: 'walk' } };
}

export { gaussianIntensity };
