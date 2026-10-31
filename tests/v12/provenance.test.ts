import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import {candidateSourceTag, buildCompositionPanel, zeroCandidateModel, REASON_LABEL} from '../../src/engines/enumeration/compositionPanelModel';
import {exclusionLines, exclusionStats, zeroCandidateExplanation} from '../../src/engines/enumeration/exclusionStats';
import {v12AssemblyLines} from '../../src/engines/reasoning/assemblyText';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import type {StructureGenerator} from '../../src/engines/composition/structureGenerator';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import type {EnumerationRunDiagnostic} from '../../src/engines/enumeration/types';
import {mk} from '../helpers/p1bScenarios';

// Provenance of v1.2 candidates (assembly), the legacy-supplement guarantee (both paths empty), the readable zero-candidate explanation, and the card
// source tag. SYNTHETIC inputs; program behaviour only.
beforeAll(() => initializeRDKit(), 60000);
afterEach(() => { V12_CONFIG.useV12Constraints = true; V12_CONFIG.useV121Planning = true; });

let counter = 0;
const h1 = (value: number, integral: number | null, mult: string | null, j: number[] = [], broad = false): ObservedEvidence => ({
  id: `1H_NMR:t:${value}`, signalId: `s${counter++}`, sourceId: 't', modality: '1H_NMR', value, unit: 'ppm', relativeIntensity: null, relativeIntegral: integral, multiplicity: mult, jHz: j,
  shape: broad ? 'BROAD' : 'NARROW', uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {solvent: 'CDCl3'}, coverage: 'CONFIRMED_COMPLETE', unknown: [],
});
const ir = (value: number, relativeIntensity: number): ObservedEvidence => ({
  id: `IR:t:${value}`, signalId: `i${counter++}`, sourceId: 't', modality: 'IR', value, unit: 'cm-1', relativeIntensity, relativeIntegral: null, multiplicity: null, jHz: [], shape: 'UNKNOWN',
  uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {}, coverage: 'PARTIAL', unknown: [],
});
const stubWith = (smiles: string[]) => { const calls = vi.fn(); const gen: StructureGenerator = {generateStructures: async () => { calls(); return {smiles, status: 'BOUNDED', visited: 5, note: 'stub', termination: 'GRAMMAR_EXHAUSTED', complete: false, partialHypotheses: [], rejectedByComposition: 0}; }}; return {gen, calls}; };
const request = (formula: string, observations: ObservedEvidence[], enumerationBudget = {timeMs: 20000, maxStates: 5e7, maxCandidates: 5000}) => ({
  formula, hints: {}, budget: {timeMs: 5000, maxStates: 1e6, maxResults: 48, maxFrontier: 1, beamWidth: 1}, enumerationBudget,
  constraintEvidence: {observations, irCoversAldehydeRegion: false, nitrogenAllowed: false},
});
const ethylEster = () => [h1(8.04, 2, 'm'), h1(7.55, 1, 'm'), h1(7.43, 2, 'm'), h1(4.37, 2, 'q', [7.1]), h1(1.39, 3, 't', [7.1]), ir(1720, 100), ir(2980, 30)];

