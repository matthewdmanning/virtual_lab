// Simulation inputs use SI except the documented Wilke–Chang molar volume.
export const DEFAULT_SYSTEM = Object.freeze({
    columnLength: 0.15, columnDiameter: 0.005, particleSize: 5e-6,
    porosity: 0.4, viscosity: 0.001, temperature: 298,
    pressureDrop: 1e7, organicFraction: 0.5, phaseModifier: 1, solventModifier: 1
});

// Display limits are independent of physical model parameters.
export const HPLC_CONFIG = Object.freeze({
    columnLengthsMm: Object.freeze([30, 50, 100, 150, 200, 250, 300]),
    colors: Object.freeze(['#dc2626', '#2563eb', '#16a34a', '#d97706']),
    textColors: Object.freeze(['text-red-600', 'text-blue-600', 'text-green-600', 'text-yellow-600']),
    maxSolutes: 4, maxParticles: 1000, defaultMolarVolumeCm3Mol: 100,
    detectorWindowMinutes: 2.5, detectorWindowPixels: 800
});

export const UI_LABELS = Object.freeze({
    pause: 'Pause', resume: 'Resume', custom: 'Custom', solute: 'Solute', logP: 'Log P',
    maximumSolutes: 'Maximum of {count} solutes allowed.',
    soluteSearchPlaceholder: 'Search (e.g. Caffeine)...'
});
