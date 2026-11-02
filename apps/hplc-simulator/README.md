# HPLC simulation

The active implementation follows the low-cost analytical + stochastic tier in
[gh-pages.md](../../gh-pages.md). The browser UI supplies inputs and renders
snapshots; it does not calculate retention, broadening, or particle transport.
See the [framework guide](../../framework_parameter_interdependence_guide.md) and
[glossary](../../glossary.md) for the intended physical pipeline.

The screen has five tabs: Analytes, Mobile phase, Solid phase, Settings (advanced),
and Simulation. Simulation contains the column and detector with run/pause/flush
controls. Settings lists each pipeline stage's solver as a dropdown (static text for
Wilke–Chang, the only diffusion solver); a selection reveals only its parameter fields.
Gradient program, HSM/LSER column values and solute descriptors live in Mobile phase,
Solid phase and Analytes. Speed also lives in Settings. Tabs remain navigable during a run;
setup fields lock until it finishes or is flushed. Arrow keys, Home, and End move
between tabs. Invalid setup inputs are revealed before validation feedback.

## Physical stages

Settings (advanced) selects one solver per stage; all choices reach `calculateSolutePhysics`.

| Framework | Module | Selections |
| --- | --- | --- |
| 1 Hydrodynamics | `physics/hydrodynamics.js` | Kozeny–Carman or constant-permeability Darcy |
| 2 Diffusion | `physics/diffusion.js` | Wilke–Chang (only solver) |
| 3/4 Retention | `physics/retention.js` | LSS (LogP or measured logKw/S), HSM, Abraham LSER |
| 5/6 Broadening | `physics/kinetics.js` | Van Deemter or Knox; both report u_opt, H_min, ν, h |
| 7 Transport | `physics/pipeline.js`, `physics/profiles.js` | EDM linear (Gaussian), LPM/LDF (spectral), EDM Langmuir (Cole–Hopf) |
| 8 Gradient | `physics/gradient.js` | Isocratic or linear LSS gradient with dwell |
| 9 Instrument | `hydrodynamics.js`, `retention.js`, `transport.js` | Compressibility, k(P), extra-column variance |

Model equations and assumptions:

- **Compressibility:** ρ = ρout(1 + χ(P − Pout)), Darcy flow, constant viscosity. B0 = ε × the §1 Kozeny–Carman factor
  (interstitial basis) or the Darcy B0. Outlet superficial
  velocity B0(ΔP + χΔP²/2)/(ηL); t0 = εB0((1 + χΔP)³ − 1)/(3χηu²). `u` is the mean L/t0.
- **HSM:** log(k/kEB) = η'H − σ'S* + β'A + α'B + κ'C. kEB uses the LSS LogP route with
  ethylbenzene LogP 3.15. **LSER:** log k = c + eE + sS + aA + bB + vV. Both need user descriptors.
- **k(P):** k₀·exp(−ΔVm·P/RT) at mean column pressure ΔP/2 above the outlet.
- **Knox:** h = Aν^⅓ + B/ν + Cν. Defaults A = 1, B = 2, C = 0.05 are editable typical values.
  ν_opt = (B/2C)^½ (glossary §6).
- **LPM:** 1/kEff = dp/(6kf) + dp²/(60Dp); kf from Wilson–Geankoplis; Dp = εp·Dm/τ.
  Axial dispersion excludes the mass-transfer term. G(s) = exp(L(u − √(u² + 4D·g(s)))/(2D)),
  g(s) = s(1 + k·kEff/(s + kEff)), inverted by FFT. Defaults εp = 0.5, τ = 2 are editable assumptions.
- **Langmuir EDM:** q' ≈ a(1 − 2bc) reduces the EDM to Burgers' equation; the Cole–Hopf pulse
  solution gives the profile. Valid while b·c ≪ 1. Amount = sample concentration × injection volume.
- **Gradient, LSS closed form (default):** glossary §8 b, k̄, t_R,grad and G as written.
  σt = G·t0(1 + k̄)/√N (§7 σt = t_R/√N at k̄). Particles sample this Gaussian.
- **Gradient, band integration:** separate framework, not in the glossary. RK4 along the band:
  dz/dt = u/(1+k), dσz²/dt = 2D_L/(1+k) + 2σz²·∂v/∂z, Φ(z, t) = program(t − tD − z/u).
  Particles walk with local Φ. Both gradient solvers require LSS retention and EDM transport.
- **Extra-column:** σt² = (Vinj²/12 + π·r⁴·Lt·F/(24·Dm) + Vcell²/12)/F², per solute.

No model uses a spatial grid or finite-difference stencil. Particle mode: EDM walks; LPM uses
two-state LDF switching when exchange is slow per step, otherwise the equivalent walk; gradient
particles use local Φ; Langmuir particles sample arrival times from the profile.

`physics-models.js` is the public interface; `calculateSolutePhysics` runs the
coupled stages. There is no fixed plate count, pressure-based retention
shortcut, or rendering-specific velocity in the physical model.

Units are metres, seconds, pascals, Pa·s and kelvin. Molar volume is cm³/mol;
Wilke–Chang converts viscosity to cP internally and returns m²/s. PubChem volume
conversion is Å³/molecule × 0.602214076. Minutes, millimetres, bars, and mL/min
belong to the UI adapters.

Kozeny–Carman yields interstitial velocity u (glossary §1). Darcy yields superficial velocity;
u = u_Darcy/ε. `Fv = u × area × ε` and `t0 = V0/Fv` hold for both.

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
properties. Each Analytes dropdown merges three sources: built-in compounds,
the curated PubChem catalog (localStorage, 30-day cache), and remembered name
searches (localStorage, newest 50). Typing an unlisted name offers
“Search PubChem”; a found compound joins the dropdown. Molecular volume defaults to the labeled/configured 100 cm³/mol
estimate when unknown. Custom LogP mode does not reuse an unrelated compound's
volume. Measured `logKw` and `S` can replace the empirical retention correlation
through the headless interface without supplying LogP.

Phase/solvent dropdowns retain empirical modifiers; they do not provide measured
HSM/LSER descriptors. No HSM/LSER values are built in; enter published values for your
column and solutes. Solvent viscosity, association factor, molar mass, temperature and
packing constants remain explicit configurable assumptions. Viscous heating, lattice
Boltzmann and the compiled General Rate Model are out of scope.

`experimental/` keeps an unused finite-difference WebGPU prototype; no active model uses it.

## Verification

Source-independent peak measurements and separation metrics are available from
`analysis.js`. See the [analysis interface and conventions](analysis/README.md).
Analysis accepts scalar values or numeric time/signal arrays; it does not read
simulation state or browser controls.

Run `npm test` from the repository root. The checks exercise every framework's equations,
every Settings/phase/analyte selection reaching the engine, units,
physical response to input changes, mass balance, seed/frame/drain invariance,
particle mean/width agreement, optional network failures, and static artifact
paths. Adapter tests exercise real browser scheduling/render methods with small
rendering stubs. They do not establish actual browser graphics performance or
GPU shader execution. Run `npm run build` for the Pages artifact.
