import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {scoreScientificEvidence, sourceSpectra} from '../../src/engines/scientificEngines/evidenceLedger';
import {irCalibrationTrusted, irImageRangeCovered, irRangeCovered, prepareIR} from '../../src/engines/scientificEngines/irSignalProcessing';
import {CARBONYL_CLASSES, candidateCarbonylClasses, carbonylBandStatus} from '../../src/engines/scientificEngines/carbonylClasses';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {AXIS_CALIBRATION_CONFIG} from '../../src/engines/scientificEngines/axisCalibrationConfig';
import {canonNoStereo, fixtureSpectra, loadFixture, STEP_ONLY_TIME_MS} from '../helpers/v121Golden';
import {refPoint, syntheticSegmentedIRImage} from '../irAxisFixture';
import type {ExperimentalSpectrumData} from '../../src/types/spectrum';

// v1.2.1 B4: a candidate with a carbonyl class but no strong IR band in that class's window is scored down (never rejected) when the IR is an image whose calibration is
// trusted and whose trace covers the window. IR image: SYNTHETIC (tests/irAxisFixture.ts); the 1H comes from the hand-written E1 shape. Nothing here is a measured spectrum.
beforeAll(() => initializeRDKit(), 60000);
const planning = V12_CONFIG.planning;
const saved = {...planning}, savedMissing = {...V12_CONFIG.irMissingBand};
afterEach(() => { Object.assign(planning, saved); Object.assign(V12_CONFIG.irMissingBand, savedMissing); V12_CONFIG.useV121Planning = true; });

const E1 = loadFixture('E1');
const TARGET = E1.targetSmiles;                 // ethyl 4-methylbenzoate: an ester
const CONTROL = 'CCOc1ccc(C)cc1';               // 4-methylphenetole: no carbonyl
// [centre cm-1, width, depth %T] of the spec; B4-missing has no band in 1650–1800.
const BANDS_PRESENT: [number, number, number][] = [[3050, 15, 15], [2980, 14, 30], [1717, 12, 88], [1610, 10, 45], [1270, 18, 85], [1100, 14, 65]];
const BANDS_MISSING = BANDS_PRESENT.filter(b => b[0] < 1650 || b[0] > 1800);
const FIVE = [3500, 3000, 2000, 1500, 500];
const TWO = [3000, 500];
const real = (cm: number) => { const p = refPoint(cm); return {pixelX: p.pixelX, realX: p.physicalX}; };

function imageIr(bands: [number, number, number][], calibrationCms: number[]): ExperimentalSpectrumData {
  const raw = syntheticSegmentedIRImage(bands.map(b => b[0]), bands);
  return WorkbenchOrchestrator.applyPiecewiseCalibration(raw, {points: calibrationCms.map(real), presetId: null});
}
const bundleOf = (ir: ExperimentalSpectrumData) => {
  const h1 = fixtureSpectra(E1)['1H_NMR'];
  return WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR': h1, IR: ir} as never, {}).bundle;
};
const ledger = (bundle: ReturnType<typeof bundleOf>, smiles: string, on: boolean) => {
  V12_CONFIG.useV121Planning = on;
  try { return scoreScientificEvidence(smiles, bundle); } finally { V12_CONFIG.useV121Planning = true; }
};
const missingEntries = (l: ReturnType<typeof ledger>) => l.entries.filter(e => e.evidenceId.startsWith('IR:carbonyl-missing:'));

