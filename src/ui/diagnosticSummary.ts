import type {PanelModel} from '../engines/enumeration/compositionPanelModel';
import type {DataCheckResult} from './dataCheck';
import {fmtIntegral, fmtScoreOf100, fmtShift1H, fmtWavenumber} from './format';
import {obsLabels, type ObservationLike} from './obsLabel';

/**
 * Plain-text diagnostic summary and full formula table of the 診斷 tab (v1.2.2, DESIGN_REPORT B1.7).
 * Built only from fields the page already has (panel model, composition inference, data check, peak tables); it never computes anything about the chemistry
 * and never includes file names or file contents. Output is plain text: no HTML, no Markdown tables, at most MAX_SUMMARY_LINES lines.
 */
export const MAX_SUMMARY_LINES = 120;
/** How many not-searched formula rows the summary lists before it falls back to "reason: count". */
export const SUMMARY_UNSEARCHED_ROWS = 15;
export const SUMMARY_SECTION_TITLES = ['資料檢查', '¹H 峰表與程式的讀法', 'IR 帶與校正方式', '分子式表', '搜尋計畫摘要', '前幾名候選', '各規則擋掉的結構數'] as const;

export interface H1PeakLike {position: number; integration?: number | null; multiplicity?: string; jValues?: number[]}
export interface IrPeakLike {position: number; broad?: boolean}
export interface TopCandidateLike {rank: number; formula: string; score: number | null; smiles: string}
/** The slice of the composition inference result the summary reads (O floor and N evidence sources). */
export interface CompositionSourcesLike {
  status?: string;
  nitrogenEvidence?: {mode: string; note: string; reasons: {text: string; observationIds: string[]}[]};
  v121?: {oxygenFloor: {floor: number; sources: {text: string; observationIds: string[]}[]} | null; sulfurConsidered: boolean};
}

export interface DiagnosticInput {
  generatedAt: string;
  appVersion: string;
  /** False when the input was edited after the analysis (the summary says so). */
  resultIsCurrent: boolean;
  dataCheck: DataCheckResult;
  h1Peaks: H1PeakLike[];
  irPeaks: IrPeakLike[];
  /** Calibration wording of the IR spectrum, e.g. the label of `calibrationStatus`. */
  irCalibrationText?: string;
  /** Functional-group groups hidden by the IR filter / shown (counts only). */
  hiddenIrGroups: number;
  shownIrGroups: number;
  panel: PanelModel | null;
  composition: CompositionSourcesLike | null | undefined;
  observations: readonly ObservationLike[];
  topCandidates: TopCandidateLike[];
}

const NOT_SEARCHED_PREFIX = '未搜尋（';
type Row = PanelModel['rows'][number];
const isSearched = (r: Row): boolean => r.search.round ? r.search.round.id !== 'NOT_SEARCHED' : !r.search.text.startsWith(NOT_SEARCHED_PREFIX);
/** "未搜尋（k 輪流名額已滿（第一輪最多搜尋 12 個分子式））" → "k 輪流名額已滿（第一輪最多搜尋 12 個分子式）". */
const notSearchedReason = (r: Row): string => {
  const t = r.search.text;
  return t.startsWith(NOT_SEARCHED_PREFIX) ? t.slice(NOT_SEARCHED_PREFIX.length).replace(/）$/, '') : '原因未記錄';
};
const rowK = (r: Row) => (r.k === '—' ? 'k 未定' : `k = ${r.k}`);
const searchedLine = (r: Row): string => `- #${r.rank} ${r.formula}（${rowK(r)}）｜${r.search.round ? `${r.search.round.text}｜` : ''}${r.search.text}`;

/** The reason without its explanation: "¹H 清單不可行：沒有可容納…" → "¹H 清單不可行". Used for the short summary lines and for grouping. */
export const shortReason = (reason: string): string => reason.split(/[：（]/)[0].trim() || reason;

/** 「原因：數量」 pairs of the not-searched rows, in order of first appearance. The planned search already groups them by reason code; otherwise the short reason texts are grouped. */
export function notSearchedCounts(rows: readonly Row[], planned?: {label: string; count: number}[]): {reason: string; count: number}[] {
  if (planned?.length) return planned.map(p => ({reason: p.label, count: p.count}));
  const counts = new Map<string, number>();
  for (const r of rows) if (!isSearched(r)) { const k = shortReason(notSearchedReason(r)); counts.set(k, (counts.get(k) ?? 0) + 1); }
  return [...counts].map(([reason, count]) => ({reason, count}));
}

