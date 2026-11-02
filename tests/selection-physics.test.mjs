import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { UIController } from '../apps/hplc-simulator/ui-controller.js';
import { DEFAULT_COMPOUNDS } from '../apps/hplc-simulator/compounds.js';
import { HPLC_CONFIG } from '../apps/hplc-simulator/simulator-config.js';
import { FLOW_MODELS, calculateMolecularDiffusion, calculateRetentionFactor }
    from '../apps/hplc-simulator/physics-models.js';

const html = readFileSync(new URL('../apps/hplc-simulator/index.html', import.meta.url), 'utf8');

/** Use this function to list the shipped option values of one <select>; depends on index.html. */
function optionsOf(id) {
    const select = html.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`));
    assert.ok(select, `missing select #${id}`);
    return [...select[0].matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
}

/** Use this function to build a solute row stub matching the selectors UIController reads. */
function fakeRow() {
    const element = () => ({ value: '', checked: false, focus() {}, classList: { add() {}, remove() {} } });
    const parts = { '.lookup-box': element(), '.logp-slider': element(),
        '.logp-num': element(), '.custom-toggle': element() };
    return { dataset: {}, querySelector: selector => parts[selector], parts };
}

/** Use this function to build a controller whose selects default to their first shipped option,
 * with one solute row; depends on UIController and index.html. */
function controller(overrides = {}) {
    const value = v => ({ value: String(v) });
    const row = fakeRow();
    const ui = Object.assign(Object.create(UIController.prototype), {
        catalog: [...DEFAULT_COMPOUNDS],
        selectTab() {},
        inputs: {
            colLengthNum: value(150), pressureNum: value(100), organicNum: value(50),
            statPhase: value(optionsOf('statPhase')[0]),
            solventSystem: value(optionsOf('solventSystem')[0]),
            flowModel: value(optionsOf('flowModel')[0]),
            simMode: value(optionsOf('simMode')[0]),
            ...Object.fromEntries(Object.entries(overrides).map(([key, v]) => [key, value(v)]))
        },
        panels: { soluteContainer: { querySelectorAll: () => [row] } }
    });
    ui.applyCompound(row, DEFAULT_COMPOUNDS[0]);
    return { ui, row };
}

/** Use this function to assert every option yields a distinct value of one physics output. */
function assertDistinct(values, label) {
    assert.equal(new Set(values).size, values.length, `${label} must differ per option`);
}

test('every stationary-phase option reaches retention physics', () => {
    const ks = optionsOf('statPhase').map(option => {
        const run = controller({ statPhase: option }).ui.buildSimulation();
        assert.equal(run.system.phaseModifier, Number(option));
        const solute = run.solutes[0];
        assert.equal(solute.k, calculateRetentionFactor({ logP: solute.logP, organicFraction: 0.5,
            phaseModifier: Number(option), solventModifier: run.system.solventModifier }));
        return solute.tr;
    });
    assertDistinct(ks, 'Retention time');
});

test('every solvent-system option reaches retention physics', () => {
    const ks = optionsOf('solventSystem').map(option => {
        const run = controller({ solventSystem: option }).ui.buildSimulation();
        assert.equal(run.system.solventModifier, Number(option));
        const solute = run.solutes[0];
        assert.equal(solute.k, calculateRetentionFactor({ logP: solute.logP, organicFraction: 0.5,
            phaseModifier: run.system.phaseModifier, solventModifier: Number(option) }));
        return solute.tr;
    });
    assertDistinct(ks, 'Retention time');
});

test('every flow-model option reaches hydrodynamics physics', () => {
    const ids = optionsOf('flowModel');
    assert.deepEqual(ids, Object.values(FLOW_MODELS).map(model => model.id));
    const velocities = ids.map(option => {
        const run = controller({ flowModel: option }).ui.buildSimulation();
        assert.equal(run.system.flowModel.id, option);
        const { particleSize, porosity, pressureDrop, viscosity, columnLength } = run.system;
        const permeability = run.system.flowModel.permeability({ particleSize, porosity });
        const expected = pressureDrop * permeability / (viscosity * columnLength) / porosity;
        assert.ok(Math.abs(run.solutes[0].u - expected) <= expected * 1e-12);
        return run.solutes[0].u;
    });
    assertDistinct(velocities, 'Interstitial velocity');
});

test('every detector-mode option reaches the transport engine', () => {
    for (const option of optionsOf('simMode')) {
        const run = controller({ simMode: option }).ui.buildSimulation();
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

test('settings show static text for single-solver stages', () => {
    const settings = html.slice(html.indexOf('id="panel-settings"'), html.indexOf('id="panel-simulation"'));
    assert.equal([...settings.matchAll(/class="framework-static"/g)].length, 4);
});