describe('assembly provenance of v1.2 candidates', () => {
  it('inventory candidates carry the inventory reading, k, extra OH, the signals, the required substructures and the leaf checks', async () => {
    const {gen} = stubWith([]);
    const out = await createExhaustiveGenerator(gen).generateStructures(request('C9H10O2', ethylEster()));
    const ds = Object.values(out.derivations!);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      const v = d.v12!;
      expect(v.path).toBe('INVENTORY');
      expect(v.inventoryAlternativeIds!.length).toBeGreaterThan(0);
      expect(v.k).toBe(1);
      expect(v.extraExchangeable).toBe(0);
      expect(v.signals!.length).toBe(5);
      expect(v.required.map(r => r.id).sort()).toEqual(['ETHYL', 'STRONG_CARBONYL']);
      expect(v.leafChecks).toEqual(expect.arrayContaining(['AROMATIC', 'REQUIRED', 'STRAIN']));
    }
  }, 60000);
  it('the card lines are readable Traditional Chinese: shifts, H counts, k, substructure names; no internal codes', async () => {
    const {gen} = stubWith([]);
    const out = await createExhaustiveGenerator(gen).generateStructures(request('C9H10O2', ethylEster()));
    const lines = v12AssemblyLines(Object.values(out.derivations!)[0].v12!);
    const text = lines.join('\n');
    expect(text).toMatch(/1H 原子清單讀法：k=1，額外可交換 H=0/);
    expect(text).toMatch(/δ 4\.37 ppm（2H）＝1 個CH2/);
    expect(text).toMatch(/δ 1\.39 ppm（3H）＝1 個CH3/);
    expect(text).toMatch(/芳香 CH/);
    expect(text).toMatch(/用到的必含子結構：/);
    expect(text).toMatch(/乙基/);
    expect(text).toMatch(/強 C=O/);
    expect(text).toMatch(/葉端檢查：.*芳香原子.*必含子結構/s);
    expect(text).not.toMatch(/ARO_CH|ALKYL_CH|O_CH|STRONG_CARBONYL|INVENTORY|inv-k|\bg\d\b|ring\d|atoms:/);
  }, 60000);
  it('FLEX_NO_INTEGRALS and FALLBACK candidates say which path they came from (fallback with its reason)', () => {
    expect(v12AssemblyLines({path: 'FLEX_NO_INTEGRALS', required: [{id: 'X', label: '強 C=O'}], leafChecks: ['REQUIRED']}).join('\n')).toMatch(/1H 沒有積分.*\n用到的必含子結構：強 C=O/);
    const fb = v12AssemblyLines({path: 'FALLBACK', required: [], leafChecks: [], fallbackReason: '分子式 H=12 與積分不相容'}).join('\n');
    expect(fb).toMatch(/1H 約束未能套用（已退回）.*原因：分子式 H=12 與積分不相容/);
    expect(fb).toMatch(/沒有強證據子結構被觸發/);
  });
  it('full flow: every ranked candidate of a v1.2 analysis has a non-empty assembly provenance in the reasoning trace', async () => {
    const spectra = {'1H_NMR': mk('1H_NMR', [{x: 6.84, integration: 4, multiplicity: 's'}, {x: 3.77, integration: 6, multiplicity: 's'}] as never, {nmrSolvent: 'CDCl3'})};
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C8H10O2'}}, {});
    expect(r.reasoningTrace!.candidates.length).toBeGreaterThan(0);
    for (const c of r.reasoningTrace!.candidates) {
      expect(c.assembly?.v12?.path).toBe('INVENTORY');
      expect(c.assembly!.v12!.signals!.length).toBe(2);
      expect(c.assembly!.v12!.k).toBe(2);
    }
  }, 120000);
  it('the 1H-constraint candidates have readable two-way evidence lines in the trace and none of them carries an internal id', async () => {
    const spectra = {'1H_NMR': mk('1H_NMR', [{x: 6.84, integration: 4, multiplicity: 's'}, {x: 3.77, integration: 6, multiplicity: 's'}] as never, {nmrSolvent: 'CDCl3'})};
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C8H10O2'}}, {});
    const allReasons = r.rankedCandidates.flatMap(c => [...c.contradictingReasons, ...c.supportingReasons]);
    expect(allReasons.some(t => /^預測 \d+ 種氫環境，實測 \d+ 組訊號/.test(t))).toBe(true);
    for (const t of allReasons) expect(t).not.toMatch(/1H:(unmatched|environment|integral)|unmatched-predicted/);
    for (const c of r.reasoningTrace!.candidates) for (const e of c.evidence) expect(e.observationIds.join()).not.toMatch(/1H:(unmatched|environment|integral)/);
  }, 120000);
});

