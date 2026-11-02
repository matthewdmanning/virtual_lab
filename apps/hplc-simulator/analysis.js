// Source-independent chromatography analysis. Units are supplied by the caller.
export {
  retentionFactor,
  selectivityFactor,
  theoreticalPlateCount,
  plateHeight,
  resolution,
  theoreticalResolution,
  tailingFactor,
  asymmetryFactor,
  signalToNoise,
  detectionLimits,
} from "./analysis/metrics.js";
export {
  peakArea,
  peakMoments,
  peakWidth,
  analyzePeak,
} from "./analysis/peaks.js";
