import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeAll, describe, expect, it} from 'vitest';
import {CandidateEvidence} from '../../src/ui/CandidateEvidence';
import {FunctionalGroupTab, type FunctionalGroupTabProps} from '../../src/ui/FunctionalGroupTab';
import {DiagnosisTab} from '../../src/ui/DiagnosisTab';
import {InputSummaryTab, type InputSummaryRow} from '../../src/ui/InputSummaryTab';
import {filterIrEvidence, type FunctionalGroupRow, type IrFindingRow} from '../../src/ui/irEvidenceFilter';
import type {ObservationLike} from '../../src/ui/obsLabel';
import type {TraceEvidenceLike} from '../../src/ui/evidenceMerge';
import {s1Analysis} from './s1Analysis';
import {CompositionPanelView} from '../../src/components/CompositionPanel';
import {buildCompositionPanel, type PanelModel} from '../../src/engines/enumeration/compositionPanelModel';
import {isSearchedRow} from '../../src/ui/diagnosticSummary';

// What the result tabs actually print for the real analysis of the SYNTHETIC fixture S1 (tests/fixtures/v121/S1.json, hand-written):
// the page's own summaries (rows, hidden notice, one-line summaries, template sentences said once), not only the pure helpers behind them.
// Rendered with react-dom/server: every <details> is in the markup, open or closed, so the checks below are stricter than "visible text".
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;|&#x27;|&quot;/g, m => ({'&amp;': '&', '&#x27;': "'", '&quot;': '"'}[m] as string)).replace(/\s+/g, ' ');
const count = (s: string, needle: string | RegExp) => (s.match(typeof needle === 'string' ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : new RegExp(needle, 'g')) ?? []).length;
const noop = () => undefined;

let r: Awaited<ReturnType<typeof s1Analysis>>;
let fgProps: FunctionalGroupTabProps;
beforeAll(async () => {
  r = await s1Analysis();
  const t = r.reasoningTrace!;
  fgProps = {
    hasResult: true,
    groups: r.modeAReport!.constraints.functionalGroups ?? [],
    irFindings: r.modeAReport!.irFindings,
    evidenceList: r.spectrumEvidenceList,
    observations: t.observations as unknown as ObservationLike[],
    proton: r.modeAReport!.protonSummary ?? null, carbon: r.modeAReport!.carbonSummary ?? null, ms: r.modeAReport!.msSummary ?? null,
    msmsProductIons: null, msmsNeutralLosses: null, tofFeatures: null,
    localStructures: t.localStructures, hypotheses: t.hypotheses, partialHypotheses: undefined, msOnlyNote: false, onNext: noop,
  };
}, 60000);

