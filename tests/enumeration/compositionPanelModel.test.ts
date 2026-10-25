import {describe, expect, it} from 'vitest';
import {buildCompositionPanel, candidateSourceTag, runBadges, summaryBadges, type PanelInput} from '../../src/engines/enumeration/compositionPanelModel';
import {ENUMERATION_CONFIG as CFG} from '../../src/engines/enumeration/enumerationConfig';
import type {CompositionHypothesis, CompositionInferenceResult} from '../../src/engines/composition/types';
import type {CompositionSearchRun} from '../../src/engines/composition/structureGenerator';
import type {EnumerationDiagnostics, EnumerationRunDiagnostic} from '../../src/engines/enumeration/types';

// Synthetic objects only. The panel model is pure, so every wording is checked here without a browser.
const hyp = (formula: string, relativeConfidence: number, extra: Partial<CompositionHypothesis> = {}): CompositionHypothesis => ({
  id: `comp-${formula}`, formula, counts: {}, dbe: 4, monoisotopicMass: 100, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null,
  relativeConfidence, calibrated: false, score: 0, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: true,
  sizeConfirmed: false, symmetryMultiple: null, ...extra,
});
const composition = (hypotheses: CompositionHypothesis[], status: CompositionInferenceResult['status'] = 'INFERRED', extra: Partial<CompositionInferenceResult> = {}): CompositionInferenceResult => ({
  status, hypotheses, ionHypotheses: [], elementsConsidered: ['C', 'H', 'O'], elementsExcluded: [{element: 'N', reason: '沒有 N 專屬證據'}], elementClues: [],
  nitrogenEvidence: {mode: 'NONE', allowed: false, reasons: [], note: '也可能是 N，但無 N 專屬證據'},
  bounds: {carbon: [6, 12], hydrogenMultiples: null, heteroMinimums: {O: 1}, dbeMin: 4, hardBoundsRelaxed: false},
  enumeration: {enumeratedNodes: 0, passedHardFilters: 0, returned: hypotheses.length, truncatedByNodes: false, droppedByKeepLimit: 0}, limitations: ['本地規則限制 A'], elapsedMs: 1, ...extra,
});
const runDiag = (extra: Partial<EnumerationRunDiagnostic> = {}): EnumerationRunDiagnostic => ({
  used: true, fallbackReason: null, formula: 'X', status: 'COMPLETE', complete: true, incompleteReasons: [], readings: [], incompatibleReadings: 0, candidates: 5, visited: 10, leaves: 5,
  elapsedMs: 1, rejected: null, conversions: [], notes: [], ...extra,
});
const run = (hypothesisId: string, enumeration?: EnumerationRunDiagnostic, candidates = 5): CompositionSearchRun => ({
  hypothesisId, formula: hypothesisId.replace('comp-', ''), maxStates: 1, timeMs: 1, visited: 1, elapsedMs: 1, termination: 'GRAMMAR_EXHAUSTED', candidates, symmetry: null, diagnostic: null, ...(enumeration ? {enumeration} : {}),
});
const input = (extra: Partial<PanelInput>): PanelInput => ({composition: composition([hyp('C8H8O2', 0.5)]), runs: [], mode: 'COMPOSITION_HYPOTHESES', enumeration: undefined, localStructures: [], ...extra});
const allText = (m: ReturnType<typeof buildCompositionPanel>) => JSON.stringify(m!.rows.map(r => ({...r, confidenceBar: undefined, confidenceRank: undefined, confidenceTooltip: undefined})));