describe('B4 image IR cases (5-point piecewise calibration 3500/3000/2000/1500/500 cm-1, E1 1H)', () => {
  it('the synthetic setup is what the spec says: a trusted piecewise calibration that covers the ester window, strong 1717 band', () => {
    const ir = imageIr(BANDS_PRESENT, FIVE);
    expect(ir.imageCalibration?.calibrationMode).toBe('PIECEWISE');
    expect(ir.calibrationFailed).not.toBe(true);
    expect(irCalibrationTrusted(ir, 1710, 1750)).toBe(true);
    expect(irImageRangeCovered(ir, 1710, 1750)).toBe(true);
    expect(irRangeCovered(ir, 1710, 1750)).toBe(false);   // the old test is false for every image: this is why B4 needs its own coverage test
    const processed = prepareIR(ir);
    expect(processed.peaks.some(p => Math.abs(p.x - 1717) < 4 && p.y >= 90)).toBe(true);
  });

  it('B4-present: a strong 1717 band → no IR:carbonyl-missing entry; totalScore equals the same spectrum with the flag off', () => {
    const bundle = bundleOf(imageIr(BANDS_PRESENT, FIVE));
    const on = ledger(bundle, TARGET, true), off = ledger(bundle, TARGET, false);
    expect(missingEntries(on)).toEqual([]);
    expect(on.totalScore).toBe(off.totalScore);
    expect(on.entries).toEqual(off.entries);
    expect(on.totalScore).toBeCloseTo(83.924, 2);   // the figure measured on the unmodified scoring in the 2A report
  });

  it('B4-missing: no band in 1650–1800 → IR:carbonyl-missing:ESTER (compatibility 0, weight 0.8 × irDataQuality); the IR modality score falls; the control candidate is unchanged', () => {
    const bundle = bundleOf(imageIr(BANDS_MISSING, FIVE));
    const quality = prepareIR(sourceSpectra(bundle).IR!).irDataQuality!;
    const on = ledger(bundle, TARGET, true), off = ledger(bundle, TARGET, false);
    const mine = missingEntries(on);
    expect(mine.map(e => e.evidenceId)).toEqual(['IR:carbonyl-missing:ESTER']);
    expect(mine[0].compatibility).toBe(0);
    expect(mine[0].sourceModality).toBe('IR');
    expect(mine[0].weight).toBeCloseTo(0.8 * quality, 12);
    expect(mine[0].display).toContain('酯');
    expect(mine[0].display).toContain('1710–1750');
    expect(mine[0].display).not.toMatch(/IR:carbonyl|ESTER/);
    expect(missingEntries(off)).toEqual([]);
    // the deduction is in the IR modality, which falls; not only "the total falls"
    expect(on.modalityScores.IR!).toBeLessThan(off.modalityScores.IR!);
    expect(on.totalScore).toBeLessThan(off.totalScore);
    // the figures of the 2A report: flag off 80.064 / IR 23.304, flag on 77.702 / IR 18.162
    expect([off.totalScore, off.modalityScores.IR!, on.totalScore, on.modalityScores.IR!].map(v => Number(v.toFixed(3)))).toEqual([80.064, 23.304, 77.702, 18.162]);
    // every other entry is the same
    expect(on.entries.filter(e => !e.evidenceId.startsWith('IR:carbonyl-missing:'))).toEqual(off.entries);
    // the candidate without a carbonyl is not touched at all
    const controlOn = ledger(bundle, CONTROL, true), controlOff = ledger(bundle, CONTROL, false);
    expect(missingEntries(controlOn)).toEqual([]);
    expect(controlOn.totalScore).toBe(controlOff.totalScore);
    expect(controlOn.entries).toEqual(controlOff.entries);
    expect(controlOn.totalScore).toBeCloseTo(70.936, 2);
  });

  it('B4-missing through the whole pipeline: the target stays in rankedCandidates (scored down, not rejected) and carries the entry', async () => {
    const ir = imageIr(BANDS_MISSING, FIVE);
    const spectra = {'1H_NMR': fixtureSpectra(E1)['1H_NMR'], IR: ir} as never;
    const out = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: E1.formula}}, {timeMs: STEP_ONLY_TIME_MS, maxStates: 2_000_000});
    const target = canonNoStereo(TARGET);
    const ranked = out.rankedCandidates.find(c => canonNoStereo(c.smiles) === target);
    expect(ranked, 'the ester target is still ranked').toBeDefined();
    expect(ranked!.scientificScoreLedger!.entries.map(e => e.evidenceId)).toContain('IR:carbonyl-missing:ESTER');
    expect(out.rejectedCandidates.some(c => canonNoStereo(c.candidate.smiles) === target)).toBe(false);
    const display = ranked!.scientificScoreLedger!.entries.find(e => e.evidenceId === 'IR:carbonyl-missing:ESTER')!.display;
    expect(display).toContain('已扣分，未剔除');
  }, 120000);

  it('B4-untrusted: the same missing band with a two-point calibration (3000 / 500) → no entry; flag on and off give the same total', () => {
    const ir = imageIr(BANDS_MISSING, TWO);
    expect(irCalibrationTrusted(ir, 1710, 1750)).toBe(false);
    const bundle = bundleOf(ir);
    const on = ledger(bundle, TARGET, true), off = ledger(bundle, TARGET, false);
    expect(missingEntries(on)).toEqual([]);
    expect(on.totalScore).toBe(off.totalScore);
    expect(on.totalScore).toBeCloseTo(84.054, 2);
  });

  it('B4-flagoff: the missing-band spectrum with useV121Planning = false gives a ledger without any B4 item; the sub-switch carbonylBand = false gives the same ledger', () => {
    const bundle = bundleOf(imageIr(BANDS_MISSING, FIVE));
    const flagOff = ledger(bundle, TARGET, false);
    planning.carbonylBand = false;
    const switchOff = scoreScientificEvidence(TARGET, bundle);
    expect(switchOff.entries).toEqual(flagOff.entries);
    expect(switchOff.totalScore).toBe(flagOff.totalScore);
    expect(flagOff.totalScore).toBeCloseTo(80.064, 2);   // v1.2.0 scoring of this spectrum (2A report)
    expect(flagOff.entries.some(e => e.evidenceId.includes('carbonyl'))).toBe(false);
    // the old coverage entries are what v1.2.0 produced for an image IR: none (irRangeCovered is false for every image)
    expect(flagOff.entries.some(e => e.evidenceId.startsWith('IR:coverage'))).toBe(false);
  });

  it('weights: 0.8 × quality is above the mean weight of the existing IR items (the total falls); 0.2 × quality would make the total RISE (the mean reliability drops)', () => {
    const bundle = bundleOf(imageIr(BANDS_MISSING, FIVE));
    const off = ledger(bundle, TARGET, false);
    const quality = prepareIR(sourceSpectra(bundle).IR!).irDataQuality!;
    const irWeights = off.entries.filter(e => e.sourceModality === 'IR' && e.weight > 0).map(e => e.weight);
    const mean = irWeights.reduce((a, b) => a + b, 0) / irWeights.length;
    expect(0.8 * quality).toBeGreaterThan(mean);
    expect(0.2 * quality).toBeLessThan(mean);
    expect(ledger(bundle, TARGET, true).totalScore).toBeLessThan(off.totalScore);
    V12_CONFIG.irMissingBand.weight = 0.2;
    expect(ledger(bundle, TARGET, true).totalScore).toBeGreaterThan(off.totalScore);
  });
});

