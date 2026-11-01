import type {FunctionalGroupConstraint, IRFunctionalGroupFinding} from '../types/spectrum';

/**
 * "IR 證據不足" display filter of the 圖譜官能基 tab (v1.2.2, decision D2, DESIGN_REPORT B1.5).
 * A DISPLAY-LAYER filter: nothing is deleted, the hidden items stay in the data, in the export and in the diagnostic summary, and the page says how many are hidden.
 *
 * A functional group (all rows that share one name) is hidden only when ALL of these hold:
 *   1. IR is its only source: every row of that name is IR-sourced, and no ¹H/¹³C/MS row carries the same name;
 *   2. at most one isolated peak: every IR finding of the group has `observedPeaks.length ≤ maxPeaks`;
 *   3. no companion band was observed: every IR finding has fewer than `minCompanions` observed companion bands (0 when the knowledge entry defines none).
 * Rows whose constraint status is in `neverHide` are never hidden (they restrict the candidates; the user must see them).
 * A row without a matching IR finding is never hidden (missing data → show).
 */
export interface IrWeakRule {
  maxPeaks: number;
  minCompanions: number;
  neverHide: readonly FunctionalGroupConstraint['status'][];
}
export const IR_WEAK_RULE: IrWeakRule = {maxPeaks: 1, minCompanions: 1, neverHide: ['REQUIRED', 'FORBIDDEN', 'EXCLUDED', 'CONFLICTING']};

export type FunctionalGroupRow = Pick<FunctionalGroupConstraint, 'label' | 'groupName' | 'groupFamily' | 'status' | 'sourceModality' | 'sourceModalities' | 'observedSignal'>;
export type IrFindingRow = Pick<IRFunctionalGroupFinding, 'id' | 'functionalGroup' | 'observedPeak' | 'observedPeaks' | 'companionPeaksObserved' | 'matchLevel' | 'status'> & Partial<Pick<IRFunctionalGroupFinding, 'observedWidthAndShape'>>;

export interface FilteredGroup {
  /** Group name (the row label). */
  name: string;
  hidden: boolean;
  /** Why the group is shown or hidden, in one phrase. */
  reason: 'WEAK_IR_ONLY' | 'NEVER_HIDE_STATUS' | 'NOT_IR_ONLY' | 'MORE_THAN_ONE_PEAK' | 'COMPANION_OBSERVED' | 'NO_FINDING';
  rows: FunctionalGroupRow[];
  /** Indexes into the input `groups` array, in input order. */
  rowIndexes: number[];
  findings: IrFindingRow[];
}
export interface IrEvidenceFilterResult {
  groups: FilteredGroup[];
  shown: FilteredGroup[];
  hidden: FilteredGroup[];
  total: number;
  shownCount: number;
  hiddenCount: number;
  /** Number of individual IR comparisons (rows) inside the hidden groups. */
  hiddenRowCount: number;
}

const nameOf = (g: FunctionalGroupRow): string => g.label || g.groupName || g.groupFamily;
const isIrOnly = (g: FunctionalGroupRow): boolean => g.sourceModality === 'IR' && (g.sourceModalities ?? ['IR']).every(m => m === 'IR');
const peakCount = (f: IrFindingRow): number => f.observedPeaks?.length ?? 1;

/** The IR finding a row came from: same name and the finding's peak is the one the row's observed signal starts with ("3350 cm⁻¹ (broad…"). */
export function matchFinding(row: FunctionalGroupRow, findings: readonly IrFindingRow[]): IrFindingRow | null {
  const name = nameOf(row);
  const signalPeak = Number((row.observedSignal ?? '').match(/^\s*(\d+(?:\.\d+)?)/)?.[1]);
  const sameName = findings.filter(f => f.functionalGroup === name);
  if (!sameName.length) return null;
  if (Number.isFinite(signalPeak)) {
    const exact = sameName.find(f => f.observedPeak === signalPeak || f.observedPeaks?.includes(signalPeak));
    if (exact) return exact;
  }
  return sameName.length === 1 ? sameName[0] : null;
}

export function filterIrEvidence(groups: readonly FunctionalGroupRow[], findings: readonly IrFindingRow[], rule: IrWeakRule = IR_WEAK_RULE): IrEvidenceFilterResult {
  const byName = new Map<string, FilteredGroup>();
  groups.forEach((g, index) => {
    const name = nameOf(g);
    const entry = byName.get(name) ?? {name, hidden: false, reason: 'NO_FINDING' as FilteredGroup['reason'], rows: [], rowIndexes: [], findings: []};
    entry.rows.push(g);
    entry.rowIndexes.push(index);
    byName.set(name, entry);
  });
  for (const entry of byName.values()) {
    const matched = entry.rows.map(r => (isIrOnly(r) ? matchFinding(r, findings) : null));
    entry.findings = matched.filter((f): f is IrFindingRow => f !== null);
    if (entry.rows.some(r => rule.neverHide.includes(r.status))) { entry.reason = 'NEVER_HIDE_STATUS'; continue; }
    if (!entry.rows.every(isIrOnly)) { entry.reason = 'NOT_IR_ONLY'; continue; }
    if (matched.some(f => f === null)) { entry.reason = 'NO_FINDING'; continue; }
    if (entry.findings.some(f => peakCount(f) > rule.maxPeaks)) { entry.reason = 'MORE_THAN_ONE_PEAK'; continue; }
    if (entry.findings.some(f => f.companionPeaksObserved.length >= rule.minCompanions)) { entry.reason = 'COMPANION_OBSERVED'; continue; }
    entry.hidden = true;
    entry.reason = 'WEAK_IR_ONLY';
  }
  const all = [...byName.values()];
  const hidden = all.filter(g => g.hidden), shown = all.filter(g => !g.hidden);
  return {groups: all, shown, hidden, total: all.length, shownCount: shown.length, hiddenCount: hidden.length, hiddenRowCount: hidden.reduce((n, g) => n + g.rows.length, 0)};
}

/** The one line the page prints where the hidden groups are, or null when nothing is hidden. */
export const hiddenNotice = (r: IrEvidenceFilterResult): string | null => (r.hiddenCount > 0 ? `另有 ${r.hiddenCount} 項 IR 證據不足的官能基，已隱藏（點開查看）` : null);
