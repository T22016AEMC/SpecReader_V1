import type {CompositionInferenceResult, CompositionReason} from '../composition/types';
import type {CompositionSearchRun} from '../composition/structureGenerator';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import type {CandidateOrigin, EnumerationDiagnostics, EnumerationRunDiagnostic, IncompleteReason} from './types';

/**
 * Pure model of the "組成推斷（分子式假設）" panel (docs/P1B_COMPOSITION_PANEL_DESIGN.md). Input: the analysis result objects; output:
 * rows and texts. The component only renders this, so every wording is testable. Fixed wordings that are configuration-like (badges,
 * tooltip prefix, deferred note, candidate source tags) live in ENUMERATION_CONFIG.ui.
 */
export type BadgeId = 'RELAXED' | 'LEGACY_SUPPLEMENT' | 'INCOMPLETE';
export interface PanelBadge {id: BadgeId; text: string}
export interface ReadingLine {text: string}
export interface SearchCell {
  text: string;
  note: string | null;
  badges: PanelBadge[];
  readings: ReadingLine[];
  excluded: string[];
}
export interface ReasonLine {text: string; source: string; strength: string}
export interface HypothesisRow {
  rank: number;
  formula: string;
  unsupportedNote: string | null;
  dbe: number;
  k: string;
  massBasis: string;
  massDetail: string | null;
  /** 1-based rank by relative confidence (1 = highest). Shown as the rank; the number itself only appears in the tooltip. */
  confidenceRank: number;
  /** 0…1, relative to the highest hypothesis; drawn as a bar. */
  confidenceBar: number;
  confidenceTooltip: string;
  size: string;
  search: SearchCell;
  support: ReasonLine[];
  contradiction: ReasonLine[];
  unknown: ReasonLine[];
}
export interface PanelModel {
  statusCode: CompositionInferenceResult['status'];
  statusLabel: string;
  hypothesisCount: number;
  enumerationLabel: string;
  summary: string;
  badges: PanelBadge[];
  rows: HypothesisRow[];
  emptyMessage: string | null;
  overview: {text: string; prefilterText: string | null; deferredNote: string} | null;
  nitrogen: {title: string; note: string; reasons: ReasonLine[]};
  clues: string[];
  excludedElements: string[];
  bounds: string;
  limitations: string[];
}
export interface PanelInput {
  composition: CompositionInferenceResult | undefined;
  runs: CompositionSearchRun[];
  mode: 'USER_FORMULA' | 'COMPOSITION_HYPOTHESES' | 'NO_FORMULA' | undefined;
  enumeration: EnumerationDiagnostics | undefined;
  localStructures: {id: string; kind: string}[];
}

export const STATUS_LABEL: Record<CompositionInferenceResult['status'], string> = {
  USER_FORMULA: '使用者分子式（硬限制）',
  INFERRED: '由光譜推斷（假設，非確認）',
  INSUFFICIENT_DATA: '資料不足，不猜測分子式',
  INVALID_USER_FORMULA: '使用者分子式無效',
};
export const MASS_BASIS_LABEL: Record<string, string> = {USER_FORMULA: '使用者分子式', HRMS: '高解析 MS', LOW_RES_MS: '低解析 MS', NONE: '無質量依據'};
export const SOURCE_LABEL: Record<CompositionReason['source'], string> = {MS: 'MS', MS_ISOTOPE: 'MS 同位素', '13C_NMR': '13C', '1H_NMR': '1H', IR: 'IR', HYPOTHESIS: '假設', USER: '使用者', RULE: '規則'};
export const REASON_LABEL: Record<IncompleteReason, string> = {
  TIME_BUDGET: '時間預算', STATE_BUDGET: '步數預算', CANDIDATE_LIMIT: '候選上限', CANCELLED: '已取消',
  INVALID_ALTERNATIVE_SET: '有讀法無法表達', ALTERNATIVE_SET_NOT_RUN: '有讀法未執行', READINGS_TRUNCATED: '讀法過多被截斷（只列舉前 ' + CFG.adapter.maxAlternativeSets + ' 組）',
  // v1.2 (only produced when useV12Constraints is on; wording is a placeholder until the stage-4 panel review)
  INVENTORY_ALTERNATIVES_TRUNCATED: '1H 原子清單的替代解讀過多被截斷', AROMATIC_TEMPLATE_LIMITED: '芳香 CH 超出環模板庫', V12_CONSTRAINTS_FALLBACK: '1H 約束未能套用（已退回）', VINYL_READINGS_BUDGET: '含烯基的讀法預算內未跑完',
};
const NITROGEN_LABEL: Record<string, string> = {EVIDENCE: '有 N 專屬證據', EVEN_ION_ONLY: '只有偶電子離子（不足）', NONE: '沒有 N 專屬證據'};
export const FIXED_LIMITATIONS = [
  '分子式是假設，不是確認；使用者分子式永遠優先並作為硬限制。',
  '相對信心沒有校準，只表示假設之間的相對比較。',
  '窮舉完整性只相對於目前的分子式、片段讀法與禁止規則（COMPLETE），不代表列出所有可能結構；未完整時請看原因。',
  '片段讀法由光譜推得的局部結構轉成：H 數不固定（彈性原子），不是已確認的取代數。',
];