/** The oxygen-floor line: where the lower bound of O comes from. */
export function oxygenFloorLine(c: CompositionSourcesLike | null | undefined, observations: readonly ObservationLike[]): string {
  if (c?.status === 'USER_FORMULA') return '氧下限來源：使用者宣告的分子式（不由光譜推導）';
  const of = c?.v121?.oxygenFloor;
  if (of === undefined) return '氧下限來源：此分析沒有 O 下限（沒有搜尋計畫）';
  if (of === null) return '氧下限來源：無（沒有 IR 的寬 O–H、強 C=O 或強 C–O 觀測帶，或已有質量依據）';
  const parts = of.sources.map(s => `${s.text}${s.observationIds.length ? `［${obsLabels(s.observationIds, observations)}］` : ''}`);
  return `氧下限來源：O ≥ ${of.floor} ← ${parts.join('；') || '（未記錄）'}`;
}
/** The nitrogen-evidence line: which IR bands / ¹H signals count as N evidence, or why there is none. */
export function nitrogenEvidenceLine(c: CompositionSourcesLike | null | undefined, observations: readonly ObservationLike[]): string {
  const n = c?.nitrogenEvidence;
  if (!n) return '氮證據來源：此分析沒有氮證據評估';
  if (n.mode === 'EVIDENCE') {
    const parts = n.reasons.map(r => `${r.text}${r.observationIds.length ? `［${obsLabels(r.observationIds, observations)}］` : ''}`);
    return `氮證據來源：${parts.join('；') || '有 N 專屬證據（未記錄細節）'}`;
  }
  if (n.mode === 'EVEN_ION_ONLY') return '氮證據來源：只有偶電子離子（不足以確認 N；N 保留為可能但被扣分）';
  return `氮證據來源：無 N 專屬證據（${n.note.replace(/^無 N 專屬證據：/, '') || '模糊的 O／N 訊號歸 O'}）`;
}

function h1Lines(input: DiagnosticInput, cap: number): string[] {
  const signals = input.panel?.inventory?.formulas[0]?.signals ?? [];
  const reading = (p: H1PeakLike): string => {
    const s = signals.find(x => Math.abs(Number(x.shift) - p.position) < 0.006);
    return s ? `｜${s.classes}｜${s.equivalence === '要求' ? '要求等價' : '不要求等價'}${s.singlet === '套用' ? '｜單峰規則套用' : ''}` : '';
  };
  const lines = input.h1Peaks.slice(0, cap).map(p => {
    const j = p.jValues?.length ? `（J = ${p.jValues.map(v => Number(v.toFixed(1))).join(', ')}）` : '';
    return `- ${fmtShift1H(p.position)} ppm｜${p.integration == null ? '積分未提供' : `${fmtIntegral(p.integration)}H`}｜${p.multiplicity ?? '多重性未提供'}${j}${reading(p)}`;
  });
  if (input.h1Peaks.length > cap) lines.push(`- …其餘 ${input.h1Peaks.length - cap} 筆未列出`);
  const combos = input.panel?.inventory?.formulas[0]?.combinations ?? [];
  if (combos.length) lines.push(`- 積分最簡比與原子清單讀法：${combos[0].split('｜').slice(0, 2).join('｜')}${combos.length > 1 ? `（共 ${combos.length} 種 k／額外 OH 組合）` : ''}`);
  return lines;
}

