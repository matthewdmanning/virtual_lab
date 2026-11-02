import {
  requireFinite,
  requireFiniteOutput,
  requirePositive,
} from "../physics/validation.js";

/**
 * Use this function to derive dimensionless retention from measured times.
 * Inputs: `retentionTime` and `voidTime` are elapsed times in one common unit.
 * Dependencies: `requireFinite`, `requirePositive`, and `requireFiniteOutput`.
 */
export function retentionFactor(retentionTime, voidTime) {
  requirePositive("Void time", voidTime);
  requireFinite("Retention time", retentionTime);
  if (retentionTime < voidTime) {
    throw new RangeError("Retention time must not precede void time.");
  }
  const factor = (retentionTime - voidTime) / voidTime;
  requireFiniteOutput("Retention factor", factor);
  return factor;
}

/**
 * Use this function to compare two positive retention factors independent of analyte order.
 * Inputs: `k1` and `k2` are dimensionless retention factors.
 * Dependencies: `requirePositive` and `requireFiniteOutput`.
 */
export function selectivityFactor(k1, k2) {
  requirePositive("First retention factor", k1);
  requirePositive("Second retention factor", k2);
  const selectivity = Math.max(k1, k2) / Math.min(k1, k2);
  requireFiniteOutput("Selectivity factor", selectivity);
  return selectivity;
}

/**
 * Use this function to estimate theoretical plates from a peak time and width.
 * Inputs: `retentionTime` and `width` are matching time units; `options.method` is sigma, fwhm, or baseline.
 * Dependencies: `requirePositive`, `requireFiniteOutput`.
 */
export function theoreticalPlateCount(
  retentionTime,
  width,
  { method = "sigma" } = {},
) {
  requirePositive("Retention time", retentionTime);
  requirePositive("Peak width", width);
  if (!["sigma", "fwhm", "baseline"].includes(method)) {
    throw new RangeError(
      "Plate-count method must be sigma, fwhm, or baseline.",
    );
  }
  const ratioSquared = (retentionTime / width) ** 2;
  const coefficient = method === "sigma" ? 1 : method === "fwhm" ? 5.545 : 16;
  const plateCount = coefficient * ratioSquared;
  requireFiniteOutput("Theoretical plate count", plateCount);
  if (plateCount <= 0)
    throw new RangeError("Theoretical plate count must be positive.");
  return plateCount;
}

/**
 * Use this function to convert a column length and plate count into HETP.
 * Inputs: `columnLength` is a positive column length and `plateCount` is dimensionless.
 * Dependencies: `requirePositive` and `requireFiniteOutput`.
 */
export function plateHeight(columnLength, plateCount) {
  requirePositive("Column length", columnLength);
  requirePositive("Plate count", plateCount);
  const height = columnLength / plateCount;
  requireFiniteOutput("Plate height", height);
  if (height <= 0) throw new RangeError("Plate height must be positive.");
  return height;
}

/**
 * Use this function to calculate baseline resolution from two peak centers and widths.
 * Inputs: `tr1` and `tr2` are matching retention-time units; `width1` and `width2` are positive baseline widths in that unit.
 * Dependencies: `requireFinite`, `requirePositive`, and `requireFiniteOutput`.
 */
export function resolution(tr1, tr2, width1, width2) {
  requireFinite("First retention time", tr1);
  requireFinite("Second retention time", tr2);
  requirePositive("First peak width", width1);
  requirePositive("Second peak width", width2);
  if (tr1 < 0 || tr2 < 0)
    throw new RangeError("Retention times must be non-negative.");
  const value = Math.abs(tr2 - tr1) / (width1 / 2 + width2 / 2);
  requireFiniteOutput("Resolution", value);
  return value;
}

/**
 * Use this function to estimate resolution from plate count, selectivity, and the later analyte retention factor.
 * Inputs: `plateCount` is dimensionless, `selectivity` is alpha and must be at least 1, and `retentionFactor` is k > 0.
 * Dependencies: `requirePositive`, `requireFinite`, and `requireFiniteOutput`.
 */
export function theoreticalResolution(
  plateCount,
  selectivity,
  retentionFactor,
) {
  requirePositive("Plate count", plateCount);
  requireFinite("Selectivity", selectivity);
  requirePositive("Retention factor", retentionFactor);
  if (selectivity < 1) throw new RangeError("Selectivity must be at least 1.");
  const value =
    (Math.sqrt(plateCount) / 4) *
    ((selectivity - 1) / selectivity) *
    (retentionFactor / (1 + retentionFactor));
  requireFiniteOutput("Theoretical resolution", value);
  return value;
}

/**
 * Use this function to calculate USP tailing at 5 percent peak height.
 * Inputs: `frontWidth` and `backWidth` are positive time widths measured from the peak center.
 * Dependencies: `requirePositive` and `requireFiniteOutput`.
 */
export function tailingFactor(frontWidth, backWidth) {
  requirePositive("Front width", frontWidth);
  requirePositive("Back width", backWidth);
  const value = 0.5 + backWidth / 2 / frontWidth;
  requireFiniteOutput("Tailing factor", value);
  return value;
}

/**
 * Use this function to calculate peak asymmetry at 10 percent peak height.
 * Inputs: `frontWidth` and `backWidth` are positive time widths measured from the peak center.
 * Dependencies: `requirePositive` and `requireFiniteOutput`.
 */
export function asymmetryFactor(frontWidth, backWidth) {
  requirePositive("Front width", frontWidth);
  requirePositive("Back width", backWidth);
  const value = backWidth / frontWidth;
  requireFiniteOutput("Asymmetry factor", value);
  return value;
}

/**
 * Use this function to express a non-negative peak height as signal-to-noise ratio.
 * Inputs: `peakHeight` is detector signal above baseline and `noiseStandardDeviation` is baseline noise in the same signal units.
 * Dependencies: `requireFinite`, `requirePositive`, and `requireFiniteOutput`.
 */
export function signalToNoise(peakHeight, noiseStandardDeviation) {
  requireFinite("Peak height", peakHeight);
  requirePositive("Noise standard deviation", noiseStandardDeviation);
  if (peakHeight < 0) throw new RangeError("Peak height must be non-negative.");
  const value = peakHeight / noiseStandardDeviation;
  requireFiniteOutput("Signal-to-noise ratio", value);
  return value;
}

/**
 * Use this function to calculate LOD and LOQ signal-equivalent concentrations from noise and calibration slope.
 * Inputs: `noiseStandardDeviation` is baseline noise, `calibrationSlope` is positive signal per concentration, and ratios are positive S/N thresholds.
 * Dependencies: `requirePositive` and `requireFiniteOutput`.
 */
export function detectionLimits(
  noiseStandardDeviation,
  calibrationSlope,
  { detectionRatio = 3, quantitationRatio = 10 } = {},
) {
  requirePositive("Noise standard deviation", noiseStandardDeviation);
  requirePositive("Calibration slope", calibrationSlope);
  requirePositive("Detection ratio", detectionRatio);
  requirePositive("Quantitation ratio", quantitationRatio);
  if (quantitationRatio < detectionRatio) {
    throw new RangeError(
      "Quantitation ratio must be at least the detection ratio.",
    );
  }
  const lod = (noiseStandardDeviation / calibrationSlope) * detectionRatio;
  const loq = (noiseStandardDeviation / calibrationSlope) * quantitationRatio;
  requireFiniteOutput("Limit of detection", lod);
  requireFiniteOutput("Limit of quantitation", loq);
  if (lod <= 0 || loq <= 0)
    throw new RangeError("Detection limits are below the numeric range.");
  return { lod, loq };
}
