import {beforeAll, describe, expect, it} from 'vitest';
import {bandShapeTag, mergeFunctionalGroups, summarizeCandidateEvidence, summaryLine, type TraceEvidenceLike} from '../../src/ui/evidenceMerge';
import type {FunctionalGroupRow, IrFindingRow} from '../../src/ui/irEvidenceFilter';
import type {ObservationLike} from '../../src/ui/obsLabel';
import {s1Analysis} from './s1Analysis';

// Evidence merging (v1.2.2 DESIGN_REPORT B1.6) on the real analysis of the synthetic S1 fixture, plus hand-made edge cases.
let rows: FunctionalGroupRow[] = [];
let findings: IrFindingRow[] = [];
let evidence: TraceEvidenceLike[] = [];
let observations: ObservationLike[] = [];
beforeAll(async () => {
  const r = await s1Analysis();
  rows = r.modeAReport!.constraints.functionalGroups as FunctionalGroupRow[];
  findings = r.modeAReport!.irFindings as unknown as IrFindingRow[];
  observations = r.reasoningTrace!.observations as unknown as ObservationLike[];
  evidence = r.reasoningTrace!.candidates.find(c => c.smiles === 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1')!.evidence as unknown as TraceEvidenceLike[];
}, 60000);

describe('mergeFunctionalGroups', () => {
  it('29 rows become 19 named groups, in the order of first appearance, with every row index used once', () => {
    const m = mergeFunctionalGroups(rows, findings);
    expect(m).toHaveLength(19);
    expect(m.reduce((n, g) => n + g.rowCount, 0)).toBe(29);
    expect(m.flatMap(g => g.rowIndexes).sort((a, b) => a - b)).toEqual(rows.map((_, i) => i));
    expect(m[0].name).toBe('酚 O–H');
  });
  it('aromatic C=C: three IR peaks become one row "3 個 IR 峰：1612、1510、1440 cm⁻¹" (high to low)', () => {
    const g = mergeFunctionalGroups(rows, findings).find(x => x.name === '芳環骨架 C=C')!;
    expect(g.rowCount).toBe(3);
    expect(g.irPeaks).toEqual([1612, 1510, 1440]);
    expect(g.peakText).toBe('3 個 IR 峰：1612、1510、1440 cm⁻¹');
    expect(g.level).toBe('SUPPORTED');
    expect(g.levelText).toBe('較支持');
  });
  it('phenol C–O: two rows merge (1235 and 1175)', () => {
    const g = mergeFunctionalGroups(rows, findings).find(x => x.name === '酚 C–O')!;
    expect(g.irPeaks).toEqual([1235, 1175]);
    expect(g.rowCount).toBe(2);
  });
  it('weak groups are "證據不足", moderate ones "可能"; the ¹H row has no IR peaks and keeps its own signal text', () => {
    const m = mergeFunctionalGroups(rows, findings);
    expect(m.find(x => x.name === '二級胺 N–H')!.levelText).toBe('證據不足');
    expect(m.find(x => x.name === '烯烴 C=C')!.levelText).toBe('可能');
    const h1 = m.find(x => x.modalities.includes('1H_NMR'))!;
    expect(h1.irPeaks).toEqual([]);
    expect(h1.peakText).toContain('4.75');
  });
  it('the phenol O–H group carries the "寬" tag (the 3350 band is broad) and its companion bands', () => {
    const g = mergeFunctionalGroups(rows, findings).find(x => x.name === '酚 O–H')!;
    expect(g.bandShape).toBe('寬');
    expect(g.companionBands).toEqual(['1180–1270 cm⁻¹', '1450–1620 cm⁻¹']);
  });
  it('restricting statuses are reported on the merged row', () => {
    const r = [{label: 'A', groupFamily: 'X', status: 'REQUIRED', sourceModality: 'IR', observedSignal: '1700 cm⁻¹'}, {label: 'A', groupFamily: 'X', status: 'CANDIDATE', sourceModality: 'IR', observedSignal: '1650 cm⁻¹'}] as FunctionalGroupRow[];
    expect(mergeFunctionalGroups(r, [])[0].restrictingStatus).toBe('REQUIRED');
    expect(mergeFunctionalGroups(r, [])[0].rowCount).toBe(2);
  });
});

describe('bandShapeTag', () => {
  it('broad → 寬, sharp → 窄, unresolved or empty → no tag', () => {
    expect(bandShapeTag('broad；區間 未標記；寬度 540')).toBe('寬');
    expect(bandShapeTag('very_broad')).toBe('寬');
    expect(bandShapeTag('SHARP；寬度 12')).toBe('窄');
    expect(bandShapeTag('UNRESOLVED；區間 未標記')).toBeNull();
    expect(bandShapeTag(undefined)).toBeNull();
  });
});

describe('summarizeCandidateEvidence', () => {
  it('the S1 target: IR 10 items = 8 support, 1 unknown, 1 contradiction; ¹H 6 items = 5 support, 1 unknown', () => {
    const s = summarizeCandidateEvidence(evidence);
    expect(s.map(x => x.modality)).toEqual(['IR', '1H_NMR']);
    expect(s[0]).toMatchObject({total: 10, support: 8, unknown: 1, contradiction: 1, noun: '峰'});
    expect(s[1]).toMatchObject({total: 6, support: 5, unknown: 1, contradiction: 0, noun: '訊號'});
  });
  it('the line names the unknown and the contradicting peak', () => {
    const [ir, h1] = summarizeCandidateEvidence(evidence);
    expect(summaryLine(ir, observations)).toMatch(/^IR：10 個峰中 8 個與預測一致，1 個不明（\d+）、1 個矛盾（\d+）$/);
    expect(summaryLine(h1, observations)).toMatch(/^¹H：6 組訊號中 5 組與預測一致，1 組不明（/);
  });
  it('modalities without evidence produce no entry; the order is fixed (IR, ¹H, ¹³C, MS…)', () => {
    const ev: TraceEvidenceLike[] = [
      {observationIds: ['MS:f:105'], modality: 'MS', status: 'SUPPORT'}, {observationIds: ['13C_NMR:f:65'], modality: '13C_NMR', status: 'CONTRADICTION'}, {observationIds: ['IR:f:1700'], modality: 'IR', status: 'SUPPORT'},
    ];
    const s = summarizeCandidateEvidence(ev);
    expect(s.map(x => x.modality)).toEqual(['IR', '13C_NMR', 'MS']);
    expect(summaryLine(s[1])).toBe('¹³C：1 組訊號中 0 組與預測一致，1 組矛盾（65）');
    expect(summarizeCandidateEvidence([])).toEqual([]);
  });
  it('a line without unknown or contradicting items is just the agreement count', () => {
    const s = summarizeCandidateEvidence([{observationIds: ['IR:f:1700'], modality: 'IR', status: 'SUPPORT'}]);
    expect(summaryLine(s[0])).toBe('IR：1 個峰中 1 個與預測一致');
  });
});
