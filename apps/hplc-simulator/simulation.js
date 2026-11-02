import { calculateSolutePhysics } from './physics-models.js';

const MAX_ADVANCE_SECONDS = 0.25;
const MAX_STEPS_PER_ADVANCE = 256;
const MAX_SAMPLES_PER_ADVANCE = 1000;
const EPSILON = 1e-12;

/** Use this function to validate and copy SI system inputs; depends on no other
 * project code and returns an owned configuration for calculateSolutePhysics. */
function ownSystem(system) {
    if (!system || typeof system !== 'object' || Array.isArray(system)) {
        throw new TypeError('system must be an object.');
    }
    const required = ['columnLength', 'columnDiameter', 'particleSize',
        'porosity', 'viscosity', 'temperature', 'organicFraction'];
    if (required.some((key) => !Number.isFinite(system[key]))) {
        throw new TypeError('system values must be finite numbers.');
    }
    if (required.filter((key) => key !== 'organicFraction').some((key) => system[key] <= 0) ||
        system.porosity >= 1 || system.organicFraction < 0 || system.organicFraction > 1) {
        throw new RangeError('system values are outside their valid ranges.');
    }
    const phaseModifier = system.phaseModifier ?? 1;
    const solventModifier = system.solventModifier ?? 1;
    if (![phaseModifier, solventModifier].every((value) => Number.isFinite(value) && value > 0)) {
        throw new RangeError('phaseModifier and solventModifier must be finite and positive.');
    }
    const hasFlow = system.flowRate !== undefined;
    const flowValue = hasFlow ? system.flowRate : system.pressureDrop;
    if (!Number.isFinite(flowValue) || flowValue <= 0) {
        throw new RangeError('flowRate or pressureDrop must be finite and positive.');
    }
    if (system.extraColumnVariance !== undefined &&
        (!Number.isFinite(system.extraColumnVariance) || system.extraColumnVariance < 0)) {
        throw new RangeError('extraColumnVariance must be finite and non-negative.');
    }
    return { ...system, phaseModifier, solventModifier,
        extraColumnVariance: system.extraColumnVariance ?? 0 };
}

/** Use this function to validate and copy solute metadata; inputs are solute
 * records with LogP or measured logKw/S, molarVolume, and optional mass. */
function ownSolutes(solutes) {
    if (!Array.isArray(solutes) || solutes.length === 0 || solutes.length > 0xffff) {
        throw new RangeError('solutes must be a non-empty array of at most 65535 entries.');
    }
    const ids = new Set();
    return solutes.map((solute) => {
        if (!solute || typeof solute !== 'object' || typeof solute.id !== 'string' || !solute.id) {
            throw new TypeError('Each solute needs a non-empty string id.');
        }
        if (ids.has(solute.id)) throw new RangeError(`Duplicate solute id: ${solute.id}`);
        ids.add(solute.id);
        const hasLogP = Number.isFinite(solute.logP);
        const hasMeasuredLss = Number.isFinite(solute.logKw) && Number.isFinite(solute.S);
        const hasDescriptors = solute.hsm !== undefined || solute.lser !== undefined;
        if ((!hasLogP && !hasMeasuredLss && !hasDescriptors) ||
            !Number.isFinite(solute.molarVolume) || solute.molarVolume <= 0) {
            throw new TypeError('Solute needs finite logP, measured logKw/S or HSM/LSER descriptors, plus positive molarVolume.');
        }
        if (solute.logKw !== undefined && !Number.isFinite(solute.logKw) ||
            solute.S !== undefined && (!Number.isFinite(solute.S) || solute.S < 0)) {
            throw new TypeError('Measured logKw and S must be finite, with non-negative S.');
        }
        const mass = solute.mass ?? 100;
        if (!Number.isFinite(mass) || mass < 0) throw new RangeError('Solute mass must be finite and non-negative.');
        return { ...solute, mass };
    });
}

/** Use this class to provide reproducible particle randomness; input is a finite
 * numeric seed and the dependency is only standard JavaScript arithmetic. */
