import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {buildCompositionPanel, carbonylBandView, VINYL_RELAXED_NOTE, VINYL_WINDOW_TEXT, type PanelInput} from '../../src/engines/enumeration/compositionPanelModel';
import {exclusionLines, exclusionStats, FORBIDDEN_SOURCE_LINE, zeroCandidateExplanation} from '../../src/engines/enumeration/exclusionStats';
import {carbonylBandStatusOfIr, CARBONYL_STATUS_TEXT} from '../../src/engines/scientificEngines/carbonylClasses';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {fixtureSpectra, loadFixture, SHAPE_BUDGET} from '../helpers/v121Golden';
import {refPoint, syntheticSegmentedIRImage} from '../irAxisFixture';
import type {CompositionHypothesis, CompositionInferenceResult} from '../../src/engines/composition/types';
import type {CompositionSearchRun} from '../../src/engines/composition/structureGenerator';
import type {EnumerationRunDiagnostic, V12RunDiagnostic} from '../../src/engines/enumeration/types';

// v1.2.1 B class, panel: forbidden-fragment statistics, the missing-carbonyl-band status, the vinyl-window sentence and the "relaxed" note. Synthetic objects only.
beforeAll(() => initializeRDKit(), 60000);
const planning = V12_CONFIG.planning;
const saved = {...planning};
afterEach(() => { Object.assign(planning, saved); V12_CONFIG.useV121Planning = true; });

const hyp = (formula: string): CompositionHypothesis => ({
  id: `comp-${formula}`, formula, counts: {}, dbe: 4, monoisotopicMass: 100, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null,
  relativeConfidence: 1, calibrated: false, score: 0, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: true, sizeConfirmed: false, symmetryMultiple: 1,
});
const composition = (formulas: string[]): CompositionInferenceResult => ({
  status: 'INFERRED', hypotheses: formulas.map(hyp), ionHypotheses: [], elementsConsidered: ['C', 'H', 'O'], elementsExcluded: [], elementClues: [],
  nitrogenEvidence: {mode: 'NONE', allowed: false, reasons: [], note: 'n'}, bounds: {carbon: [6, 12], hydrogenMultiples: null, heteroMinimums: {}, dbeMin: 4, hardBoundsRelaxed: false},
  enumeration: {enumeratedNodes: 0, passedHardFilters: 0, returned: formulas.length, truncatedByNodes: false, droppedByKeepLimit: 0}, limitations: [], elapsedMs: 1,
} as CompositionInferenceResult);
const v12 = (relaxed: boolean): V12RunDiagnostic => ({
  path: 'INVENTORY', badge: null, reason: null,
  inventory: {
    status: 'BUILT', reason: null, alternatives: 3, truncated: false, patternSets: 3, patternTruncated: false, incompleteReasons: [], ratioSum: 5,
    combinations: [{k: 1, extraExchangeable: 0, ratio: [2, 3]}],
    signals: [
      {observationId: 'a', shiftPpm: 6.2, relativeIntegral: 2, ratio: 2, multiplicity: 's', broad: false, classes: ['ARO_CH', 'VINYL_CH'], singletRuleApplied: false, equivalenceRequired: false, ...(relaxed ? {vinylRelaxed: true} : {})},
      {observationId: 'b', shiftPpm: 2.3, relativeIntegral: 3, ratio: 3, multiplicity: 's', broad: false, classes: ['ALKYL_CH'], singletRuleApplied: true, equivalenceRequired: false},
    ],
    voided: [], aromaticLimited: [], alternativesPreview: [],
  },
  constraints: {pinnedAtoms: 5, equivalentGroups: 0, aromaticPools: [], singletGroups: 1, alkeneGroups: 0, strainProfile: null, symmetryPruning: true},
  required: [], runs: [], leafCost: null,
});
const run = (formula: string, forbiddenById?: Record<string, number>, relaxed = false): EnumerationRunDiagnostic => ({
  used: true, fallbackReason: null, formula, status: 'COMPLETE', complete: true, incompleteReasons: [], readings: [], incompatibleReadings: 0, candidates: 1, visited: 10, leaves: 3, elapsedMs: 1,
  rejected: {sanitizeFailed: 0, duplicatesMerged: 0, notConnected: 0, forbiddenByRule: {}, strainByRule: {}, approximate: false, v12: {aromaticFailed: 0, requiredFailed: 0, equivalenceFailed: 0, alkeneFailed: 0, ...(forbiddenById ? {forbiddenById} : {})}},
  conversions: [], notes: [], v12: v12(relaxed),
});
const searchRun = (formula: string, e: EnumerationRunDiagnostic): CompositionSearchRun =>
  ({hypothesisId: `comp-${formula}`, formula, maxStates: 1, timeMs: 1, visited: 1, elapsedMs: 1, termination: 'GRAMMAR_EXHAUSTED', candidates: 1, symmetry: null, diagnostic: null, enumeration: e});