describe('relative confidence: rank and bar, never a percentage', () => {
  const m = buildCompositionPanel(input({composition: composition([hyp('C8H8O2', 0.5), hyp('C9H10O2', 0.625), hyp('C7H6O2', 0.125)])}))!;
  it('ranks by relative confidence; the bar is relative to the highest; no percent sign in any visible text', () => {
    expect(m.rows.map(r => [r.formula, r.confidenceRank])).toEqual([['C8H8O2', 2], ['C9H10O2', 1], ['C7H6O2', 3]]);
    expect(m.rows.map(r => Number(r.confidenceBar.toFixed(3)))).toEqual([0.8, 1, 0.2]);
    expect(allText(m)).not.toContain('%');
    expect(m.summary).not.toContain('%');
  });
  it('the value only appears in the tooltip, with the fixed wording', () => {
    expect(m.rows[1].confidenceTooltip).toBe('各假設間的相對比較，不是機率，也沒有以實測準確度校準：0.6250');
    expect(CFG.ui.confidenceTooltipPrefix).toBe('各假設間的相對比較，不是機率，也沒有以實測準確度校準：');
  });
});

describe('badges (amber): relaxed / legacy supplement / incomplete', () => {
  it('each appears exactly under its condition, with the fixed texts', () => {
    expect(runBadges(undefined)).toEqual([]);
    expect(runBadges(runDiag())).toEqual([]);
    expect(runBadges(runDiag({relaxedToFormulaOnly: {candidates: 2, complete: true}})).map(b => b.text)).toEqual(['約束已放寬（只依分子式）']);
    expect(runBadges(runDiag({legacySupplement: {candidates: 4, added: 3, visited: 10}})).map(b => b.text)).toEqual(['含舊搜尋補充']);
    expect(runBadges(runDiag({complete: false, status: 'INCOMPLETE', incompleteReasons: ['TIME_BUDGET']})).map(b => b.text)).toEqual(['未完整']);
    expect(runBadges(runDiag({used: false, complete: false, fallbackReason: '沒有分子式'})).map(b => b.text)).toEqual(['未完整']);
    expect(runBadges(runDiag({relaxedToFormulaOnly: {candidates: 1, complete: true}, legacySupplement: {candidates: 1, added: 1, visited: 1}, complete: false})).map(b => b.id)).toEqual(['RELAXED', 'LEGACY_SUPPLEMENT', 'INCOMPLETE']);
    expect(CFG.ui.badges).toEqual({RELAXED: '約束已放寬（只依分子式）', LEGACY_SUPPLEMENT: '含舊搜尋補充', INCOMPLETE: '未完整', V12_FALLBACK: '1H 約束未能套用（已退回）'});
  });
  it('the summary line collects the badges of all formulas, each kind once, in a fixed order', () => {
    const a = runDiag({complete: false, incompleteReasons: ['STATE_BUDGET']});
    const b = runDiag({complete: false, incompleteReasons: ['TIME_BUDGET'], legacySupplement: {candidates: 1, added: 1, visited: 1}});
    const c = runDiag({relaxedToFormulaOnly: {candidates: 2, complete: true}});
    expect(summaryBadges([a, b, c, undefined]).map(x => x.id)).toEqual(['RELAXED', 'LEGACY_SUPPLEMENT', 'INCOMPLETE']);
    expect(summaryBadges([a, a]).map(x => x.id)).toEqual(['INCOMPLETE']);
    expect(summaryBadges([runDiag(), undefined])).toEqual([]);
    const m = buildCompositionPanel(input({composition: composition([hyp('C8H8O2', 0.5), hyp('C9H10O2', 0.3)]), runs: [run('comp-C8H8O2', a), run('comp-C9H10O2', b)]}))!;
    expect(m.badges.map(x => x.id)).toEqual(['LEGACY_SUPPLEMENT', 'INCOMPLETE']);
    expect(m.rows[0].search.badges.map(x => x.id)).toEqual(['INCOMPLETE']);
    expect(m.rows[1].search.badges.map(x => x.id)).toEqual(['LEGACY_SUPPLEMENT', 'INCOMPLETE']);
  });
});

