import type {ExperimentalSpectrumData} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';
import type {ScoreLedgerEntry} from './evidenceLedger';
import {irCalibrationTrusted, irImageRangeCovered} from './irSignalProcessing';
import {matchingSMARTS} from './rdkitAdapter';

/**
 * v1.2.1 (B4): carbonyl classes and the IR window each one is expected in. A candidate that has one of these classes but whose windows hold no strong band, on an image IR
 * with a trusted calibration and a trace that covers the windows, is scored down (never rejected).
 *
 * Windows (cm-1): the planner's widened windows (conservative direction). Checked against Coates, "Interpretation of Infrared Spectra, A Practical Approach", Table 9
 * (article p. 13, PDF page 13 of the file in 論文\): amide 1680–1630 (window 1630–1680: same), quinone or conjugated ketone 1690–1675 plus a conjugation band 1650–1600
 * (windows 1650–1690 / 1650–1700 contain the 1690–1675 band), ester 1750–1725 (window 1710–1750: wider at the low end, because conjugation lowers a carbonyl by 30–50,
 * article p. 21), open-chain anhydride 1850–1800/1790–1740 and five-membered anhydride 1870–1820/1800–1775 (window 1740–1870 contains both), acid halide 1815–1770 (window
 * 1770–1815: same). The SMARTS that decide whether a candidate has the class are 工程判斷，未查證.
 */
export interface CarbonylClass {
  id: 'ESTER' | 'CONJUGATED_KETONE' | 'AMIDE' | 'QUINONE' | 'ANHYDRIDE' | 'ACYL_HALIDE';
  /** Traditional Chinese, shown in the panel. */
  label: string;
  smarts: string;
  windowCm1: [number, number];
  /** Where the window comes from. */
  source: string;
}

const PLANNER = '規劃者放寬的窗（工程判斷，未查證）；Coates, Interpretation of Infrared Spectra, Table 9, p. 13：';
export const CARBONYL_CLASSES: CarbonylClass[] = [
  // ester: C(=O) bound to carbon or H and to O–C (the carbon of that O is not a carbonyl); carbamates, carbonates, acid halides and anhydrides are not esters here
  {id: 'ESTER', label: '酯', windowCm1: [1710, 1750], source: `${PLANNER}酯 1750–1725`,
    smarts: '[CX3;$(C(=[OX1])[OX2][#6;!$([#6]=[OX1])]);!$(C(=[OX1])[NX3]);!$(C(=[OX1])([OX2])[OX2]);!$(C(=[OX1])[F,Cl,Br,I])]=[OX1]'},
  // ketone with a C=C or aromatic neighbour (quinones have their own class)
  {id: 'CONJUGATED_KETONE', label: '共軛酮', windowCm1: [1650, 1700], source: `${PLANNER}共軛酮 1690–1675（另有 1650–1600 帶）`,
    smarts: '[CX3;$(C(=[OX1])([#6])[#6]);$(C(=[OX1])[#6;$([#6]=,:[#6])]);!$([CX3]1(=O)[#6]=,:[#6][#6](=O)[#6]=,:[#6]1)]=[OX1]'},
  {id: 'AMIDE', label: '醯胺', windowCm1: [1630, 1680], source: `${PLANNER}醯胺 1680–1630`,
    smarts: '[CX3;$(C(=[OX1])[NX3]);!$(C(=[OX1])[OX2])]=[OX1]'},
  {id: 'QUINONE', label: '醌', windowCm1: [1650, 1690], source: `${PLANNER}醌 1690–1675（另有 1650–1600 帶）`,
    smarts: '[#6]1(=O)[#6]=,:[#6][#6](=O)[#6]=,:[#6]1'},
  {id: 'ANHYDRIDE', label: '酸酐', windowCm1: [1740, 1870], source: `${PLANNER}酸酐 1850–1800/1790–1740、五員環 1870–1820/1800–1775`,
    smarts: '[CX3](=[OX1])[OX2][CX3](=[OX1])'},
  {id: 'ACYL_HALIDE', label: '醯鹵', windowCm1: [1770, 1815], source: `${PLANNER}醯鹵 1815–1770`,
    smarts: '[CX3](=[OX1])[F,Cl,Br,I]'},
];

/** The carbonyl classes (of the six) a candidate has; empty = B4 does not apply (acids, aldehydes, non-conjugated ketones, no carbonyl). */
export function candidateCarbonylClasses(smiles: string): CarbonylClass[] {
  const hits = matchingSMARTS(smiles, CARBONYL_CLASSES.map(c => c.smarts)) ?? [];
  return hits.map(i => CARBONYL_CLASSES[i]);
}