interface Caps {h1: number; searched: number; exclusions: number}
function build(input: DiagnosticInput, caps: Caps): string[] {
  const out: string[] = [];
  const section = (title: string, lines: string[]) => { out.push('', `■ ${title}`, ...(lines.length ? lines : ['- （沒有資料）'])); };
  const rows = input.panel?.rows ?? [];
  const searched = rows.filter(isSearched), unsearched = rows.filter(r => !isSearched(r));
  out.push('SpecReader 診斷摘要', `產生時間：${input.generatedAt}｜版本 ${input.appVersion}｜${input.resultIsCurrent ? '結果為目前輸入' : '資料已變更，以下為舊結果'}`);

  section(SUMMARY_SECTION_TITLES[0], [
    ...input.dataCheck.items.map(i => `- ${i.text}${i.detail ? `｜${i.detail}` : ''}`),
    ...(input.dataCheck.unprovidedText ? [`- ${input.dataCheck.unprovidedText}`] : []),
    ...(input.dataCheck.staleText ? [`- ${input.dataCheck.staleText}`] : []),
  ]);
  section(SUMMARY_SECTION_TITLES[1], input.h1Peaks.length ? h1Lines(input, caps.h1) : ['- 未提供 ¹H']);
  section(SUMMARY_SECTION_TITLES[2], input.irPeaks.length ? [
    `- 校正方式：${input.irCalibrationText ?? '未記錄'}`,
    `- 峰（${input.irPeaks.length}）：${input.irPeaks.map(p => `${fmtWavenumber(p.position)}${p.broad ? '（寬）' : ''}`).join('、')} cm⁻¹`,
    `- 官能基（IR）：顯示 ${input.shownIrGroups} 項；因 IR 證據不足而隱藏 ${input.hiddenIrGroups} 項（只是顯示層篩選，匯出與本摘要的資料不變）`,
  ] : ['- 未提供 IR']);

  const tableLines: string[] = [];
  if (input.panel) {
    tableLines.push(`- 共 ${rows.length} 個假設；${searched.length} 個被搜尋、${unsearched.length} 個未搜尋`);
    tableLines.push(`- 被搜尋的列（${searched.length}）：`, ...searched.slice(0, caps.searched).map(searchedLine));
    if (searched.length > caps.searched) tableLines.push(`- …另有 ${searched.length - caps.searched} 列被搜尋，請用「複製完整分子式表」`);
    if (unsearched.length) {
      tableLines.push(`- 未搜尋的列（只列前 ${Math.min(SUMMARY_UNSEARCHED_ROWS, unsearched.length)} 列；完整表請用「複製完整分子式表」）：`);
      tableLines.push(...unsearched.slice(0, SUMMARY_UNSEARCHED_ROWS).map(r => `- #${r.rank} ${r.formula}｜未搜尋｜${shortReason(notSearchedReason(r))}`));
      tableLines.push(`- 未搜尋原因與數量：${notSearchedCounts(rows, input.panel?.planning?.notSearched).map(c => `${c.reason} ${c.count}`).join('、')}（合計 ${unsearched.length}）`);
    }
  }
  section(SUMMARY_SECTION_TITLES[3], tableLines.length ? tableLines : ['- 沒有分子式假設']);

  const plan = input.panel?.planning;
  section(SUMMARY_SECTION_TITLES[4], [
    ...(plan ? [`- ${plan.summary}`] : input.panel ? [`- ${input.panel.summary}`] : []),
    `- ${oxygenFloorLine(input.composition, input.observations)}`,
    `- ${nitrogenEvidenceLine(input.composition, input.observations)}`,
    `- S：${input.composition?.v121 ? (input.composition.v121.sulfurConsidered ? '已考慮' : '未考慮（沒有 S 專屬證據）') : '此分析沒有 S 判斷'}`,
    ...(input.panel ? [`- 窮舉：${input.panel.enumerationLabel}`] : []),
  ]);
  section(SUMMARY_SECTION_TITLES[5], input.topCandidates.slice(0, 5).map(c => `- #${c.rank} ${c.formula}｜相容度 ${fmtScoreOf100(c.score)}｜${c.smiles}`));
  const ex = input.panel?.constraints?.exclusions ?? [];
  section(SUMMARY_SECTION_TITLES[6], [...ex.slice(0, caps.exclusions).map(x => `- ${x}`), ...(ex.length > caps.exclusions ? [`- …另有 ${ex.length - caps.exclusions} 條未列出`] : [])]);
  return out;
}

/** The 7-section plain-text summary, at most MAX_SUMMARY_LINES lines (the flexible lists shrink until it fits). */
export function buildDiagnosticSummary(input: DiagnosticInput): string {
  const caps: Caps = {h1: 15, searched: 30, exclusions: 15};
  let lines = build(input, caps);
  while (lines.length > MAX_SUMMARY_LINES && (caps.h1 > 3 || caps.searched > 3 || caps.exclusions > 3)) {
    caps.searched = Math.max(3, caps.searched - 1);
    caps.exclusions = Math.max(3, caps.exclusions - 1);
    caps.h1 = Math.max(3, caps.h1 - 1);
    lines = build(input, caps);
  }
  return lines.join('\n') + '\n';
}

/** Every formula hypothesis, one plain-text line each, with the search state and (for unsearched rows) the reason. No line limit. */
export function buildFullFormulaTable(panel: PanelModel | null, generatedAt: string): string {
  if (!panel) return `SpecReader 完整分子式表\n產生時間：${generatedAt}\n沒有分子式假設\n`;
  const searched = panel.rows.filter(isSearched).length;
  const lines = [
    'SpecReader 完整分子式表',
    `產生時間：${generatedAt}`,
    `共 ${panel.rows.length} 個假設｜${searched} 個被搜尋｜${panel.rows.length - searched} 個未搜尋`,
    '格式：#排序｜分子式｜DBE｜k｜搜尋狀態｜結果或原因',
    ...panel.rows.map(r => `#${r.rank}｜${r.formula}｜DBE ${r.dbe}｜${r.k === '—' ? 'k 未定' : `k=${r.k}`}｜${isSearched(r) ? `已搜尋${r.search.round ? `（${r.search.round.text}）` : ''}｜${r.search.text}` : `未搜尋｜原因：${notSearchedReason(r)}`}`),
  ];
  return lines.join('\n') + '\n';
}