describe('search cell, readings and local structures that are in no reading', () => {
  const locals = [{id: 'local-0', kind: 'HYDROXYL'}, {id: 'local-1', kind: 'AROMATIC'}];
  it('lists the excluded local structures below the readings in the fixed format', () => {
    const e = runDiag({
      readings: [{id: 'reading-1', localIds: ['local-1', 'local-1#2'], complete: true, error: null, newCandidates: 5}, {id: 'reading-2', localIds: ['local-0'], complete: null, error: 'FORMULA_ELEMENT_SHORTAGE：片段含 O', newCandidates: 0}],
      excludedLocals: [{localId: 'local-0', kind: 'HYDROXYL', reason: '需要 2 個 O，分子式只有 0 個'}],
    });
    const m = buildCompositionPanel(input({runs: [run('comp-C8H8O2', e)], localStructures: locals}))!;
    const cell = m.rows[0].search;
    expect(cell.excluded).toEqual(['未納入任何讀法：local-0／HYDROXYL（原因：需要 2 個 O，分子式只有 0 個）']);
    expect(cell.readings[0].text).toBe('讀法 1：local-1／AROMATIC＋local-1#2／AROMATIC｜完整｜候選 5');
    expect(cell.readings[1].text).toContain('與分子式不相容');
    expect(cell.text).toBe('5 個候選｜完整（COMPLETE）');
    expect(cell.note).toBe('只相對於目前分子式與片段約束，不代表所有可能結構');
  });
  it('texts for incomplete, supplement, relaxed, legacy fallback, not searched and legacy-only runs', () => {
    const t = (e: EnumerationRunDiagnostic | undefined, h = hyp('C8H8O2', 0.5), r = true) => buildCompositionPanel(input({composition: composition([h]), runs: r ? [run(h.id, e, 7)] : []}))!.rows[0].search.text;
    expect(t(runDiag({complete: false, incompleteReasons: ['TIME_BUDGET', 'CANDIDATE_LIMIT'], candidates: 9}))).toBe('9 個候選｜未完整（INCOMPLETE：時間預算、候選上限）');
    expect(t(runDiag({complete: false, incompleteReasons: ['READINGS_TRUNCATED'], candidates: 3}))).toContain('讀法過多被截斷');
    expect(t(runDiag({legacySupplement: {candidates: 5, added: 3, visited: 9}, complete: false, incompleteReasons: ['STATE_BUDGET'], candidates: 12}))).toContain('＋舊 beam 搜尋補充 3 個');
    expect(t(runDiag({relaxedToFormulaOnly: {candidates: 2, complete: true}, candidates: 2}))).toContain('片段讀法與分子式矛盾，已放寬為只依分子式');
    expect(t(runDiag({used: false, complete: false, fallbackReason: '沒有分子式，維持舊搜尋', candidates: 0}))).toBe('7 個候選｜舊 beam 搜尋（原因：沒有分子式，維持舊搜尋）');
    expect(t(undefined)).toBe('7 個候選｜舊 beam 搜尋');
    expect(t(undefined, hyp('C8H8P', 0.1, {generatorSupported: false, unsupportedElements: ['P'], searched: false}), false)).toBe('未搜尋（含生成器不支援的元素：P）');
    expect(t(undefined, hyp('C8H8O2', 0.1, {searched: false}), false)).toContain('未搜尋');
  });
});