export type CarbonylBandStatus =
  | {state: 'ENABLED'}
  | {state: 'DISABLED'; reason: 'NOT_IMAGE_IR' | 'CALIBRATION_UNTRUSTED' | 'RANGE_NOT_COVERED' | 'INTENSITY_UNKNOWN'};

export const CARBONYL_STATUS_TEXT: Record<Extract<CarbonylBandStatus, {state: 'DISABLED'}>['reason'], string> = {
  NOT_IMAGE_IR: '不是影像 IR（峰表或數值光譜的強度不可靠，缺羰基帶扣分不啟用）',
  CALIBRATION_UNTRUSTED: '影像 IR 的 X 軸校正不可信（需要分段線性 ≥ 3 個使用者點並涵蓋羰基窗，或殘差合格的三點校正；兩點校正不算）',
  RANGE_NOT_COVERED: '影像 IR 沒有涵蓋羰基窗的描線曲線（只有人工標記、沒有描線，或描線範圍不含羰基窗）',
  INTENSITY_UNKNOWN: '影像 IR 的峰強度未知',
};

/** Is the missing-carbonyl-band check usable for the windows [lo, hi] of this IR spectrum? (Not candidate specific.) */
export function carbonylBandStatus(ir: ExperimentalSpectrumData | undefined, processed: ExperimentalSpectrumData | null | undefined, windows: [number, number][]): CarbonylBandStatus {
  const isImage = Boolean(ir && (ir.digitizedFromImage || ir.sourceType === 'IMAGE_EXPERIMENTAL' || ir.sourceType === 'IMAGE_DIGITIZED'));
  if (!ir || !isImage) return {state: 'DISABLED', reason: 'NOT_IMAGE_IR'};
  if (!windows.every(([lo, hi]) => irCalibrationTrusted(ir, lo, hi))) return {state: 'DISABLED', reason: 'CALIBRATION_UNTRUSTED'};
  if (!windows.every(([lo, hi]) => irImageRangeCovered(ir, lo, hi))) return {state: 'DISABLED', reason: 'RANGE_NOT_COVERED'};
  const known = (processed?.peaks ?? []).filter(p => p.intensityKnown !== false && Number.isFinite(p.y) && p.y > 0);
  if (!known.length) return {state: 'DISABLED', reason: 'INTENSITY_UNKNOWN'};
  return {state: 'ENABLED'};
}

/** The status for the whole carbonyl range (all six windows together), for the panel. */
export const allCarbonylWindows = (): [number, number][] => [[Math.min(...CARBONYL_CLASSES.map(c => c.windowCm1[0])), Math.max(...CARBONYL_CLASSES.map(c => c.windowCm1[1]))]];

/**
 * B4 ledger entries of one candidate: one `IR:carbonyl-missing:<class>` entry (compatibility 0, weight = irMissingBand.weight × irDataQuality) per carbonyl class the candidate has,
 * when no window of those classes holds a strong band (a band of at least irMissingBand.strongRelativeIntensity of the strongest band; a band inside the union of the windows is enough).
 * Peak-table / numeric IR and an untrusted calibration produce nothing. The candidate is never rejected.
 */
export function carbonylBandEntries(smiles: string, ir: ExperimentalSpectrumData, processed: ExperimentalSpectrumData): ScoreLedgerEntry[] {
  const classes = candidateCarbonylClasses(smiles);
  if (!classes.length) return [];
  if (carbonylBandStatus(ir, processed, classes.map(c => c.windowCm1)).state !== 'ENABLED') return [];
  const cfg = V12_CONFIG.irMissingBand;
  const known = processed.peaks.filter(p => p.intensityKnown !== false && Number.isFinite(p.y) && p.y > 0);
  const strongest = Math.max(...known.map(p => p.y));
  const present = known.some(p => p.y >= cfg.strongRelativeIntensity * strongest && classes.some(c => p.x >= c.windowCm1[0] && p.x <= c.windowCm1[1]));
  if (present) return [];
  const weight = cfg.weight * (processed.irDataQuality ?? .5);
  return classes.map(c => {
    const id = `IR:carbonyl-missing:${c.id}`;
    const display = `IR（影像）：候選含${c.label}羰基，但在 ${c.windowCm1[0]}–${c.windowCm1[1]} cm⁻¹ 沒有強帶（校正可信、描線涵蓋該範圍）；已扣分，未剔除`;
    return {
      evidenceId: id, observationIds: [id], sourceModality: 'IR' as const, compatibility: 0, weight, contribution: 0, method: display, display,
      limitations: [`缺羰基帶扣分：權重 ${cfg.weight}（未校準，工程判斷，未查證）× IR 資料品質；窗口 ${c.source}`, '只在影像 IR、校正可信、描線涵蓋窗口時啟用；非硬限制'],
    };
  });
}
