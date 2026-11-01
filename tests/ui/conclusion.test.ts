import {beforeAll, describe, expect, it} from 'vitest';
import {CLOSE_SCORE_GAP, conclusionBullets, firstSentence, pickTopWarning, searchStatusSentence} from '../../src/ui/conclusion';
import {buildDataCheck, type DataCheckSpectrum} from '../../src/ui/dataCheck';
import type {ObservationLike} from '../../src/ui/obsLabel';
import type {TraceEvidenceLike} from '../../src/ui/evidenceMerge';
import {s1Analysis} from './s1Analysis';

// Conclusion-card wording (v1.2.2 P4, DESIGN_REPORT B1.3) on hand-made data and on the real analysis of the synthetic S1 fixture.
const h1Image = (source: string, extra: Record<string, unknown> = {}): DataCheckSpectrum => ({
  sourceType: 'IMAGE_EXPERIMENTAL', digitizedFromImage: true, nmrSolvent: 'CDCl3', spectrometerFrequencyMHz: 400,
  imageCalibration: {source} as never, ...extra,
});
const good = {nmrSolvent: 'CDCl3', spectrometerFrequencyMHz: 400} as DataCheckSpectrum;

describe('pickTopWarning: priority calibration > incomplete search > close top two', () => {
  const uncalibrated = buildDataCheck({'1H_NMR': h1Image('AI_DETECTED')});
  const calibrated = buildDataCheck({'1H_NMR': h1Image('USER_CALIBRATED')});
  it('an uncalibrated ¹H image wins over everything else', () => {
    const w = pickTopWarning({dataCheck: uncalibrated, generationCode: 'PARTIAL_CANDIDATES', scores: [70, 69]});
    expect(w).toEqual({kind: 'calibration', text: '¹H 未經校正——排名可能不可靠'});
  });
  it('a calibrated ¹H image does not warn about calibration; an incomplete search is next', () => {
    for (const code of ['PARTIAL_CANDIDATES', 'CANCELLED', 'TIME_BUDGET', 'STATE_BUDGET', 'SEARCH_INCOMPLETE', 'SEARCH_LIMIT']) {
      expect(pickTopWarning({dataCheck: calibrated, generationCode: code, scores: [70, 69]})).toEqual({kind: 'incomplete', text: '窮舉未完整——清單只是目前限制下找到的結構'});
    }
  });
  it('a finished search with the top two less than 5 apart (shown as whole numbers) says how many points', () => {
    expect(pickTopWarning({dataCheck: calibrated, generationCode: 'CANDIDATES_FOUND', scores: [78.4, 74.2]})).toEqual({kind: 'close', text: '前兩名只差 4 分，不能視為有區別'});
    expect(pickTopWarning({dataCheck: calibrated, generationCode: 'CANDIDATES_FOUND', scores: [70, 70]})?.text).toBe('前兩名只差 0 分，不能視為有區別');
  });
  it('the gap threshold is a single constant (5): a gap of exactly 5 is not a warning', () => {
    expect(CLOSE_SCORE_GAP).toBe(5);
    expect(pickTopWarning({dataCheck: calibrated, generationCode: 'CANDIDATES_FOUND', scores: [75, 70]})).toBeNull();
    expect(pickTopWarning({dataCheck: calibrated, generationCode: 'CANDIDATES_FOUND', scores: [74.6, 70.4]})).toBeNull(); // shown as 75 and 70
  });
  it('nothing to warn about: calibrated, complete, one candidate or none, no data check', () => {
    expect(pickTopWarning({dataCheck: calibrated, generationCode: 'CANDIDATES_FOUND', scores: [80]})).toBeNull();
    expect(pickTopWarning({dataCheck: null, generationCode: undefined, scores: []})).toBeNull();
  });
  it('solvent and frequency warnings stay in the data-check line: they are not the conclusion warning', () => {
    const solventOnly = buildDataCheck({'1H_NMR': {...h1Image('USER_CALIBRATED'), nmrSolvent: 'Unknown', spectrometerFrequencyMHz: undefined}});
    expect(solventOnly.warnCount).toBe(0); // blue info only (stop 4)
    expect(solventOnly.items.filter(i => i.level === 'info').map(i => i.id)).toEqual(['solvent', 'frequency']);
    expect(pickTopWarning({dataCheck: solventOnly, generationCode: 'CANDIDATES_FOUND', scores: [80, 50]})).toBeNull();
  });
  it('IR or pixel-mark warnings are reported when ¹H is fine', () => {
    const ir = buildDataCheck({'1H_NMR': good, IR: {sourceType: 'IMAGE_EXPERIMENTAL', digitizedFromImage: true, imageCalibration: {source: 'DEFAULT_FALLBACK'} as never}});
    expect(pickTopWarning({dataCheck: ir, generationCode: 'CANDIDATES_FOUND', scores: [80, 50]})?.text).toBe('IR 未經校正——排名可能不可靠');
    const pixels = buildDataCheck({'1H_NMR': {...good, peaks: [{isCalibrated: false}] as never}});
    expect(pickTopWarning({dataCheck: pixels, generationCode: 'CANDIDATES_FOUND', scores: [80, 50]})?.text).toBe('仍有標記是像素（座標未確定）——排名可能不可靠');
  });
});

