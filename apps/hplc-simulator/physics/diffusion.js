import { requireFiniteOutput, requirePositive } from "./validation.js";

// Framework 2. Inputs use Pa s, K, and cm³/mol; output uses m²/s.
export const DIFFUSION_DEFAULTS = Object.freeze({
  associationFactor: 2.2,
  solventMolarMass: 25,
});

/** Use this function to calculate Wilke–Chang molecular diffusion for one solute. */
export function calculateMolecularDiffusion(
  molarVolume,
  viscosity,
  tempK,
  options = {},
) {
  requirePositive("Molar volume", molarVolume);
  requirePositive("Viscosity", viscosity);
  requirePositive("Temperature", tempK);
  const {
    associationFactor = DIFFUSION_DEFAULTS.associationFactor,
    solventMolarMass = DIFFUSION_DEFAULTS.solventMolarMass,
  } = options;
  requirePositive("Association factor", associationFactor);
  requirePositive("Solvent molar mass", solventMolarMass);

  const viscosityCentipoise = viscosity * 1000;
  requireFiniteOutput("Viscosity conversion", viscosityCentipoise);
  const diffusionCm2PerSecond =
    (7.4e-8 * Math.sqrt(associationFactor * solventMolarMass) * tempK) /
    (viscosityCentipoise * molarVolume ** 0.6);
  requireFiniteOutput("Molecular diffusion", diffusionCm2PerSecond);
  if (diffusionCm2PerSecond <= 0)
    throw new RangeError("Molecular diffusion must be positive.");
  const diffusion = diffusionCm2PerSecond * 1e-4;
  requireFiniteOutput("Molecular diffusion", diffusion);
  return diffusion;
}
