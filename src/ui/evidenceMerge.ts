import {fmtWavenumber} from './format';
import {matchFinding, type FunctionalGroupRow, type IrFindingRow} from './irEvidenceFilter';
import {obsLabel, type ObservationLike} from './obsLabel';

/**
 * Evidence merging for the result page (v1.2.2, DESIGN_REPORT B1.6): same-name functional groups become one row; one candidate's evidence is summarised per spectrum.
 * Display layer only: it reads the analysis output and builds view models, it never changes it.
 */

// ---------------------------------------------------------------- functional groups
export type GroupLevel = 'SUPPORTED' | 'POSSIBLE' | 'WEAK';
export const GROUP_LEVEL_TEXT: Record<GroupLevel, string> = {SUPPORTED: '較支持', POSSIBLE: '可能', WEAK: '證據不足'};
export type BandShapeTag = '寬' | '窄' | null;

export interface MergedGroup {
  name: string;
  family: string;
  modalities: string[];
  /** Observed IR peaks (cm⁻¹) of all rows, strongest-first order of the input removed: sorted from high to low wavenumber, without duplicates. */
  irPeaks: number[];
  /** 「3 個 IR 峰：1612、1510、1440 cm⁻¹」 or the signal of a non-IR row. */
  peakText: string;
  level: GroupLevel;
  levelText: string;
  /** Wide / narrow absorption band, shown as a small tag when the engine determined one for the group's IR rows. */
  bandShape: BandShapeTag;
  /** Companion bands observed for the group (union over rows). */
  companionBands: string[];
  /** Constraint status of the strongest-restricting row (REQUIRED etc.), or null when every row is an ordinary candidate. */
  restrictingStatus: string | null;
  /** Indexes into the input rows, in input order. */
  rowIndexes: number[];
  rowCount: number;
}

const LEVEL_RANK: Record<GroupLevel, number> = {SUPPORTED: 2, POSSIBLE: 1, WEAK: 0};
const RESTRICTING = ['REQUIRED', 'FORBIDDEN', 'EXCLUDED', 'CONFLICTING'];

/** Wide/narrow tag from the engine's shape text ("broad；區間 未標記；寬度 540" / "sharp…" / "UNRESOLVED…"). Anything else → no tag. */
export function bandShapeTag(shapeText: string | undefined): BandShapeTag {
  const t = (shapeText ?? '').trim().toLowerCase();
  if (/^(very_broad|broad)/.test(t)) return '寬';
  if (/^(sharp|narrow)/.test(t)) return '窄';
  return null;
}

function levelOf(row: FunctionalGroupRow, finding: IrFindingRow | null): GroupLevel {
  if (finding) return finding.matchLevel === 'Strong' ? 'SUPPORTED' : finding.matchLevel === 'Moderate' ? 'POSSIBLE' : 'WEAK';
  return row.status === 'SUPPORTED' || row.status === 'REQUIRED' ? 'SUPPORTED' : 'POSSIBLE';
}

export function mergeFunctionalGroups(groups: readonly FunctionalGroupRow[], findings: readonly IrFindingRow[]): MergedGroup[] {
  const order: string[] = [];
  const by = new Map<string, {row: FunctionalGroupRow; finding: IrFindingRow | null; index: number}[]>();
  groups.forEach((row, index) => {
    const name = row.label || row.groupName || row.groupFamily;
    const finding = row.sourceModality === 'IR' ? matchFinding(row, findings) : null;
    if (!by.has(name)) { by.set(name, []); order.push(name); }
    by.get(name)!.push({row, finding, index});
  });
  return order.map(name => {
    const entries = by.get(name)!;
    const irPeaks = [...new Set(entries.flatMap(e => e.finding?.observedPeaks ?? (e.finding ? [e.finding.observedPeak] : [])))].sort((a, b) => b - a);
    const level = entries.map(e => levelOf(e.row, e.finding)).reduce((best, l) => (LEVEL_RANK[l] > LEVEL_RANK[best] ? l : best), 'WEAK' as GroupLevel);
    const shapes = entries.flatMap(e => (e.finding ? [bandShapeTag(e.finding.observedWidthAndShape)] : []));
    const nonIr = entries.filter(e => e.row.sourceModality !== 'IR');
    const modalities = [...new Set(entries.flatMap(e => e.row.sourceModalities?.length ? e.row.sourceModalities : [e.row.sourceModality]))].map(String);
    const peakText = irPeaks.length
      ? `${irPeaks.length} 個 IR 峰：${irPeaks.map(fmtWavenumber).join('、')} cm⁻¹`
      : nonIr.map(e => e.row.observedSignal ?? '').filter(Boolean).join('；');
    return {
      name, family: entries[0].row.groupFamily, modalities, irPeaks, peakText, level, levelText: GROUP_LEVEL_TEXT[level],
      bandShape: shapes.find(s => s !== null) ?? null,
      companionBands: [...new Set(entries.flatMap(e => e.finding?.companionPeaksObserved ?? []))],
      restrictingStatus: entries.map(e => e.row.status).find(s => RESTRICTING.includes(s)) ?? null,
      rowIndexes: entries.map(e => e.index), rowCount: entries.length,
    };
  });
}