describe('B4 applicability', () => {
  it('the six classes and their windows are the planner\'s; every window has a source note', () => {
    expect(Object.fromEntries(CARBONYL_CLASSES.map(c => [c.id, c.windowCm1]))).toEqual({
      ESTER: [1710, 1750], CONJUGATED_KETONE: [1650, 1700], AMIDE: [1630, 1680], QUINONE: [1650, 1690], ANHYDRIDE: [1740, 1870], ACYL_HALIDE: [1770, 1815],
    });
    for (const c of CARBONYL_CLASSES) expect(c.source, c.id).toMatch(/工程判斷，未查證/);
  });
  const rows: [string, string, string[]][] = [
    ['ethyl benzoate', 'CCOC(=O)c1ccccc1', ['ESTER']],
    ['methyl acetate', 'COC(C)=O', ['ESTER']],
    ['formate ester', 'CCOC=O', ['ESTER']],
    ['acetanilide', 'CC(=O)Nc1ccccc1', ['AMIDE']],
    ['benzophenone', 'O=C(c1ccccc1)c1ccccc1', ['CONJUGATED_KETONE']],
    ['chalcone-like enone', 'CC(=O)C=Cc1ccccc1', ['CONJUGATED_KETONE']],
    ['p-benzoquinone', 'O=C1C=CC(=O)C=C1', ['QUINONE']],
    ['acetic anhydride', 'CC(=O)OC(C)=O', ['ANHYDRIDE']],
    ['acetyl chloride', 'CC(=O)Cl', ['ACYL_HALIDE']],
    // not applicable: acids, aldehydes, non-conjugated ketones, carbonates, carbamates, no carbonyl
    ['carboxylic acid', 'CC(=O)O', []],
    ['aldehyde', 'CC=O', []],
    ['benzaldehyde', 'O=Cc1ccccc1', []],
    ['acetone (not conjugated)', 'CC(C)=O', []],
    ['dimethyl carbonate', 'COC(=O)OC', []],
    ['methyl carbamate', 'COC(N)=O', []],
    ['ether', 'CCOc1ccc(C)cc1', []],
  ];
  for (const [name, smiles, expected] of rows) it(`${name}: ${smiles} → ${expected.join(', ') || 'not applicable'}`, () => { expect(candidateCarbonylClasses(smiles).map(c => c.id).sort()).toEqual([...expected].sort()); });

  it('a union window rule: an anhydride with only a 1800 band is not "missing" even though its ester-like window is empty', () => {
    const bands: [number, number, number][] = [[3050, 15, 15], [1800, 12, 88], [1270, 18, 60]];
    const bundle = bundleOf(imageIr(bands, FIVE));
    const l = ledger(bundle, 'CC(=O)OC(C)=O', true);
    expect(missingEntries(l)).toEqual([]);
  });
});

