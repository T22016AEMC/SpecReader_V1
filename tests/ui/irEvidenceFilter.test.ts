import {beforeAll, describe, expect, it} from 'vitest';
import {filterIrEvidence, hiddenNotice, IR_WEAK_RULE, matchFinding, type FunctionalGroupRow, type IrFindingRow, type IrWeakRule} from '../../src/ui/irEvidenceFilter';
import {s1Analysis} from './s1Analysis';

// "IR 證據不足" display filter (v1.2.2, decision D2). The real S1 numbers (hand-written fixture): 29 rows, 19 groups; v1.2.2: 7 hidden, 12 shown. v1.2.3 (A8): a broad O–H / N–H band is never hidden,
// so the broad 3350 group '氫鍵 O–H' moves from hidden to shown: 6 hidden (10 rows), 13 shown (the changed expectations below are marked "A8").
let rows: FunctionalGroupRow[] = [];
let findings: IrFindingRow[] = [];
beforeAll(async () => {
  const r = await s1Analysis();
  rows = r.modeAReport!.constraints.functionalGroups as FunctionalGroupRow[];
  findings = r.modeAReport!.irFindings as unknown as IrFindingRow[];
}, 60000);

const HIDDEN_S1 = ['硝基 NO₂ 伸縮對', '三級胺 C–N', '醚 C–O–C', 'C–F 指紋', '胺 C–N', 'C–Br 指紋'];

describe('filterIrEvidence on the real S1 analysis', () => {
  it('29 rows merge to 19 groups; 6 are hidden and 13 shown (13 + 6 = 19, nothing lost; A8: was 7 and 12)', () => {
    expect(rows).toHaveLength(29);
    expect(findings).toHaveLength(28);
    const r = filterIrEvidence(rows, findings);
    expect(r.total).toBe(19);
    expect(r.shownCount).toBe(13);
    expect(r.hiddenCount).toBe(6);
    expect(r.shownCount + r.hiddenCount).toBe(r.total);
    expect(r.hiddenRowCount).toBe(10);
    expect(r.hidden.map(g => g.name).sort()).toEqual([...HIDDEN_S1].sort());
    expect(r.groups.flatMap(g => g.rowIndexes).sort((a, b) => a - b)).toEqual(rows.map((_, i) => i));
  });
  it('the two N–H groups stay visible (A8: they are broad 3350 bands, so the reason is BROAD_XH, was COMPANION_OBSERVED) and the ¹H row is never touched', () => {
    const r = filterIrEvidence(rows, findings);
    const shown = r.shown.map(g => g.name);
    expect(shown).toEqual(expect.arrayContaining(['二級胺 N–H', '一級胺 N–H']));
    const exchangeable = r.groups.find(g => g.rows.some(x => x.sourceModality === '1H_NMR'))!;
    expect(exchangeable.hidden).toBe(false);
    expect(exchangeable.reason).toBe('NOT_IR_ONLY');
    expect(r.groups.find(g => g.name === '二級胺 N–H')!.reason).toBe('BROAD_XH');
    expect(r.groups.find(g => g.name === '氫鍵 O–H')!.reason).toBe('BROAD_XH');
  });
  it('multi-peak groups are shown (chelated OH has 3 rows, aromatic C=C 3 rows)', () => {
    const r = filterIrEvidence(rows, findings);
    const aromatic = r.groups.find(g => g.name === '芳環骨架 C=C')!;
    expect(aromatic.rows).toHaveLength(3);
    expect(aromatic.hidden).toBe(false);
  });
  it('the filter does not change its input and the hidden rows are still there (display only)', () => {
    const before = JSON.stringify(rows);
    const r = filterIrEvidence(rows, findings);
    expect(JSON.stringify(rows)).toBe(before);
    expect(r.hidden.flatMap(g => g.rows).length).toBe(10);
    expect(hiddenNotice(r)).toBe('另有 6 項 IR 證據不足的官能基，已隱藏（點開查看）');
  });
  it('a stricter or looser rule changes the numbers through the single settings object', () => {
    const loose: IrWeakRule = {...IR_WEAK_RULE, minCompanions: 2};
    expect(filterIrEvidence(rows, findings, loose).hiddenCount).toBeGreaterThan(7);
    const off: IrWeakRule = {...IR_WEAK_RULE, minCompanions: 0};
    expect(filterIrEvidence(rows, findings, off).hiddenCount).toBe(0);
  });
});

// ---- boundary cases with hand-made rows
const row = (label: string, over: Partial<FunctionalGroupRow> = {}): FunctionalGroupRow => ({label, groupFamily: 'X', status: 'CANDIDATE', sourceModality: 'IR', observedSignal: '1700 cm⁻¹ (sharp)', ...over});
const finding = (name: string, peaks: number[], companions: string[], over: Partial<IrFindingRow> = {}): IrFindingRow => ({
  id: `ir-range-${name}-${peaks.join('-')}`, functionalGroup: name, observedPeak: peaks[0], observedPeaks: peaks, companionPeaksObserved: companions, matchLevel: 'Moderate', status: 'POSSIBLE', ...over,
});

