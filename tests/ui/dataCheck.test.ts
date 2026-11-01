import {describe, expect, it} from 'vitest';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import type {ExperimentalSpectrumData, ImageSpectrumCalibration, SpectralPeak} from '../../src/types/spectrum';
import {buildDataCheck, DEFAULT_FREQUENCY_MHZ, type DataCheckSpectrum} from '../../src/ui/dataCheck';

// The 14 scenarios of DESIGN_REPORT B1.2 (v1.2.2). Inputs are synthetic placeholders; nothing here says anything about chemistry.
const cal = (source: ImageSpectrumCalibration['source'], extra: Partial<ImageSpectrumCalibration> = {}): ImageSpectrumCalibration => ({
  plotLeftPx: 80, plotRightPx: 950, plotTopPx: 40, plotBottomPx: 530, xAxisStart: 12, xAxisEnd: 0, xAxisDirection: 'DESCENDING', confidence: 0.78, source, ...extra,
});
const img = (source: ImageSpectrumCalibration['source'] | null, extra: Partial<DataCheckSpectrum> = {}, calExtra: Partial<ImageSpectrumCalibration> = {}): DataCheckSpectrum => ({
  sourceType: 'IMAGE_EXPERIMENTAL', sourceFormat: 'PNG', digitizedFromImage: true, ...(source ? {imageCalibration: cal(source, calExtra)} : {}), nmrSolvent: 'CDCl3', spectrometerFrequencyMHz: 400, ...extra,
});
const csv = (extra: Partial<DataCheckSpectrum> = {}): DataCheckSpectrum => ({sourceType: 'NUMERIC_EXPERIMENTAL', sourceFormat: 'CSV', nmrSolvent: 'CDCl3', spectrometerFrequencyMHz: 400, ...extra});
const item = (r: ReturnType<typeof buildDataCheck>, id: string) => r.items.find(i => i.id === id);

describe('buildDataCheck: ¹H calibration', () => {
  it('1. image, AI_DETECTED 0.78, not user calibrated → warn "預設座標" (although the engine calls it calibrated)', () => {
    const h1 = img('AI_DETECTED');
    expect(SpectrumParser.isSpectrumCalibrated(h1 as ExperimentalSpectrumData)).toBe(true);
    const r = buildDataCheck({'1H_NMR': h1});
    expect(item(r, 'h1-calibration')).toMatchObject({level: 'warn'});
    expect(item(r, 'h1-calibration')!.text).toContain('預設座標');
    expect(r.worst).toBe('warn');
  });
  it('2. image, DEFAULT_FALLBACK → warn', () => {
    expect(item(buildDataCheck({'1H_NMR': img('DEFAULT_FALLBACK')}), 'h1-calibration')!.level).toBe('warn');
    expect(item(buildDataCheck({'1H_NMR': img('PLOT_BOUNDARY_UNCERTAIN')}), 'h1-calibration')!.level).toBe('warn');
    expect(item(buildDataCheck({'1H_NMR': img(null)}), 'h1-calibration')!.level).toBe('warn');
  });
  it('3. image, USER_CALIBRATED (two-point) → ok, says "兩點" and the residual', () => {
    const i = item(buildDataCheck({'1H_NMR': img('USER_CALIBRATED', {}, {maxResidual: 0.02})}), 'h1-calibration')!;
    expect(i.level).toBe('ok');
    expect(i.text).toContain('兩點');
    expect(i.text).toContain('0.02');
  });
  it('4. image, USER_CORRECTED with PIECEWISE → ok, says "分段"', () => {
    const i = item(buildDataCheck({'1H_NMR': img('USER_CORRECTED', {}, {calibrationMode: 'PIECEWISE'})}), 'h1-calibration')!;
    expect(i.level).toBe('ok');
    expect(i.text).toContain('分段');
  });
  it('5. image, USER_3PT_CALIBRATED → ok, says "三點"', () => {
    const i = item(buildDataCheck({'1H_NMR': img('USER_3PT_CALIBRATED')}), 'h1-calibration')!;
    expect(i.level).toBe('ok');
    expect(i.text).toContain('三點');
  });
  it('6. image whose calibration failed → warn', () => {
    expect(item(buildDataCheck({'1H_NMR': img('USER_CALIBRATED', {calibrationFailed: true})}), 'h1-calibration')!.level).toBe('warn');
    expect(item(buildDataCheck({'1H_NMR': img('AI_DETECTED', {calibrationFailed: true})}), 'h1-calibration')!.level).toBe('warn');
  });
  it('7. numeric file → info, not warn (the program cannot know whether the axis was referenced)', () => {
    const r = buildDataCheck({'1H_NMR': csv()});
    expect(item(r, 'h1-calibration')!.level).toBe('info');
    expect(r.worst).toBe('info');
    expect(r.warnCount).toBe(0);
  });
  it('8. manual table → info, "手動輸入"', () => {
    const i = item(buildDataCheck({'1H_NMR': csv({sourceFormat: 'MANUAL'})}), 'h1-calibration')!;
    expect(i.level).toBe('info');
    expect(i.text).toContain('手動輸入');
  });
});

