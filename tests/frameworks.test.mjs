import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../apps/hplc-simulator/physics-models.js';
import { Simulation } from '../apps/hplc-simulator/simulation.js';
import { DEFAULT_SYSTEM } from '../apps/hplc-simulator/simulator-config.js';

const SOLUTE = { logP: 2, molarVolume: 150 };
const BAND = 'band-integration';
const close = (actual, expected, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${actual} ≠ ${expected}`);
const physics = (overrides = {}, solute = SOLUTE) =>
    P.calculateSolutePhysics({ ...DEFAULT_SYSTEM, ...overrides }, solute);

test('F1/F9: compressible flow reduces to Darcy and round-trips flow and pressure', () => {
    const base = P.calculateHydrodynamics(DEFAULT_SYSTEM);
    const tiny = P.calculateHydrodynamics({ ...DEFAULT_SYSTEM, compressibility: 1e-20 });
    close(tiny.u, base.u, 1e-9);
    close(tiny.t0, base.t0, 1e-9);
    const chi = 1e-9;
    const pressureDriven = P.calculateHydrodynamics({ ...DEFAULT_SYSTEM, pressureDrop: 4e7, compressibility: chi });
    const flowDriven = P.calculateHydrodynamics({ ...DEFAULT_SYSTEM, pressureDrop: undefined,
        flowRate: pressureDriven.flowRate, compressibility: chi });
    close(flowDriven.pressureDrop, 4e7, 1e-9);
    close(flowDriven.t0, pressureDriven.t0, 1e-9);
    assert.ok(pressureDriven.flowRate > P.calculateHydrodynamics({ ...DEFAULT_SYSTEM, pressureDrop: 4e7 }).flowRate);
});

test('F3/F4/F9: HSM, LSER and pressure retention follow their equations', () => {
    const zero = { eta: 0, sigma: 0, beta: 0, alpha: 0, kappa: 0 };
    const column = { H: 1, S: 0.5, A: 0.2, B: 0.1, C: 0.3 };
    const kEB = P.calculateRetentionFactor({ organicFraction: 0.4, logP: P.HSM_REFERENCE.logP });
    close(P.calculateHsmRetention({ organicFraction: 0.4, hsm: zero, columnHsm: column }), kEB);
    const hsm = { eta: 0.5, sigma: 0.2, beta: 0.1, alpha: -0.1, kappa: 0.4 };
    close(P.calculateHsmRetention({ organicFraction: 0.4, hsm, columnHsm: column }),
        kEB * 10 ** (0.5 - 0.1 + 0.02 - 0.01 + 0.12));
    close(P.calculateLserRetention({ lser: { E: 1, S: 2, A: 3, B: 4, V: 5 },
        lserSystem: { c: 0.1, e: 0.2, s: -0.1, a: 0.01, b: -0.2, v: 0.3 } }), 10 ** (0.1 + 0.2 - 0.2 + 0.03 - 0.8 + 1.5));
    close(P.pressureRetentionFactor({ molarVolumeChange: -1e-5, pressure: 2e7, temperature: 300 }),
        Math.exp(1e-5 * 2e7 / (P.GAS_CONSTANT * 300)));
    assert.throws(() => physics({ retentionModel: 'hsm', columnHsm: column }), /HSM descriptors are required/);
});

test('F5/F6: Van Deemter and Knox optima follow glossary §5 and §6', () => {
    const vd = physics();
    close(vd.optimumVelocity, Math.sqrt(vd.B / vd.C));
    close(vd.minimumPlateHeight, vd.A + 2 * Math.sqrt(vd.B * vd.C));
    const knox = physics({ dispersionModel: 'knox' });
    const h = (nu) => Math.cbrt(nu) + 2 / nu + 0.05 * nu;
    const nuOpt = Math.sqrt(2 / (2 * 0.05));
    close(knox.optimumVelocity, nuOpt * knox.D_m / DEFAULT_SYSTEM.particleSize);
    close(knox.minimumPlateHeight, h(nuOpt) * DEFAULT_SYSTEM.particleSize);
    close(knox.reducedPlateHeight, knox.plateHeight / DEFAULT_SYSTEM.particleSize);
});

test('F8 closed form: glossary §8 t_R,grad, k̄ and G as written', () => {
    const steep = { logP: 4, molarVolume: 150 };
    const gradient = { finalFraction: 1, gradientTime: 600, dwellVolume: 1e-7 };
    const run = physics({ organicFraction: 0.2, gradient }, steep);
    const iso = physics({ organicFraction: 0.2 }, steep);
    const { t0 } = run;
    const tD = gradient.dwellVolume / run.flowRate;
    const b = run.gradient.steepness;
    close(b, run.gradient.steepness);
    close(run.k, iso.k);
    close(run.tr, t0 / b * Math.log10(2.303 * b * run.k * (t0 - tD) / t0 + 1) + t0 + tD);
    close(run.kElution, 1 / (2.303 * b));
    const p = 2.303 * b * run.k;
    const G = Math.sqrt((1 + p + p * p / 3) / (1 + p));
    close(run.gradient.compression, G);
    close(run.sigma, G * t0 * (1 + run.kElution) / Math.sqrt(DEFAULT_SYSTEM.columnLength / run.plateHeight));
    const lss = P.lssCoefficients({ ...steep, phaseModifier: DEFAULT_SYSTEM.phaseModifier,
        solventModifier: DEFAULT_SYSTEM.solventModifier });
    close(b, lss.S * 0.8 * t0 / 600);
});

test('F8 band integration: matches isocratic, Snyder and Poppe limits', () => {
    const steep = { logP: 4, molarVolume: 150 };
    const iso = physics({ organicFraction: 0.2 }, steep);
    const flat = physics({ organicFraction: 0.2, gradient: { finalFraction: 0.2, gradientTime: 100, solver: BAND } }, steep);
    close(flat.tr, iso.tr, 1e-6);
    close(flat.sigma, iso.sigma, 1e-6);
    const run = physics({ organicFraction: 0.2, gradient: { finalFraction: 1, gradientTime: 600, solver: BAND } }, steep);
    const b = run.gradient.steepness;
    close(run.tr, P.snyderGradientRetentionTime({ t0: run.t0, k0: run.k, b }), 1e-4);
    const p = 2.303 * b * run.k / (1 + run.k);
    close(run.gradient.compression, Math.sqrt((1 + p + p * p / 3) / (1 + p) ** 2), 5e-3);
    const dwell = physics({ organicFraction: 0.2, gradient: { finalFraction: 1, gradientTime: 600, dwellVolume: 1e-6, solver: BAND } }, steep);
    assert.ok(dwell.tr > run.tr && dwell.tr < run.tr + dwell.gradient.dwellTime);
    assert.throws(() => physics({ organicFraction: 0, gradient: { finalFraction: 0, gradientTime: 1, solver: BAND } },
        { logP: 20, molarVolume: 150 }), /does not elute/);
});

test('mechanistic: LPM spectral profile reproduces its moments and tails under slow kinetics', () => {
    for (const lumpedPore of [undefined, { particlePorosity: 0.02, tortuosity: 50 }]) {
        const run = physics({ transportModel: 'lpm', lumpedPore });
        close(run.profile.mean, run.tr, 1e-4);
        close(run.profile.sigma, run.sigma, 2e-2);
        close(run.plateHeight, run.axialPlateHeight + 2 * run.u * run.k / ((1 + run.k) ** 2 * run.kEff));
    }
    const slow = physics({ transportModel: 'lpm', lumpedPore: { particlePorosity: 0.02, tortuosity: 50 } });
    assert.ok(slow.profile.apexTime < slow.profile.mean, 'slow exchange produces a tailing peak');
});

test('mechanistic: Burgers pulse conserves mass and satisfies its PDE; Langmuir has a linear limit', () => {
    const D = 1e-9;
    const M = 4e-8;
    const t = 20;
    let area = 0;
    for (let x = -2e-3; x < 2e-3; x += 1e-7) area += P.burgersPulse(x, t, D, M) * 1e-7;
    close(area, M, 1e-4);
    for (const x of [-2e-4, 0, 1e-4, 3e-4]) {
        // h ≫ 1e-7 keeps the 1.2e-7 erfc approximation error out of the second difference.
        const h = 2e-6;
        const dt = 1e-2;
        const U = P.burgersPulse(x, t, D, M);
        const Ut = (P.burgersPulse(x, t + dt, D, M) - P.burgersPulse(x, t - dt, D, M)) / (2 * dt);
        const Ux = (P.burgersPulse(x + h, t, D, M) - P.burgersPulse(x - h, t, D, M)) / (2 * h);
        const Uxx = (P.burgersPulse(x + h, t, D, M) - 2 * U + P.burgersPulse(x - h, t, D, M)) / h ** 2;
        assert.ok(Math.abs(Ut + U * Ux - D * Uxx) <= 1e-3 * (Math.abs(Ut) + Math.abs(U * Ux) + 1e-12));
    }
    const linear = physics({ transportModel: 'langmuir', langmuir: { b: 1e-6, sampleConcentration: 1e-3, injectionVolume: 1e-8 } });
    const edm = physics();
    close(linear.profile.mean, edm.tr, 1e-3);
    close(linear.profile.sigma, edm.sigma, 2e-2);
    const loaded = physics({ transportModel: 'langmuir', langmuir: { b: 0.05, sampleConcentration: 10, injectionVolume: 2e-8 } });
    assert.ok(loaded.profile.apexTime < edm.tr && loaded.loading > 1);
});

test('F9: extra-column variance follows plug and Taylor–Aris terms', () => {
    const F = 1e-8;
    const Dm = 1e-9;
    close(P.calculateExtraColumnVariance({ injectionVolume: 1e-8, tubingRadius: 1e-4, tubingLength: 0.5,
        cellVolume: 2e-9, flowRate: F, D_m: Dm }),
    (1e-16 / 12 + Math.PI * 1e-16 * 0.5 * F / (24 * Dm) + 4e-18 / 12) / F ** 2);
    close(P.erfc(0.5), 0.4795001221869535, 1e-6);
    close(P.erfc(-1), 1.8427007929497148, 1e-6);
});

test('every transport model conserves mass and particles agree with the detector profile', () => {
    const cases = {
        edm: {},
        lpm: { transportModel: 'lpm' },
        lpmSlow: { transportModel: 'lpm', lumpedPore: { particlePorosity: 0.02, tortuosity: 50 } },
        langmuir: { transportModel: 'langmuir', langmuir: { b: 0.05, sampleConcentration: 10, injectionVolume: 2e-8 } },
        gradient: { organicFraction: 0.3, gradient: { finalFraction: 0.9, gradientTime: 60, dwellVolume: 2e-7 } },
        gradientBand: { organicFraction: 0.3, gradient: { finalFraction: 0.9, gradientTime: 60, dwellVolume: 2e-7,
            solver: BAND } },
        extraColumn: { extraColumn: { injectionVolume: 1e-8, tubingRadius: 6.35e-5, tubingLength: 0.3, cellVolume: 1e-8 } }
    };
    for (const [name, overrides] of Object.entries(cases)) {
        for (const mode of ['continuous', 'stochastic']) {
            const sim = new Simulation({ system: { ...DEFAULT_SYSTEM, ...overrides },
                solutes: [{ id: 'a', ...SOLUTE }], mode, particleCount: 4000, seed: 3, stepSeconds: 0.05 });
            const samples = [];
            while (!sim.finished) { sim.advance(0.25); samples.push(...sim.drainSamples()[0]); }
            let m0 = 0;
            let m1 = 0;
            for (let i = 1; i < samples.length; i++) {
                const dt = samples[i].time - samples[i - 1].time;
                const y = (samples[i].intensity + samples[i - 1].intensity) / 2;
                m0 += y * dt;
                m1 += y * (samples[i].time + samples[i - 1].time) / 2 * dt;
            }
            const { profile } = sim.solutes[0];
            close(m0 + sim.remainingMass[0], 100, 1e-3);
            assert.ok(Math.abs(m1 / m0 - profile.mean) < 0.05 * profile.sigma + 4 * profile.sigma / Math.sqrt(4000),
                `${name}/${mode} mean ${m1 / m0} vs ${profile.mean}`);
        }
    }
});
