import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { UIController } from '../apps/hplc-simulator/ui-controller.js';

/** Use this function to exercise the real tab handlers against the shipped HTML;
 * inputs are a test callback; depends on UIController and temporarily supplied DOM/animation globals. */
function withTabs(check) {
    const html = readFileSync(new URL('../apps/hplc-simulator/index.html', import.meta.url), 'utf8');
    const panels = new Map();
    const tabs = [];
    const frames = [];
    let focused;
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)]
            .map(attribute => [attribute[1], attribute[2]]));
        if (attributes.role === 'tabpanel') panels.set(attributes.id, { hidden: /\bhidden\b/.test(match[2]) });
        if (attributes.role === 'tab') {
            tabs.push({
                id: attributes.id, dataset: { tab: attributes['data-tab'] }, listeners: {},
                tabIndex: Number(attributes.tabindex),
                getAttribute(name) { return attributes[name]; },
                setAttribute(name, value) { attributes[name] = value; },
                addEventListener(name, handler) { this.listeners[name] = handler; },
                focus() { focused = this.id; }
            });
        }
    }
    const oldDocument = globalThis.document;
    const oldFrame = globalThis.requestAnimationFrame;
    globalThis.document = { querySelectorAll() { return tabs; }, getElementById(id) { return panels.get(id); } };
    globalThis.requestAnimationFrame = callback => frames.push(callback);
    let resizes = 0;
    const simulation = { time: 123 };
    const controller = Object.assign(Object.create(UIController.prototype), {
        simulation, view: { resize() { resizes++; } }
    });
    try {
        controller.bindTabs();
        check({ controller, tabs, panels, frames, simulation,
            focus: () => focused, resizes: () => resizes });
    } finally {
        if (oldDocument === undefined) delete globalThis.document;
        else globalThis.document = oldDocument;
        if (oldFrame === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = oldFrame;
    }
}

test('five linked tabs preserve simulation state and reveal exactly one panel', () => {
    withTabs(({ controller, tabs, panels, frames, simulation, resizes }) => {
        assert.deepEqual(tabs.map(tab => tab.dataset.tab),
            ['analytes', 'mobile-phase', 'solid-phase', 'settings', 'simulation']);
        assert.equal(controller.activeTab, 'analytes');
        assert.equal(panels.size, 5);
        for (const tab of tabs) {
            tab.listeners.click();
            assert.equal(controller.activeTab, tab.dataset.tab);
            assert.equal([...panels.values()].filter(panel => !panel.hidden).length, 1);
            assert.equal(panels.get(tab.getAttribute('aria-controls')).hidden, false);
            assert.equal(tabs.filter(button => button.tabIndex === 0).length, 1);
            assert.equal(tab.getAttribute('aria-selected'), 'true');
        }
        assert.equal(resizes(), 0);
        frames.shift()();
        assert.equal(resizes(), 1);
        assert.equal(controller.simulation, simulation);
        assert.equal(simulation.time, 123);
    });
});

test('keyboard navigation wraps, supports Home/End, and cancels stale resize callbacks', () => {
    withTabs(({ controller, tabs, frames, focus, resizes }) => {
        let prevented = 0;
        tabs[0].listeners.keydown({ key: 'ArrowLeft', preventDefault() { prevented++; } });
        assert.equal(controller.activeTab, 'simulation');
        assert.equal(focus(), 'tab-simulation');
        tabs[4].listeners.keydown({ key: 'Home', preventDefault() { prevented++; } });
        assert.equal(controller.activeTab, 'analytes');
        frames.shift()();
        assert.equal(resizes(), 0);
        tabs[0].listeners.keydown({ key: 'End', preventDefault() { prevented++; } });
        tabs[4].listeners.keydown({ key: 'ArrowRight', preventDefault() { prevented++; } });
        assert.equal(controller.activeTab, 'analytes');
        assert.equal(prevented, 4);
    });
});

test('injection reveals a hidden invalid setup field before browser validity focus', () => {
    withTabs(({ controller }) => {
        controller.selectTab('simulation');
        let reported = false;
        const input = {
            checkValidity() { return false; },
            closest() { return { id: 'panel-mobile-phase' }; },
            reportValidity() {
                assert.equal(controller.activeTab, 'mobile-phase');
                reported = true;
            }
        };
        controller.panels = { control: { querySelectorAll() { return [input]; } } };
        controller.handleInject();
        assert.equal(reported, true);
    });
});
