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
  /** UI texts (Traditional Chinese) shown by the calibration panel; kept here so no wording is hard-coded in components. */
  ui: {
    /** 2-point mode: a line through two points cannot reveal non-linearity, so the panel says so instead of guessing. */
    twoPointHintText: '只用兩點無法檢查座標軸是否線性；若圖的座標軸在中途換比例，請展開進階選項加入第三點。',
    piecewiseToggleText: '進階選項：分段線性校正（座標軸中途換比例時使用，僅 IR）',
    piecewiseExplainText: '點的順序不限，系統會依像素位置排序；相鄰兩點之間各自線性換算，兩端外推沿用最近一段。',
    switchToPiecewiseButtonText: '改用分段線性校正',
    checkTableTitle: '校正點檢查（輸入值／換算值／差值）',
    checkBasisText: { TWO_POINT: '換算依據：2 點直線', THREE_POINT: '換算依據：3 點最小平方直線', PIECEWISE: '換算依據：分段線性' },
    /** Prefix of the 3-point failure message; the reason and the fit figures are appended by the panel. */
    threePointFailedPrefix: '三點最小平方法校正失敗，未套用',
    threePointFailedNoApplyText: '光譜標記仍維持原狀，沒有被轉換。請重新確認校正點，或改用分段線性校正（僅 IR）。',
  },
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
      /** Help text under the checkbox (the preset is opt-in; the alternative needs no preset at all). */
      helpText: '適用於座標軸在 2000 cm⁻¹ 處改變比例的圖（2000 以上與以下的刻度間距不同）。勾選前請確認你的圖確實如此。',
      alternativeText: '也可以直接點 2000 的刻度當作校正點 D，不使用預設。',
      source: '依一位使用者的實測校正點推得（3000→331、1500→824、500→1319）；其他儀器或圖片格式不一定適用',
    },
  },
} as const;
export type AxisPresetId = keyof typeof AXIS_CALIBRATION_CONFIG.presets;
