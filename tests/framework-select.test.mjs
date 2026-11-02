import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { UIController } from '../apps/hplc-simulator/ui-controller.js';
import { FLOW_MODELS, calculateHydrodynamics } from '../apps/hplc-simulator/physics-models.js';

const html = readFileSync(new URL('../apps/hplc-simulator/index.html', import.meta.url), 'utf8');
const settings = html.slice(html.indexOf('id="panel-settings"'), html.indexOf('id="panel-simulation"'));

/** Use this function to build a controller whose inputs are plain values; depends on UIController. */
function controllerWith(flowModel) {
    const value = v => ({ value: String(v) });
    return Object.assign(Object.create(UIController.prototype), { inputs: {
        colLengthNum: value(150), pressureNum: value(100), organicNum: value(50),
        statPhase: value(1), solventSystem: value(1), flowModel: value(flowModel) } });
}

test('settings offer a dropdown per multi-solver stage and static text otherwise', () => {
    const options = [...settings.matchAll(/<select id="flowModel"[\s\S]*?<\/select>/g)][0][0];
    const ids = [...options.matchAll(/value="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids, Object.values(FLOW_MODELS).map(model => model.id));
    assert.match(settings, /id="simMode"/);
    assert.equal([...settings.matchAll(/class="framework-static"/g)].length, 4);
});

test('selected flow model reaches the hydrodynamics stage', () => {
    for (const model of Object.values(FLOW_MODELS)) {
        const system = controllerWith(model.id).getSystemInputs();
        assert.equal(system.flowModel, model);
    }
    const kozeny = calculateHydrodynamics(controllerWith('kozeny-carman').getSystemInputs());
    const darcy = calculateHydrodynamics(controllerWith('simple-darcy').getSystemInputs());
    assert.notEqual(kozeny.u, darcy.u);
    assert.equal(controllerWith('unknown').getSystemInputs().flowModel, FLOW_MODELS.kozenyCarman);
});
