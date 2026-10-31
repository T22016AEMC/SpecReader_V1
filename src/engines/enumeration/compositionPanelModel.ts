import type {CompositionInferenceResult, CompositionReason} from '../composition/types';
import type {CompositionSearchRun} from '../composition/structureGenerator';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import {V12_CONFIG} from '../constraints/v12Config';
import {COMPOSITION_CONFIG} from '../composition/compositionConfig';
import {SULFUR_NOT_CONSIDERED as SULFUR_TEXT} from '../composition/inferComposition';
import {exclusionLines, exclusionStats, zeroCandidateExplanation, type ZeroCandidateExplanation} from './exclusionStats';
import type {CandidateOrigin, EnumerationDiagnostics, EnumerationRunDiagnostic, IncompleteReason, V12RunDiagnostic} from './types';

/**
 * Pure model of the "組成推斷（分子式假設）" panel (docs/P1B_COMPOSITION_PANEL_DESIGN.md). Input: the analysis result objects; output:
 * rows and texts. The component only renders this, so every wording is testable. Fixed wordings that are configuration-like (badges,
 * tooltip prefix, deferred note, candidate source tags) live in ENUMERATION_CONFIG.ui.
 */
export type BadgeId = 'RELAXED' | 'LEGACY_SUPPLEMENT' | 'INCOMPLETE' | 'V12_FALLBACK';
export interface PanelBadge {id: BadgeId; text: string}
export interface ReadingLine {text: string}
/** v1.2.1: the round badge of a formula row (only present when useV121Planning planned the search). */
export interface RoundBadge {id: 'ROUND_1' | 'ROUND_2' | 'NOT_SEARCHED'; text: string}
export interface SearchCell {
  text: string;
  round?: RoundBadge;
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
/** Section A of the v1.2 panel: what the 1H spectrum says about the atoms (one entry per formula that has a v1.2 diagnostic). */
export interface InventoryFormulaView {
  formula: string;
  path: V12RunDiagnostic['path'];
  /** Status line, and the reason (fallback / not available) on its own line. */
  statusText: string;
  reasonText: string | null;
  badges: PanelBadge[];
  combinations: string[];
  /** Column headers are fixed by the component; `hText` is for the first reading. */
  signals: {shift: string; integral: string; ratio: string; hText: string; multiplicity: string; classes: string; hPerAtom: string; atoms: string; equivalence: string; singlet: string}[];
  preview: string[];
  countsText: string | null;
  voided: {text: string}[];
  aromaticLimited: string[];
  incompleteReasons: string[];
}
export interface ConstraintsFormulaView {
  formula: string;
  stateText: string;
  required: string[];
  requiredEmptyText: string | null;
  structural: string[];
  leaf: string[];
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
  /** v1.2 sections; null when no formula has a v1.2 diagnostic (flag off or legacy runs). */
  inventory: {formulas: InventoryFormulaView[]; notes: string[]} | null;
  constraints: {formulas: ConstraintsFormulaView[]; scoringText: string; exclusionTitle: string; exclusions: string[]} | null;
  /** v1.2.1 search plan section (absent when the planning flag was off). */
  planning?: PlanningView;
}
export interface PlanningView {
  title: string;
  oxygenText: string;
  sulfurText: string | null;
  summary: string;
  notSearched: {reason: string; label: string; count: number}[];
}
export interface PanelInput {
  /** Candidates the downstream gates rejected (their reasons feed the exclusion statistics of section B). */
  rejectedCandidates?: {violatedConstraints: string[]}[];
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
  INVENTORY_ALTERNATIVES_TRUNCATED: `1H 原子清單的替代解讀超過上限，只列舉最前面的（每個 k／額外 OH 組合至多 ${V12_CONFIG.maxInventoryAlternatives} 個，取代型式至多 ${V12_CONFIG.maxPatternSetsPerAlternative} 組）`,
  AROMATIC_TEMPLATE_LIMITED: '芳香 CH 超出環模板庫（目前只有苯、萘，有 N 證據時才有吡啶；呋喃、噻吩、吡咯等五員雜環是已知限制）',
  VINYL_READINGS_BUDGET: '含烯基（C=C–H）的讀法在預算內沒有跑完；不含烯基的讀法已完成',
  V12_CONSTRAINTS_FALLBACK: '1H 約束未能套用（已退回）：改用舊的彈性原子讀法',
  // v1.2.1 (only produced when useV121Planning plans the search)
  VINYL_READINGS_NOT_RUN: '含烯基（C=C–H）的讀法尚未執行（第一輪只跑不含烯基的讀法；第二輪只給各 k 最高分的分子式）',
  ROUND1_STEP_CAP: '第一輪達到每個分子式的步數上限（這個上限只屬於第一輪，不是整體預算）',
  ROUND1_NO_TEMPLATE_READING: '第一輪沒有可容納此分子式的模板讀法（沒有退回彈性原子讀法或舊搜尋）',
};
const NITROGEN_LABEL: Record<string, string> = {EVIDENCE: '有 N 專屬證據', EVEN_ION_ONLY: '只有偶電子離子（不足）', NONE: '沒有 N 專屬證據'};
export const NOT_SEARCHED_LABEL: Record<string, string> = {
  OXYGEN_OUTSIDE_RANGE: 'O 數在 IR 證據範圍之外', OXYGEN_VARIANT_LIMIT: '同骨架 O 變體超過保留數', K_ROUND_ROBIN_FULL: 'k 輪流名額已滿',
  H1_INFEASIBLE: '¹H 清單不可行', UNSUPPORTED_ELEMENT: '含生成器不支援的元素', BUDGET_NOT_REACHED: '預算用完',
};
export const ROUND_LABEL = {ROUND_1: '第一輪（芳香模板）', ROUND_1_VINYL: '第一輪（烯基例外）', ROUND_2: '第二輪（含烯基）', NOT_SEARCHED: '未搜尋'} as const;
/** v1.2.1: added to the fixed limitations only when the search was planned. */
export const PLANNING_LIMITATION = '兩輪搜尋下，烯基讀法只給各 k 第一輪最高分者；其餘分子式只跑了不含烯基的讀法（各分子式的「未完整」原因會寫明）。';
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
  if (e.v12?.path === 'FALLBACK') out.push(badge('V12_FALLBACK'));
  return out;
}
/** Summary-line badges: every kind that occurs in any run, once each, in a fixed order. */
export function summaryBadges(runs: (EnumerationRunDiagnostic | undefined)[]): PanelBadge[] {
  const ids = new Set(runs.flatMap(r => runBadges(r).map(b => b.id)));
  return (['RELAXED', 'LEGACY_SUPPLEMENT', 'INCOMPLETE', 'V12_FALLBACK'] as BadgeId[]).filter(id => ids.has(id)).map(badge);
}

