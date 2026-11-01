import type {ExperimentalSpectrumData, ImageSpectrumCalibration} from '../types/spectrum';

/**
 * Display-layer calibration status of one spectrum (v1.2.2, DESIGN_REPORT B1.2 / B2.1 ③ / B2.2 ③).
 * It reads the CALIBRATION SOURCE, not the engine's "is the spectrum usable" flag: for ¹H/¹³C images the program assumes a 0–12 ppm frame (source AI_DETECTED,
 * confidence 0.78) and `SpectrumParser.isSpectrumCalibrated` accepts that as calibrated; only the three USER_* sources mean the user calibrated the axis.
 * Pure and read-only; no analysis behaviour depends on it (decision D4).
 */
export type CalibrationKind = 'USER' | 'NUMERIC' | 'MANUAL' | 'DEFAULT_COORDS' | 'UNCALIBRATED' | 'FAILED';
export type CalibrationLevel = 'ok' | 'info' | 'warn';
export type CalibrationMethod = '兩點' | '三點' | '分段';

export type CalibrationInput = Partial<Pick<ExperimentalSpectrumData,
  'sourceType' | 'sourceFormat' | 'digitizedFromImage' | 'imageCalibration' | 'calibrationFailed' | 'digitizedMetadata'>>;

export interface CalibrationStatus {
  kind: CalibrationKind;
  level: CalibrationLevel;
  isImage: boolean;
  /** True only when the user calibrated an image axis (two-point, three-point or piecewise). */
  userCalibrated: boolean;
  method: CalibrationMethod | null;
  /** Largest residual of the user calibration, when the image carries one. */
  maxResidual: number | null;
  /** Short chip text, e.g. 「已校正 ✓（分段）」「⚠ 預設座標（未校正）」. */
  label: string;
  /** One sentence for the data check / tooltip. */
  detail: string;
}

/** The three sources the user produces by calibrating (parity with `SpectrumParser.isUserCalibratedSource`, checked by a unit test). */
const USER_SOURCES: readonly ImageSpectrumCalibration['source'][] = ['USER_CALIBRATED', 'USER_CORRECTED', 'USER_3PT_CALIBRATED'];
export const isUserCalibrationSource = (source: ImageSpectrumCalibration['source'] | undefined): boolean => source !== undefined && USER_SOURCES.includes(source);

export const isImageSpectrum = (s: CalibrationInput): boolean => s.sourceType === 'IMAGE_EXPERIMENTAL' || Boolean(s.digitizedFromImage);

function userMethod(cal: ImageSpectrumCalibration | undefined): CalibrationMethod {
  if (cal?.calibrationMode === 'PIECEWISE' || (cal?.piecewiseKnots?.length ?? 0) >= 2) return '分段';
  if (cal?.source === 'USER_3PT_CALIBRATED' || cal?.calibrationMode === 'THREE_POINT') return '三點';
  return '兩點';
}

export function calibrationStatus(spectrum: CalibrationInput | null | undefined): CalibrationStatus {
  const base = {method: null, maxResidual: null, userCalibrated: false} as const;
  if (!spectrum) {
    return {...base, kind: 'UNCALIBRATED', level: 'warn', isImage: false, label: '⚠ 尚未校正', detail: '沒有光譜資料'};
  }
  if (!isImageSpectrum(spectrum)) {
    if (spectrum.sourceFormat === 'MANUAL') {
      return {...base, kind: 'MANUAL', level: 'info', isImage: false, label: '座標為手動輸入', detail: '手動輸入的座標；程式無法得知是否已對溶劑殘峰或 TMS 校準'};
    }
    return {...base, kind: 'NUMERIC', level: 'info', isImage: false, label: '座標來自數值檔', detail: '座標來自數值檔；程式無法得知是否已對溶劑殘峰或 TMS 校準'};
  }
  const cal = spectrum.imageCalibration;
  if (spectrum.calibrationFailed) {
    return {...base, kind: 'FAILED', level: 'warn', isImage: true, label: '⚠ 尚未校正', detail: '沒有套用任何校正（程式沒有偵測到座標軸，或剛才的校正沒有成功）；座標仍是程式預設'};
  }
  if (isUserCalibrationSource(cal?.source) || spectrum.digitizedMetadata?.isTwoPointCalibrated) {
    const method = userMethod(cal);
    const maxResidual = typeof cal?.maxResidual === 'number' && Number.isFinite(cal.maxResidual) ? cal.maxResidual : null;
    return {
      kind: 'USER', level: 'ok', isImage: true, userCalibrated: true, method, maxResidual,
      label: `已校正 ✓（${method}）`,
      detail: `使用者已校正座標（${method}${maxResidual === null ? '' : `，最大誤差 ${Number(maxResidual.toFixed(2))}`}）`,
    };
  }
  if (cal?.source === 'AI_DETECTED') {
    return {...base, kind: 'DEFAULT_COORDS', level: 'warn', isImage: true, label: '⚠ 預設座標（未校正）', detail: '預設座標：程式用圖框推定，不是使用者校正過的；位移若有偏差，排名可能不可靠'};
  }
  return {...base, kind: 'UNCALIBRATED', level: 'warn', isImage: true, label: '⚠ 尚未校正', detail: '圖片座標尚未校正；程式使用預設刻度'};
}

/** Wording for the page-1 spectrum tags and the page-2 chips (v1.2.2 P2): never says "calibrated" for the program's default frame. */
export interface CalibrationCardText {
  text: string;
  tone: 'ok' | 'info' | 'warn';
}
export function calibrationCardText(status: CalibrationStatus): CalibrationCardText {
  switch (status.kind) {
    case 'USER': return {text: `已由你校正（${status.method ?? '兩點'}）`, tone: 'ok'};
    case 'DEFAULT_COORDS': return {text: '預設座標（尚未校正）', tone: 'warn'};
    case 'FAILED': return {text: '尚未校正', tone: 'warn'};   // the parser also sets calibrationFailed on a fresh upload whose axes were not found, so do not say "failed"
    case 'UNCALIBRATED': return {text: '尚未校正', tone: 'warn'};
    case 'NUMERIC':
    case 'MANUAL': return {text: '座標來自檔案', tone: 'info'};
  }
}

/** Non-blocking reminder shown before page 3; `null` when every loaded spectrum is calibrated or comes from a file. */
export function calibrationReminder(items: readonly {label: string; status: CalibrationStatus}[]): {count: number; labels: string[]; text: string} | null {
  const labels = items.filter(i => i.status.level === 'warn').map(i => i.label);
  if (labels.length === 0) return null;
  return {count: labels.length, labels, text: `還有 ${labels.length} 張光譜尚未校正：${labels.join('、')}。仍可直接前往第 3 頁。`};
}