class SeededRandom {
    /** Use this function to initialize reproducible state from numeric seed; no project dependencies. */
    constructor(seed) {
        this.state = (Math.trunc(seed) >>> 0) || 0x6d2b79f5;
    }

    /** Use this function to draw a uniform value from owned uint32 state; no inputs or project dependencies. */
    next() {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let value = this.state;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    }

    /** Use this function to draw axial/detector noise; no inputs; depends on SeededRandom.next. */
    normal() {
        const u = Math.max(Number.MIN_VALUE, this.next());
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
    }
}

/** Use this class to run DOM-free analytical or stochastic HPLC simulations;
 * inputs are SI system/solute configuration and dependencies are the existing
 * calculateSolutePhysics pipeline and its per-solute detector profiles. */
export class Simulation {
    /** Use this function to initialize SI system/solute inputs and sampling options; depends on the physics pipeline and SeededRandom. */
    constructor({ system, solutes, mode = 'continuous', particleCount = 1000,
        seed = 1, stepSeconds = 0.01, detectorIntervalSeconds } = {}) {
        if (mode !== 'continuous' && mode !== 'stochastic') {
            throw new RangeError('mode must be continuous or stochastic.');
        }
        if (!Number.isFinite(particleCount) || !Number.isInteger(particleCount) || particleCount <= 0 || particleCount > 50000) {
            throw new RangeError('particleCount must be an integer between 1 and 50000.');
        }
        if (!Number.isFinite(seed) || !Number.isFinite(stepSeconds) || stepSeconds <= 0 || stepSeconds > MAX_ADVANCE_SECONDS ||
            MAX_ADVANCE_SECONDS / stepSeconds > MAX_STEPS_PER_ADVANCE) {
            throw new RangeError('seed must be finite; stepSeconds must allow at most 256 steps per 0.25 seconds.');
        }
        if (detectorIntervalSeconds !== undefined &&
            (!Number.isFinite(detectorIntervalSeconds) || detectorIntervalSeconds <= 0)) {
            throw new RangeError('detectorIntervalSeconds must be finite and positive.');
        }

        this.system = ownSystem(system);
        const metadata = ownSolutes(solutes);
        if (mode === 'stochastic' && particleCount < metadata.length) {
            throw new RangeError('particleCount must be at least the solute count in stochastic mode.');
        }
        this.solutes = metadata.map((solute) => ({
            ...solute,
            ...calculateSolutePhysics(this.system, solute)
        }));
        this.mode = mode;
        this.particleCount = particleCount;
        this.seed = seed;
        this.stepSeconds = stepSeconds;
        const narrowestSigma = Math.min(...this.solutes.map((solute) => solute.sigma));
        this.detectorIntervalSeconds = detectorIntervalSeconds ?? narrowestSigma / 6;
        if (!Number.isFinite(this.detectorIntervalSeconds) || this.detectorIntervalSeconds <= 0) {
            throw new RangeError('Detector interval must be finite and positive.');
        }
        if (MAX_ADVANCE_SECONDS / this.detectorIntervalSeconds > MAX_SAMPLES_PER_ADVANCE) {
            throw new RangeError('Detector interval would exceed the per-advance sample ceiling.');
        }
        // ponytail: finite 12-sigma stochastic ceiling; expose remainingMass for
        // the vanishing random tail instead of fabricating terminal arrivals.
        const rawDuration = Math.max(...this.solutes.map((solute) => mode === 'stochastic'
            ? Math.max(solute.profile.windowEnd, solute.tr + 12 * solute.sigma)
            : solute.profile.windowEnd));
        this.duration = Math.max(this.detectorIntervalSeconds,
            Math.ceil((rawDuration - EPSILON) / this.detectorIntervalSeconds) *
            this.detectorIntervalSeconds);
        if (!Number.isFinite(this.duration)) throw new RangeError('Run duration exceeds the numeric range.');
        if (this.duration / stepSeconds > Number.MAX_SAFE_INTEGER ||
            this.duration / this.detectorIntervalSeconds > 1e6) {
            throw new RangeError('Run exceeds the supported clock precision or one million detector bins.');
        }
        this.time = 0;
        this.finished = false;
        this.positions = mode === 'stochastic' ? new Float64Array(particleCount) : new Float64Array(0);
        this.soluteIndices = mode === 'stochastic' ? new Uint16Array(particleCount) : new Uint16Array(0);
        this._samples = this.solutes.map(() => []);
        this._random = new SeededRandom(seed);
        this._physicalSteps = 0;
        this._nextSampleTime = this.detectorIntervalSeconds;
        this._apexAdded = this.solutes.map(() => false);
        this._windowStartAdded = this.solutes.map(() => false);
        this._windowEndAdded = this.solutes.map(() => false);
        this.remainingMass = new Float64Array(this.solutes.length);

        if (mode === 'stochastic') this._initializeParticles();
    }