describe('status, k, mass basis, overview and limitation texts', () => {
  it('status labels, k dash, mass basis labels and sizes', () => {
    const m = buildCompositionPanel(input({composition: composition([hyp('C8H8O2', 0.5, {symmetryMultiple: 2, massBasis: 'HRMS', massErrorDa: 0.0012, massErrorPpm: 8.1, sizeConfirmed: true}), hyp('C9H10O2', 0.4, {massBasis: 'LOW_RES_MS'}), hyp('C7H6O2', 0.1, {massBasis: 'USER_FORMULA'})], 'USER_FORMULA')}))!;
    expect(m.statusLabel).toBe('使用者分子式（硬限制）');
    expect(m.rows.map(r => r.k)).toEqual(['2', '—', '—']);
    expect(m.rows.map(r => r.massBasis)).toEqual(['高解析 MS', '低解析 MS', '使用者分子式']);
    expect(m.rows[0].massDetail).toBe('誤差 0.0012 Da（8.1 ppm）');
    expect(m.rows.map(r => r.size)).toEqual(['質量已確認', '大小未確認', '大小未確認']);
    for (const [status, label] of [['INFERRED', '由光譜推斷（假設，非確認）'], ['INSUFFICIENT_DATA', '資料不足，不猜測分子式'], ['INVALID_USER_FORMULA', '使用者分子式無效']] as const) {
      expect(buildCompositionPanel(input({composition: composition([], status)}))!.statusLabel).toBe(label);
    }
    expect(buildCompositionPanel(input({composition: composition([], 'INSUFFICIENT_DATA')}))!.emptyMessage).toBe('資料不足，沒有可列舉的分子式假設');
    expect(buildCompositionPanel(input({composition: undefined}))).toBeNull();
  });
  const en = (deferred: number, prefilter: EnumerationDiagnostics['deferred']['prefilter'] = null): EnumerationDiagnostics => ({used: true, complete: false, runs: [], enumerated: 500, scored: 300, deferred: {count: deferred, samples: [], prefilter}, maxScoredCandidates: 300});
  it('the overview line is followed by the sentence that unscored candidates were not excluded', () => {
    const m = buildCompositionPanel(input({enumeration: en(200, {h1Required: 4, c13Required: null, passing: 120, failing: 80})}))!;
    expect(m.overview!.text).toBe('共列舉 500 個候選，其中 300 個進入完整評分；200 個超過評分上限（300）而保留但未評分。');
    expect(m.overview!.deferredNote).toBe('未評分的候選沒有被排除，只是沒有進入完整評分。');
    expect(m.overview!.prefilterText).toContain('篩選啟發式，不是評分');
    expect(m.overview!.prefilterText).toContain('通過 120 個、未通過 80 個');
    expect(buildCompositionPanel(input({enumeration: undefined}))!.overview).toBeNull();
  });
  it('enumeration label in the summary line', () => {
    const lab = (e: EnumerationDiagnostics | undefined, mode: PanelInput['mode'] = 'COMPOSITION_HYPOTHESES') => buildCompositionPanel(input({enumeration: e, mode}))!.enumerationLabel;
    expect(lab({...en(0), complete: true})).toBe('完整（COMPLETE）');
    expect(lab(en(0))).toBe('未完整（INCOMPLETE）');
    expect(lab({...en(0), used: false})).toBe('未使用（舊搜尋）');
    expect(lab(undefined, 'NO_FORMULA')).toBe('無分子式');
    expect(lab(undefined)).toBe('未使用（舊搜尋）');
  });
  it('limitations always include the fixed sentences and then the composition limitations', () => {
    const m = buildCompositionPanel(input({}))!;
    expect(m.limitations.slice(0, 4).join('')).toContain('相對信心沒有校準');
    expect(m.limitations.slice(0, 4).join('')).toContain('不代表列出所有可能結構');
    expect(m.limitations[4]).toBe('本地規則限制 A');
  });
});

describe('candidate source tags', () => {
  it('enumerator, legacy supplement and relaxed constraints', () => {
    expect(candidateSourceTag({source: 'ENUMERATOR', relaxed: false})).toBe('窮舉器');
    expect(candidateSourceTag({source: 'LEGACY_SUPPLEMENT', relaxed: false})).toBe('舊 beam 搜尋（補充）');
    expect(candidateSourceTag({source: 'ENUMERATOR', relaxed: true})).toBe('窮舉器｜約束已放寬');
    expect(candidateSourceTag({source: 'LEGACY', relaxed: false})).toBe('舊 beam 搜尋（退回）');
    expect(candidateSourceTag(undefined)).toBeNull();
  });
});
