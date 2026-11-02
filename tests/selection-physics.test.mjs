import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { UIController } from '../apps/hplc-simulator/ui-controller.js';
import { DEFAULT_COMPOUNDS } from '../apps/hplc-simulator/compounds.js';
import { HPLC_CONFIG } from '../apps/hplc-simulator/simulator-config.js';
import { FLOW_MODELS, calculateExtraColumnVariance, calculateHsmRetention, calculateLserRetention,
    calculateMolecularDiffusion, calculateRetentionFactor, GAS_CONSTANT }
    from '../apps/hplc-simulator/physics-models.js';

const html = readFileSync(new URL('../apps/hplc-simulator/index.html', import.meta.url), 'utf8');

/** Use this function to list the shipped option values of one <select>; depends on index.html. */
function optionsOf(id) {
    const select = html.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`));
    assert.ok(select, `missing select #${id}`);
    return [...select[0].matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
}

/** Use this function to read every shipped control default: first select option or input value. */
function shippedDefaults() {
    const defaults = {};
    for (const match of html.matchAll(/<select id="([^"]+)"/g)) defaults[match[1]] = optionsOf(match[1])[0];
    for (const match of html.matchAll(/<input\b([^>]*)>/g)) {
        const id = match[1].match(/\bid="([^"]+)"/)?.[1];
        if (id) defaults[id] = match[1].match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    }
    return defaults;
}

const HSM_COLUMN = { hsmH: 1.0, hsmS: 0.03, hsmA: -0.1, hsmB: 0.02, hsmC: 0.1 };
const HSM_SOLUTE = { eta: 0.6, sigma: 0.1, beta: -0.2, alpha: 0.05, kappa: 0 };
const LSER_SYSTEM = { lserC: -0.5, lserE: 0.2, lserS: -0.4, lserA: -0.3, lserB: -1.5, lserV: 2.0 };
const LSER_SOLUTE = { E: 0.8, S: 0.9, A: 0.2, B: 0.6, V: 1.1 };

/** Use this function to build a solute row stub matching the selectors UIController reads. */
function fakeRow() {
    const parts = {};
    const element = () => ({ value: '', checked: false, focus() {}, classList: { add() {}, remove() {} } });
    for (const name of ['lookup-box', 'logp-slider', 'logp-num', 'custom-toggle',
        ...Object.keys(HSM_SOLUTE).map(key => `hsm-${key}`), ...Object.keys(LSER_SOLUTE).map(key => `lser-${key}`)]) {
        parts[`.${name}`] = element();
    }
    for (const [key, v] of Object.entries(HSM_SOLUTE)) parts[`.hsm-${key}`].value = String(v);
    for (const [key, v] of Object.entries(LSER_SOLUTE)) parts[`.lser-${key}`].value = String(v);
    return { dataset: {}, querySelector: selector => parts[selector], parts };
}

/** Use this function to build a controller from the shipped defaults plus overrides, with one solute row. */
function controller(overrides = {}) {
    const values = { ...shippedDefaults(), ...HSM_COLUMN, ...LSER_SYSTEM,
        molarVolumeChange: -10, langmuirB: 0.05, sampleConcentration: 10, ...overrides };
    const row = fakeRow();
    const ui = Object.assign(Object.create(UIController.prototype), {
        catalog: [...DEFAULT_COMPOUNDS],
        selectTab() {},
        inputs: Object.fromEntries(Object.entries(values).map(([id, v]) => [id, { value: String(v) }])),
        panels: { soluteContainer: { querySelectorAll: () => [row] } }
    });
    ui.applyCompound(row, DEFAULT_COMPOUNDS[2]);
    return { ui, row };
}

/** Use this function to run the real Inject path and return the first solute's physics. */
const physicsFor = (overrides) => {
    const run = controller(overrides).ui.buildSimulation();
    return { run, solute: run.solutes[0] };
};

/** Use this function to assert every option yields a distinct value of one physics output. */
function assertDistinct(values, label) {
    assert.equal(new Set(values).size, values.length, `${label} must differ per option`);
}

