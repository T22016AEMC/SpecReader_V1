import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {parseCounts} from '../../src/engines/composition/goldenRules';
import {listedExchangeableSignal} from '../../src/engines/composition/functionalGroupBounds';
import {planFormulaSearch, type Feasibility} from '../../src/engines/composition/searchPlanning';
import type {CompositionHypothesis} from '../../src/engines/composition/types';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import {BPA_FORMULA, BPA_SAMPLES, bpaSpectra, layer1} from '../helpers/v143Bpa';

// v1.4.3 (useV143Select): formula selection of the no-formula search. SYNTHETIC samples only (numbers, no spectrum file); nothing here claims accuracy.
// Flag off = the v1.4.2 selection; the flag-off golden files switch it off through usePreV142Defaults().
beforeAll(() => initializeRDKit(), 60000);
const saved = {flag: V12_CONFIG.useV143Select, planning: {...V12_CONFIG.planning}};
afterEach(() => { V12_CONFIG.useV143Select = saved.flag; Object.assign(V12_CONFIG.planning, saved.planning); V12_CONFIG.useV121Planning = true; });
const flag = (on: boolean) => { V12_CONFIG.useV143Select = on; };

const hyp = (formula: string, k: number, score: number, e: number): CompositionHypothesis => ({
  id: `comp-${formula}`, formula, counts: parseCounts(formula)!, dbe: 0, monoisotopicMass: 0, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null, relativeConfidence: 0, calibrated: false,
  score, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: false, sizeConfirmed: false, symmetryMultiple: k, extraExchangeable: e,
});
const feas = (feasible: boolean, reason: string | null = null): Feasibility => ({feasible, reason, templateReading: feasible, vinylException: false, dbeNeeded: null, ms: 0});
const noEvidence = {observations: [], irCoversAldehydeRegion: false, nitrogenAllowed: false};
const names = (r: ReturnType<typeof planFormulaSearch>) => r.chosen.map(x => x.hypothesis.formula);
const h1Obs = (id: string, value: number, multiplicity: string, solvent: string, extra: Partial<ObservedEvidence> = {}) => ({id, modality: '1H_NMR', value, multiplicity, optional: false, shape: 'SHARP', metadata: {solvent}, ...extra}) as unknown as ObservedEvidence;