describe('buildDataCheck: solvent, frequency, the rest', () => {
  it('9. solvent undefined / Unknown → warn, CDCl3 → ok', () => {
    expect(item(buildDataCheck({'1H_NMR': csv({nmrSolvent: undefined})}), 'solvent')!.level).toBe('warn');
    expect(item(buildDataCheck({'1H_NMR': csv({nmrSolvent: 'Unknown'})}), 'solvent')!.level).toBe('warn');
    const ok = item(buildDataCheck({'1H_NMR': csv({nmrSolvent: 'CDCl3'})}), 'solvent')!;
    expect(ok.level).toBe('ok');
    expect(ok.text).toContain('CDCl3');
  });
  it('10. frequency undefined → warn and says the program computes with 400 MHz; 500 → ok', () => {
    const w = item(buildDataCheck({'1H_NMR': csv({spectrometerFrequencyMHz: undefined})}), 'frequency')!;
    expect(w.level).toBe('warn');
    expect(w.text).toContain(`${DEFAULT_FREQUENCY_MHZ} MHz`);
    const ok = item(buildDataCheck({'1H_NMR': csv({spectrometerFrequencyMHz: 500})}), 'frequency')!;
    expect(ok).toMatchObject({level: 'ok'});
    expect(ok.text).toContain('500');
  });
  it('11. only IR (no ¹H) → no ¹H, solvent or frequency item; the "未提供" line names ¹H', () => {
    const r = buildDataCheck({IR: csv()});
    expect(r.items.map(i => i.id)).toEqual(['ir-calibration']);
    expect(r.unprovided).toContain('1H_NMR');
    expect(r.unprovidedText).toContain('¹H');
    expect(r.unprovidedText).toContain('不當成反證');
  });
  it('12. IR image not calibrated → warn; IR numeric file → info', () => {
    expect(item(buildDataCheck({IR: img('DEFAULT_FALLBACK')}), 'ir-calibration')!.level).toBe('warn');
    expect(item(buildDataCheck({IR: csv()}), 'ir-calibration')!.level).toBe('info');
  });
  it('13. pixel marks left on an image → an extra "N 個標記仍是像素" warning', () => {
    const peaks = [{isCalibrated: false}, {isCalibrated: false}, {isCalibrated: true}] as SpectralPeak[];
    const r = buildDataCheck({'1H_NMR': img('USER_CALIBRATED', {peaks})});
    expect(item(r, 'pixel-marks')).toMatchObject({level: 'warn'});
    expect(item(r, 'pixel-marks')!.text).toContain('2 個標記仍是像素');
    expect(buildDataCheck({'1H_NMR': img('USER_CALIBRATED', {peaks: [{isCalibrated: true}] as SpectralPeak[]})}).items.some(i => i.id === 'pixel-marks')).toBe(false);
  });
  it('14. input edited after the analysis → the check describes the current input and says "資料已變更"', () => {
    const r = buildDataCheck({'1H_NMR': csv()}, {stale: true});
    expect(r.stale).toBe(true);
    expect(r.staleText).toContain('資料已變更');
    expect(buildDataCheck({'1H_NMR': csv()}).staleText).toBeNull();
  });
});

describe('buildDataCheck: summary line', () => {
  it('lists label and mark per item: ✓ ok, ℹ info, ⚠ warn', () => {
    const r = buildDataCheck({'1H_NMR': img('AI_DETECTED', {nmrSolvent: undefined}), IR: csv()});
    expect(r.summary.map(s => `${s.label}${s.mark}`)).toEqual(['¹H⚠', 'IRℹ', '溶劑⚠', '頻率✓']);
    expect(r.warnCount).toBe(2);
  });
  it('everything fine → worst is ok', () => {
    const r = buildDataCheck({'1H_NMR': img('USER_CALIBRATED'), IR: img('USER_CORRECTED', {}, {calibrationMode: 'PIECEWISE'})});
    expect(r.worst).toBe('ok');
    expect(r.summary.every(s => s.mark === '✓')).toBe(true);
  });
  it('the five-point baseline setting and its version are reported next to IR', () => {
    const ir = {...csv(), irManualSettings: {enabled: true}, irAnalysisSnapshot: {settingsVersion: 3}} as unknown as DataCheckSpectrum;
    const r = buildDataCheck({IR: ir});
    expect(r.irSettingsVersion).toBe(3);
    expect(item(r, 'ir-calibration')!.text).toContain('設定 v3');
  });
  it('nothing loaded → no items, everything unprovided', () => {
    const r = buildDataCheck({});
    expect(r.items).toEqual([]);
    expect(r.worst).toBe('ok');
    expect(r.unprovided).toHaveLength(6);
  });
});