    /** Use this function to allocate per-solute particles and sampled detector
     * delays; inputs are the constructor-owned arrays and physics records. */
    _initializeParticles() {
        this._active = new Uint8Array(this.particleCount);
        this._particleMass = new Float64Array(this.particleCount);
        this._detectorDelay = new Float64Array(this.particleCount);
        this._stationary = new Uint8Array(this.particleCount);
        this._arrival = new Float64Array(this.particleCount);
        this._counts = new Uint32Array(this.solutes.length);
        for (let i = 0; i < this.particleCount; i++) this._counts[i % this.solutes.length]++;
        for (let i = 0; i < this.particleCount; i++) {
            const soluteIndex = i % this.solutes.length;
            const solute = this.solutes[soluteIndex];
            this.soluteIndices[i] = soluteIndex;
            this._active[i] = 1;
            this._particleMass[i] = solute.mass / this._counts[soluteIndex];
            const sampled = solute.particleModel.kind === 'sampled';
            this._detectorDelay[i] = !sampled && solute.extraColumnVariance
                ? this._random.normal() * Math.sqrt(solute.extraColumnVariance)
                : 0;
            this._arrival[i] = sampled ? this._sampleArrival(solute.profile) : Infinity;
        }
        // Explicit two-state LDF switching only when exchange is slow relative to one step;
        // otherwise the equivalent LPM plate height drives an ordinary walk.
        this._explicitKinetics = this.solutes.map((solute) => solute.particleModel.kind === 'lpm' &&
            solute.particleModel.kEff * (1 + solute.particleModel.k) * this.stepSeconds <= 0.5);
        this._bins = this.solutes.map(() => new Map());
        this._deferredMass = new Float64Array(this.solutes.length);
        this._nextBin = new Uint32Array(this.solutes.length);
    }

