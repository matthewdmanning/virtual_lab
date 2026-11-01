import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../apps/hplc-simulator/simulation.js';
import { UIController } from '../apps/hplc-simulator/ui-controller.js';
import { SimulationView } from '../apps/hplc-simulator/simulation-view.js';
import { DEFAULT_SYSTEM } from '../apps/hplc-simulator/simulator-config.js';

test('browser scheduling gives identical physical detector output at 30 and 120 FPS', () => {
    const original = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
        const results = [];
        for (const fps of [30, 120]) {
            const simulation = new Simulation({ system: DEFAULT_SYSTEM,
                solutes: [{ id: 'a', logP: -0.1, molarVolume: 100 }] });
            const series = [];
            const controller = Object.assign(Object.create(UIController.prototype), {
                simulation, speed: 1, paused: false, previousTimestamp: null, lastPaint: 0,
                view: { render(model) { series.push(...model.drainSamples()[0]); } },
                setControlsLocked() {}, toggleButtons() {}
            });
            controller.tick(0);
            for (let frame = 1; !simulation.finished; frame++) {
                controller.tick(frame * 1000 / fps);
                assert.ok(frame < fps * (simulation.duration + 1), 'Browser clock did not finish');
            }
            results.push(series);
        }
        assert.deepEqual(results[0], results[1]);
    } finally {
        if (original === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = original;
    }
});

test('rendering converts seconds to minutes while preserving each solute signal', () => {
    const model = {
        system: { columnLength: 0.15 }, time: 60,
        soluteIndices: new Uint16Array([0, 1]), positions: new Float64Array([0.075, 0.03]),
        drainSamples() { return [[{ time: 30, intensity: 2 }], [{ time: 60, intensity: 7 }]]; }
    };
    const view = Object.assign(Object.create(SimulationView.prototype), {
        app: { screen: { width: 100, height: 200 } }, sprites: [{}, {}],
        chart: { data: { datasets: [{ data: [] }, { data: [] }] } }
    });
    view.render(model, false);
    assert.deepEqual(view.chart.data.datasets.map(dataset => dataset.data),
        [[{ x: 0.5, y: 2 }], [{ x: 1, y: 7 }]]);
    assert.equal(view.sprites[0].y, 95);
    assert.equal(view.sprites[1].y, 38);
    assert.deepEqual(Array.from(model.positions), [0.075, 0.03]);
});