const input = (runs: CompositionSearchRun[], extra: Partial<PanelInput> = {}): PanelInput => ({composition: composition(runs.map(r => r.formula!)), runs, mode: 'COMPOSITION_HYPOTHESES', enumeration: undefined, localStructures: [], ...extra});

describe('forbidden-fragment statistics in the panel', () => {
  it('hit counts read as Chinese lines, followed by the source line; zero hits list nothing and add no line', () => {
    const hit = buildCompositionPanel(input([searchRun('C9H10O', run('C9H10O', {PARA_BRIDGE_3: 2, CYCLIC_HYDROXY_ORTHOESTER: 1}))]))!;
    const lines = hit.constraints!.exclusions;
    expect(lines.some(l => /^禁含片段『對位短橋.*』排除了 2 個$/.test(l))).toBe(true);
    expect(lines.some(l => /^禁含片段『環狀 C\(OH\)\(OR\)\(OR\).*』排除了 1 個$/.test(l))).toBe(true);
    expect(lines[lines.length - 1]).toBe('禁含片段的出處：工程判斷，未查證');
    expect(lines.join('\n')).not.toMatch(/PARA_BRIDGE|CYCLIC_HYDROXY|FORBIDDEN/);
    const leaf = hit.constraints!.formulas[0].leaf.join('|');
    expect(leaf).toContain('禁含片段 3');
    const none = buildCompositionPanel(input([searchRun('C9H10O', run('C9H10O'))]))!;
    expect(none.constraints!.exclusions.join('\n')).not.toContain('禁含片段');
    expect(none.constraints!.formulas[0].leaf.join('|')).not.toContain('禁含片段');
  });
  it('the zero-candidate explanation lists them too, without internal codes', () => {
    const e = zeroCandidateExplanation({runs: [run('C9H10O', {PARA_BRIDGE_2: 4})], userFormula: null, rejectedCandidates: [{violatedConstraints: ['PLAUSIBILITY(FORBIDDEN_META_BRIDGE_3): x']}], reasonLabel: {} as never, coverageUnconfirmed: false})!;
    expect(e.blocked.some(b => b.includes('排除了 4 個'))).toBe(true);
    expect(e.blocked.some(b => b.includes('排除了 1 個'))).toBe(true);
    expect(e.blocked).toContain(FORBIDDEN_SOURCE_LINE);
    expect(e.blocked.join('\n')).not.toMatch(/FORBIDDEN|BRIDGE|PLAUSIBILITY/);
  });
  it('exclusionStats keeps old statistics unchanged: with no forbidden hit the lines equal the v1.2.0 lines', () => {
    const s = exclusionStats([run('C9H10O')], [{violatedConstraints: ['PLAUSIBILITY(GEM_DIOL): y']}]);
    expect(s.forbidden).toEqual([]);
    expect(exclusionLines(s)).toEqual(['化學合理性規則『偶二醇』排除了 1 個']);
  });
});