describe('searchStatusSentence', () => {
  it('one sentence per code, with the candidate count', () => {
    expect(searchStatusSentence('CANDIDATES_FOUND', 3, 'x')).toContain('取得 3 個候選');
    expect(searchStatusSentence('PARTIAL_CANDIDATES', 13, 'x')).toBe('搜尋沒有走完，取得 13 個候選；清單只是目前限制下找到的結構。');
    expect(searchStatusSentence('CANCELLED', 2, 'x')).toBe('搜尋已取消，保留 2 個已驗證候選。');
  });
  it('other codes use the first sentence of the engine message; a missing message has a fallback', () => {
    expect(searchStatusSentence('NO_MATCH_WITHIN_SEARCH', 0, '指定圖文法的有限搜尋未取得符合條件的候選；不是全部化學結構已被排除。第二句。')).toBe('指定圖文法的有限搜尋未取得符合條件的候選；不是全部化學結構已被排除。');
    expect(searchStatusSentence(undefined, 0, undefined)).toBe('尚無搜尋結果。');
    expect(firstSentence('沒有句點')).toBe('沒有句點');
  });
});

describe('conclusionBullets (hand-made evidence)', () => {
  const ev = (modality: string, status: TraceEvidenceLike['status'], id: string): TraceEvidenceLike => ({modality, status, observationIds: [id]});
  const observations: ObservationLike[] = [{id: 'IR:f:3030', modality: 'IR', value: 3030}, {id: 'IR:f:560', modality: 'IR', value: 560}, {id: '1H_NMR:f:7.1', modality: '1H_NMR', value: 7.1}];
  const evidence: TraceEvidenceLike[] = [
    ...Array.from({length: 8}, (_, i) => ev('IR', 'SUPPORT', `IR:f:${1600 - i}`)), ev('IR', 'UNKNOWN', 'IR:f:3030'), ev('IR', 'CONTRADICTION', 'IR:f:560'),
    ev('1H_NMR', 'SUPPORT', '1H_NMR:f:7.1'), ev('1H_NMR', 'SUPPORT', '1H_NMR:f:6.8'), ev('1H_NMR', 'SUPPORT', '1H_NMR:f:3.7'), ev('1H_NMR', 'UNKNOWN', '1H_NMR:f:1.2'),
  ];
  it('¹H first, then IR, then where the formula came from (three lines at most)', () => {
    const lines = conclusionBullets({evidence, observations, userFormula: null, candidateFormula: 'C15H16O2'});
    expect(lines).toEqual([
      '¹H：4 組訊號中 3 組與預測一致，1 組不明（1.20）',
      'IR：10 個峰中 8 個與預測一致，1 個不明（3030）、1 個矛盾（560）',
      '分子式：未指定，由證據組出 C15H16O2',
    ]);
  });
  it('a declared formula is named as such; a spectrum without evidence produces no line', () => {
    const lines = conclusionBullets({evidence: evidence.filter(e => e.modality === 'IR'), observations, userFormula: 'C15H16O2', candidateFormula: 'C15H16O2'});
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^IR：/);
    expect(lines[1]).toBe('分子式：使用者指定 C15H16O2');
  });
  it('evidence that is not a spectrum (formula, chemical notes) produces no spectrum line', () => {
    const lines = conclusionBullets({evidence: [ev('FORMULA', 'SUPPORT', 'formula:C2H6O'), ev('IR', 'SUPPORT', 'IR:f:1700')], userFormula: null, candidateFormula: 'C2H6O'});
    expect(lines).toEqual(['IR：1 個峰中 1 個與預測一致', '分子式：未指定，由證據組出 C2H6O']);
  });
  it('no evidence at all still gives the formula line', () => {
    expect(conclusionBullets({evidence: [], userFormula: null, candidateFormula: 'C2H6O'})).toEqual(['分子式：未指定，由證據組出 C2H6O']);
  });
  it('more than two spectra: only two spectrum lines are kept, ¹H and IR before the others', () => {
    const many = [ev('MS', 'SUPPORT', 'MS:f:105'), ev('13C_NMR', 'SUPPORT', '13C_NMR:f:65'), ev('IR', 'SUPPORT', 'IR:f:1700')];
    const lines = conclusionBullets({evidence: many, userFormula: null, candidateFormula: 'C2H6O'});
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^IR：/);
    expect(lines[1]).toMatch(/^¹³C：/);
  });
});

describe('conclusionBullets on the synthetic S1 analysis', () => {
  let first: ReturnType<typeof conclusionBullets> = [];
  beforeAll(async () => {
    const r = await s1Analysis();
    const trace = r.reasoningTrace!;
    const rec = trace.candidates[0];
    first = conclusionBullets({evidence: rec.evidence as unknown as TraceEvidenceLike[], observations: trace.observations as unknown as ObservationLike[], userFormula: null, candidateFormula: rec.formula});
  }, 60000);
  it('at most three lines, none with a number of three or more decimals', () => {
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(3);
    for (const line of first) expect(line).not.toMatch(/\d+\.\d{3,}/);
    expect(first[first.length - 1]).toMatch(/^分子式：/);
  });
});
