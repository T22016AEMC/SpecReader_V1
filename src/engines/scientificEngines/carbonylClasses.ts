import type {ExperimentalSpectrumData} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';
import type {ScoreLedgerEntry} from './evidenceLedger';
import {carbonylBandActive, v141RingCarbonylActive} from '../composition/planningGate';
import {irCalibrationTrusted, irImageRangeCovered, prepareIR} from './irSignalProcessing';
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
  id: 'ESTER' | 'CONJUGATED_KETONE' | 'AMIDE' | 'QUINONE' | 'ANHYDRIDE' | 'ACYL_HALIDE' | 'ACID' | 'ALDEHYDE' | 'KETONE' | 'LACTONE5' | 'LACTONE4' | 'LACTAM4';
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// v1.4.1 (ir.ringCarbonyl): ring strain raises the C=O frequency, so the gamma-lactone (and any 5-ring lactone), the beta-lactone and the beta-lactam are often OUTSIDE the ester / amide window above, and were
// scored down as "carbonyl band missing" (v1.4.0: gamma-butyrolactone at 1775 lost 12 IR points to this). With the flag on, ESTER and AMIDE no longer claim those ring carbonyls and three classes with wide windows
// take them. The windows are textbook-style (gamma-lactone ~1795-1760, beta-lactone ~1840, beta-lactam ~1780-1730) made WIDE on purpose: each one runs DOWN to the lower edge of the class it takes the carbonyl from (ESTER 1710, AMIDE 1630),
// so a candidate is never deducted where v1.4.0 did not deduct it (stop 18: with the narrow windows 1740-1810 / 1780-1860 / 1710-1800 two beta-lactone candidates of the ranking pool lost 1.4 IR points, because an observed ester band
// at 1740 no longer counted for them; the design report's claim 'only deducts less' needs the wide lower edge). UNCALIBRATED, 工程判斷，未查證.
// A five-membered cyclic anhydride (succinic anhydride) is excluded from LACTONE5 by the SMARTS (it has its own ANHYDRIDE class). Five-membered cyclic carbonates have no missing-carbonyl class (carbonates are not modelled).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const V141_RING = '寬窗（工程判斷，未查證，未經校準）；環張力使 C=O 上移，常見教科書範圍：';
export const CARBONYL_CLASSES_V141_RING: CarbonylClass[] = [
  {id: 'LACTONE5', label: '五員環內酯', windowCm1: [1710, 1810], source: `${V141_RING}γ-內酯約 1795–1760（下緣沿用 ESTER 窗 1710）`,
    smarts: '[CX3;r5;$(C(=[OX1])([#6])[OX2;r5]);!$(C(=[OX1])[OX2][CX3]=[OX1])]=[OX1]'},
  {id: 'LACTONE4', label: '四員環內酯（β-內酯）', windowCm1: [1710, 1860], source: `${V141_RING}β-內酯約 1840（下緣沿用 ESTER 窗 1710）`,
    smarts: '[CX3;r4;$(C(=[OX1])([#6])[OX2;r4])]=[OX1]'},
  {id: 'LACTAM4', label: 'β-內醯胺', windowCm1: [1630, 1800], source: `${V141_RING}β-內醯胺約 1780–1730（下緣沿用 AMIDE 窗 1630）`,
    smarts: '[CX3;r4;$(C(=[OX1])([#6])[NX3;r4])]=[OX1]'},
];
/** ESTER without the 4- / 5-membered ring lactones, AMIDE without the beta-lactam (everything else about the two classes is unchanged). */
const NO_RING_LACTONE = ';!$([CX3;r4,r5](=[OX1])[OX2;r4,r5])';
const NO_BETA_LACTAM = ';!$([CX3;r4](=[OX1])[NX3;r4])';
/** The class list with the ring-carbonyl refinement: ESTER / AMIDE narrowed, the three ring classes appended (so the class order, and with it the item id, of every other candidate is unchanged). */
export function withRingCarbonyl(classes: CarbonylClass[]): CarbonylClass[] {
  const withExtra = (smarts: string, extra: string) => { const i = smarts.lastIndexOf(']=[OX1]'); return `${smarts.slice(0, i)}${extra}${smarts.slice(i)}`; }; // the extra condition goes into the last atom bracket (the carbonyl carbon)
  const narrowed = classes.map(c => c.id === 'ESTER' ? {...c, smarts: withExtra(c.smarts, NO_RING_LACTONE)} : c.id === 'AMIDE' ? {...c, smarts: withExtra(c.smarts, NO_BETA_LACTAM)} : c);
  return [...narrowed, ...CARBONYL_CLASSES_V141_RING];
}