describe('2C-0: one item per candidate however many carbonyl classes it has', () => {
  const BOTH = 'CCOC(=O)CNC(C)=O';   // N-acetylglycine ethyl ester: an ester and an amide
  const noCarbonylBand: [number, number, number][] = [[3050, 15, 15], [2980, 14, 30], [1610, 10, 45], [1270, 18, 85], [1100, 14, 65]];
  it('(a) ester + amide with no strong band in the union of the windows: exactly one item, its id and text name both classes, weight 0.8 × quality, compatibility 0', () => {
    expect(candidateCarbonylClasses(BOTH).map(c => c.id)).toEqual(['ESTER', 'AMIDE']);
    const bundle = bundleOf(imageIr(noCarbonylBand, FIVE));
    const quality = prepareIR(sourceSpectra(bundle).IR!).irDataQuality!;
    const on = ledger(bundle, BOTH, true), off = ledger(bundle, BOTH, false);
    const mine = missingEntries(on);
    expect(mine).toHaveLength(1);
    expect(mine[0].evidenceId).toBe('IR:carbonyl-missing:ESTER+AMIDE');
    expect(mine[0].compatibility).toBe(0);
    expect(mine[0].weight).toBeCloseTo(0.8 * quality, 12);
    expect(mine[0].display).toContain('酯、醯胺');
    expect(mine[0].display).toContain('酯 1710–1750');
    expect(mine[0].display).toContain('醯胺 1630–1680');
    expect(mine[0].display).toContain('已扣分，未剔除');
    expect(missingEntries(off)).toEqual([]);
    expect(on.entries.filter(e => !e.evidenceId.startsWith('IR:carbonyl-missing:'))).toEqual(off.entries);
    expect(on.modalityScores.IR!).toBeLessThan(off.modalityScores.IR!);
    // the deduction has the same weight as a single-class candidate's: two items would have doubled it
    const single = missingEntries(ledger(bundleOf(imageIr(BANDS_MISSING, FIVE)), TARGET, true));
    expect(single).toHaveLength(1);
    expect(single[0].weight).toBeCloseTo(mine[0].weight, 12);
  });
  it('(b) a strong band in ANY window of the candidate (amide window or ester window) → no item', () => {
    for (const centre of [1660, 1730]) {
      const bands: [number, number, number][] = [[3050, 15, 15], [centre, 12, 88], [1270, 18, 60]];
      const bundle = bundleOf(imageIr(bands, FIVE));
      const on = ledger(bundle, BOTH, true), off = ledger(bundle, BOTH, false);
      expect(missingEntries(on), `band at ${centre}`).toEqual([]);
      expect(on.totalScore).toBe(off.totalScore);
    }
  });
  it('(c) single class: the ids, texts and scores are those of 2B (ester only)', () => {
    const bundle = bundleOf(imageIr(BANDS_MISSING, FIVE));
    const on = ledger(bundle, TARGET, true), off = ledger(bundle, TARGET, false);
    const mine = missingEntries(on);
    expect(mine.map(e => e.evidenceId)).toEqual(['IR:carbonyl-missing:ESTER']);
    expect(mine[0].display).toBe('IR（影像）：候選含酯羰基，但在 1710–1750 cm⁻¹ 沒有強帶（校正可信、描線涵蓋該範圍）；已扣分，未剔除');
    expect([off.totalScore, off.modalityScores.IR!, on.totalScore, on.modalityScores.IR!].map(v => Number(v.toFixed(3)))).toEqual([80.064, 23.304, 77.702, 18.162]);
    expect(Number(ledger(bundleOf(imageIr(BANDS_PRESENT, FIVE)), TARGET, true).totalScore.toFixed(3))).toBe(83.924);
    expect(Number(ledger(bundleOf(imageIr(BANDS_MISSING, TWO)), TARGET, true).totalScore.toFixed(3))).toBe(84.054);
    expect(Number(ledger(bundle, CONTROL, true).totalScore.toFixed(3))).toBe(70.936);
  });
  it('(e) the flag and the sub-switch switch the item off for the two-class candidate too', () => {
    const bundle = bundleOf(imageIr(noCarbonylBand, FIVE));
    expect(missingEntries(ledger(bundle, BOTH, false))).toEqual([]);
    planning.carbonylBand = false;
    expect(missingEntries(scoreScientificEvidence(BOTH, bundle))).toEqual([]);
  });
});

