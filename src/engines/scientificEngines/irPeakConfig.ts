/**
 * Minimum IR peak-detection thresholds (v1.1.7-hotfix.1). Applied inside processIRSeries, which serves numeric
 * uploads, JCAMP decoding and the traced curve of calibrated IR images, so the same rules hold before and after
 * calibration. Baseline, smoothing and calibration algorithms are unchanged. Engineering defaults, not calibrated.
 */
export const IR_PEAK_CONFIG = {
  /** A peak must rise at least this many noise σ above the corrected baseline (existing rule, unchanged). */
  minHeightNoiseMultiple: 3,
  /** …and at least this fraction of the largest corrected signal (existing rule, unchanged). */
  minHeightFractionOfMax: 0.02,
  /** Topographic prominence (depth to the higher of the two surrounding saddles) must be at least this many noise σ… */
  minProminenceNoiseMultiple: 6,
  /** …and at least this fraction of the largest corrected signal. Removes ripples riding on broad bands. */
  minProminenceFractionOfMax: 0.02,
  /** Half-width (cm⁻¹) of the window used to decide whether the surroundings of a candidate peak are flat. */
  flatHalfWindowCm: 60,
  /** A window whose signal range is below this many noise σ is flat: no peak may be reported there. */
  flatRangeNoiseMultiple: 8,
} as const;