describe('圖譜官能基 tab on S1 (what the page prints)', () => {
  const render = (props?: Partial<FunctionalGroupTabProps>) => renderToStaticMarkup(React.createElement(FunctionalGroupTab, {...fgProps, ...props}));

  it('12 groups shown, 7 hidden behind one notice, 19 in total; the hidden ones are all in the markup', () => {
    const html = render();
    const filter = filterIrEvidence(fgProps.groups as FunctionalGroupRow[], fgProps.irFindings as unknown as IrFindingRow[]);
    expect([filter.shownCount, filter.hiddenCount, filter.total]).toEqual([12, 7, 19]);
    const hiddenBlock = html.slice(html.indexOf('data-testid="fg-hidden-groups"'));
    const shownBlock = html.slice(html.indexOf('data-testid="fg-group-list"'), html.indexOf('data-testid="fg-hidden-groups"'));
    expect(count(shownBlock, 'data-testid="fg-group"')).toBe(12);
    expect(count(hiddenBlock.slice(0, hiddenBlock.indexOf('data-testid="fg-local-structures"')), 'data-testid="fg-group"')).toBe(7);
    expect(text(html)).toContain('另有 7 項 IR 證據不足的官能基，已隱藏（點開查看）');
    for (const g of filter.hidden) expect(hiddenBlock).toContain(`data-group="${g.name.replace(/&/g, '&amp;')}"`);
    for (const g of filter.shown) expect(shownBlock).toContain(`data-group="${g.name.replace(/&/g, '&amp;')}"`);
  });

  it('same-name groups are one row: 芳環骨架 C=C is one row with 3 IR peaks', () => {
    const html = render();
    const row = html.slice(html.indexOf('data-group="芳環骨架 C=C"'));
    const summary = text(row.slice(0, row.indexOf('</summary>')));
    expect(count(html, 'data-group="芳環骨架 C=C"')).toBe(1);
    expect(summary).toContain('3 個 IR 峰：1612、1510、1440 cm⁻¹');
    expect(summary).toContain('較支持');
  });

  it('nothing is hidden when no row qualifies: rows with a restricting status stay in the shown list (never hidden)', () => {
    const groups = [{groupFamily: 'carbonyl', label: '酮 C=O', status: 'REQUIRED', sourceModality: 'IR', observedSignal: '1715 cm⁻¹'}, {groupFamily: 'oh', label: '氫鍵 O–H', status: 'CANDIDATE', sourceModality: 'IR', observedSignal: '3350 cm⁻¹'}] as unknown as FunctionalGroupTabProps['groups'];
    const findings = [
      {id: 'f1', functionalGroup: '酮 C=O', observedPeak: 1715, observedPeaks: [1715], companionPeaksObserved: [], matchLevel: 'Weak', status: 'PRESENT'},
      {id: 'f2', functionalGroup: '氫鍵 O–H', observedPeak: 3350, observedPeaks: [3350], companionPeaksObserved: [], matchLevel: 'Weak', status: 'PRESENT'},
    ] as unknown as FunctionalGroupTabProps['irFindings'];
    const html = render({groups, irFindings: findings, evidenceList: [], localStructures: [], hypotheses: []});
    expect(text(html)).toContain('另有 1 項 IR 證據不足的官能基，已隱藏');
    const shownBlock = html.slice(html.indexOf('data-testid="fg-group-list"'), html.indexOf('data-testid="fg-hidden-groups"'));
    expect(shownBlock).toContain('data-group="酮 C=O"');
    expect(shownBlock).not.toContain('data-group="氫鍵 O–H"');
  });

  it('the template sentences are said once in the whole tab; the shared-observation sentence once', () => {
    const t = text(render());
    expect(count(t, '目前僅依賴單一模態之孤立峰支持')).toBe(1);
    expect(count(t, '已獲 X+Y 跨模態雙重印證')).toBe(1);
    expect(count(t, '建議結合互補光譜模態')).toBe(1);
    expect(count(t, '共享同一個觀測，不可當成兩個獨立片段必須共存')).toBe(1);
    expect(count(t, '候選分子圖選出區間')).toBe(0);
  });

  it('local structures: one summary line (11 structures, 46 possible links, 64 unknown) and the detail keeps all 11', () => {
    const html = render();
    const t = text(html);
    expect(t).toContain('11 個局部結構');
    expect(t).toContain('46 組可能連結、64 組未知');
    expect(count(html, 'data-local-ref=')).toBe(11);
    expect(t).toContain('競爭化學環境與觀測來源');
  });

  it('observation ids appear as short labels; the full id is only in small detail text', () => {
    const t = text(render());
    expect(t).toMatch(/IR 3350 cm⁻¹/);
    expect(t).toMatch(/來源觀測：[^。]*(IR \d+ cm⁻¹|¹H \d+\.\d\d ppm)/);
  });

  it('no inner scroll area, no number with three or more decimals anywhere in the markup text, no 可信度 NN%', () => {
    const html = render();
    expect(html).not.toMatch(/overflow-y-(auto|scroll)|max-h-\d/);
    expect(text(html)).not.toMatch(/\d+\.\d{3,}/);
    expect(text(html)).not.toMatch(/可信度\s*\d+%/);
  });

  it('an unfinished page says so; the next button never starts with 第 N 頁', () => {
    expect(text(render({hasResult: false}))).toContain('尚未分析');
    const t = text(render());
    expect(t).toContain('看預測結構');
    expect(t).not.toMatch(/第 [123] 頁.*看預測結構/);
  });
});

