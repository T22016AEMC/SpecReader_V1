import {describe, expect, it} from 'vitest';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import type {ExperimentalSpectrumData, ImageSpectrumCalibration} from '../../src/types/spectrum';
import {calibrationStatus, isUserCalibrationSource, type CalibrationInput} from '../../src/ui/calibrationStatus';

// Display-layer calibration status (v1.2.2, decision D4): it reads the calibration SOURCE. All spectra here are synthetic placeholders.
const cal = (source: ImageSpectrumCalibration['source'], extra: Partial<ImageSpectrumCalibration> = {}): ImageSpectrumCalibration => ({
  plotLeftPx: 80, plotRightPx: 950, plotTopPx: 40, plotBottomPx: 530, xAxisStart: 12, xAxisEnd: 0, xAxisDirection: 'DESCENDING', confidence: 0.78, source, ...extra,
});
const image = (c: ImageSpectrumCalibration | undefined, extra: Partial<CalibrationInput> = {}): CalibrationInput => ({sourceType: 'IMAGE_EXPERIMENTAL', sourceFormat: 'PNG', digitizedFromImage: true, imageCalibration: c, ...extra});

describe('calibrationStatus', () => {
  it('an image with the default frame (AI_DETECTED, confidence 0.78) is NOT shown as calibrated, although the engine calls it calibrated', () => {
    const s = image(cal('AI_DETECTED'));
    expect(SpectrumParser.isSpectrumCalibrated(s as ExperimentalSpectrumData)).toBe(true);
    const st = calibrationStatus(s);
    expect(st.kind).toBe('DEFAULT_COORDS');
    expect(st.level).toBe('warn');
    expect(st.userCalibrated).toBe(false);
    expect(st.label).toBe('⚠ 預設座標（未校正）');
    expect(st.label).not.toContain('已校正');
  });
  it('DEFAULT_FALLBACK, PLOT_BOUNDARY_UNCERTAIN and a missing calibration read "尚未校正"', () => {
    for (const c of [cal('DEFAULT_FALLBACK'), cal('PLOT_BOUNDARY_UNCERTAIN'), undefined]) {
      const st = calibrationStatus(image(c));
      expect(st.kind).toBe('UNCALIBRATED');
      expect(st.label).toBe('⚠ 尚未校正');
    }
  });
  it('USER_CALIBRATED is a two-point calibration, with the residual in the detail', () => {
    const st = calibrationStatus(image(cal('USER_CALIBRATED', {maxResidual: 0.4321})));
    expect(st).toMatchObject({kind: 'USER', level: 'ok', userCalibrated: true, method: '兩點', label: '已校正 ✓（兩點）', maxResidual: 0.4321});
    expect(st.detail).toContain('0.43');
  });
  it('USER_3PT_CALIBRATED is three-point; USER_CORRECTED with PIECEWISE (or knots) is piecewise', () => {
    expect(calibrationStatus(image(cal('USER_3PT_CALIBRATED'))).method).toBe('三點');
    expect(calibrationStatus(image(cal('USER_CORRECTED', {calibrationMode: 'PIECEWISE'}))).method).toBe('分段');
    expect(calibrationStatus(image(cal('USER_CORRECTED', {piecewiseKnots: [{pixelX: 80, physicalX: 4000}, {pixelX: 950, physicalX: 400}]}))).label).toBe('已校正 ✓（分段）');
    expect(calibrationStatus(image(cal('USER_CORRECTED'))).method).toBe('兩點');
  });
  it('a failed calibration is a warning even when a user source is still on the object', () => {
    const st = calibrationStatus(image(cal('USER_CALIBRATED'), {calibrationFailed: true}));
    expect(st.kind).toBe('FAILED');
    expect(st.level).toBe('warn');
    expect(st.userCalibrated).toBe(false);
  });
  it('numeric files and manual tables get an info status, never a warning', () => {
    expect(calibrationStatus({sourceType: 'NUMERIC_EXPERIMENTAL', sourceFormat: 'CSV'})).toMatchObject({kind: 'NUMERIC', level: 'info', label: '座標來自數值檔'});
    expect(calibrationStatus({sourceType: 'NUMERIC_EXPERIMENTAL', sourceFormat: 'MANUAL'})).toMatchObject({kind: 'MANUAL', level: 'info', label: '座標為手動輸入'});
  });
  it('a missing spectrum is a warning (nothing to trust)', () => {
    expect(calibrationStatus(null).level).toBe('warn');
    expect(calibrationStatus(undefined).kind).toBe('UNCALIBRATED');
  });
  it('the user-source test agrees with SpectrumParser.isUserCalibratedSource for every source value', () => {
    const all: ImageSpectrumCalibration['source'][] = ['AI_DETECTED', 'USER_CALIBRATED', 'USER_CORRECTED', 'USER_3PT_CALIBRATED', 'DEFAULT_FALLBACK', 'PLOT_BOUNDARY_UNCERTAIN'];
    for (const s of all) expect(isUserCalibrationSource(s)).toBe(SpectrumParser.isUserCalibratedSource(s));
    expect(isUserCalibrationSource(undefined)).toBe(false);
  });
});
