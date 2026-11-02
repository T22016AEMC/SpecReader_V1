import {beforeAll, describe, expect, it} from 'vitest';
import {buildCompositionPanel, type PanelModel} from '../../src/engines/enumeration/compositionPanelModel';
import {buildDataCheck} from '../../src/ui/dataCheck';
import {
  MAX_SUMMARY_LINES, SUMMARY_SECTION_TITLES, SUMMARY_UNSEARCHED_ROWS, buildDiagnosticSummary, buildFullFormulaTable, nitrogenEvidenceLine, notSearchedCounts, oxygenFloorLine,
  type CompositionSourcesLike, type DiagnosticInput,
} from '../../src/ui/diagnosticSummary';
import type {ObservationLike} from '../../src/ui/obsLabel';
import {s1Analysis} from './s1Analysis';
import {fixtureSpectra, loadFixture} from '../helpers/v121Golden';
import {filterIrEvidence} from '../../src/ui/irEvidenceFilter';
import type {FunctionalGroupRow, IrFindingRow} from '../../src/ui/irEvidenceFilter';

// Diagnostic summary and full formula table (v1.2.2 DESIGN_REPORT B1.7) from the real analysis of the SYNTHETIC fixture S1.
const GENERATED_AT = '2026-11-01 12:00';
let input: DiagnosticInput;
let panel: PanelModel;
const SECRET = 'SECRET-FILE-CONTENT-9f3a';

beforeAll(async () => {
  const r = await s1Analysis();
  const cs = r.reasoningTrace?.compositionSearch;
  panel = buildCompositionPanel({composition: r.compositionInference, runs: cs?.runs ?? [], mode: cs?.mode, enumeration: r.solvedConstraintSpace.searchResult?.enumeration, localStructures: r.reasoningTrace?.localStructures ?? [], rejectedCandidates: r.rejectedCandidates}) as PanelModel;
  const spectra = fixtureSpectra(loadFixture('S1')) as Record<string, any>;
  // a file-content marker hidden in fields the summary must not print
  spectra.IR.fileName = `${SECRET}.csv`;
  spectra.IR.rawExperimentalSnapshot = {rawPoints: [{x: 1, y: 2}], fileName: `${SECRET}.csv`, originalImageUrl: `data:image/png;base64,${SECRET}`};
  const filter = filterIrEvidence(r.modeAReport!.constraints.functionalGroups as FunctionalGroupRow[], r.modeAReport!.irFindings as unknown as IrFindingRow[]);
  input = {
    generatedAt: GENERATED_AT, appVersion: '1.2.2-test', resultIsCurrent: true,
    dataCheck: buildDataCheck({'1H_NMR': spectra['1H_NMR'], IR: spectra.IR}),
    h1Peaks: spectra['1H_NMR'].peaks.map((p: any) => ({position: p.position ?? p.x, integration: p.integration, multiplicity: p.multiplicity, jValues: p.jValues})),
    irPeaks: spectra.IR.peaks.map((p: any) => ({position: p.position ?? p.x, broad: Boolean(p.isBroad)})),
    irCalibrationText: '數值檔，無需校正',
    hiddenIrGroups: filter.hiddenCount, shownIrGroups: filter.shownCount,
    panel, composition: r.compositionInference as unknown as CompositionSourcesLike, observations: r.reasoningTrace!.observations as unknown as ObservationLike[],
    topCandidates: r.rankedCandidates.slice(0, 3).map((c, i) => ({rank: i + 1, formula: c.molecularFormula, score: c.scoreBreakdown.totalScore, smiles: c.smiles})),
  };
}, 60000);