describe('「支持與矛盾」 of the top candidate on S1', () => {
  const evidenceHtml = () => {
    const t = r.reasoningTrace!;
    const cand = r.rankedCandidates[0];
    const rec = t.candidates.find(c => c.candidateId === cand.id)!;
    return renderToStaticMarkup(React.createElement(CandidateEvidence, {cand, modalityCount: 2, evidence: rec.evidence as unknown as TraceEvidenceLike[], observations: t.observations as unknown as ObservationLike[]}));
  };
  it('per-spectrum summary lines in place of one line per peak', () => {
    const t = text(evidenceHtml());
    expect(t).toMatch(/IR：10 個峰中 8 個與預測一致，1 個不明（3030）、1 個矛盾（560）/);
    expect(t).toMatch(/¹H：4 組訊號中 3 組與預測一致，1 組不明（4\.75）/);
  });
  it('the item-by-item table keeps short labels and two-decimal compatibility; the template sentence is not repeated', () => {
    const html = evidenceHtml();
    const t = text(html);
    expect(count(html, '<tr')).toBeGreaterThan(10);
    expect(t).toMatch(/IR 3350 cm⁻¹ 支持 0\.90/);
    expect(t).toMatch(/IR 560 cm⁻¹ 矛盾 0\.\d\d/);
    expect(count(t, '候選分子圖選出區間')).toBe(0);
    expect(t).not.toMatch(/\d+\.\d{3,}/);
  });
  it('with a contradiction there is no "無直接排他矛盾" line; without one there is none either', () => {
    expect(text(evidenceHtml())).not.toContain('無直接排他矛盾');
    const t = r.reasoningTrace!;
    const cand = {...r.rankedCandidates[0], contradictingReasons: [], scientificScoreLedger: undefined};
    const html = renderToStaticMarkup(React.createElement(CandidateEvidence, {cand, modalityCount: 2, evidence: [{observationIds: ['IR:f:1700'], modality: 'IR', status: 'SUPPORT'}], observations: t.observations as unknown as ObservationLike[]}));
    expect(text(html)).toContain('IR：1 個峰中 1 個與預測一致');
    expect(text(html)).not.toContain('無直接排他矛盾');
  });
});