describe('missing-carbonyl-band status in the panel', () => {
  it('enabled / disabled with the reason in Chinese (peak table, untrusted calibration, no curve, unknown intensity)', () => {
    const on = carbonylBandView({state: 'ENABLED'});
    expect(on.enabled).toBe(true);
    expect(on.text).toContain('已啟用');
    // 2C-0: the panel does not claim a per-candidate judgement; it says when the check is on and where to look
    expect(on.text).toBe('影像 IR 缺羰基帶檢查：影像 IR 涵蓋並且校正可信（範圍 1630–1870 cm⁻¹）時，缺帶檢查才會啟用，目前已啟用。是否對某個候選扣分，看該候選的證據欄（扣分不剔除；權重是未校準的工程判斷）。');
    expect(on.text).toContain('看該候選的證據欄');
    expect(on.text).not.toContain('候選含上列羰基類別');
    expect(on.windowsText).toContain('酯 1710–1750');
    for (const reason of ['NOT_IMAGE_IR', 'CALIBRATION_UNTRUSTED', 'RANGE_NOT_COVERED', 'INTENSITY_UNKNOWN'] as const) {
      const v = carbonylBandView({state: 'DISABLED', reason});
      expect(v.enabled).toBe(false);
      expect(v.text).toContain('未啟用（原因：');
      expect(v.text).toContain(CARBONYL_STATUS_TEXT[reason]);
      expect(v.text + v.windowsText).not.toMatch(/NOT_IMAGE_IR|CALIBRATION_UNTRUSTED|RANGE_NOT_COVERED|INTENSITY_UNKNOWN/);
    }
    expect(carbonylBandView({state: 'DISABLED', reason: 'NOT_IMAGE_IR'}).text).toContain('峰表');
  });
  it('the block is in the model only when the caller supplies a status', () => {
    const base = input([searchRun('C9H10O', run('C9H10O'))]);
    expect(buildCompositionPanel(base)!.carbonylBand).toBeUndefined();
    expect(buildCompositionPanel({...base, carbonylBand: {state: 'ENABLED'}})!.carbonylBand!.enabled).toBe(true);
  });
  it('carbonylBandStatusOfIr: null without IR, with the flag off or with the sub-switch off; the real reasons for an image and a peak table', () => {
    const real = (cm: number) => { const p = refPoint(cm); return {pixelX: p.pixelX, realX: p.physicalX}; };
    const bands: [number, number, number][] = [[3050, 15, 15], [1270, 18, 85], [1100, 14, 65]];
    const image = WorkbenchOrchestrator.applyPiecewiseCalibration(syntheticSegmentedIRImage(bands.map(b => b[0]), bands), {points: [3500, 3000, 2000, 1500, 500].map(real), presetId: null});
    const twoPoint = WorkbenchOrchestrator.applyPiecewiseCalibration(syntheticSegmentedIRImage(bands.map(b => b[0]), bands), {points: [3000, 500].map(real), presetId: null});
    const peakTable = fixtureSpectra(loadFixture('E1')).IR;
    expect(carbonylBandStatusOfIr(undefined)).toBeNull();
    expect(carbonylBandStatusOfIr(image)).toEqual({state: 'ENABLED'});
    expect(carbonylBandStatusOfIr(twoPoint)).toEqual({state: 'DISABLED', reason: 'CALIBRATION_UNTRUSTED'});
    expect(carbonylBandStatusOfIr(peakTable)).toEqual({state: 'DISABLED', reason: 'NOT_IMAGE_IR'});
    planning.carbonylBand = false;
    expect(carbonylBandStatusOfIr(image)).toBeNull();
    planning.carbonylBand = true;
    V12_CONFIG.useV121Planning = false;
    expect(carbonylBandStatusOfIr(image)).toBeNull();
  });
});

describe('vinyl windows in the panel', () => {
  it('the signal table marks a class that exists only through the extended window', () => {
    const relaxed = buildCompositionPanel(input([searchRun('C7H10O', run('C7H10O', undefined, true))]))!;
    expect(relaxed.inventory!.formulas[0].signals[0].classes).toContain(VINYL_RELAXED_NOTE);
    expect(relaxed.inventory!.formulas[0].signals[1].classes).not.toContain(VINYL_RELAXED_NOTE);
    const plain = buildCompositionPanel(input([searchRun('C7H10O', run('C7H10O', undefined, false))]))!;
    expect(plain.inventory!.formulas[0].signals[0].classes).not.toContain('放寬');
    expect(VINYL_RELAXED_NOTE).toBe('（烯基視窗已依 IR 共軛 C=O 放寬）');
  });
  it('through the real pipeline (G3, no formula): the planning block carries the window sentence; the sub-switch and the flag remove it', async () => {
    const panel = async () => {
      const r = await executeSixStepAnalysis({spectra: fixtureSpectra(loadFixture('G3')), extraInput: {}}, SHAPE_BUDGET);
      const cs = r.reasoningTrace?.compositionSearch;
      return buildCompositionPanel({composition: r.compositionInference, runs: cs?.runs ?? [], mode: cs?.mode, enumeration: r.solvedConstraintSpace?.searchResult?.enumeration, localStructures: r.reasoningTrace?.localStructures ?? [], rejectedCandidates: r.rejectedCandidates})!;
    };
    expect((await panel()).planning!.vinylText).toBe(VINYL_WINDOW_TEXT);
    planning.vinylWindows = false;
    expect((await panel()).planning!.vinylText).toBeUndefined();
    planning.vinylWindows = true;
    V12_CONFIG.useV121Planning = false;
    const off = await panel();
    expect(off.planning).toBeUndefined();
    expect(off.carbonylBand).toBeUndefined();
  }, 120000);
});
