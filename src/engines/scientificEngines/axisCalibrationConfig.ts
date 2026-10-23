/**
 * Image x-axis calibration constants (v1.1.7-hotfix.2). The existing 2-point and 3-point OLS modes are unchanged;
 * these values serve the piecewise-linear mode and the linearity warning. Engineering defaults, not calibrated.
 */
export const AXIS_CALIBRATION_CONFIG = {
  /** Piecewise-linear mode accepts this many calibration points. */
  piecewiseMinPoints: 2,
  piecewiseMaxPoints: 5,
  /** Two points closer than this (pixels) count as a duplicate pixel position. */
  minPixelSeparation: 3,
  /** Two points whose physical values differ by less than this fraction of the span count as the same value. */
  minPhysicalSeparationFraction: 0.002,
  /** Every calibration point, mapped back through the result, must land within max(absolute, fraction × span). */
  pointReproductionToleranceAbsolute: 0.05,
  pointReproductionToleranceFraction: 0.0002,
  /** 2-point / 3-point OLS: a point whose residual exceeds this fraction of the span triggers the non-linearity warning. */
  linearityResidualFractionOfSpan: 0.005,
  /** Warning text shown when a straight-line calibration leaves a large residual (never blocks the user). */
  linearityWarningText: '座標軸可能非線性，建議使用分段線性模式',
  /** IR positions after calibration are compared with this tolerance (cm⁻¹) in the synthetic acceptance tests. */
  irCalibratedPositionToleranceCm: 2,
  /**
   * Optional presets. IR_SCALE_BREAK_2000: the wavenumber axis changes scale at 2000 cm⁻¹ and the part below 2000
   * has `belowToAboveScaleRatio` times as many pixels per cm⁻¹ as the part above. Derived from one user's measured
   * calibration points (3000 → px 331, 1500 → px 824, 500 → px 1319: ≈0.245 vs ≈0.495 px/cm⁻¹). Other instruments and
   * image formats may differ, so the preset is opt-in only.
   */
  presets: {
    IR_SCALE_BREAK_2000: {
      label: 'IR 座標軸在 2000 cm⁻¹ 處換比例（2:1）',
      modality: 'IR',
      breakPhysical: 2000,
      belowToAboveScaleRatio: 2,
      /** When every point lies on one side of the break, an extra knot this far past the break carries the other slope. */
      extensionPhysical: 2000,
      source: '依一位使用者的實測校正點推得（3000→331、1500→824、500→1319）；其他儀器或圖片格式不一定適用',
    },
  },
} as const;
export type AxisPresetId = keyof typeof AXIS_CALIBRATION_CONFIG.presets;
