import {describe, expect, it} from 'vitest';
import {buildCompositionPanel, candidateSourceTag, observationLabel, REASON_LABEL, runBadges, summaryBadges, type PanelInput} from '../../src/engines/enumeration/compositionPanelModel';
import type {CompositionHypothesis, CompositionInferenceResult} from '../../src/engines/composition/types';
import type {CompositionSearchRun} from '../../src/engines/composition/structureGenerator';
import type {EnumerationRunDiagnostic, V12RunDiagnostic} from '../../src/engines/enumeration/types';

// Panel model of the 1H-constraint sections (docs/P1C_PANEL_DESIGN.md §2–§5). Synthetic objects only; the model is pure, so every wording is checked here.
const hyp = (formula: string, relativeConfidence = 1): CompositionHypothesis => ({
  id: `comp-${formula}`, formula, counts: {}, dbe: 4, monoisotopicMass: 100, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null,
  relativeConfidence, calibrated: false, score: 0, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: true, sizeConfirmed: false, symmetryMultiple: 2,
});
const composition = (hypotheses: CompositionHypothesis[]): CompositionInferenceResult => ({
  status: 'INFERRED', hypotheses, ionHypotheses: [], elementsConsidered: ['C', 'H', 'O'], elementsExcluded: [], elementClues: [],
  nitrogenEvidence: {mode: 'NONE', allowed: false, reasons: [], note: 'n'}, bounds: {carbon: [6, 12], hydrogenMultiples: null, heteroMinimums: {}, dbeMin: 4, hardBoundsRelaxed: false},
  enumeration: {enumeratedNodes: 0, passedHardFilters: 0, returned: hypotheses.length, truncatedByNodes: false, droppedByKeepLimit: 0}, limitations: [], elapsedMs: 1,
} as CompositionInferenceResult);
const v12 = (over: Partial<V12RunDiagnostic> = {}): V12RunDiagnostic => ({
  path: 'INVENTORY', badge: null, reason: null,
  inventory: {
    status: 'BUILT', reason: null, alternatives: 57, truncated: false, patternSets: 190, patternTruncated: false, incompleteReasons: [], ratioSum: 8,
    combinations: [{k: 2, extraExchangeable: 0, ratio: [2, 2, 1, 3]}],
    signals: [
      {observationId: 'a', shiftPpm: 7.3, relativeIntegral: 4, ratio: 2, multiplicity: 'd', broad: false, classes: ['ARO_CH', 'VINYL_CH'], singletRuleApplied: false, equivalenceRequired: true},
      {observationId: 'b', shiftPpm: 7.2, relativeIntegral: 4, ratio: 2, multiplicity: 'm', broad: false, classes: ['ARO_CH'], singletRuleApplied: false, equivalenceRequired: false},
      {observationId: 'c', shiftPpm: 7.12, relativeIntegral: 2, ratio: 1, multiplicity: 'm', broad: false, classes: ['ARO_CH'], singletRuleApplied: false, equivalenceRequired: false},
      {observationId: 'd', shiftPpm: 1.68, relativeIntegral: 6, ratio: 3, multiplicity: 's', broad: false, classes: ['ALKYL_CH'], singletRuleApplied: true, equivalenceRequired: true},
    ],
    voided: [{kind: 'ELEMENT_SHORTAGE', reason: '原子清單需要 11 個 C，分子式只有 10 個', count: 5}], aromaticLimited: [],
    alternativesPreview: [{
      id: 'inv-k2-e0-01', k: 2, extraExchangeable: 0, hasVinyl: false, zeroHAtoms: {C: 1},
      groups: [
        {observationId: 'a', shiftClasses: ['ARO_CH'], hTotal: 4, atomCount: 4, hPerAtom: 1, element: 'C', aromatic: true, alkene: false, exchangeable: false, equivalent: true, singletRule: false},
        {observationId: 'b', shiftClasses: ['ARO_CH'], hTotal: 4, atomCount: 4, hPerAtom: 1, element: 'C', aromatic: true, alkene: false, exchangeable: false, equivalent: false, singletRule: false},
        {observationId: 'c', shiftClasses: ['ARO_CH'], hTotal: 2, atomCount: 2, hPerAtom: 1, element: 'C', aromatic: true, alkene: false, exchangeable: false, equivalent: false, singletRule: false},
        {observationId: 'd', shiftClasses: ['ALKYL_CH'], hTotal: 6, atomCount: 2, hPerAtom: 3, element: 'C', aromatic: false, alkene: false, exchangeable: false, equivalent: true, singletRule: true},
      ],
      rings: [{templateId: 'benzene', ch: 5, patterns: 1}, {templateId: 'benzene', ch: 5, patterns: 1}],
    }],
  },
  constraints: {pinnedAtoms: 15, equivalentGroups: 1, aromaticPools: [4], singletGroups: 1, alkeneGroups: 0, strainProfile: 'SURGE_INSPIRED', symmetryPruning: true},
  required: [{id: 'PARA_BENZENE', smarts: '[cH]1[cH]c([!#1])[cH][cH]c1[!#1]', label: '對位二取代苯（兩組等積芳香雙峰，J 7–9 Hz）', evidenceObservationIds: ['1H_NMR:t:7.3', '1H_NMR:t:7.2']}, {id: 'STRONG_CARBONYL', smarts: '[CX3]=[OX1]', label: '強 C=O（IR 1650–1800 cm-1）', evidenceObservationIds: ['IR:t:1720']}],
  runs: [{k: 2, extraExchangeable: 0, alternatives: 57, sets: 190, complete: false, visited: 100, leaves: 5, candidates: 238, incompleteReasons: ['VINYL_READINGS_BUDGET']}],
  leafCost: {leaves: 10502, parseMs: 1, checksMs: 1, orbitChecks: 7935, orbitMs: 1, requiredMatches: 0},
  ...over,
});
const run = (over: Partial<EnumerationRunDiagnostic> = {}): EnumerationRunDiagnostic => ({
  used: true, fallbackReason: null, formula: 'C15H16', status: 'INCOMPLETE', complete: false, incompleteReasons: ['VINYL_READINGS_BUDGET'], readings: [], incompatibleReadings: 0, candidates: 238,
  visited: 100, leaves: 5, elapsedMs: 1, rejected: {sanitizeFailed: 0, duplicatesMerged: 0, notConnected: 0, forbiddenByRule: {}, strainByRule: {CUMULATED_CENTRE: 3}, approximate: false, v12: {aromaticFailed: 2, requiredFailed: 4, equivalenceFailed: 1, alkeneFailed: 0, requiredById: {PARA_BENZENE: 4}}},
  conversions: [], notes: [], v12: v12(), ...over,
});
const searchRun = (formula: string, e?: EnumerationRunDiagnostic): CompositionSearchRun =>
  ({hypothesisId: `comp-${formula}`, formula, maxStates: 1, timeMs: 1, visited: 1, elapsedMs: 1, termination: 'GRAMMAR_EXHAUSTED', candidates: 5, symmetry: null, diagnostic: null, ...(e ? {enumeration: e} : {})});
