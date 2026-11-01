import {describe, expect, it} from 'vitest';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import type {ExperimentalSpectrumData, ImageSpectrumCalibration} from '../../src/types/spectrum';
import {calibrationCardText, calibrationReminder, calibrationStatus, isUserCalibrationSource, type CalibrationInput} from '../../src/ui/calibrationStatus';

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

// v1.2.2 P2: the words on the page-1 tags and the page-2 reminder.
describe('calibrationCardText (page-1 tags)', () => {
  const text = (s: CalibrationInput) => calibrationCardText(calibrationStatus(s));
  it('never calls the default frame "calibrated": 預設座標（尚未校正）, warn', () => {
    expect(text(image(cal('AI_DETECTED')))).toEqual({text: '預設座標（尚未校正）', tone: 'warn'});
  });
  it('a user calibration names its method: 已由你校正（兩點／三點／分段）, ok', () => {
    expect(text(image(cal('USER_CALIBRATED')))).toEqual({text: '已由你校正（兩點）', tone: 'ok'});
    expect(text(image(cal('USER_3PT_CALIBRATED')))).toEqual({text: '已由你校正（三點）', tone: 'ok'});
    expect(text(image(cal('USER_CORRECTED', {calibrationMode: 'PIECEWISE'})))).toEqual({text: '已由你校正（分段）', tone: 'ok'});
  });
  it('numeric files and manual tables are blue information (座標來自檔案), not a warning', () => {
    expect(text({sourceType: 'NUMERIC_EXPERIMENTAL', sourceFormat: 'CSV'})).toEqual({text: '座標來自檔案', tone: 'info'});
    expect(text({sourceType: 'NUMERIC_EXPERIMENTAL', sourceFormat: 'MANUAL'})).toEqual({text: '座標來自檔案', tone: 'info'});
  });
  it('an image whose axes were not found (the parser sets calibrationFailed on upload) reads 尚未校正, not "failed"', () => {
    const st = calibrationStatus(image(cal('DEFAULT_FALLBACK'), {calibrationFailed: true}));
    expect(st.kind).toBe('FAILED');
    expect(st.label).toBe('⚠ 尚未校正');
    expect(calibrationCardText(st)).toEqual({text: '尚未校正', tone: 'warn'});
  });
});

describe('calibrationReminder (page 2, non-blocking)', () => {
  const item = (label: string, s: CalibrationInput) => ({label, status: calibrationStatus(s)});
  it('is null when every loaded spectrum is calibrated or comes from a file', () => {
    expect(calibrationReminder([])).toBeNull();
    expect(calibrationReminder([item('IR', image(cal('USER_CALIBRATED'))), item('¹H', {sourceType: 'NUMERIC_EXPERIMENTAL', sourceFormat: 'CSV'})])).toBeNull();
  });
  it('lists exactly the spectra with a warning, in order', () => {
    const r = calibrationReminder([item('IR', image(cal('DEFAULT_FALLBACK'))), item('¹H', image(cal('AI_DETECTED'))), item('¹³C', image(cal('USER_CALIBRATED')))]);
    expect(r).toMatchObject({count: 2, labels: ['IR', '¹H']});
    expect(r!.text).toBe('還有 2 張光譜尚未校正：IR、¹H。仍可直接前往第 3 頁。');
  });
});