describe('診斷 tab and 輸入與校正 tab', () => {
  const diag = (over: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(DiagnosisTab, {
    hasResult: true, summaryText: 'SpecReader 診斷摘要\n■ 資料檢查\n', fullFormulaTableText: 'x', onOpenExport: noop, markdownReport: () => '', onDownloadJson: noop,
    matrix: r.validationMatrix, evidence: r.spectrumEvidenceList, consensusNotes: r.modeAReport!.crossModalConsistencyNotes, uncertaintyNotes: r.modeAReport!.uncertaintyNotes, processCard: null, ...over,
  } as never));
  it('the matrix lists only the provided spectra; the rest is one 「未提供」 line; scores are whole numbers', () => {
    const html = diag();
    const matrix = html.slice(html.indexOf('data-testid="diagnostic-matrix"'), html.indexOf('data-testid="diagnostic-evidence"'));
    const t = text(matrix);
    expect(t).toContain('未提供：¹³C、MS、MS/MS、ToF-SIMS（不當成反證）');
    expect(t).not.toContain('NOT PROVIDED');
    expect(count(matrix, '<th ')).toBe(2 + 2 + 1); // candidate, formula, IR, ¹H, overall: only the two provided spectra have columns
    expect(text(html)).not.toMatch(/\d+\.\d{3,}/);
  });
  it('the buttons: two copy buttons, four export buttons, the preview, folded sections', () => {
    const html = diag();
    for (const name of ['複製診斷摘要', '複製完整分子式表', '開啟匯出視窗', '複製 Markdown 報告', '下載完整 JSON 證據包', '列印報告']) expect(text(html)).toContain(name);
    expect(html).toContain('data-testid="diagnostic-preview"');
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).not.toMatch(/overflow-y-(auto|scroll)|max-h-\d/);
  });
  it('the evidence list shows the first 20 and a 展開全部 button', () => {
    const html = diag();
    expect(r.spectrumEvidenceList.length).toBeGreaterThan(20);
    expect(count(html, 'data-evidence-row')).toBe(0); // rows carry no marker; count the ids instead
    expect(text(html)).toContain(`展開全部 ${r.spectrumEvidenceList.length} 筆（目前顯示前 20 筆）`);
  });
  it('input tab: per spectrum the calibration state, the peak table (first 20 + 展開全部), a page-2 link; unprovided spectra in one line', () => {
    const peaks = Array.from({length: 25}, (_, i) => ({id: `p${i}`, position: `${3500 - i * 10} cm⁻¹`, intensity: '50', detail: ''}));
    const rows: InputSummaryRow[] = [{key: 'IR', label: 'IR', fileName: 'x.csv', peakCount: 25, calibrationLabel: '座標來自數值檔', calibrationDetail: 'd', level: 'info', peaks, irBaselineText: 'IR 已使用設定 v2'}];
    const html = renderToStaticMarkup(React.createElement(InputSummaryTab, {rows, unprovidedText: '未提供：¹H、¹³C、MS、MS/MS、ToF-SIMS（不當成反證）', onGoPage1: noop, onGoPage2: noop}));
    const t = text(html);
    expect(t).toContain('座標來自數值檔');
    expect(t).toContain('到第 2 頁調整');
    expect(t).toContain('展開全部 25 筆（目前顯示前 20 筆）');
    expect(count(html, '<tr')).toBe(1 + 20 + 1);
    expect(t).toContain('五點基線：IR 已使用設定 v2');
    expect(t).toContain('未提供：¹H、¹³C、MS、MS/MS、ToF-SIMS（不當成反證）');
  });
});

describe('分子式與搜尋: the hypothesis table row limit (display parameter only)', () => {
  const model = () => {
    const cs = r.reasoningTrace?.compositionSearch;
    return buildCompositionPanel({composition: r.compositionInference, runs: cs?.runs ?? [], mode: cs?.mode, enumeration: r.solvedConstraintSpace.searchResult?.enumeration, localStructures: r.reasoningTrace?.localStructures ?? [], rejectedCandidates: r.rejectedCandidates}) as PanelModel;
  };
  const rowCount = (html: string) => count(html, 'data-formula="') - count(html, 'data-testid="composition-inventory-formula"') - count(html, 'data-testid="composition-constraints-formula"');
  it('without a limit every hypothesis row is listed (v1.2.1 behaviour)', () => {
    const m = model();
    const html = renderToStaticMarkup(React.createElement(CompositionPanelView, {model: m, stale: false}));
    expect(rowCount(html)).toBe(m.rows.length);
    expect(html).not.toContain('composition-rows-toggle');
  });
  it('with the limit: every searched row plus the first 4 not-searched rows, and a 展開全部 button naming the total', () => {
    const m = model();
    const searched = m.rows.filter(isSearchedRow).length;
    expect(m.rows.length).toBeGreaterThan(searched + 4);
    const html = renderToStaticMarkup(React.createElement(CompositionPanelView, {model: m, stale: false, unsearchedRowLimit: 4}));
    expect(rowCount(html)).toBe(searched + 4);
    expect(text(html)).toContain(`展開全部 ${m.rows.length} 筆`);
    // the searched rows are never cut, even when they rank far down the table
    for (const row of m.rows.filter(isSearchedRow)) expect(html).toContain(`data-formula="${row.formula}"`);
    // the 30 composition-* markers the E2E tests use are still in the markup
    expect(html).toContain('data-testid="composition-panel"');
    expect(html).toContain('data-testid="composition-hypotheses"');
  });
});