const input = (runs: CompositionSearchRun[], extra: Partial<PanelInput> = {}): PanelInput => ({composition: composition(runs.map(r => hyp(r.formula!))), runs, mode: 'COMPOSITION_HYPOTHESES', enumeration: undefined, localStructures: [], ...extra});

describe('v1.2 panel sections', () => {
  it('flag off / legacy runs: both sections are null and the rest of the model is unchanged', () => {
    const plain = buildCompositionPanel(input([searchRun('C15H16', run({v12: undefined}))]))!;
    expect(plain.inventory).toBeNull();
    expect(plain.constraints).toBeNull();
    expect(plain.rows).toHaveLength(1);
    expect(buildCompositionPanel(input([searchRun('C15H16')]))!.inventory).toBeNull();
  });
  it('section A: status, combinations with H counts, signal table (H = k × ratio, class names in Chinese), preview, voided', () => {
    const m = buildCompositionPanel(input([searchRun('C15H16', run())]))!;
    const f = m.inventory!.formulas[0];
    expect(f.formula).toBe('C15H16');
    expect(f.statusText).toBe('1H 原子清單：57 個替代解讀、190 個片段組合');
    expect(f.reasonText).toBeNull();
    expect(f.combinations[0]).toMatch(/^k=2，額外可交換 H=0｜整數比 2:2:1:3（H 數 4、4、2、6）｜57 個替代解讀、190 個片段組合｜未完整（含烯基（C=C–H）的讀法在預算內沒有跑完；不含烯基的讀法已完成）｜候選 238$/);
    expect(f.signals.map(s => s.hText)).toEqual(['4', '4', '2', '6']);
    expect(f.signals[0]).toMatchObject({shift: '7.3', integral: '4', ratio: '2', multiplicity: 'd', classes: '芳香 CH、烯基 CH', equivalence: '要求', singlet: '—', hPerAtom: '1（環上）', atoms: '4'});
    expect(f.signals[3]).toMatchObject({classes: '烷基 H', equivalence: '要求', singlet: '套用', hPerAtom: '3', atoms: '2'});
    expect(f.preview[0]).toMatch(/^讀法 1（k=2，額外可交換 H=0）：4H＝4×芳香 CH，等價；4H＝4×芳香 CH；2H＝2×芳香 CH；6H＝2×CH3，等價｜環：苯 5 個 CH（1 種取代型式）＋苯 5 個 CH（1 種取代型式）$/);
    expect(f.voided[0].text).toBe('原子清單需要 11 個 C，分子式只有 10 個（5 次）');
    expect(m.inventory!.notes.join('\n')).toMatch(/工程預設，未校準/);
    expect(m.inventory!.notes.join('\n')).toMatch(/3\.9 ppm 的 CH2 可以不接 O/);
  });
  it('section B: required substructures by name with readable evidence, structural constraints, leaf statistics, the fixed scoring sentence', () => {
    const m = buildCompositionPanel(input([searchRun('C15H16', run())], {rejectedCandidates: [{violatedConstraints: ['PLAUSIBILITY(HEMIACETAL_ACYCLIC): x']}]}))!;
    const c = m.constraints!;
    expect(c.formulas[0].stateText).toBe('1H 約束：開啟');
    expect(c.formulas[0].required[0]).toBe('對位二取代苯（兩組等積芳香雙峰，J 7–9 Hz）｜SMARTS [cH]1[cH]c([!#1])[cH][cH]c1[!#1]｜依據：1H 7.3 ppm、1H 7.2 ppm');
    expect(c.formulas[0].required[1]).toMatch(/依據：IR 1720 cm-1$/);
    expect(c.formulas[0].structural).toEqual(expect.arrayContaining(['釘住 H 的原子：15 個（分子式的全部重原子）', '需要拓樸等價的群：1 個；芳香 CH 需要等價的訊號大小：4']));
    expect(c.formulas[0].leaf.join('\n')).toMatch(/被葉端檢查排除的結構：芳香 2、必含子結構 4、等價 1、烯基 0/);
    expect(c.scoringText).toBe('雙向評分見各候選的證據清單');
    expect(c.exclusions).toEqual(expect.arrayContaining(['必含子結構『對位二取代苯（兩組等積芳香雙峰，J 7–9 Hz）』排除了 4 個', '芳香原子檢查排除了 2 個', '等價（對稱）檢查排除了 1 個', '應變規則『累積雙鍵中心（丙二烯型）』排除了 3 個', '化學合理性規則『非環狀半縮醛／半縮酮』排除了 1 個']));
    expect(JSON.stringify(c)).not.toMatch(/PARA_BENZENE|STRONG_CARBONYL|HEMIACETAL|CUMULATED|FALLBACK|ARO_CH/);
  });
  it('FLEX_NO_INTEGRALS and no required substructure: the empty-state sentences', () => {
    const m = buildCompositionPanel(input([searchRun('C4H8O2', run({formula: 'C4H8O2', v12: v12({path: 'FLEX_NO_INTEGRALS', inventory: {...v12().inventory!, status: 'NOT_AVAILABLE', reason: '1 個 1H 訊號沒有積分', alternatives: 0, signals: [], combinations: [], alternativesPreview: []}, constraints: null, required: [], runs: []})}))]))!;
    expect(m.inventory!.formulas[0].statusText).toBe('1H 沒有積分，無法建立原子清單；使用舊的彈性原子路徑');
    expect(m.inventory!.formulas[0].reasonText).toBe('原因：1 個 1H 訊號沒有積分');
    expect(m.constraints!.formulas[0].stateText).toBe('1H 沒有積分：使用舊的彈性原子路徑，只套用強證據子結構');
    expect(m.constraints!.formulas[0].requiredEmptyText).toBe('沒有強證據規則被觸發');
    expect(m.constraints!.formulas[0].structural).toEqual([]);
  });
  it('FALLBACK: badge in the summary and on the formula, the reason line, and the fixed reason texts', () => {
    const e = run({v12: v12({path: 'FALLBACK', badge: '1H 約束未能套用（已退回）', reason: '分子式 H=12 與積分的整數比總和 S=7 不相容', runs: []}), incompleteReasons: ['V12_CONSTRAINTS_FALLBACK']});
    const m = buildCompositionPanel(input([searchRun('C15H16', e)]))!;
    expect(runBadges(e).map(b => b.id)).toEqual(['INCOMPLETE', 'V12_FALLBACK']);
    expect(runBadges(e).find(b => b.id === 'V12_FALLBACK')!.text).toBe('1H 約束未能套用（已退回）');
    expect(m.badges.map(b => b.id)).toEqual(['INCOMPLETE', 'V12_FALLBACK']);
    expect(m.inventory!.formulas[0].badges.map(b => b.text)).toEqual(['1H 約束未能套用（已退回）']);
    expect(m.inventory!.formulas[0].statusText).toBe('1H 約束未能套用（已退回）：改用舊的彈性原子讀法');
    expect(m.inventory!.formulas[0].reasonText).toBe('原因：分子式 H=12 與積分的整數比總和 S=7 不相容');
    expect(m.constraints!.formulas[0].stateText).toBe('1H 約束未能套用（已退回）：使用舊的彈性原子路徑，仍套用強證據子結構');
    expect(summaryBadges([run({v12: undefined, complete: true})])).toEqual([]);
  });
  it('the four new reason texts, the vinyl reason text, and the candidate source tag of fallback candidates', () => {
    expect(REASON_LABEL.INVENTORY_ALTERNATIVES_TRUNCATED).toBe('1H 原子清單的替代解讀超過上限，只列舉最前面的（每個 k／額外 OH 組合至多 64 個，取代型式至多 128 組）');
    expect(REASON_LABEL.AROMATIC_TEMPLATE_LIMITED).toBe('芳香 CH 超出環模板庫（目前只有苯、萘，有 N 證據時才有吡啶；呋喃、噻吩、吡咯等五員雜環是已知限制）');
    expect(REASON_LABEL.VINYL_READINGS_BUDGET).toBe('含烯基（C=C–H）的讀法在預算內沒有跑完；不含烯基的讀法已完成');
    expect(REASON_LABEL.V12_CONSTRAINTS_FALLBACK).toBe('1H 約束未能套用（已退回）：改用舊的彈性原子讀法');
    expect(candidateSourceTag({source: 'ENUMERATOR', relaxed: false, v12Fallback: true})).toBe('窮舉器｜1H 約束未套用');
    expect(candidateSourceTag({source: 'LEGACY_SUPPLEMENT', relaxed: false, v12Fallback: true})).toBe('舊 beam 搜尋（補充）｜1H 約束未套用');
    expect(candidateSourceTag({source: 'ENUMERATOR', relaxed: true, v12Fallback: true})).toBe('窮舉器｜約束已放寬｜1H 約束未套用');
    expect(candidateSourceTag({source: 'ENUMERATOR', relaxed: false})).toBe('窮舉器');
  });
  it('observation labels: "1H 7.3 ppm", "IR 1720 cm-1"', () => {
    expect(observationLabel('1H_NMR:src:7.30')).toBe('1H 7.3 ppm');
    expect(observationLabel('13C_NMR:src:128.4')).toBe('13C 128.4 ppm');
    expect(observationLabel('IR:src:1720')).toBe('IR 1720 cm-1');
  });
});