describe('legacy-search guarantee: only when both the inventory path and the fallback produce nothing', () => {
  // (couplings of 2 Hz: the para-benzene rule does not fire, so the nitrile is the only required substructure)
  const nitrile = () => [h1(2.3, 3, 's'), h1(7.1, 2, 'd', [2]), h1(7.0, 2, 'd', [2]), ir(2230, 100), ir(2950, 40)];
  // a budget too small for either path to finish; the required nitrile cannot hold in a formula without N, so no structure passes the leaf filter
  const tiny = {timeMs: 20000, maxStates: 60, maxCandidates: 100};
  it('(i) both paths empty → one legacy supplement; its candidates must pass the strong-evidence substructure; tags and flags are set; never COMPLETE', async () => {
    const {gen, calls} = stubWith(['CC#N', 'CCO', 'CCC#N']);
    const out = await createExhaustiveGenerator(gen).generateStructures(request('C7H8O', nitrile(), tiny));
    expect(calls).toHaveBeenCalledTimes(1);
    const run = out.enumeration!.runs[0];
    expect(run.v12?.path).toBe('FALLBACK');
    expect(run.legacySupplement).toMatchObject({candidates: 3, added: 2});
    expect(out.smiles.sort()).toEqual(['CC#N', 'CCC#N']);          // 'CCO' lacks the nitrile and is dropped
    expect(run.notes.join()).toMatch(/不含強證據要求的子結構/);
    expect(run.complete).toBe(false);
    expect(out.complete).toBe(false);
    expect(run.incompleteReasons).toContain('V12_CONSTRAINTS_FALLBACK');
    for (const s of out.smiles) {
      const o = out.enumeration!.origins![s];
      expect(o).toMatchObject({source: 'LEGACY_SUPPLEMENT', v12Fallback: true});
      expect(candidateSourceTag(o)).toBe('舊 beam 搜尋（補充）｜1H 約束未套用');
      expect(out.derivations![s].v12?.path).toBe('FALLBACK');
    }
  }, 60000);
  it('(ii) the inventory path has candidates → the legacy search is not called and nothing unconstrained is added', async () => {
    const {gen, calls} = stubWith(['CCO']);
    const out = await createExhaustiveGenerator(gen).generateStructures(request('C9H10O2', ethylEster()));
    expect(calls).not.toHaveBeenCalled();
    expect(out.smiles).not.toContain('CCO');
    expect(out.enumeration!.runs[0].legacySupplement).toBeUndefined();
    expect(out.enumeration!.runs[0].v12?.path).toBe('INVENTORY');
    expect(out.enumeration!.runs[0].complete).toBe(true);
  }, 60000);
  it('(iii) the fallback path has candidates → no unconstrained legacy candidate is added either', async () => {
    const {gen, calls} = stubWith(['CCO']);
    // H and the integrals cannot match (inventory unusable); the flexible-atom path finds structures for this small formula
    const out = await createExhaustiveGenerator(gen).generateStructures(request('C7H12', [h1(2.3, 3, 's'), h1(7.1, 2, 'd', [2]), h1(7.0, 2, 'd', [2])]));
    expect(out.enumeration!.runs[0].v12?.path).toBe('FALLBACK');
    expect(out.smiles.length).toBeGreaterThan(0);
    expect(calls).not.toHaveBeenCalled();
    expect(out.smiles).not.toContain('CCO');
    for (const s of out.smiles) expect(candidateSourceTag(out.enumeration!.origins![s])).toBe('窮舉器｜1H 約束未套用');
  }, 60000);
  it('the whole-request legacy fallback (formula too large for the flexible-atom path) is filtered by the strong evidence as well', async () => {
    const {gen} = stubWith(['CC#N', 'CCO']);
    const out = await createExhaustiveGenerator(gen).generateStructures(request('C14H24O2', nitrile()));
    expect(out.smiles).toEqual(['CC#N']);
    expect(out.enumeration!.runs[0].used).toBe(false);
    expect(out.enumeration!.runs[0].v12?.path).toBe('FALLBACK');
  }, 60000);
});