describe('buildDiagnosticSummary on S1', () => {
  it('has the 7 fixed section titles, in order, once each', () => {
    const text = buildDiagnosticSummary(input);
    const titles = text.split('\n').filter(l => l.startsWith('■ ')).map(l => l.slice(2));
    expect(titles).toEqual([...SUMMARY_SECTION_TITLES]);
    expect(SUMMARY_SECTION_TITLES).toHaveLength(7);
  });
  it('is plain text: no HTML tags, no Markdown table or code fence, at most 120 lines', () => {
    const text = buildDiagnosticSummary(input);
    expect(text.split('\n').length - 1).toBeLessThanOrEqual(MAX_SUMMARY_LINES);
    expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(text).not.toMatch(/```|^\s*\|.*\|\s*$/m);
    expect(text).not.toMatch(/\*\*|^#{1,6} /m);
  });
  it('never contains file names or file content', () => {
    const text = buildDiagnosticSummary(input);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('synthetic-fixture.csv');
    expect(text).not.toContain('base64');
  });
  it('formula part: every searched row, the first 15 unsearched rows, and the count per not-searched reason', () => {
    const text = buildDiagnosticSummary(input);
    const searched = panel.rows.filter(r => !r.search.text.startsWith('未搜尋（'));
    const unsearched = panel.rows.filter(r => r.search.text.startsWith('未搜尋（'));
    expect(panel.rows).toHaveLength(200);
    expect(searched).toHaveLength(12);
    for (const r of searched) expect(text).toContain(`- #${r.rank} ${r.formula}（`);
    for (const r of unsearched.slice(0, SUMMARY_UNSEARCHED_ROWS)) expect(text).toContain(`- #${r.rank} ${r.formula}｜未搜尋｜`);
    expect(text).not.toContain(`- #${unsearched[SUMMARY_UNSEARCHED_ROWS].rank} ${unsearched[SUMMARY_UNSEARCHED_ROWS].formula}｜未搜尋`);
    const counts = notSearchedCounts(panel.rows, panel.planning?.notSearched);
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(unsearched.length);
    expect(counts.map(c => c.reason)).toEqual(['k 輪流名額已滿', '¹H 清單不可行', '同骨架 O 變體超過保留數', 'O 數在 IR 證據範圍之外']);
    expect(counts.map(c => c.count)).toEqual([38, 76, 21, 53]);
    for (const c of counts) expect(text).toContain(`${c.reason} ${c.count}`);
    expect(text).toContain('共 200 個假設；12 個被搜尋、188 個未搜尋');
    // the target formula is searched and must be in the list (the S1 target formula ranks far down the table)
    expect(text).toContain('C15H16O2（');
  });
  it('names the oxygen-floor source and the nitrogen-evidence source', () => {
    const text = buildDiagnosticSummary(input);
    expect(text).toMatch(/氧下限來源：O ≥ 1 ← IR 3350 cm⁻¹ 寬帶 → O–H［IR 3350 cm⁻¹］；IR 1235 cm⁻¹、IR 1175 cm⁻¹ 強 C–O 帶［IR 1235 cm⁻¹、IR 1175 cm⁻¹］/);
    expect(text).toContain('氮證據來源：無 N 專屬證據（模糊的 O／N 訊號預設歸 O');
  });
  it('states how many IR groups were hidden (display filter only)', () => {
    expect(buildDiagnosticSummary(input)).toContain('顯示 13 項；因 IR 證據不足而隱藏 6 項');
  });
  it('matches the stored snapshot (S1, step budget)', () => {
    expect(buildDiagnosticSummary(input)).toMatchSnapshot();
  });
  it('the full formula table has one line per hypothesis, every line with its search state and reason', () => {
    const text = buildFullFormulaTable(panel, GENERATED_AT);
    const lines = text.trim().split('\n');
    const body = lines.filter(l => l.startsWith('#'));
    expect(body).toHaveLength(200);
    expect(lines[2]).toBe('共 200 個假設｜12 個被搜尋｜188 個未搜尋');
    expect(body.filter(l => l.includes('｜已搜尋')).length).toBe(12);
    const not = body.filter(l => l.includes('｜未搜尋｜原因：'));
    expect(not).toHaveLength(188);
    expect(not.every(l => !/原因：$/.test(l))).toBe(true);
    expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(text).not.toContain(SECRET);
  });
});

describe('buildDiagnosticSummary edge cases', () => {
  it('stays within 120 lines even with many peaks, many searched rows and many exclusion lines', () => {
    const manyRows = Array.from({length: 80}, (_, i) => ({...panel.rows[0], rank: i + 1, formula: `C${i + 5}H${2 * i + 6}O`, search: {...panel.rows[0].search, text: '1 個候選｜完整（COMPLETE）', round: {id: 'ROUND_1' as const, text: '第一輪'}}}));
    const big: PanelModel = {...panel, rows: manyRows, constraints: panel.constraints ? {...panel.constraints, exclusions: Array.from({length: 60}, (_, i) => `規則 ${i}：${i} 個`)} : null};
    const text = buildDiagnosticSummary({...input, panel: big, h1Peaks: Array.from({length: 60}, (_, i) => ({position: 1 + i * 0.1, integration: 1, multiplicity: 's'}))});
    expect(text.split('\n').length - 1).toBeLessThanOrEqual(MAX_SUMMARY_LINES);
    expect(text.split('\n').filter(l => l.startsWith('■ '))).toHaveLength(7);
  });
  it('without a panel, peaks or candidates every section still prints, with an explicit "沒有資料" or "未提供" line', () => {
    const text = buildDiagnosticSummary({...input, panel: null, h1Peaks: [], irPeaks: [], topCandidates: [], composition: null, dataCheck: buildDataCheck({})});
    expect(text.split('\n').filter(l => l.startsWith('■ '))).toHaveLength(7);
    expect(text).toContain('未提供 ¹H');
    expect(text).toContain('未提供 IR');
    expect(text).toContain('氧下限來源：此分析沒有 O 下限');
    expect(text).toContain('氮證據來源：此分析沒有氮證據評估');
    expect(buildFullFormulaTable(null, GENERATED_AT)).toContain('沒有分子式假設');
  });
  it('a stale result says so in the header line', () => {
    expect(buildDiagnosticSummary({...input, resultIsCurrent: false})).toContain('資料已變更，以下為舊結果');
  });
});

describe('oxygen-floor and nitrogen-evidence lines', () => {
  const obs: ObservationLike[] = [{id: 'IR:f:1715', modality: 'IR', value: 1715}, {id: 'IR:f:3350', modality: 'IR', value: 3350}];
  it('user formula, no floor, floor with sources', () => {
    expect(oxygenFloorLine({status: 'USER_FORMULA'}, obs)).toContain('使用者宣告的分子式');
    expect(oxygenFloorLine({v121: {oxygenFloor: null, sulfurConsidered: false}}, obs)).toContain('氧下限來源：無');
    expect(oxygenFloorLine({v121: {oxygenFloor: {floor: 2, sources: [{text: '強 C=O 帶', observationIds: ['IR:f:1715']}]}, sulfurConsidered: false}}, obs)).toBe('氧下限來源：O ≥ 2 ← 強 C=O 帶［IR 1715 cm⁻¹］');
  });
  it('nitrogen evidence with sources, even-ion only, none', () => {
    const base = {note: 'n', reasons: [{text: 'IR 兩條窄峰，與一級胺 N–H 伸縮雙峰相容', observationIds: ['IR:f:3350', 'IR:f:3400']}]};
    expect(nitrogenEvidenceLine({nitrogenEvidence: {mode: 'EVIDENCE', ...base}}, obs)).toBe('氮證據來源：IR 兩條窄峰，與一級胺 N–H 伸縮雙峰相容［IR 3350 cm⁻¹、IR 3400 cm⁻¹］');
    expect(nitrogenEvidenceLine({nitrogenEvidence: {mode: 'EVEN_ION_ONLY', ...base}}, obs)).toContain('只有偶電子離子');
    expect(nitrogenEvidenceLine({nitrogenEvidence: {mode: 'NONE', note: '無 N 專屬證據：X', reasons: []}}, obs)).toBe('氮證據來源：無 N 專屬證據（X）');
  });
});