/** The carbonyl classes (of the six) a candidate has; empty = B4 does not apply (acids, aldehydes, non-conjugated ketones, no carbonyl). With ir.ringCarbonyl on: the ring-carbonyl refinement (above). */
export function candidateCarbonylClasses(smiles: string): CarbonylClass[] {
  const all = v141RingCarbonylActive() ? withRingCarbonyl(CARBONYL_CLASSES) : CARBONYL_CLASSES;
  const hits = matchingSMARTS(smiles, all.map(c => c.smarts)) ?? [];
  return hits.map(i => all[i]);
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

/** The panel's status for the IR of an analysis: null when the B class is off or there is no IR. */
export function carbonylBandStatusOfIr(ir: ExperimentalSpectrumData | undefined): CarbonylBandStatus | null {
  if (!carbonylBandActive() || !ir) return null;
  return carbonylBandStatus(ir, prepareIR(ir), allCarbonylWindows());
}

/**
 * B4 ledger entries of one candidate: at most ONE `IR:carbonyl-missing:<class>[+<class>…]` entry (compatibility 0, weight = irMissingBand.weight × irDataQuality; the id and the text name every
 * carbonyl class the candidate has), when no window of those classes holds a strong band (a band of at least irMissingBand.strongRelativeIntensity of the strongest band; a band inside the union of the windows is enough).
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
  // One item per candidate: the missing band is one fact (no strong band in the union of the windows), however many classes the candidate has (2C-0).
  const id = `IR:carbonyl-missing:${classes.map(c => c.id).join('+')}`;
  const labels = classes.map(c => c.label).join('、');
  const windows = classes.length === 1 ? `${classes[0].windowCm1[0]}–${classes[0].windowCm1[1]}` : classes.map(c => `${c.label} ${c.windowCm1[0]}–${c.windowCm1[1]}`).join('、');
  const display = `IR（影像）：候選含${labels}羰基，但在 ${windows} cm⁻¹ 沒有強帶（校正可信、描線涵蓋該範圍）；已扣分，未剔除`;
  return [{
    evidenceId: id, observationIds: [id], sourceModality: 'IR' as const, compatibility: 0, weight, contribution: 0, method: display, display,
    limitations: [`缺羰基帶扣分：權重 ${cfg.weight}（未校準，工程判斷，未查證）× IR 資料品質；窗口 ${classes.map(c => c.source).join('；')}`, '只在影像 IR、校正可信、描線涵蓋窗口時啟用；非硬限制'],
  }];
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// v1.3.0 (G4): the missing-carbonyl-band deduction for EVERY carbonyl class. The v1.2.1 functions above are unchanged (their tests pin them); the ledger calls carbonylMissingEntries when useV130 is on.
// Three classes are added to the six: carboxylic acid, aldehyde and non-conjugated ketone. Their windows are the planner's wide windows (ENGINEERING JUDGEMENT, 工程判斷，未查證: no table page was checked;
// the usual textbook ranges are acid about 1725–1680, aldehyde 1740–1685, saturated ketone 1725–1705; the windows are wider so that conjugation, ring size and hydrogen bonding stay inside).
// Not modelled in this version: carboxylate salts (the SMARTS needs a neutral CO2H, so a salt gets no deduction), carbonates, carbamates, ureas, strained rings (cyclobutanone and smaller are left out of KETONE).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const V130 = '規劃者放寬的窗（工程判斷，未查證）；常見教科書範圍：';
export const CARBONYL_CLASSES_V130: CarbonylClass[] = [
  {id: 'ACID', label: '羧酸', windowCm1: [1675, 1745], source: `${V130}羧酸約 1725–1680`, smarts: '[CX3](=[OX1])[OX2H1]'},
  {id: 'ALDEHYDE', label: '醛', windowCm1: [1675, 1745], source: `${V130}醛約 1740–1685`, smarts: '[CX3H1](=[OX1])[#6]'},
  {id: 'KETONE', label: '非共軛酮', windowCm1: [1700, 1750], source: `${V130}飽和酮約 1725–1705`,
    smarts: '[CX3;$(C(=[OX1])([#6])[#6]);!$(C(=[OX1])[#6;$([#6]=,:[#6])]);!$([CX3;r3,r4])]=[OX1]'},
];
const ALL_V130 = [...CARBONYL_CLASSES, ...CARBONYL_CLASSES_V130];

/** The carbonyl classes (of the nine) a candidate has. With ir.ringCarbonyl on: the ring-carbonyl refinement (v1.4.1). */
export function candidateCarbonylClassesV130(smiles: string): CarbonylClass[] {
  const all = v141RingCarbonylActive() ? withRingCarbonyl(ALL_V130) : ALL_V130;
  const hits = matchingSMARTS(smiles, all.map(c => c.smarts)) ?? [];
  return hits.map(i => all[i]);
}

export type CarbonylMissingStatus = CarbonylBandStatus | {state: 'DISABLED'; reason: 'ONE_SIDED_PEAKS'};
/**
 * Is the missing-carbonyl-band check usable for this IR? An image IR: the v1.2.1 conditions (carbonylBandStatus). A peak table or numeric IR (v1.3.0, decision 3, ENGINEERING JUDGEMENT): it must have bands on BOTH sides of
 * the carbonyl region (irV130.carbonylMissing.peakTableUpperCm1 and ...LowerCm1, about 1800–3100 and 1000–1650 cm-1) and known intensities; "not marked" in a table that only lists one side is not "absent".
 */
export function carbonylMissingStatus(ir: ExperimentalSpectrumData | undefined, processed: ExperimentalSpectrumData | null | undefined, windows: [number, number][]): CarbonylMissingStatus {
  if (!ir) return {state: 'DISABLED', reason: 'NOT_IMAGE_IR'};
  const isImage = Boolean(ir.digitizedFromImage || ir.sourceType === 'IMAGE_EXPERIMENTAL' || ir.sourceType === 'IMAGE_DIGITIZED');
  if (isImage) return carbonylBandStatus(ir, processed, windows);
  const C = V12_CONFIG.irV130.carbonylMissing;
  const known = (processed?.peaks ?? []).filter(p => p.intensityKnown !== false && Number.isFinite(p.y) && p.y > 0);
  if (!known.length) return {state: 'DISABLED', reason: 'INTENSITY_UNKNOWN'};
  const side = (r: [number, number]) => known.some(p => p.x >= r[0] && p.x <= r[1]);
  return side(C.peakTableUpperCm1) && side(C.peakTableLowerCm1) ? {state: 'ENABLED'} : {state: 'DISABLED', reason: 'ONE_SIDED_PEAKS'};
}

/**
 * v1.3.0 (G4) ledger entries of one candidate: at most ONE `IR:carbonyl-missing:<class>[+<class>…]` item (compatibility 0), when the candidate has a carbonyl class of the nine and the IR has no band of at least
 * presentRelativeIntensity % of the strongest band inside the union of the class windows (each widened by edgeToleranceCm1 on both sides: the soft edge). The weight is irWeightShare (20 %) × `irWeightSum`, the sum of the weights of the
 * candidate's other IR items, so the deduction keeps its size however many bands the spectrum has (a fixed 0.8 against about 16 of other weight moved the IR score by about 2 points; the planner asked for about 20 %).
 * The candidate is scored down, never rejected.
 */
export function carbonylMissingEntries(smiles: string, ir: ExperimentalSpectrumData, processed: ExperimentalSpectrumData, irWeightSum: number): ScoreLedgerEntry[] {
  const classes = candidateCarbonylClassesV130(smiles);
  if (!classes.length || !(irWeightSum > 0)) return [];
  if (carbonylMissingStatus(ir, processed, classes.map(c => c.windowCm1)).state !== 'ENABLED') return [];
  const C = V12_CONFIG.irV130.carbonylMissing;
  const known = processed.peaks.filter(p => p.intensityKnown !== false && Number.isFinite(p.y) && p.y > 0);
  const strongest = Math.max(...known.map(p => p.y));
  const present = known.some(p => p.y >= (C.presentRelativeIntensity / 100) * strongest && classes.some(c => p.x >= c.windowCm1[0] - C.edgeToleranceCm1 && p.x <= c.windowCm1[1] + C.edgeToleranceCm1));
  if (present) return [];
  const weight = C.irWeightShare * irWeightSum;
  const id = `IR:carbonyl-missing:${classes.map(c => c.id).join('+')}`;
  const labels = classes.map(c => c.label).join('、');
  const windows = classes.length === 1 ? `${classes[0].windowCm1[0]}–${classes[0].windowCm1[1]}` : classes.map(c => `${c.label} ${c.windowCm1[0]}–${c.windowCm1[1]}`).join('、');
  const isImage = Boolean(ir.digitizedFromImage || ir.sourceType === 'IMAGE_EXPERIMENTAL' || ir.sourceType === 'IMAGE_DIGITIZED');
  const display = `IR（${isImage ? '影像' : '峰表'}）：候選含${labels}羰基，但在 ${windows} cm⁻¹（邊界各放寬 ${C.edgeToleranceCm1}）沒有至少 ${C.presentRelativeIntensity}% 最強帶的吸收帶；已扣分，未剔除`;
  return [{
    evidenceId: id, observationIds: [id], sourceModality: 'IR' as const, compatibility: 0, weight, contribution: 0, method: display, display,
    limitations: [`缺羰基帶扣分（v1.3.0）：權重 = ${C.irWeightShare} × 其餘 IR 項權重總和 ${irWeightSum.toFixed(2)}（未校準，工程判斷，未查證）；窗口 ${classes.map(c => c.source).join('；')}`,
      isImage ? '影像 IR：校正可信、描線涵蓋窗口時啟用；非硬限制' : '峰表 IR：羰基區兩側（約 1800–3100 與 1000–1650 cm⁻¹）都有峰時啟用（工程判斷）；非硬限制；羧酸鹽、碳酸酯、胺基甲酸酯未建模'],
  }];
}