describe('zero-candidate explanation', () => {
  const runDiag = (extra: Partial<EnumerationRunDiagnostic> = {}): EnumerationRunDiagnostic => ({
    used: true, fallbackReason: null, formula: 'C10H14O2', status: 'INCOMPLETE', complete: false, incompleteReasons: ['STATE_BUDGET', 'VINYL_READINGS_BUDGET'], readings: [], incompatibleReadings: 0, candidates: 0,
    visited: 100, leaves: 3, elapsedMs: 5, rejected: {sanitizeFailed: 0, duplicatesMerged: 0, notConnected: 0, forbiddenByRule: {}, strainByRule: {CUMULATED_CENTRE: 4}, approximate: false, v12: {aromaticFailed: 2, requiredFailed: 5, equivalenceFailed: 1, alkeneFailed: 3, requiredById: {PARA_BENZENE: 5}}},
    conversions: [], notes: [],
    v12: {path: 'FALLBACK', badge: '1H 約束未能套用（已退回）', reason: 'x', inventory: null, constraints: null, required: [{id: 'PARA_BENZENE', smarts: 'c', label: '對位二取代苯（兩組等積芳香雙峰，J 7–9 Hz）', evidenceObservationIds: []}], runs: [], leafCost: null},
    ...extra,
  });
  const input = (over: object = {}) => ({runs: [runDiag()], userFormula: null as string | null, rejectedCandidates: [{violatedConstraints: ['PLAUSIBILITY(HEMIACETAL_ACYCLIC): x']}, {violatedConstraints: ['PLAUSIBILITY(GEM_DIOL): y', 'PLAUSIBILITY(HEMIACETAL_ACYCLIC): x']}], reasonLabel: REASON_LABEL, coverageUnconfirmed: true, ...over});
  it('headline, per-check exclusion counts (required substructure by name), unfinished parts in Chinese, suggestions', () => {
    const z = zeroCandidateExplanation(input())!;
    expect(z.headline).toBe('在預算內找不到符合 1H 約束與強證據的結構');
    expect(z.blocked).toEqual(expect.arrayContaining([
      '必含子結構『對位二取代苯（兩組等積芳香雙峰，J 7–9 Hz）』排除了 5 個', '芳香原子檢查排除了 2 個', '等價（對稱）檢查排除了 1 個', '烯基（非芳香 C=C）檢查排除了 3 個',
      '應變規則『累積雙鍵中心（丙二烯型）』排除了 4 個', '化學合理性規則『非環狀半縮醛／半縮酮』排除了 2 個', '化學合理性規則『偶二醇』排除了 1 個',
    ]));
    expect(z.unfinished).toEqual(['C10H14O2：步數預算、含烯基（C=C–H）的讀法在預算內沒有跑完；不含烯基的讀法已完成']);
    expect(z.suggestions).toEqual(expect.arrayContaining(['填入分子式可縮小搜尋範圍']));
    expect(z.suggestions.join()).toMatch(/1H 涵蓋尚未確認完整/);
    const text = JSON.stringify(z);
    expect(text).not.toMatch(/STATE_BUDGET|VINYL_READINGS_BUDGET|PARA_BENZENE|HEMIACETAL|CUMULATED_CENTRE|FALLBACK/);
  });
  it('with a user formula the "enter a formula" suggestion is absent; without any exclusion the empty-blocked sentence is shown; integrals missing add their hint', () => {
    const z = zeroCandidateExplanation(input({userFormula: 'C10H14O2', coverageUnconfirmed: false, rejectedCandidates: [], runs: [runDiag({rejected: null, v12: {...runDiag().v12!, path: 'FLEX_NO_INTEGRALS'}})]}))!;
    expect(z.suggestions.join()).not.toMatch(/填入分子式/);
    expect(z.blockedEmpty).toMatch(/沒有任何結構被葉端檢查排除/);
    expect(z.suggestions.join()).toMatch(/缺少積分/);
  });
  it('null without a v1.2 run (flag off or legacy runs) and no statistics for it', () => {
    expect(zeroCandidateExplanation(input({runs: [runDiag({v12: undefined})]}))).toBeNull();
    expect(exclusionLines(exclusionStats([runDiag({v12: undefined})]))).toEqual([]);
  });
  const tinySpectra = () => {
    return {
      '1H_NMR': mk('1H_NMR', [{x: 7.25, integration: 2, multiplicity: 'd', jValues: [8.6]}, {x: 6.78, integration: 2, multiplicity: 'd', jValues: [8.6]}, {x: 4.75, integration: 1, multiplicity: 'br s', isBroad: true, shape: 'broad'}, {x: 1.29, integration: 9, multiplicity: 's'}] as never),
      IR: mk('IR', [{x: 3300, y: 70, isBroad: true, shape: 'broad'}, {x: 3050, y: 20}, {x: 2960, y: 60}, {x: 2870, y: 40}, {x: 1600, y: 40}, {x: 1510, y: 60}, {x: 1385, y: 30}, {x: 1365, y: 35}, {x: 1240, y: 80}, {x: 830, y: 50}] as never),
    };
  };
  it('real tiny-budget analysis: no candidate survives, and the explanation names the required substructure that removed structures', async () => {
    // v1.2.1: this is the v1.2.0 search (eight formulas share 16000 steps). The planned search (k round-robin, feasible formulas only) reaches candidates with the same
    // budget, so the planned variant of this test follows below with a smaller budget.
    V12_CONFIG.useV121Planning = false;
    const spectra = tinySpectra();
    const r = await executeSixStepAnalysis({spectra, extraInput: {}}, {timeMs: 8000, maxStates: 16000});
    expect(r.rankedCandidates.length).toBe(0);
    const z = zeroCandidateModel(r)!;
    expect(z.headline).toBe('在預算內找不到符合 1H 約束與強證據的結構');
    expect(z.blocked.some(x => /^必含子結構『對位二取代苯.*』排除了 \d+ 個$/.test(x))).toBe(true);
    expect(z.unfinished.length).toBeGreaterThan(0);
    expect(z.unfinished.join()).toMatch(/步數預算/);
    expect(z.suggestions).toContain('填入分子式可縮小搜尋範圍');
    const panel = buildCompositionPanel({composition: r.compositionInference, runs: r.reasoningTrace?.compositionSearch?.runs ?? [], mode: r.reasoningTrace?.compositionSearch?.mode, enumeration: r.solvedConstraintSpace.searchResult?.enumeration, localStructures: r.reasoningTrace?.localStructures ?? [], rejectedCandidates: r.rejectedCandidates})!;
    expect(panel.constraints!.exclusions.join('\n')).toMatch(/必含子結構『對位二取代苯/);
  }, 120000);
  it('v1.2.1 planned search with a 20-step budget: still no candidate, and the explanation names the budget (no fallback hides the empty result)', async () => {
    const r = await executeSixStepAnalysis({spectra: tinySpectra(), extraInput: {}}, {timeMs: 8000, maxStates: 20});
    expect(r.rankedCandidates.length).toBe(0);
    const z = zeroCandidateModel(r)!;
    expect(z.headline).toBe('在預算內找不到符合 1H 約束與強證據的結構');
    expect(z.unfinished.length).toBeGreaterThan(0);
    expect(z.unfinished.join()).toMatch(/步數預算/);
    expect(z.suggestions).toContain('填入分子式可縮小搜尋範圍');
    expect(r.reasoningTrace?.compositionSearch?.runs.every(x => x.enumeration?.used && x.enumeration.fallbackReason === null)).toBe(true);
  }, 120000);
  it('flag off: no explanation object (the old text stays)', async () => {
    V12_CONFIG.useV12Constraints = false;
    const r = await executeSixStepAnalysis({spectra: {'1H_NMR': mk('1H_NMR', [{x: 7.25, integration: 2, multiplicity: 'd'}] as never, {nmrSolvent: 'CDCl3'})}, extraInput: {molecularFormula: 'C2H6'}}, {timeMs: 3000, maxStates: 3000});
    expect(zeroCandidateModel({...r, rankedCandidates: []})).toBeNull();
  }, 60000);
});