    /** Use this function to advance by at most 250 ms using fixed physical steps;
     * input is elapsed seconds and the dependency is the owned simulation state. */
    advance(elapsedSeconds) {
        if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > MAX_ADVANCE_SECONDS) {
            throw new RangeError('elapsedSeconds must be in the range [0, 0.25].');
        }
        if (this.finished || elapsedSeconds === 0) return;
        const target = Math.min(this.duration, this.time + elapsedSeconds);
        const wantedSteps = Math.floor((target + EPSILON) / this.stepSeconds);
        if (this.mode === 'stochastic' && (wantedSteps - this._physicalSteps) * this.particleCount > 1e6) {
            throw new RangeError('Advance exceeds one million particle updates; use a smaller elapsed interval.');
        }
        while (this._physicalSteps < wantedSteps) {
            this._step();
            this._physicalSteps++;
        }
        this.time = target;
        if (this.mode === 'continuous') this._sampleContinuous(target);
        else this._emitBins(this._physicalSteps * this.stepSeconds);
        if (target >= this.duration - EPSILON) this._finish();
    }

    /** Use this function to advance all active particles by one fixed physical
     * step; it depends on retained velocity and dispersion from physics-models. */
    _step() {
        if (this.mode !== 'stochastic') return;
        const start = this._physicalSteps * this.stepSeconds;
        for (let i = 0; i < this.particleCount; i++) {
            if (!this._active[i]) continue;
            const soluteIndex = this.soluteIndices[i];
            const solute = this.solutes[soluteIndex];
            const previous = this.positions[i];
            const proposed = this._propose(i, solute, soluteIndex, previous, start);
            this.positions[i] = proposed;
            if (proposed < this.system.columnLength) continue;
            const fraction = previous < this.system.columnLength && proposed !== previous
                ? Math.max(0, Math.min(1, (this.system.columnLength - previous) / (proposed - previous)))
                : 1;
            const arrival = solute.particleModel.kind === 'sampled'
                ? this._arrival[i]
                : start + fraction * this.stepSeconds + this._detectorDelay[i];
            this._active[i] = 0;
            this._recordArrival(this.soluteIndices[i], arrival, this._particleMass[i]);
        }
    }

    /** Use this function to propose one particle's next axial position for its solute's
     * transport model: walk (EDM), lpm (two-state LDF), gradient (local Φ) or sampled (profile CDF). */
    _propose(i, solute, soluteIndex, previous, start) {
        const dt = this.stepSeconds;
        const model = solute.particleModel;
        if (model.kind === 'sampled') {
            return this.system.columnLength * Math.min(1.5, (start + dt) / this._arrival[i]);
        }
        if (model.kind === 'gradient') {
            const tau = start - model.dwellTime - previous / model.u;
            const k = model.multiplier * 10 ** (model.logKw - model.S * model.program.fraction(tau));
            return previous + model.u / (1 + k) * dt +
                this._random.normal() * Math.sqrt(2 * model.dispersion / (1 + k) * dt);
        }
        if (this._explicitKinetics[soluteIndex]) {
            let next = previous;
            if (!this._stationary[i]) {
                next += model.u * dt + this._random.normal() * Math.sqrt(2 * model.axialDispersion * dt);
                if (this._random.next() < -Math.expm1(-model.k * model.kEff * dt)) this._stationary[i] = 1;
            } else if (this._random.next() < -Math.expm1(-model.kEff * dt)) {
                this._stationary[i] = 0;
            }
            return next;
        }
        return previous + solute.soluteVelocity * dt +
            this._random.normal() * Math.sqrt(2 * solute.soluteDispersion * dt);
    }

    /** Use this function to draw one detector arrival time: Gaussian directly, tabulated profiles by inverse CDF. */
    _sampleArrival(profile) {
        if (profile.kind === 'gaussian') return profile.mean + profile.sigma * this._random.normal();
        if (!profile.cdf) {
            const cdf = new Float64Array(profile.values.length);
            for (let j = 1; j < cdf.length; j++) {
                cdf[j] = cdf[j - 1] + (profile.values[j - 1] + profile.values[j]) / 2 * profile.step;
            }
            profile.cdf = cdf;
        }
        const cdf = profile.cdf;
        const target = this._random.next() * cdf[cdf.length - 1];
        let low = 0;
        let high = cdf.length - 1;
        while (high - low > 1) {
            const middle = (low + high) >> 1;
            if (cdf[middle] < target) low = middle; else high = middle;
        }
        const span = cdf[high] - cdf[low];
        return profile.start + (low + (span > 0 ? (target - cdf[low]) / span : 0)) * profile.step;
    }

    /** Use this function to put exited mass into a detector bin; inputs are a
     * solute index, arrival time, and mass, with no external dependencies. */
    _recordArrival(soluteIndex, arrival, mass) {
        if (arrival >= this.duration - EPSILON) {
            this._deferredMass[soluteIndex] += mass;
            return;
        }
        const bin = Math.max(0, Math.floor(arrival / this.detectorIntervalSeconds));
        const bins = this._bins[soluteIndex];
        bins.set(bin, (bins.get(bin) ?? 0) + mass);
    }

    /** Use this function to generate fixed analytical samples and apex samples;
     * inputs are the target time and calculated Gaussian physics. */
    _sampleContinuous(target) {
        while (this._nextSampleTime <= target + EPSILON) {
            const sampleTime = this._nextSampleTime;
            this.solutes.forEach((solute, index) => {
                if (sampleTime >= solute.profile.windowStart - EPSILON &&
                    sampleTime <= Math.min(this.duration, solute.profile.windowEnd) + EPSILON) {
                    const apex = solute.profile.apexTime;
                    const time = Math.abs(sampleTime - apex) < EPSILON ? apex : sampleTime;
                    this._addSample(index, time,
                        solute.mass * solute.profile.pdf(time));
                }
            });
            this._nextSampleTime += this.detectorIntervalSeconds;
        }
        this.solutes.forEach((solute, index) => {
            const start = solute.profile.windowStart;
            const end = Math.min(this.duration, solute.profile.windowEnd);
            const apex = solute.profile.apexTime;
            if (target >= start - EPSILON && !this._windowStartAdded[index]) {
                this._addSample(index, start,
                    solute.mass * solute.profile.pdf(start));
                this._windowStartAdded[index] = true;
            }
            if (!this._apexAdded[index] && apex <= target + EPSILON) {
                // Insert the apex; never replace a grid point that a previous
                // drain may already have delivered to the caller.
                const onGrid = Math.abs(apex / this.detectorIntervalSeconds -
                    Math.round(apex / this.detectorIntervalSeconds)) < EPSILON;
                if (!onGrid) this._addSample(index, apex, solute.mass * solute.profile.pdf(apex));
                this._apexAdded[index] = true;
            }
            if (target >= end - EPSILON && !this._windowEndAdded[index]) {
                this._addSample(index, end,
                    solute.mass * solute.profile.pdf(end));
                this._windowEndAdded[index] = true;
            }
        });
    }

    /** Use this function to emit completed stochastic bins as mass-per-second
     * samples; inputs are current time and optional final flush state. */
    _emitBins(target, force = false) {
        this._bins.forEach((bins, soluteIndex) => {
            const safeTime = force ? this.duration : Math.min(this.duration, target,
                target + this._earliestActiveDelay(soluteIndex));
            const completed = Math.floor((safeTime + EPSILON) / this.detectorIntervalSeconds);
            for (let bin = this._nextBin[soluteIndex]; bin < completed; bin++) {
                const mass = bins.get(bin) ?? 0;
                bins.delete(bin);
                this._addSample(soluteIndex, (bin + 0.5) * this.detectorIntervalSeconds,
                    mass / this.detectorIntervalSeconds);
            }
            this._nextBin[soluteIndex] = Math.max(this._nextBin[soluteIndex], completed);
        });
    }

    /** Use this function to delay bin emission until sampled negative delays are
     * safe; input is a solute index and the dependency is active particle state. */
    _earliestActiveDelay(soluteIndex) {
        let earliest = Infinity;
        for (let index = 0; index < this.particleCount; index++) {
            if (this._active[index] && this.soluteIndices[index] === soluteIndex) {
                earliest = Math.min(earliest, this._detectorDelay[index]);
            }
        }
        return earliest;
    }

    /** Use this function to append a detector sample while coalescing duplicates;
     * inputs are solute index, time, and intensity. */
    _addSample(soluteIndex, time, intensity) {
        const samples = this._samples[soluteIndex];
        const previous = samples[samples.length - 1];
        if (previous && Math.abs(previous.time - time) <= EPSILON) previous.intensity = intensity;
        else samples.push({ time, intensity });
    }

    /** Use this function to finish the finite run and expose unobserved random
     * tail mass; inputs are the current state and no external dependencies. */
    _finish() {
        if (this.mode === 'stochastic') {
            this._emitBins(this.duration, true);
            this._active.forEach((active, index) => {
                if (active) this.remainingMass[this.soluteIndices[index]] += this._particleMass[index];
            });
            this._deferredMass.forEach((mass, index) => this.remainingMass[index] += mass);
        }
        this.finished = true;
        this.time = this.duration;
    }

    /** Use this function to return and clear samples since the previous drain;
     * it has no inputs and returns per-solute time/intensity arrays. */
    drainSamples() {
        return this._samples.map((samples) => {
            samples.sort((a, b) => a.time - b.time);
            const drained = samples.map((sample) => ({ ...sample }));
            samples.length = 0;
            return drained;
        });
    }
}
