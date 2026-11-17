import {beforeAll, describe, expect, it} from 'vitest';
import {spectrum} from '../fixtures';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {inferComposition} from '../../src/engines/composition/inferComposition';
import type {CompositionHypothesis} from '../../src/engines/composition/types';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';

// v1.4.2 stop 32 (B). Pins the CURRENT behaviour of the "M+2 absent" branch of the MS composition inference; nothing in src/ changed.
// Why it matters: no product code sets observationCoverage to CONFIRMED_COMPLETE (stop 31 report, item 11), so in the product an absent M+2 is always "not marked" and never "confirmed absent".
//   - coverage not confirmed complete (the product's only state): an absent M+2 is NOT_MARKED -> no score, the hypothesis list says "未標記；不當作不存在", Cl / Br are NOT excluded because of it.
//   - coverage CONFIRMED_COMPLETE (set by hand here; no product control does it): an absent M+2 is ABSENT_COVERED (ratio 0) -> below the 10 % threshold -> Cl / Br are excluded for that ion, and the
//     isotope line is scored ("未檢出（完整峰表）").
// The second group documents the INTENT of the branch (what would happen if a control "confirm the table complete" were ever added); it does not say that the product behaves like this today.
// All peak lists are synthetic.
beforeAll(() => initializeRDKit());
type ParamsT = NonNullable<ExperimentalSpectrumData['msParams']>;
const ei = (peaks: Partial<SpectralPeak>[], extra: Partial<ExperimentalSpectrumData> = {}, params: Partial<ParamsT> = {}): ExperimentalSpectrumData =>
  ({...spectrum('MS', peaks.map((p, i) => ({id: `MS-${i}`, manualPeak: true, y: 100, ...p})) as SpectralPeak[]), msParams: {msType: 'EI-MS', ionization: 'EI', ...params}, ...extra}) as ExperimentalSpectrumData;
const run = (ms: ExperimentalSpectrumData) => {
  const prepared = WorkbenchOrchestrator.prepareModeAEvidence({MS: ms}, {});
  const plan = createReasoningPlan(prepared.bundle);
  return {prepared, r: inferComposition({bundle: prepared.bundle, observations: plan.observations, userFormula: plan.userFormula})};
};
const count = (h: CompositionHypothesis, e: string) => (h.counts as Record<string, number>)[e] ?? 0;
const molecularIon = (r: ReturnType<typeof run>['r']) => r.hypotheses.filter(h => h.ionHypothesisId === 'ion-0-M+');
const hasText = (h: CompositionHypothesis, list: 'support' | 'contradiction' | 'unknown', needle: string) => h[list].some(x => x.text.includes(needle));
// M at 150 (100 %) with an M+1 at 10 %; M+2 (m/z 152) is simply not in the list.
const NO_M2 = [{x: 150, y: 100}, {x: 151, y: 10}];

describe('MS: absent M+2 depends on the confirmed-complete state', () => {
  it('the default state of a peak table is "not confirmed complete" (the only state the product has)', () => {
    expect(run(ei(NO_M2)).prepared.bundle.scientificSources?.MS?.observationCoverage).toBe('PARTIAL_MARKERS');
  });

  it.each([['unset', undefined], ['PARTIAL_MARKERS', 'PARTIAL_MARKERS'], ['CONTINUOUS_TRACE', 'CONTINUOUS_TRACE']] as const)(
    'coverage %s: an absent M+2 is "not marked" and Cl / Br are not excluded because of it',
    (_label, coverage) => {
      const {r} = run(ei(NO_M2, coverage ? {observationCoverage: coverage} : {}));
      expect(r.status).toBe('INFERRED');
      expect(r.elementsExcluded.map(e => e.element)).not.toContain('Cl');
      expect(r.elementsExcluded.map(e => e.element)).not.toContain('Br');
      expect(r.elementsConsidered).toEqual(expect.arrayContaining(['Cl', 'Br']));
      const ion = molecularIon(r);
      expect(ion.length).toBeGreaterThan(0);
      // every hypothesis of the molecular ion says "M+2 not marked; not treated as absent" and nothing about a covered absence
      expect(ion.every(h => hasText(h, 'unknown', 'M+2/M 未標記；不當作不存在'))).toBe(true);
      expect(ion.some(h => hasText(h, 'support', '未檢出（完整峰表）') || hasText(h, 'contradiction', '未檢出（完整峰表）'))).toBe(false);
      // the exclusion is not applied: a halogen-containing formula is still allowed among the enumerated formulas
      expect(ion.some(h => count(h, 'Cl') > 0 || count(h, 'Br') > 0)).toBe(true);
      // and no limitation mentions an M+2-based halogen exclusion
      expect(r.limitations.some(l => l.includes('Cl／Br 只在下列離子假設中被 M+2 排除'))).toBe(false);
    });

  it('INTENT, coverage set to CONFIRMED_COMPLETE by hand: an absent M+2 is "confirmed absent", Cl / Br are excluded and the isotope line is scored', () => {
    const {r} = run(ei(NO_M2, {observationCoverage: 'CONFIRMED_COMPLETE'}));
    expect(r.status).toBe('INFERRED');
    const excluded = r.elementsExcluded.map(e => e.element);
    expect(excluded).toEqual(expect.arrayContaining(['Cl', 'Br']));
    const ion = molecularIon(r);
    expect(ion.length).toBeGreaterThan(0);
    expect(ion.some(h => count(h, 'Cl') > 0 || count(h, 'Br') > 0)).toBe(false);
    expect(ion.every(h => !hasText(h, 'unknown', 'M+2/M 未標記'))).toBe(true);
    expect(ion.some(h => hasText(h, 'support', 'M+2/M 觀測 未檢出（完整峰表）'))).toBe(true);
  });

  it('the two states differ only in that branch: same ion, same M+1, a different treatment of the missing M+2', () => {
    const open = run(ei(NO_M2)).r, closed = run(ei(NO_M2, {observationCoverage: 'CONFIRMED_COMPLETE'})).r;
    expect(open.ionHypotheses.map(i => i.neutralMass)).toEqual(closed.ionHypotheses.map(i => i.neutralMass));
    // a marked M+2 above the threshold behaves the same in both states (Cl allowed): the coverage state matters only for the ABSENT case
    const cl = (extra: Partial<ExperimentalSpectrumData>) => run(ei([{x: 112, y: 100}, {x: 113, y: 6.6}, {x: 114, y: 32}], extra)).r;
    expect(cl({}).hypotheses[0].formula).toBe('C6H5Cl');
    expect(cl({observationCoverage: 'CONFIRMED_COMPLETE'}).hypotheses[0].formula).toBe('C6H5Cl');
  });
});