/** "窮舉器" / "舊 beam 搜尋（補充）" / "舊 beam 搜尋（退回）", plus "約束已放寬" when the run was relaxed; null without origin information. */
export function candidateSourceTag(origin: CandidateOrigin | undefined): string | null {
  if (!origin) return null;
  const T = CFG.ui.candidateSourceTags;
  return T[origin.source] + (origin.relaxed ? `｜${T.RELAXED}` : '') + (origin.v12Fallback ? `｜${T.V12_FALLBACK}` : '') + (origin.round === 1 ? '｜第一輪' : origin.round === 2 ? `｜${ROUND_LABEL.ROUND_2}` : '');
}

function searchCell(h: CompositionInferenceResult['hypotheses'][number], run: CompositionSearchRun | undefined, kindOf: Map<string, string>): SearchCell {
  const empty = {badges: [] as PanelBadge[], readings: [] as ReadingLine[], excluded: [] as string[], note: null as string | null};
  if (!run) {
    if (h.searchPlan?.status === 'NOT_SEARCHED') return {...empty, text: `未搜尋（${h.searchPlan.reasonText ?? NOT_SEARCHED_LABEL[h.searchPlan.reason ?? ''] ?? '原因未記錄'}）`, round: {id: 'NOT_SEARCHED', text: ROUND_LABEL.NOT_SEARCHED}};
    const why = !h.generatorSupported ? `含生成器不支援的元素：${h.unsupportedElements.join('、')}` : '排名在搜尋範圍之外或預算已用完';
    return {...empty, text: `未搜尋（${why}）`};
  }
  const e = run.enumeration;
  if (!e) return {...empty, text: `${run.candidates} 個候選｜舊 beam 搜尋`};
  const badges = runBadges(e);
  const pl = e.planning;
  const round: RoundBadge | undefined = pl ? {id: pl.round === 2 ? 'ROUND_2' : 'ROUND_1', text: pl.round === 2 ? ROUND_LABEL.ROUND_2 : pl.vinylException ? ROUND_LABEL.ROUND_1_VINYL : ROUND_LABEL.ROUND_1} : undefined;
  const reasons = e.incompleteReasons.map(r => REASON_LABEL[r] ?? r).join('、');
  const readings: ReadingLine[] = e.readings.map((r, i) => ({
    text: `讀法 ${i + 1}：${r.localIds.map(id => `${id}／${kindOf.get(id.replace(/#\d+$/, '')) ?? '?'}`).join('＋') || '（沒有片段，只依分子式）'}｜${r.complete === true ? '完整' : r.complete === false ? '未完整' : r.error ? '與分子式不相容' : '未執行'}｜候選 ${r.newCandidates}${r.error ? `｜${r.error}` : ''}`,
  }));
  const excluded = (e.excludedLocals ?? []).map(x => `未納入任何讀法：${x.localId}／${x.kind}（原因：${x.reason}）`);
  if (!e.used) return {text: `${e.candidates || run.candidates} 個候選｜舊 beam 搜尋（原因：${e.fallbackReason ?? '未記錄'}）`, note: null, badges, readings, excluded};
  const withRound = <T extends object>(cell: T): T => (round ? {...cell, round} : cell);
  let text = `${e.candidates} 個候選｜${e.complete ? '完整（COMPLETE）' : `未完整（INCOMPLETE：${reasons || '原因未記錄'}）`}`;
  if (e.legacySupplement) text += `＋舊 beam 搜尋補充 ${e.legacySupplement.added} 個`;
  if (e.relaxedToFormulaOnly) text += '｜片段讀法與分子式矛盾，已放寬為只依分子式';
  return withRound({text, note: e.complete ? '只相對於目前分子式與片段約束，不代表所有可能結構' : null, badges, readings, excluded});
}

export const SHIFT_CLASS_LABEL: Record<string, string> = {
  ARO_CH: '芳香 CH', VINYL_CH: '烯基 CH', ALDEHYDE: '醛基 H', O_CH: '接 O 的碳 H', N_CH: '接 N 的碳 H', ALPHA_CH: '鄰羰基／芳環／炔的碳 H', ALKYL_CH: '烷基 H', EXCHANGEABLE: '可交換 H（OH／NH）',
};
export const INVENTORY_NOTES = [
  '原子清單是由 1H 積分與位移類別推得的假設讀法，不是確認的結構；位移類別的數值是工程預設，未校準。',
  '位移類別只決定每原子 H 數與環模板，不要求原子的混成或鄰接元素（例如 3.9 ppm 的 CH2 可以不接 O）；位移的鑑別留給評分。',
  `整數比容差 ±${COMPOSITION_CONFIG.h1IntegralTolerance}；積分誤差過大時整組讀法都可能錯。`,
];
export const SCORING_TEXT = '雙向評分見各候選的證據清單';
const MODALITY_LABEL: Record<string, string> = {'1H_NMR': '1H', '13C_NMR': '13C', IR: 'IR'};
/** "1H_NMR:source:7.20" → "1H 7.2 ppm"; IR → "IR 1720 cm-1". */
export function observationLabel(id: string): string {
  const parts = id.split(':');
  const mod = MODALITY_LABEL[parts[0]] ?? parts[0], value = Number(parts[parts.length - 1]);
  if (!Number.isFinite(value)) return id;
  return parts[0] === 'IR' ? `${mod} ${Math.round(value)} cm-1` : `${mod} ${Number(value.toFixed(2))} ppm`;
}
const num = (v: number) => String(Number(v.toFixed(2)));

function inventoryView(formula: string, v: V12RunDiagnostic): InventoryFormulaView {
  const inv = v.inventory;
  const badges = v.path === 'FALLBACK' ? [badge('V12_FALLBACK')] : [];
  const statusText = v.path === 'INVENTORY' ? `1H 原子清單：${inv?.alternatives ?? 0} 個替代解讀、${inv?.patternSets ?? 0} 個片段組合`
    : v.path === 'FLEX_NO_INTEGRALS' ? '1H 沒有積分，無法建立原子清單；使用舊的彈性原子路徑'
    : '1H 約束未能套用（已退回）：改用舊的彈性原子讀法';
  const reasonText = v.path === 'INVENTORY' ? null : `原因：${v.reason ?? inv?.reason ?? '未記錄'}`;
  const first = inv?.combinations[0];
  const combos = (inv?.combinations ?? []).map(c => {
    const r = v.runs.find(x => x.k === c.k && x.extraExchangeable === c.extraExchangeable);
    const reasons = r?.incompleteReasons.map(x => REASON_LABEL[x] ?? x).join('、');
    return `k=${c.k}，額外可交換 H=${c.extraExchangeable}｜整數比 ${c.ratio.join(':')}（H 數 ${c.ratio.map(x => x * c.k).join('、')}）${r ? `｜${r.alternatives} 個替代解讀、${r.sets} 個片段組合｜${r.complete === true ? '完整' : r.complete === false ? `未完整${reasons ? `（${reasons}）` : ''}` : '未執行'}｜候選 ${r.candidates}` : ''}`;
  });
  const signals = (inv?.signals ?? []).map(s => ({
    shift: num(s.shiftPpm), integral: s.relativeIntegral === null ? '—' : num(s.relativeIntegral), ratio: s.ratio === null ? '—' : String(s.ratio),
    hText: s.ratio === null || !first ? '—' : String(s.ratio * first.k), multiplicity: s.multiplicity ?? '—', classes: s.classes.map(x => SHIFT_CLASS_LABEL[x] ?? x).join('、') || '—',
    hPerAtom: '', atoms: '', equivalence: s.equivalenceRequired ? '要求' : '不要求', singlet: s.singletRuleApplied ? '套用' : '—',
  }));
  const firstAlt = inv?.alternativesPreview[0];
  firstAlt?.groups.forEach((g, i) => { if (signals[i]) { signals[i].hPerAtom = g.aromatic ? '1（環上）' : String(g.hPerAtom); signals[i].atoms = String(g.atomCount); } });
  const preview = (inv?.alternativesPreview ?? []).map((a, i) => {
    const groups = a.groups.map(g => `${g.hTotal}H＝${g.atomCount}×${g.aromatic ? '芳香 CH' : g.exchangeable ? `${g.element}H` : `${g.element}H${g.hPerAtom === 1 ? '' : g.hPerAtom}`}${g.alkene ? '（烯基）' : ''}${g.equivalent && g.atomCount > 1 ? '，等價' : ''}`).join('；');
    const rings = a.rings.length ? `｜環：${a.rings.map(r => `${r.templateId === 'benzene' ? '苯' : r.templateId === 'naphthalene' ? '萘' : r.templateId === 'pyridine' ? '吡啶' : r.templateId} ${r.ch} 個 CH（${r.patterns} 種取代型式）`).join('＋')}` : '';
    return `讀法 ${i + 1}（k=${a.k}，額外可交換 H=${a.extraExchangeable}）：${groups}${rings}`;
  });
  return {
    formula, path: v.path, statusText, reasonText, badges, combinations: combos, signals, preview,
    countsText: inv ? `替代解讀 ${inv.alternatives} 個，片段組合 ${inv.patternSets} 組${inv.truncated || inv.patternTruncated ? '（已截斷）' : ''}` : null,
    voided: (inv?.voided ?? []).map(x => ({text: `${x.reason}（${x.count} 次）`})),
    aromaticLimited: (inv?.aromaticLimited ?? []).map(x => `k=${x.k}，額外可交換 H=${x.extraExchangeable}：${x.reason}`),
    incompleteReasons: (inv?.incompleteReasons ?? []).map(x => REASON_LABEL[x as IncompleteReason] ?? x),
  };
}
function constraintsView(formula: string, e: EnumerationRunDiagnostic): ConstraintsFormulaView {
  const v = e.v12!;
  const c = v.constraints;
  const structural: string[] = [];
  if (c) {
    structural.push(`釘住 H 的原子：${c.pinnedAtoms} 個（分子式的全部重原子）`);
    structural.push(`需要拓樸等價的群：${c.equivalentGroups} 個${c.aromaticPools.length ? `；芳香 CH 需要等價的訊號大小：${c.aromaticPools.join('、')}` : ''}`);
    structural.push(`單峰規則（相鄰碳不帶 H）：${c.singletGroups} 群；烯基 CH（恰有一個非芳香 C=C）：${c.alkeneGroups} 群`);
    structural.push(`應變規則：${c.strainProfile ?? '無'}；對稱剪枝：${c.symmetryPruning ? '開' : '關'}`);
  }
  return {
    formula,
    stateText: v.path === 'FLEX_NO_INTEGRALS' ? '1H 沒有積分：使用舊的彈性原子路徑，只套用強證據子結構' : v.path === 'FALLBACK' ? '1H 約束未能套用（已退回）：使用舊的彈性原子路徑，仍套用強證據子結構' : '1H 約束：開啟',
    required: v.required.map(r => `${r.label}｜SMARTS ${r.smarts}｜依據：${r.evidenceObservationIds.map(observationLabel).join('、')}`),
    requiredEmptyText: v.required.length ? null : '沒有強證據規則被觸發',
    structural,
    leaf: [
      ...(v.leafCost ? [`葉端檢查：${v.leafCost.leaves} 個葉；軌道（等價）檢查 ${v.leafCost.orbitChecks} 次${v.leafCost.orbitGiveUps ? `（${v.leafCost.orbitGiveUps} 次達搜尋上限而未排除）` : ''}`] : []),
      ...(e.rejected?.v12 ? [`被葉端檢查排除的結構：芳香 ${e.rejected.v12.aromaticFailed}、必含子結構 ${e.rejected.v12.requiredFailed}、等價 ${e.rejected.v12.equivalenceFailed}、烯基 ${e.rejected.v12.alkeneFailed}`] : []),
    ],
  };
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

function v12Sections(c: CompositionInferenceResult, runOf: (id: string) => CompositionSearchRun | undefined, rejected: {violatedConstraints: string[]}[]): Pick<PanelModel, 'inventory' | 'constraints'> {
  const items = c.hypotheses.flatMap(h => { const e = runOf(h.id)?.enumeration; return e?.v12 ? [{formula: h.formula, e, v: e.v12}] : []; });
  if (!items.length) return {inventory: null, constraints: null};
  return {
    inventory: {formulas: items.map(x => inventoryView(x.formula, x.v)), notes: INVENTORY_NOTES},
    constraints: {formulas: items.map(x => constraintsView(x.formula, x.e)), scoringText: SCORING_TEXT, exclusionTitle: '被排除的結構（全部分子式合計）', exclusions: exclusionLines(exclusionStats(items.map(x => x.e), rejected)).length ? exclusionLines(exclusionStats(items.map(x => x.e), rejected)) : ['沒有結構被葉端檢查或下游規則排除']},
  };
}

/** The v1.2.1 section: where the O floor comes from, the S decision, how many formulas ran in which round and why the others did not. */
export function planningView(c: CompositionInferenceResult): PlanningView {
  const v = c.v121!;
  const of = v.oxygenFloor;
  const oxygenText = of
    ? `O 下限 ${of.floor}（來源：${of.sources.length ? of.sources.map(x => x.text).join('；') : 'IR 沒有寬 O–H、強 C=O 或強 C–O 的觀測帶'}）；O 超過下限 ＋${V12_CONFIG.planning.oxygenAllowedAboveFloor} 起逐級扣分（只扣分，不剔除）；只有範圍比對的 IR 官能基（例如 1612 cm-1 被比成醯胺 I）不計入下限`
    : 'O 下限：此路徑沒有 IR 觀測帶可推導（或有質量依據），O 數不受 IR 下限限制';
  const plans = c.hypotheses.map(h => h.searchPlan).filter(Boolean) as NonNullable<CompositionInferenceResult['hypotheses'][number]['searchPlan']>[];
  const r1 = plans.filter(p => p.status === 'ROUND_1').length, r2 = plans.filter(p => p.status === 'ROUND_2').length;
  const counts = new Map<string, number>();
  for (const p of plans) if (p.status === 'NOT_SEARCHED' && p.reason) counts.set(p.reason, (counts.get(p.reason) ?? 0) + 1);
  return {
    title: '搜尋計畫（v1.2.1：k 輪流、兩輪預算）', oxygenText, sulfurText: v.sulfurConsidered ? null : SULFUR_TEXT,
    summary: `共 ${r1 + r2} 個分子式被搜尋：${r1} 個只跑第一輪（不含烯基的讀法）、${r2} 個也跑了第二輪（含烯基）；${[...counts.values()].reduce((a, b) => a + b, 0)} 個列在清單內但未搜尋。`,
    notSearched: [...counts].map(([reason, count]) => ({reason, label: NOT_SEARCHED_LABEL[reason] ?? reason, count})),
  };
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
    limitations: [...FIXED_LIMITATIONS, ...(c.v121 ? [PLANNING_LIMITATION] : []), ...c.limitations],
    ...(c.v121 ? {planning: planningView(c)} : {}),
    ...v12Sections(c, runOf, input.rejectedCandidates ?? []),
  };
}

/** The "no candidate" explanation of a finished analysis, or null (flag off, nothing to explain, or candidates exist). */
export function zeroCandidateModel(result: {
  rankedCandidates: unknown[];
  rejectedCandidates: {violatedConstraints: string[]}[];
  generationStatus?: {userFormula: string | null};
  reasoningTrace?: {compositionSearch?: {runs: CompositionSearchRun[]}; observations: {modality: string; optional?: boolean; coverage: string}[]};
}): ZeroCandidateExplanation | null {
  if (result.rankedCandidates.length) return null;
  const h1 = (result.reasoningTrace?.observations ?? []).filter(o => o.modality === '1H_NMR' && !o.optional);
  return zeroCandidateExplanation({
    runs: (result.reasoningTrace?.compositionSearch?.runs ?? []).map(r => r.enumeration), userFormula: result.generationStatus?.userFormula ?? null,
    rejectedCandidates: result.rejectedCandidates, reasonLabel: REASON_LABEL, coverageUnconfirmed: h1.length > 0 && h1.some(o => o.coverage !== 'CONFIRMED_COMPLETE'),
  });
}
