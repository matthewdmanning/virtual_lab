# HPLC simulation

The active implementation follows the low-cost analytical + stochastic tier in
[gh-pages.md](../../gh-pages.md). The browser UI supplies inputs and renders
snapshots; it does not calculate retention, broadening, or particle transport.
See the [framework guide](../../framework_parameter_interdependence_guide.md) and
[glossary](../../glossary.md) for the intended physical pipeline.

The screen has five tabs: Analytes, Mobile phase, Solid phase, Settings (advanced),
and Simulation. Simulation contains the column and detector with run/pause/flush
controls. Mode and speed live in Settings. Tabs remain navigable during a run;
setup fields lock until it finishes or is flushed. Arrow keys, Home, and End move
between tabs. Invalid setup inputs are revealed before validation feedback.

## Physical stages

| Framework | Module | Result |
| --- | --- | --- |
| 1: Hydrodynamics | `physics/hydrodynamics.js` | Permeability, Darcy/interstitial velocity, flow, void volume/time, phase ratio |
| 2: Molecular diffusion | `physics/diffusion.js` | Per-solute Wilke–Chang diffusion |
| 3: Thermodynamics | `physics/retention.js` | Measured LSS or empirical LogP retention |
| 5: Kinetics | `physics/kinetics.js` | Per-solute A/B/C and Van Deemter plate height |
| 7: Transport | `physics/transport.js` | Retention time, plate count, retained drift/dispersion, spatial/temporal widths |
| 9: Instrument variance | `physics/transport.js` | Optional additive extra-column temporal variance |

`physics-models.js` is the public interface; `calculateSolutePhysics` runs the
coupled stages. There is no fixed plate count, pressure-based retention
shortcut, or rendering-specific velocity in the physical model.

Units are metres, seconds, pascals, Pa·s and kelvin. Molar volume is cm³/mol;
Wilke–Chang converts viscosity to cP internally and returns m²/s. PubChem volume
conversion is Å³/molecule × 0.602214076. Minutes, millimetres, bars, and mL/min
belong to the UI adapters.

The ε³ Kozeny–Carman expression yields Darcy velocity; dividing by porosity gives
interstitial velocity. This distinction corrects the glossary's velocity label
and keeps `Fv = u × area × ε` and `t0 = V0/Fv` consistent.

## Headless interface

```js
import { Simulation } from './simulation.js';
import { DEFAULT_SYSTEM } from './simulator-config.js';

const run = new Simulation({
    system: DEFAULT_SYSTEM,
    solutes: [{ id: 'caffeine', logP: -0.1, molarVolume: 100, mass: 100 }],
    mode: 'stochastic', // or 'continuous'
    seed: 42,
    particleCount: 1000
});

run.advance(0.1); // elapsed physical seconds, at most 0.25 per call
const samples = run.drainSamples(); // one [{ time, intensity }] array per solute
```

`solutes` exposes calculated SI physics alongside caller metadata. `time`,
`duration`, and `finished` describe the run. `positions` contains axial metres
and `soluteIndices` maps particles to solute records. Renderers read these arrays
without changing them. The original input objects are copied. `mass` defaults to
100 signal·s; intensities are mass/s, and wider peaks have lower heights.

Continuous mode evaluates a Gaussian on a fixed detector clock, with exact apex
points and sparse ±6σ windows. Stochastic mode uses fixed-step seeded random
walks with drift `u/(1+k)` and diffusion `D_L/(1+k)`. Arrival-bin intensity is
collected mass divided by bin width. Default bin width is the narrowest σ/6;
zero bins remain explicit. Optional extra-column variance adds sampled Gaussian
detector-time offsets in stochastic mode; bins wait until negative offsets can
no longer change them. Finite random-walk first-passage skew and sampling noise
are expected.

Calls split across rendering frames or sample drains produce the same detector
output. Browser scheduling uses elapsed timestamps, throttles chart updates,
pauses on hidden tabs, and ignores long stalled-frame catch-up. Speed is a true
physical-time multiplier; resizing, zooming, pausing, and flushing do not change
model coefficients.

The stochastic observation window ends at the last predicted retention time +
12σ. Any unobserved mass is reported in `remainingMass` at completion; it is not
fabricated as a terminal detector spike. Work is bounded: 50,000 particles,
256 fixed steps and one million particle updates per advance, at most 1,000
fixed samples per 0.25 s and one million detector bins per run. Reduce the elapsed
chunk or choose sensible model scales when a limit is rejected. These are work
ceilings, not browser FPS promises.

## Data and model limits

Local compound names/LogP estimates allow injection immediately. Remote PubChem
lookup has a timeout, validates responses, and handles stale searches and missing
properties. Molecular volume defaults to the labeled/configured 100 cm³/mol
estimate when unknown. Custom LogP mode does not reuse an unrelated compound's
volume. Measured `logKw` and `S` can replace the empirical retention correlation
through the headless interface without supplying LogP.

Phase/solvent dropdowns retain empirical modifiers; they do not provide measured
HSM/LSER descriptors. Solvent viscosity, association factor, molar mass,
temperature and packing constants remain explicit configurable assumptions.
Frameworks 4/6/8 (HSM/LSER, Knox, gradient/dwell/compression), pressure heating,
compressibility and nonlinear adsorption are not inferred from these controls.

The [mechanistic notes](../../mechanistic-pde.md) describe future EDM/LPM/GRM
requirements. The existing finite-difference WebGPU prototype is isolated under
`experimental/`; `webgpu-harness.js` preserves its root export. It validates SI
steps and retention coefficients but remains outside the active detector path.
Its first-order upwind scheme adds numerical broadening and its simple
boundaries are not a validated mechanistic column solver. No fallback ladder or
worker/Wasm scaffolding is needed for the current closed-form/particle modes.

## Verification

Source-independent peak measurements and separation metrics are available from
`analysis.js`. See the [analysis interface and conventions](analysis/README.md).
Analysis accepts scalar values or numeric time/signal arrays; it does not read
simulation state or browser controls.

Run `npm test` from the repository root. The checks exercise equations, units,
physical response to input changes, mass balance, seed/frame/drain invariance,
particle mean/width agreement, optional network failures, and static artifact
paths. Adapter tests exercise real browser scheduling/render methods with small
rendering stubs. They do not establish actual browser graphics performance or
GPU shader execution. Run `npm run build` for the Pages artifact.