const badge = (id: BadgeId): PanelBadge => ({id, text: CFG.ui.badges[id]});
const reason = (r: CompositionReason): ReasonLine => ({text: r.text, source: SOURCE_LABEL[r.source] ?? r.source, strength: r.strength === 'HARD' ? '硬' : '軟'});

/** Badges of one formula's run: relaxed, legacy supplement, incomplete (any enumeration result that is not complete). */
export function runBadges(e: EnumerationRunDiagnostic | undefined): PanelBadge[] {
  if (!e) return [];
  const out: PanelBadge[] = [];
  if (e.relaxedToFormulaOnly) out.push(badge('RELAXED'));
  if (e.legacySupplement) out.push(badge('LEGACY_SUPPLEMENT'));
  if (!e.complete) out.push(badge('INCOMPLETE'));
  return out;
}
/** Summary-line badges: every kind that occurs in any run, once each, in a fixed order. */
export function summaryBadges(runs: (EnumerationRunDiagnostic | undefined)[]): PanelBadge[] {
  const ids = new Set(runs.flatMap(r => runBadges(r).map(b => b.id)));
  return (['RELAXED', 'LEGACY_SUPPLEMENT', 'INCOMPLETE'] as BadgeId[]).filter(id => ids.has(id)).map(badge);
}

/** "窮舉器" / "舊 beam 搜尋（補充）" / "舊 beam 搜尋（退回）", plus "約束已放寬" when the run was relaxed; null without origin information. */
export function candidateSourceTag(origin: CandidateOrigin | undefined): string | null {
  if (!origin) return null;
  const T = CFG.ui.candidateSourceTags;
  return T[origin.source] + (origin.relaxed ? `｜${T.RELAXED}` : '');
}