const close = (actual, expected, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${actual} ≠ ${expected}`);

test('every stationary-phase option reaches retention physics', () => {
    assertDistinct(optionsOf('statPhase').map(option => {
        const { run, solute } = physicsFor({ statPhase: option });
        assert.equal(run.system.phaseModifier, Number(option));
        assert.equal(solute.k, calculateRetentionFactor({ logP: solute.logP, organicFraction: 0.5,
            phaseModifier: Number(option), solventModifier: run.system.solventModifier }));
        return solute.tr;
    }), 'Retention time');
});

test('every solvent-system option reaches retention physics', () => {
    assertDistinct(optionsOf('solventSystem').map(option => {
        const { run, solute } = physicsFor({ solventSystem: option });
        assert.equal(run.system.solventModifier, Number(option));
        assert.equal(solute.k, calculateRetentionFactor({ logP: solute.logP, organicFraction: 0.5,
            phaseModifier: run.system.phaseModifier, solventModifier: Number(option) }));
        return solute.tr;
    }), 'Retention time');
});

test('every flow-model option reaches hydrodynamics physics', () => {
    const ids = optionsOf('flowModel');
    assert.deepEqual(ids, Object.values(FLOW_MODELS).map(model => model.id));
    assertDistinct(ids.map(option => {
        const { run, solute } = physicsFor({ flowModel: option });
        assert.equal(run.system.flowModel.id, option);
        const { particleSize, porosity, pressureDrop, viscosity, columnLength } = run.system;
        const permeability = run.system.flowModel.permeability({ particleSize, porosity });
        close(solute.u, pressureDrop * permeability / (viscosity * columnLength) / porosity, 1e-12);
        return solute.u;
    }), 'Interstitial velocity');
});

test('every compressibility option reaches hydrodynamics physics', () => {
    assert.deepEqual(optionsOf('compressibilityModel'), ['incompressible', 'compressible']);
    const flows = optionsOf('compressibilityModel').map(option => {
        const { run, solute } = physicsFor({ compressibilityModel: option, pressureNum: 400 });
        const chi = option === 'compressible' ? 0.45e-9 : 0;
        if (chi) close(run.system.compressibility, chi); else assert.equal(run.system.compressibility, 0);
        const { particleSize, porosity, pressureDrop, viscosity, columnLength } = run.system;
        const permeability = run.system.flowModel.permeability({ particleSize, porosity });
        const area = Math.PI * (run.system.columnDiameter / 2) ** 2;
        close(solute.flowRate, permeability * (pressureDrop + chi * pressureDrop ** 2 / 2) /
            (viscosity * columnLength) * area, 1e-12);
        return solute.flowRate;
    });
    assertDistinct(flows, 'Outlet flow');
});

test('every retention-model option reaches retention physics', () => {
    assert.deepEqual(optionsOf('retentionModel'), ['lss', 'hsm', 'lser']);
    const columnHsm = { H: 1.0, S: 0.03, A: -0.1, B: 0.02, C: 0.1 };
    const lserSystem = { c: -0.5, e: 0.2, s: -0.4, a: -0.3, b: -1.5, v: 2.0 };
    assertDistinct(optionsOf('retentionModel').map(option => {
        const { run, solute } = physicsFor({ retentionModel: option });
        const expected = {
            lss: () => calculateRetentionFactor({ logP: solute.logP, organicFraction: 0.5 }),
            hsm: () => calculateHsmRetention({ organicFraction: 0.5, hsm: HSM_SOLUTE, columnHsm }),
            lser: () => calculateLserRetention({ lser: LSER_SOLUTE, lserSystem })
        }[option]();
        assert.equal(run.system.retentionModel, option);
        close(solute.k, expected);
        return solute.k;
    }), 'Retention factor');
});

test('every pressure-retention option reaches retention physics', () => {
    const [off, on] = optionsOf('pressureRetentionModel').map(option =>
        physicsFor({ pressureRetentionModel: option }).solute);
    assert.equal(off.k, calculateRetentionFactor({ logP: off.logP, organicFraction: 0.5 }));
    close(on.k / off.k, Math.exp(10e-6 * on.meanPressure / (GAS_CONSTANT * 298)));
    assert.equal(on.meanPressure, 1e7 / 2);
});

test('every dispersion-model option reaches band-broadening physics', () => {
    assertDistinct(optionsOf('dispersionModel').map(option => {
        const { solute } = physicsFor({ dispersionModel: option });
        const nu = solute.u * 5e-6 / solute.D_m;
        const expected = option === 'knox'
            ? (Math.cbrt(nu) + 2 / nu + 0.05 * nu) * 5e-6
            : solute.A + solute.B / solute.u + solute.C * solute.u;
        close(solute.plateHeight, expected);
        close(solute.reducedVelocity, nu);
        assert.ok(solute.optimumVelocity > 0 && solute.minimumPlateHeight > 0);
        return solute.plateHeight;
    }), 'Plate height');
});

test('every elution-mode option reaches the gradient engine', () => {
    const [isocratic, gradient] = optionsOf('elutionMode').map(option =>
        physicsFor({ elutionMode: option, organicNum: 30 }));
    assert.equal(isocratic.run.system.gradient, undefined);
    assert.deepEqual(gradient.run.system.gradient, { finalFraction: 0.95, gradientTime: 600, dwellVolume: 0.5e-6 });
    assert.equal(gradient.solute.particleModel.kind, 'gradient');
    assert.ok(gradient.solute.tr < isocratic.solute.tr);
    assert.ok(gradient.solute.gradient.compression < 1);
    assert.throws(() => physicsFor({ elutionMode: 'gradient', retentionModel: 'hsm' }), /Gradient elution needs LSS/);
    assert.throws(() => physicsFor({ elutionMode: 'gradient', transportModel: 'lpm' }), /supports the EDM/);
});

test('every transport-model option reaches the transport engine in both detector modes', () => {
    const kinds = { edm: ['gaussian', 'walk'], lpm: ['table', 'lpm'], langmuir: ['table', 'sampled'] };
    assert.deepEqual(optionsOf('transportModel'), Object.keys(kinds));
    const widths = optionsOf('transportModel').map(option => {
        const { run, solute } = physicsFor({ transportModel: option });
        assert.equal(run.system.transportModel, option);
        assert.deepEqual([solute.profile.kind, solute.particleModel.kind], kinds[option]);
        if (option === 'langmuir') {
            assert.deepEqual(run.system.langmuir, { b: 0.05, sampleConcentration: 10, injectionVolume: 1e-8 });
            assert.ok(solute.loading > 0 && solute.profile.apexTime < solute.tr);
        }
        if (option === 'lpm') assert.deepEqual(run.system.lumpedPore, { particlePorosity: 0.5, tortuosity: 2 });
        for (const simMode of optionsOf('simMode')) {
            const simulation = controller({ transportModel: option, simMode }).ui.buildSimulation();
            simulation.advance(0.25);
        }
        return solute.sigma;
    });
    assertDistinct(widths, 'Peak width');
});

test('every extra-column option reaches detector variance', () => {
    const [none, calculated] = optionsOf('extraColumnModel').map(option =>
        physicsFor({ extraColumnModel: option }).solute);
    assert.equal(none.extraColumnVariance, 0);
    close(calculated.extraColumnVariance, calculateExtraColumnVariance({ injectionVolume: 10e-9,
        tubingRadius: 0.0635e-3, tubingLength: 0.3, cellVolume: 10e-9,
        flowRate: calculated.flowRate, D_m: calculated.D_m }));
    close(calculated.sigma ** 2, none.sigma ** 2 + calculated.extraColumnVariance);
});

test('every detector-mode option reaches the transport engine', () => {
    for (const option of optionsOf('simMode')) {
        const { run } = physicsFor({ simMode: option });
        assert.equal(run.mode, option);
        assert.equal(run.positions.length, option === 'stochastic' ? HPLC_CONFIG.maxParticles : 0);
        run.advance(0.1);
    }
});

test('every analyte dropdown compound reaches solute physics', () => {
    const searched = { cid: 5090, name: 'Rofecoxib', logP: 1.8, molecularWeight: 314.4,
        molarVolume: 150.6, category: 'PubChem Search Results' };
    for (const compound of [...DEFAULT_COMPOUNDS, searched]) {
        const { ui, row } = controller();
        ui.applyCompound(row, compound);
        const run = ui.buildSimulation();
        const solute = run.solutes[0];
        const molarVolume = compound.molarVolume ?? HPLC_CONFIG.defaultMolarVolumeCm3Mol;
        assert.equal(solute.name, compound.name);
        assert.equal(solute.logP, compound.logP);
        assert.equal(solute.molarVolume, molarVolume);
        assert.equal(solute.D_m, calculateMolecularDiffusion(molarVolume,
            run.system.viscosity, run.system.temperature, run.system));
        assert.equal(solute.k, calculateRetentionFactor({ logP: compound.logP, organicFraction: 0.5,
            phaseModifier: run.system.phaseModifier, solventModifier: run.system.solventModifier }));
    }
});

test('custom analyte LogP reaches solute physics; unresolved names are rejected', () => {
    const { ui, row } = controller();
    row.parts['.custom-toggle'].checked = true;
    row.parts['.logp-num'].value = '4.2';
    const solute = ui.buildSimulation().solutes[0];
    assert.equal(solute.logP, 4.2);
    assert.equal(solute.molarVolume, HPLC_CONFIG.defaultMolarVolumeCm3Mol);
    row.parts['.custom-toggle'].checked = false;
    row.parts['.lookup-box'].value = 'typed but not resolved';
    assert.throws(() => ui.buildSimulation(), /Resolve the compound name/);
});

test('settings use static text only for the single-solver diffusion stage', () => {
    const settings = html.slice(html.indexOf('id="panel-settings"'), html.indexOf('id="panel-simulation"'));
    assert.equal([...settings.matchAll(/class="framework-static"/g)].length, 1);
    assert.match(settings, /Wilke–Chang/);
});