describe('filterIrEvidence boundaries', () => {
  it('one isolated peak with no companion band is hidden', () => {
    const r = filterIrEvidence([row('A')], [finding('A', [1700], [])]);
    expect(r.hidden.map(g => g.name)).toEqual(['A']);
    expect(r.groups[0].reason).toBe('WEAK_IR_ONLY');
  });
  it('exactly one companion band → shown (boundary of minCompanions)', () => {
    const r = filterIrEvidence([row('A')], [finding('A', [1700], ['1100–1250 cm⁻¹'])]);
    expect(r.hiddenCount).toBe(0);
    expect(r.groups[0].reason).toBe('COMPANION_OBSERVED');
  });
  it('two observed peaks → shown (boundary of maxPeaks); the rule object can move that boundary', () => {
    const rowsA = [row('A')], f = [finding('A', [1700, 1650], [])];
    expect(filterIrEvidence(rowsA, f).hiddenCount).toBe(0);
    expect(filterIrEvidence(rowsA, f).groups[0].reason).toBe('MORE_THAN_ONE_PEAK');
    expect(filterIrEvidence(rowsA, f, {...IR_WEAK_RULE, maxPeaks: 2}).hiddenCount).toBe(1);
  });
  it('REQUIRED, FORBIDDEN, EXCLUDED and CONFLICTING rows are never hidden, even when weak', () => {
    for (const status of ['REQUIRED', 'FORBIDDEN', 'EXCLUDED', 'CONFLICTING'] as const) {
      const r = filterIrEvidence([row('A', {status})], [finding('A', [1700], [])]);
      expect(r.hiddenCount).toBe(0);
      expect(r.groups[0].reason).toBe('NEVER_HIDE_STATUS');
    }
    expect(filterIrEvidence([row('A', {status: 'PROBABLE'})], [finding('A', [1700], [])]).hiddenCount).toBe(1);
  });
  it('a group with a restricting row among weak rows is shown as a whole', () => {
    const r = filterIrEvidence([row('A'), row('A', {status: 'REQUIRED', observedSignal: '1650 cm⁻¹'})], [finding('A', [1700], []), finding('A', [1650], [])]);
    expect(r.hiddenCount).toBe(0);
  });
  it('a group is hidden only if EVERY row of that name is weak', () => {
    const r = filterIrEvidence([row('A'), row('A', {observedSignal: '1650 cm⁻¹'})], [finding('A', [1700], []), finding('A', [1650], ['x'])]);
    expect(r.hiddenCount).toBe(0);
    expect(r.groups).toHaveLength(1);
  });
  it('a row that another spectrum also reports is shown (IR is not its only source)', () => {
    const r = filterIrEvidence([row('A'), row('A', {sourceModality: '1H_NMR', observedSignal: 'δ 4.75'})], [finding('A', [1700], [])]);
    expect(r.hiddenCount).toBe(0);
    expect(r.groups[0].reason).toBe('NOT_IR_ONLY');
    expect(filterIrEvidence([row('A', {sourceModality: 'IR', sourceModalities: ['IR', 'MS']})], [finding('A', [1700], [])]).hiddenCount).toBe(0);
  });
  it('an IR row without a matching finding is shown (missing data → show, never hide)', () => {
    const r = filterIrEvidence([row('A')], []);
    expect(r.hiddenCount).toBe(0);
    expect(r.groups[0].reason).toBe('NO_FINDING');
  });
  it('matchFinding picks the finding of the row\'s own peak when a name has several', () => {
    const fs = [finding('A', [1700], []), finding('A', [1650], ['c'])];
    expect(matchFinding(row('A', {observedSignal: '1650 cm⁻¹ (broad)'}), fs)!.observedPeak).toBe(1650);
    expect(matchFinding(row('A', {observedSignal: '1234 cm⁻¹'}), fs)).toBeNull();
  });
  // A8 (v1.2.3): a broad O–H / N–H band is shown even when it is isolated.
  it('A8: an isolated broad band in 3200–3600 is shown (BROAD_XH); the same band sharp, or a broad band outside the window, is still hidden', () => {
    const broad = (name: string, peak: number, shape: string) => finding(name, [peak], [], {observedWidthAndShape: shape});
    const shown = filterIrEvidence([row('酚 O–H')], [broad('酚 O–H', 3338, 'broad；區間 未標記；寬度 540')]);
    expect(shown.hiddenCount).toBe(0);
    expect(shown.groups[0].reason).toBe('BROAD_XH');
    expect(filterIrEvidence([row('一級胺 N–H')], [broad('一級胺 N–H', 3338, 'broad；區間 未標記；寬度 540')]).groups[0].reason).toBe('BROAD_XH');
    expect(filterIrEvidence([row('酚 O–H')], [broad('酚 O–H', 3338, 'sharp；區間 未標記；寬度 12')]).groups[0].reason).toBe('WEAK_IR_ONLY');
    expect(filterIrEvidence([row('X')], [broad('X', 1650, 'broad；區間 未標記；寬度 200')]).groups[0].reason).toBe('WEAK_IR_ONLY');
    expect(filterIrEvidence([row('X')], [broad('X', 3338, '寬峰')]).groups[0].reason).toBe('BROAD_XH');
  });
  it('A8: the window is part of the rule object; a group with the exception stays in the data (display only) and an empty window restores the 1.2.2 behaviour', () => {
    const f = [finding('酚 O–H', [3338], [], {observedWidthAndShape: 'broad；區間 未標記'})];
    expect(filterIrEvidence([row('酚 O–H')], f, {...IR_WEAK_RULE, broadXhRangeCm1: [0, 0]}).hiddenCount).toBe(1);
    expect(IR_WEAK_RULE.broadXhRangeCm1).toEqual([3200, 3600]);
  });
  it('nothing hidden → no notice', () => {
    expect(hiddenNotice(filterIrEvidence([], []))).toBeNull();
  });
});