describe('(1) the 1H feasibility is checked before the representative is chosen', () => {
  // the bisect case in miniature: same (k = 2, C = 15, O = 2); e = 2 scores best but is infeasible, e = 0 is feasible
  const hs = () => [hyp('C15H18O2', 2, 0.225, 2), hyp('C15H16O2', 2, -0.075, 0)];
  const only = (bad: string[]) => (f: string) => (bad.includes(f) ? feas(false, 'no reading') : feas(true));
  it('flag off (v1.4.2): the infeasible best formula stands for its O count and the feasible one is lost', () => {
    flag(false);
    const r = planFormulaSearch(hs(), null, noEvidence, only(['C15H18O2']));
    expect(names(r)).toEqual([]);
    expect(r.notSearched.get('comp-C15H16O2')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
    expect(r.notSearched.get('comp-C15H18O2')?.reason).toBe('H1_INFEASIBLE');
  });
  it('flag on: the best FEASIBLE formula of the O count is the representative; the infeasible one is listed as H1_INFEASIBLE', () => {
    flag(true);
    const r = planFormulaSearch(hs(), null, noEvidence, only(['C15H18O2']));
    expect(names(r)).toEqual(['C15H16O2']);
    expect(r.notSearched.get('comp-C15H18O2')?.reason).toBe('H1_INFEASIBLE');
    expect(r.notSearched.get('comp-C15H16O2')).toBeUndefined();
  });
  it('flag on: a group is dropped only when no member is feasible', () => {
    flag(true);
    const r = planFormulaSearch(hs(), null, noEvidence, () => feas(false, 'x'));
    expect(names(r)).toEqual([]);
    expect([...r.notSearched.values()].map(x => x.reason)).toEqual(['H1_INFEASIBLE', 'H1_INFEASIBLE']);
  });
  it('flag on: the e > 0 variant is chosen among the feasible ones too; nothing else about the slots changes (N O variants per key, round robin, 12 names)', () => {
    flag(true);
    const g = [hyp('C15H16O2', 2, -0.075, 0), hyp('C15H17O2', 2, -0.375, 1), hyp('C15H18O2', 2, -0.675, 2), hyp('C15H14O', 2, -0.1, 0)];
    const r = planFormulaSearch(g, null, noEvidence, only(['C15H17O2']));
    expect(names(r).sort()).toEqual(['C15H14O', 'C15H16O2', 'C15H18O2'].sort());
  });
});

describe('(2) a listed exchangeable peak switches the add-back off (the add-back itself is unchanged)', () => {
  it('listedExchangeableSignal: DMSO-d6 singlet 9.19 yes; CDCl3 singlet 9.19 no; a CH3 singlet in CDCl3 and a ring singlet in DMSO-d6 no; above 10 ppm in any solvent yes; user-marked yes; optional (solvent) peaks no', () => {
    expect(listedExchangeableSignal([h1Obs('a', 9.19, 's', 'DMSO-d6')]).present).toBe(true);
    expect(listedExchangeableSignal([h1Obs('a', 9.19, 's', 'CDCl3')]).present).toBe(false);
    expect(listedExchangeableSignal([h1Obs('a', 2.28, 's', 'CDCl3')]).present).toBe(false);
    expect(listedExchangeableSignal([h1Obs('a', 7.1, 's', 'DMSO-d6')]).present).toBe(false);
    expect(listedExchangeableSignal([h1Obs('a', 9.19, 'd', 'DMSO-d6')]).present).toBe(false);
    expect(listedExchangeableSignal([h1Obs('a', 10.8, 'd', 'CDCl3')]).present).toBe(true);
    expect(listedExchangeableSignal([h1Obs('a', 5.0, 'm', 'CDCl3', {exchangeable: true} as Partial<ObservedEvidence>)]).present).toBe(true);
    expect(listedExchangeableSignal([h1Obs('a', 9.19, 's', 'DMSO-d6', {optional: true})]).present).toBe(false);
  });
  it('the add-back is the full weight as in v1.4.2: no listed peak = same as flag off; a listed 9.19 singlet in DMSO-d6 switches it off (hiddenExchangeable false) only with the flag on', () => {
    const ir = {id: 'ir', modality: 'IR', value: 3369, shape: 'BROAD', optional: false, metadata: {}} as unknown as ObservedEvidence;
    const base = h1Obs('h', 6.9, 'd', 'DMSO-d6', {relativeIntegral: 2, coverage: 'PARTIAL'} as Partial<ObservedEvidence>);
    const none = {observations: [ir, base], irCoversAldehydeRegion: false, nitrogenAllowed: false};
    const listed = {observations: [ir, base, h1Obs('oh', 9.19, 's', 'DMSO-d6', {relativeIntegral: 1, coverage: 'PARTIAL'} as Partial<ObservedEvidence>)], irCoversAldehydeRegion: false, nitrogenAllowed: false};
    // composition scores: e = 2 is charged 0.3 x 2 x 0.5 = 0.3 more than e = 0; the full add-back 0.3 x 2 puts e = 2 ahead (+0.225 against -0.075)
    const g = [hyp('C15H18O2', 2, -0.375, 2), hyp('C15H16O2', 2, -0.075, 0)];
    V12_CONFIG.planning.maxOxygenVariantsPerKeyMultiple = 5;
    for (const on of [true, false]) {
      flag(on);
      const r = planFormulaSearch(g, null, none, () => feas(true));
      expect(r.hiddenExchangeable, `no listed peak, flag ${on}`).toBe(true);
      expect(names(r)[0]).toBe('C15H18O2');
    }
    flag(false);
    expect(planFormulaSearch(g, null, listed, () => feas(true)).hiddenExchangeable).toBe(true);
    flag(true);
    const r = planFormulaSearch(g, null, listed, () => feas(true));
    expect(r.hiddenExchangeable).toBe(false);
    expect(names(r)[0]).toBe('C15H16O2');
  });
});

describe('layer 1: is the target formula in the searched list (formula table only, no structure search)', () => {
  const sample = (id: string) => BPA_SAMPLES.find(s => s.id === id)!;
  for (const id of ['BPA-A', 'BPA-B', 'BPA-C']) {
    it(`${id}: ${BPA_FORMULA} is searched with the flag on`, () => {
      flag(true);
      const r = layer1(bpaSpectra(sample(id)), BPA_FORMULA);
      expect(r.inTable).toBe(true);
      expect(r.searched, JSON.stringify(r)).toBe(true);
    });
  }
  it('BPA-A: with the flag off (v1.4.2) the formula is NOT searched (the case of BPA_BISECT)', () => {
    flag(false);
    const r = layer1(bpaSpectra(sample('BPA-A')), BPA_FORMULA);
    expect(r.searched).toBe(false);
    expect(r.reason).toBe('OXYGEN_VARIANT_LIMIT');
  });
  it('BPA-D (CDCl3): recorded only, no assertion on the outcome', () => {
    for (const on of [false, true]) { flag(on); const r = layer1(bpaSpectra(sample('BPA-D')), BPA_FORMULA); expect(typeof r.searched).toBe('boolean'); }
  });
});