function searchCell(h: CompositionInferenceResult['hypotheses'][number], run: CompositionSearchRun | undefined, kindOf: Map<string, string>): SearchCell {
  const empty = {badges: [] as PanelBadge[], readings: [] as ReadingLine[], excluded: [] as string[], note: null as string | null};
  if (!run) {
    const why = !h.generatorSupported ? `含生成器不支援的元素：${h.unsupportedElements.join('、')}` : '排名在搜尋範圍之外或預算已用完';
    return {...empty, text: `未搜尋（${why}）`};
  }
  const e = run.enumeration;
  if (!e) return {...empty, text: `${run.candidates} 個候選｜舊 beam 搜尋`};
  const badges = runBadges(e);
  const reasons = e.incompleteReasons.map(r => REASON_LABEL[r] ?? r).join('、');
  const readings: ReadingLine[] = e.readings.map((r, i) => ({
    text: `讀法 ${i + 1}：${r.localIds.map(id => `${id}／${kindOf.get(id.replace(/#\d+$/, '')) ?? '?'}`).join('＋') || '（沒有片段，只依分子式）'}｜${r.complete === true ? '完整' : r.complete === false ? '未完整' : r.error ? '與分子式不相容' : '未執行'}｜候選 ${r.newCandidates}${r.error ? `｜${r.error}` : ''}`,
  }));
  const excluded = (e.excludedLocals ?? []).map(x => `未納入任何讀法：${x.localId}／${x.kind}（原因：${x.reason}）`);
  if (!e.used) return {text: `${e.candidates || run.candidates} 個候選｜舊 beam 搜尋（原因：${e.fallbackReason ?? '未記錄'}）`, note: null, badges, readings, excluded};
  let text = `${e.candidates} 個候選｜${e.complete ? '完整（COMPLETE）' : `未完整（INCOMPLETE：${reasons || '原因未記錄'}）`}`;
  if (e.legacySupplement) text += `＋舊 beam 搜尋補充 ${e.legacySupplement.added} 個`;
  if (e.relaxedToFormulaOnly) text += '｜片段讀法與分子式矛盾，已放寬為只依分子式';
  return {text, note: e.complete ? '只相對於目前分子式與片段約束，不代表所有可能結構' : null, badges, readings, excluded};
}

function boundsText(c: CompositionInferenceResult): string {
  const b = c.bounds;
  const parts: string[] = [];
  parts.push(b.carbon ? `碳 ${b.carbon[0]}–${b.carbon[1] ?? '∞'}` : '碳：未限定');
  if (b.hydrogenMultiples?.length) parts.push(`氫為 ${b.hydrogenMultiples.join('、')} 的倍數`);
  const hetero = Object.entries(b.heteroMinimums).filter(([, n]) => (n ?? 0) > 0).map(([e, n]) => `${e}≥${n}`);
  if (hetero.length) parts.push(`雜原子下限 ${hetero.join('、')}`);
  parts.push(`DBE ≥ ${b.dbeMin}`);
  if (b.hardBoundsRelaxed) parts.push('硬邊界已放寬');
  return parts.join('；');
}

export function buildCompositionPanel(input: PanelInput): PanelModel | null {
  const c = input.composition;
  if (!c) return null;
  const kindOf = new Map(input.localStructures.map(l => [l.id, l.kind]));
  const runOf = (id: string) => input.runs.find(r => r.hypothesisId === id);
  const maxConfidence = Math.max(0, ...c.hypotheses.map(h => h.relativeConfidence));
  const order = [...c.hypotheses].map((h, i) => ({h, i})).sort((a, b) => b.h.relativeConfidence - a.h.relativeConfidence || a.i - b.i);
  const confidenceRank = new Map(order.map((x, idx) => [x.h.id, idx + 1]));
  const rows: HypothesisRow[] = c.hypotheses.map((h, i) => ({
    rank: i + 1, formula: h.formula,
    unsupportedNote: h.unsupportedElements.length ? `生成器不支援：${h.unsupportedElements.join('、')}` : null,
    dbe: h.dbe, k: h.symmetryMultiple === null ? '—' : String(h.symmetryMultiple),
    massBasis: MASS_BASIS_LABEL[h.massBasis] ?? h.massBasis,
    massDetail: h.massErrorDa === null ? null : `誤差 ${h.massErrorDa.toFixed(4)} Da${h.massErrorPpm === null ? '' : `（${h.massErrorPpm.toFixed(1)} ppm）`}`,
    confidenceRank: confidenceRank.get(h.id) ?? i + 1,
    confidenceBar: maxConfidence > 0 ? h.relativeConfidence / maxConfidence : 0,
    confidenceTooltip: `${CFG.ui.confidenceTooltipPrefix}${h.relativeConfidence.toFixed(4)}`,
    size: h.sizeConfirmed ? '質量已確認' : '大小未確認',
    search: searchCell(h, runOf(h.id), kindOf),
    support: h.support.map(reason), contradiction: h.contradiction.map(reason), unknown: h.unknown.map(reason),
  }));
  const runDiags = input.runs.map(r => r.enumeration);
  const badges = summaryBadges(runDiags);
  const en = input.enumeration;
  const enumerationLabel = en?.used ? (en.complete ? '完整（COMPLETE）' : '未完整（INCOMPLETE）') : en ? '未使用（舊搜尋）' : input.mode === 'NO_FORMULA' ? '無分子式' : '未使用（舊搜尋）';
  const emptyMessage = c.status === 'INSUFFICIENT_DATA' ? '資料不足，沒有可列舉的分子式假設'
    : c.status === 'INVALID_USER_FORMULA' ? '使用者分子式無效，沒有推論；請修正分子式'
    : rows.length === 0 ? '沒有任何假設通過硬限制' : null;
  const overview = en?.used ? {
    text: `共列舉 ${en.enumerated} 個候選，其中 ${en.scored} 個進入完整評分；${en.deferred.count} 個超過評分上限（${en.maxScoredCandidates}）而保留但未評分。`,
    prefilterText: en.deferred.prefilter ? `未評分的候選依「拓樸氫環境數不得少於觀測 1H 訊號數（${en.deferred.prefilter.h1Required ?? '—'}）、碳等價類不得少於觀測 13C 訊號數（${en.deferred.prefilter.c13Required ?? '—'}）」排在後面；通過 ${en.deferred.prefilter.passing} 個、未通過 ${en.deferred.prefilter.failing} 個。這是篩選啟發式，不是評分。` : null,
    deferredNote: CFG.ui.deferredNote,
  } : null;
  return {
    statusCode: c.status, statusLabel: STATUS_LABEL[c.status], hypothesisCount: rows.length, enumerationLabel,
    summary: `組成推斷（分子式假設）｜${STATUS_LABEL[c.status]}｜${rows.length} 個分子式假設｜窮舉：${enumerationLabel}`,
    badges, rows, emptyMessage, overview,
    nitrogen: {title: `氮（N）證據：${NITROGEN_LABEL[c.nitrogenEvidence.mode] ?? c.nitrogenEvidence.mode}`, note: c.nitrogenEvidence.note, reasons: c.nitrogenEvidence.reasons.map(reason)},
    clues: c.elementClues.map(x => `${x.element} ≥ ${x.minimum}（${x.strength === 'HARD' ? '硬' : '軟'}，${SOURCE_LABEL[x.source] ?? x.source}）：${x.text}`),
    excludedElements: c.elementsExcluded.map(x => `${x.element}：${x.reason}`),
    bounds: boundsText(c),
    limitations: [...FIXED_LIMITATIONS, ...c.limitations],
  };
}