describe('irCalibrationTrusted / irImageRangeCovered', () => {
  const cal = (c: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({imageCalibration: {source: 'USER_CORRECTED', ...c}, ...extra}) as unknown as ExperimentalSpectrumData;
  const knots = (cms: number[], inferred: number[] = []) => [...cms.map(x => ({pixelX: 3500 - x, physicalX: x})), ...inferred.map(x => ({pixelX: 3500 - x, physicalX: x, inferred: true}))];
  it('piecewise: at least 3 user points, the window between the lowest and the highest user point, inferred points do not count', () => {
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots(FIVE)}), 1710, 1750)).toBe(true);
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots([3000, 1500, 500])}), 1710, 1750)).toBe(true);
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots([3000, 500])}), 1710, 1750)).toBe(false);          // two user points
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots([3000, 500], [2000, 1500, 1000])}), 1710, 1750)).toBe(false); // inferred do not count
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots([3500, 3000, 2000])}), 1710, 1750)).toBe(false);          // window below the lowest point (extrapolated)
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots([1500, 1000, 500])}), 1710, 1750)).toBe(false);          // window above the highest point
  });
  it('three-point least squares: max residual ≤ 0.5 % of the span', () => {
    const pts = [{pixelX: 1, physicalX: 3000}, {pixelX: 2, physicalX: 1500}, {pixelX: 3, physicalX: 500}];   // span 2500 → limit 12.5
    const f = AXIS_CALIBRATION_CONFIG.linearityResidualFractionOfSpan;
    expect(f).toBe(0.005);
    const three = (maxResidual: number) => cal({calibrationMode: 'THREE_POINT', source: 'USER_3PT_CALIBRATED', calibrationPoints: pts, maxResidual});
    expect(irCalibrationTrusted(three(12), 1710, 1750)).toBe(true);
    expect(irCalibrationTrusted(three(12.6), 1710, 1750)).toBe(false);
    expect(irCalibrationTrusted(three(166.7), 1710, 1750)).toBe(false);
  });
  it('two points, no mode, a failed calibration and automatic sources are never trusted', () => {
    expect(irCalibrationTrusted(cal({calibrationMode: 'TWO_POINT', source: 'USER_CALIBRATED'}), 1710, 1750)).toBe(false);
    expect(irCalibrationTrusted(cal({source: 'USER_CALIBRATED'}), 1710, 1750)).toBe(false);
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', piecewiseKnots: knots(FIVE)}, {calibrationFailed: true}), 1710, 1750)).toBe(false);
    expect(irCalibrationTrusted(cal({calibrationMode: 'PIECEWISE', source: 'AI_DETECTED', piecewiseKnots: knots(FIVE)}), 1710, 1750)).toBe(false);
    expect(irCalibrationTrusted({} as ExperimentalSpectrumData, 1710, 1750)).toBe(false);
  });
  it('coverage: marks alone (no traced curve) do not cover; a short curve does not; a failed calibration does not; a numeric spectrum is not an image', () => {
    const ir = imageIr(BANDS_PRESENT, FIVE);
    expect(irImageRangeCovered(ir, 1710, 1750)).toBe(true);
    expect(irImageRangeCovered(ir, 100, 1750)).toBe(false);                         // the trace stops before 100 cm-1
    expect(irImageRangeCovered({...ir, irPixelCurve: undefined}, 1710, 1750)).toBe(false);
    expect(irImageRangeCovered({...ir, irPixelCurve: ir.irPixelCurve!.slice(0, 40)}, 1710, 1750)).toBe(false);
    expect(irImageRangeCovered({...ir, calibrationFailed: true}, 1710, 1750)).toBe(false);
    expect(irImageRangeCovered({...ir, digitizedFromImage: false, sourceType: 'NUMERIC_EXPERIMENTAL'}, 1710, 1750)).toBe(false);
  });
  it('status reasons for the panel: peak table, untrusted calibration, no curve, unknown intensity', () => {
    const win: [number, number][] = [[1630, 1870]];
    const ir = imageIr(BANDS_MISSING, FIVE);
    const processed = prepareIR(ir);
    expect(carbonylBandStatus(ir, processed, win)).toEqual({state: 'ENABLED'});
    expect(carbonylBandStatus(fixtureSpectra(E1).IR as ExperimentalSpectrumData, undefined, win)).toEqual({state: 'DISABLED', reason: 'NOT_IMAGE_IR'});
    expect(carbonylBandStatus(imageIr(BANDS_MISSING, TWO), processed, win)).toEqual({state: 'DISABLED', reason: 'CALIBRATION_UNTRUSTED'});
    expect(carbonylBandStatus({...ir, irPixelCurve: undefined}, processed, win)).toEqual({state: 'DISABLED', reason: 'RANGE_NOT_COVERED'});
    expect(carbonylBandStatus(ir, {...processed, peaks: processed.peaks.map(p => ({...p, intensityKnown: false}))}, win)).toEqual({state: 'DISABLED', reason: 'INTENSITY_UNKNOWN'});
    expect(carbonylBandStatus(undefined, undefined, win)).toEqual({state: 'DISABLED', reason: 'NOT_IMAGE_IR'});
  });
  it('a peak-table IR (the E1 fixture, not an image) never gets the new deduction, only the v1.2.0 0.2 rule', () => {
    const f = fixtureSpectra(E1);
    const noBand = {...f.IR, peaks: f.IR!.peaks.filter(p => p.x < 1650 || p.x > 1800)} as ExperimentalSpectrumData;
    const bundle = WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR': f['1H_NMR'], IR: noBand} as never, {}).bundle;
    const on = ledger(bundle, TARGET, true), off = ledger(bundle, TARGET, false);
    expect(missingEntries(on)).toEqual([]);
    expect(on.entries).toEqual(off.entries);
    expect(on.totalScore).toBe(off.totalScore);
  });
});