// ---------------------------------------------------------------- one candidate's evidence per spectrum
export interface TraceEvidenceLike {observationIds: string[]; modality: string; status: string; method?: string}
export interface ModalitySummary {
  modality: string;
  /** Unit of the counted items: 峰 (IR, MS) or 訊號 (NMR). */
  noun: '峰' | '訊號';
  total: number;
  support: number;
  contradiction: number;
  unknown: number;
  contradictionIds: string[];
  unknownIds: string[];
}
const MODALITY_ORDER = ['IR', '1H_NMR', '13C_NMR', 'MS', 'MS/MS', 'ToF-SIMS'];
export const MODALITY_SHORT: Record<string, string> = {IR: 'IR', '1H_NMR': '¹H', '13C_NMR': '¹³C', MS: 'MS', 'MS/MS': 'MS/MS', 'ToF-SIMS': 'ToF-SIMS'};

/** Evidence items that stand for one observed signal. Whole-spectrum checks (e.g. 「預測 3 種氫環境，實測 3 組訊號」) carry no observation id and are not counted as signals. */
export const perSignalEvidence = <T extends TraceEvidenceLike>(evidence: readonly T[]): T[] => evidence.filter(e => e.observationIds.length > 0);

/** Counts the three states (SUPPORT / CONTRADICTION / UNKNOWN) of one candidate's evidence per spectrum; spectra without evidence produce no entry. */
export function summarizeCandidateEvidence(evidence: readonly TraceEvidenceLike[]): ModalitySummary[] {
  const by = new Map<string, ModalitySummary>();
  for (const e of evidence) {
    const s = by.get(e.modality) ?? {modality: e.modality, noun: e.modality.endsWith('NMR') ? '訊號' as const : '峰' as const, total: 0, support: 0, contradiction: 0, unknown: 0, contradictionIds: [], unknownIds: []};
    s.total += 1;
    if (e.status === 'SUPPORT') s.support += 1;
    else if (e.status === 'CONTRADICTION') { s.contradiction += 1; s.contradictionIds.push(...e.observationIds); }
    else { s.unknown += 1; s.unknownIds.push(...e.observationIds); }
    by.set(e.modality, s);
  }
  const rank = (m: string) => (MODALITY_ORDER.includes(m) ? MODALITY_ORDER.indexOf(m) : MODALITY_ORDER.length);
  return [...by.values()].sort((a, b) => rank(a.modality) - rank(b.modality));
}

/** 「IR：10 個峰中 8 個與預測一致，1 個不明（3030）、1 個矛盾（560）」. Ids are turned into short values (IR 3030 cm⁻¹ → 3030) when they can be resolved. */
export function summaryLine(s: ModalitySummary, observations?: readonly ObservationLike[]): string {
  const value = (id: string) => obsLabel(id, observations).replace(/^\S+\s/, '').replace(/\s*(cm⁻¹|ppm)$/, '');
  const unit = s.noun === '峰' ? '個' : '組';
  const list = (ids: string[]) => { const v = [...new Set(ids.map(value))]; return v.length ? `（${v.slice(0, 4).join('、')}${v.length > 4 ? '…' : ''}）` : ''; };
  const rest = [
    ...(s.unknown ? [`${s.unknown} ${unit}不明${list(s.unknownIds)}`] : []),
    ...(s.contradiction ? [`${s.contradiction} ${unit}矛盾${list(s.contradictionIds)}`] : []),
  ];
  return `${MODALITY_SHORT[s.modality] ?? s.modality}：${s.total} ${s.noun === '峰' ? '個峰' : '組訊號'}中 ${s.support} ${unit}與預測一致${rest.length ? `，${rest.join('、')}` : ''}`;
}
