import type {ExperimentalSpectrumData} from '../types/spectrum';
import {calibrationStatus, type CalibrationInput, type CalibrationLevel} from './calibrationStatus';

/**
 * "資料檢查" of the result page (v1.2.2, DESIGN_REPORT B1.2): a fixed one-line summary above the tab row plus a detail list.
 * Reads the spectra only; nothing here changes an analysis. Which spectra to pass (the snapshot the analysis ran on, or the current input) is the caller's choice.
 */
export type DataCheckLevel = CalibrationLevel;
export type DataCheckModalityKey = 'IR' | '1H_NMR' | '13C_NMR' | 'MS' | 'MS/MS' | 'ToF-SIMS';

export type DataCheckSpectrum = CalibrationInput & Partial<Pick<ExperimentalSpectrumData,
  'nmrSolvent' | 'spectrometerFrequencyMHz' | 'irManualSettings' | 'irAnalysisSnapshot' | 'peaks'>>;

export interface DataCheckItem {
  id: 'h1-calibration' | 'c13-calibration' | 'ir-calibration' | 'pixel-marks' | 'solvent' | 'frequency';
  /** Short name for the one-line summary: ¹H, ¹³C, IR, 溶劑, 頻率, 標記. */
  label: string;
  level: DataCheckLevel;
  /** One sentence for the detail list. */
  text: string;
  /** Second sentence: consequence, limitation. */
  detail: string;
}

export interface DataCheckResult {
  items: DataCheckItem[];
  /** The worst level over all items: warn > info > ok. */
  worst: DataCheckLevel;
  warnCount: number;
  /** One-line summary items: label plus mark (✓ ℹ ⚠). */
  summary: {id: DataCheckItem['id']; label: string; level: DataCheckLevel; mark: '✓' | 'ℹ' | '⚠'}[];
  /** 「未提供：¹³C、MS、…（不當成反證）」 or null when everything is provided. */
  unprovidedText: string | null;
  unprovided: DataCheckModalityKey[];
  /** IR setting version the analysis used (shown next to the IR item and carried by `ir-analysis-version`), or null. */
  irSettingsVersion: number | null;
  /** True when the caller says the input changed after the analysis; the check then describes the CURRENT input. */
  stale: boolean;
  staleText: string | null;
}

export interface DataCheckOptions {
  /** The input was edited after the last analysis (the caller passes the current input then). */
  stale?: boolean;
}

const MODALITY_ORDER: DataCheckModalityKey[] = ['IR', '1H_NMR', '13C_NMR', 'MS', 'MS/MS', 'ToF-SIMS'];
const MODALITY_LABEL: Record<DataCheckModalityKey, string> = {IR: 'IR', '1H_NMR': '¹H', '13C_NMR': '¹³C', MS: 'MS', 'MS/MS': 'MS/MS', 'ToF-SIMS': 'ToF-SIMS'};
const MARK: Record<DataCheckLevel, '✓' | 'ℹ' | '⚠'> = {ok: '✓', info: 'ℹ', warn: '⚠'};
const RANK: Record<DataCheckLevel, number> = {ok: 0, info: 1, warn: 2};
/** The engine computes with this field when the spectrum declares none (nmrEngine). */
export const DEFAULT_FREQUENCY_MHZ = 400;

const solventDeclared = (s: DataCheckSpectrum): boolean => Boolean(s.nmrSolvent) && s.nmrSolvent !== 'Unknown';

function calibrationItem(id: DataCheckItem['id'], modality: '1H_NMR' | '13C_NMR' | 'IR', s: DataCheckSpectrum): DataCheckItem {
  const st = calibrationStatus(s);
  const label = MODALITY_LABEL[modality];
  const consequence: Record<typeof st.kind, string> = {
    USER: '',
    NUMERIC: '若檔案本身的位移軸有偏差，程式看不出來。',
    MANUAL: '若輸入的位移有偏差，程式看不出來。',
    DEFAULT_COORDS: '位移若有偏差，排名可能不可靠；請到第 2 頁校正。',
    UNCALIBRATED: '座標是程式預設，請到第 2 頁校正。',
    FAILED: '請到第 2 頁重新校正。',
  };
  return {id, label, level: st.level, text: `${label} 校正：${st.detail}`, detail: consequence[st.kind]};
}

/** Bundles the checks. `spectra` maps the modality to the spectrum the analysis uses (absent = not provided). */
export function buildDataCheck(spectra: Partial<Record<DataCheckModalityKey, DataCheckSpectrum | null | undefined>>, options: DataCheckOptions = {}): DataCheckResult {
  const items: DataCheckItem[] = [];
  const h1 = spectra['1H_NMR'], c13 = spectra['13C_NMR'], ir = spectra.IR;
  if (h1) items.push(calibrationItem('h1-calibration', '1H_NMR', h1));
  if (c13) items.push(calibrationItem('c13-calibration', '13C_NMR', c13));
  let irSettingsVersion: number | null = null;
  if (ir) {
    const item = calibrationItem('ir-calibration', 'IR', ir);
    const baseline = ir.irManualSettings?.enabled ? ir.irAnalysisSnapshot?.settingsVersion ?? null : null;
    irSettingsVersion = ir.irAnalysisSnapshot?.settingsVersion ?? null;
    if (ir.irManualSettings?.enabled) item.text += `；五點基線已啟用${baseline === null ? '' : `（設定 v${baseline}）`}`;
    items.push(item);
  }
  // Pixel marks that are still pixels (not converted to physical coordinates); they are left out of the automatic comparison.
  const pixelMarks = (['IR', '1H_NMR', '13C_NMR', 'MS', 'MS/MS', 'ToF-SIMS'] as DataCheckModalityKey[]).flatMap(key => {
    const n = (spectra[key]?.peaks ?? []).filter(p => p.isCalibrated === false).length;
    return n > 0 ? [{key, n}] : [];
  });
  if (pixelMarks.length) {
    const total = pixelMarks.reduce((a, b) => a + b.n, 0);
    items.push({
      id: 'pixel-marks', label: '標記', level: 'warn',
      text: `${total} 個標記仍是像素（${pixelMarks.map(p => `${MODALITY_LABEL[p.key]} ${p.n}`).join('、')}）`,
      detail: '座標未確定，未納入自動比對；請到第 2 頁完成座標校正。',
    });
  }
  const nmr = ([['1H_NMR', h1], ['13C_NMR', c13]] as const).filter((x): x is readonly ['1H_NMR' | '13C_NMR', DataCheckSpectrum] => Boolean(x[1]));
  if (nmr.length) {
    const missing = nmr.filter(([, s]) => !solventDeclared(s)).map(([k]) => MODALITY_LABEL[k]);
    items.push(missing.length
      ? {id: 'solvent', label: '溶劑', level: 'warn', text: `溶劑：${missing.join('、')} 未宣告（Unknown）`, detail: '溶劑殘峰（例如 CDCl₃ 的 7.26 ppm）不會被自動排除。'}
      : {id: 'solvent', label: '溶劑', level: 'ok', text: `溶劑：${nmr.map(([k, s]) => `${MODALITY_LABEL[k]} ${s.nmrSolvent}`).join('、')}（使用者宣告）`, detail: ''});
  }
  if (h1) {
    const f = h1.spectrometerFrequencyMHz;
    items.push(typeof f === 'number' && Number.isFinite(f) && f > 0
      ? {id: 'frequency', label: '頻率', level: 'ok', text: `頻率：${f} MHz（使用者宣告）`, detail: ''}
      : {id: 'frequency', label: '頻率', level: 'warn', text: `頻率：未宣告，程式以 ${DEFAULT_FREQUENCY_MHZ} MHz 計算`, detail: '耦合常數（Hz）換成 ppm 時會用這個值；實際儀器不同時多重峰寬度的判讀會有偏差。'});
  }
  const unprovided = MODALITY_ORDER.filter(k => !spectra[k]);
  const worst = items.reduce<DataCheckLevel>((w, i) => (RANK[i.level] > RANK[w] ? i.level : w), 'ok');
  return {
    items, worst, warnCount: items.filter(i => i.level === 'warn').length,
    summary: items.map(i => ({id: i.id, label: i.label, level: i.level, mark: MARK[i.level]})),
    unprovided, unprovidedText: unprovided.length ? `未提供：${unprovided.map(k => MODALITY_LABEL[k]).join('、')}（不當成反證）` : null,
    irSettingsVersion,
    stale: Boolean(options.stale), staleText: options.stale ? '資料已變更：以下檢查針對目前的輸入，結果頁內容仍是上一次分析' : null,
  };
}
