import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {parseCounts, dbeOf} from '../../src/engines/composition/goldenRules';
import {h1Feasibility, oxygenWindow, planFormulaSearch, readingDbe, type Feasibility} from '../../src/engines/composition/searchPlanning';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {COMPOSITION_CONFIG} from '../../src/engines/composition/compositionConfig';
import type {CompositionHypothesis} from '../../src/engines/composition/types';
import {inferFixture} from '../helpers/v121Golden';

// SYNTHETIC logic tests for the v1.2.1b changes of the plan: DBE parsimony as the sort key, the O window that scales with k, N = 3 O variants for k ≥ 2.
beforeAll(() => initializeRDKit(), 60000);
const planning = V12_CONFIG.planning;
const saved = {...planning};
afterEach(() => { Object.assign(planning, saved); });

const hyp = (formula: string, k: number, score = 0): CompositionHypothesis => {
  const counts = parseCounts(formula)!;
  return {id: `comp-${formula}`, formula, counts, dbe: dbeOf(counts), monoisotopicMass: 0, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null, relativeConfidence: 0, calibrated: false,
    score, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: false, sizeConfirmed: false, symmetryMultiple: k};
};
const feas = (needed: number | null): Feasibility => ({feasible: true, reason: null, templateReading: true, vinylException: false, dbeNeeded: needed, ms: 0});
const evidence = {observations: [], irCoversAldehydeRegion: false, nitrogenAllowed: false};
const names = (r: ReturnType<typeof planFormulaSearch>) => r.chosen.map(x => x.hypothesis.formula);

describe('DBE parsimony as the sort key (1b-3)', () => {
  it('equal scores: the formula with no DBE excess comes before a formula with excess, whatever the C count', () => {
    // evidence needs 8 DBE (two benzene rings); C14H16O2 has DBE 7 (below the need: excess 0), C15 has 8 (0), C16 has 9 (1), C17 has 10 (2)
    const hs = ['C17H16O2', 'C16H16O2', 'C15H16O2'].map(f => hyp(f, 2)).concat([hyp('C14H16O2', 2)]);
    planning.maxOxygenVariantsPerKeyMultiple = 3;
    const r = planFormulaSearch(hs, null, evidence, () => feas(8));
    expect(names(r)).toEqual(['C14H16O2', 'C15H16O2', 'C16H16O2', 'C17H16O2']);
    expect(r.chosen.map(x => x.dbe.excess)).toEqual([0, 0, 1, 2]);
    const mixed = [hyp('C10H16O2', 2), hyp('C15H16O2', 2)];
    const r2 = planFormulaSearch(mixed, null, evidence, f => feas(f === 'C10H16O2' ? 1 : 8));
    expect(r2.chosen.map(x => [x.hypothesis.formula, x.dbe.excess])).toEqual([['C15H16O2', 0], ['C10H16O2', 2]]);
  });
  it('the score still comes first: a better score with excess goes before a worse score without', () => {
    const hs = [hyp('C16H16O2', 2, 0), hyp('C15H16O2', 2, -0.3)];
    expect(names(planFormulaSearch(hs, null, evidence, () => feas(8)))).toEqual(['C16H16O2', 'C15H16O2']);
  });
  it('a strong C=O adds one to the DBE the evidence needs; no information (null) means no excess', () => {
    const hs = [hyp('C10H12O2', 1)];
    const withCo = planFormulaSearch(hs, {floor: 2, sources: [], strongCarbonyl: true}, evidence, () => feas(4));
    expect(withCo.chosen[0].dbe).toEqual({dbe: 5, needed: 5, excess: 0});
    const without = planFormulaSearch(hs, {floor: 2, sources: [], strongCarbonyl: false}, evidence, () => feas(4));
    expect(without.chosen[0].dbe).toEqual({dbe: 5, needed: 4, excess: 1});
    expect(planFormulaSearch(hs, null, evidence, () => feas(null)).chosen[0].dbe).toEqual({dbe: 5, needed: null, excess: 0});
  });
  it('is not a penalty: the scores of the hypotheses are untouched by the key', () => {
    const f = inferFixture('S1');
    const before = f.composition.hypotheses.map(h => h.score);
    planFormulaSearch(f.composition.hypotheses, f.composition.v121!.oxygenFloor, f.evidence);
    expect(f.composition.hypotheses.map(h => h.score)).toEqual(before);
  });
  it('reading DBE = ring templates (benzene 4, naphthalene 7, pyridine 4) + at least half of the alkene CH atoms', () => {
    const alt = (rings: string[], alkeneAtoms: number[]) => ({rings: {rings: rings.map(templateId => ({templateId}))}, groups: alkeneAtoms.map(atomCount => ({alkene: true, atomCount})).concat([{alkene: false, atomCount: 9}])});
    expect(readingDbe(alt(['benzene', 'benzene'], []))).toBe(8);
    expect(readingDbe(alt(['naphthalene'], []))).toBe(7);
    expect(readingDbe(alt(['pyridine'], []))).toBe(4);
    expect(readingDbe(alt([], [1, 1]))).toBe(1);
    expect(readingDbe(alt([], [3]))).toBe(2);
    expect(readingDbe(alt(['benzene'], [2]))).toBe(5);
  });
  it('S1: the formula with no DBE excess (C15H16O2: DBE 8, needed 8) precedes C16 and C17 in the k = 2 order; DBE values of the five shapes', () => {
    const s1 = inferFixture('S1');
    const plan = planFormulaSearch(s1.composition.hypotheses, s1.composition.v121!.oxygenFloor, s1.evidence);
    const k2 = plan.chosen.filter(x => x.hypothesis.symmetryMultiple === 2).map(x => x.hypothesis.formula);
    console.info(`[S1 k=2 plan order] ${k2.join(' ')}`);
    expect(k2).toContain('C15H16O2');
    for (const later of ['C16H16O2', 'C17H16O2']) if (k2.includes(later)) expect(k2.indexOf('C15H16O2')).toBeLessThan(k2.indexOf(later));
    expect(plan.chosen.find(x => x.hypothesis.formula === 'C15H16O2')!.dbe).toEqual({dbe: 8, needed: 8, excess: 0});
    const facts: Record<string, unknown> = {};
    for (const id of ['S1', 'G1', 'E1', 'G3', 'D1']) {
      const f = inferFixture(id);
      const floor = f.composition.v121!.oxygenFloor!;
      const fe = h1Feasibility(f.fixture.formula, f.evidence);
      const dbe = dbeOf(parseCounts(f.fixture.formula)!);
      const needed = fe.dbeNeeded === null ? null : fe.dbeNeeded + (floor.strongCarbonyl ? 1 : 0);
      facts[id] = {formula: f.fixture.formula, dbe, needed, excess: needed === null ? 0 : Math.max(0, dbe - needed), feasible: fe.feasible};
    }
    console.info(`[DBE of the targets] ${JSON.stringify(facts)}`);
    expect(facts.S1).toMatchObject({dbe: 8, needed: 8, excess: 0});
    expect(facts.G1).toMatchObject({dbe: 4, needed: 4, excess: 0});
    expect(facts.E1).toMatchObject({dbe: 5, needed: 5, excess: 0});
    expect(facts.G3).toMatchObject({dbe: 2, needed: 2, excess: 0});
  });
});

describe('the O window scales with k (1b-4)', () => {
  it('the window is [floor, k × floor + 1]', () => {
    expect(oxygenWindow(2, 1)).toEqual([2, 3]);
    expect(oxygenWindow(2, 2)).toEqual([2, 5]);
    expect(oxygenWindow(2, 3)).toEqual([2, 7]);
    expect(oxygenWindow(1, 2)).toEqual([1, 3]);
    expect(oxygenWindow(0, 2)).toEqual([0, 1]);
  });
  it('k = 2, floor 2: O 2…5 are candidates, N = 3 variants per key; k = 1 keeps [floor, floor + 1] and N = 2', () => {
    const k2 = ['C12H14O', 'C12H14O2', 'C12H14O3', 'C12H14O4', 'C12H14O5', 'C12H14O6'].map(f => hyp(f, 2));
    const k1 = ['C10H12O', 'C10H12O2', 'C10H12O3', 'C10H12O4'].map(f => hyp(f, 1));
    const r = planFormulaSearch([...k2, ...k1], {floor: 2, sources: [], strongCarbonyl: false}, evidence, () => feas(null));
    const chosenK2 = r.chosen.filter(x => x.hypothesis.symmetryMultiple === 2).map(x => x.hypothesis.formula).sort();
    expect(chosenK2).toEqual(['C12H14O2', 'C12H14O3', 'C12H14O4']);
    expect(r.notSearched.get('comp-C12H14O5')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
    expect(r.notSearched.get('comp-C12H14O')?.reason).toBe('OXYGEN_OUTSIDE_RANGE');
    expect(r.notSearched.get('comp-C12H14O6')?.reason).toBe('OXYGEN_OUTSIDE_RANGE');
    expect(r.notSearched.get('comp-C12H14O6')?.text).toContain('視窗上緣 5');
    const chosenK1 = r.chosen.filter(x => x.hypothesis.symmetryMultiple === 1).map(x => x.hypothesis.formula).sort();
    expect(chosenK1).toEqual(['C10H12O2', 'C10H12O3']);
    expect(r.notSearched.get('comp-C10H12O4')?.reason).toBe('OXYGEN_OUTSIDE_RANGE');
  });
  it('the priority beats the score: O = floor and O = k × floor are kept even when other O variants score higher', () => {
    const hs = [hyp('C12H14O2', 2, -0.5), hyp('C12H14O3', 2, 0), hyp('C12H14O4', 2, -0.5), hyp('C12H14O5', 2, 0)];
    planning.maxOxygenVariantsPerKeyMultiple = 2;
    const r = planFormulaSearch(hs, {floor: 2, sources: [], strongCarbonyl: false}, evidence, () => feas(null));
    expect(names(r).sort()).toEqual(['C12H14O2', 'C12H14O4']);
  });
  it('O variants are distinct O counts: H or N variants of the same O count share one slot (they do not push another O count out)', () => {
    const hs = [hyp('C6H6', 1, 0), hyp('C6H7N', 1, -0.1), hyp('C6H6O', 1, -0.2), hyp('C6H8O', 1, -0.5)];
    const r = planFormulaSearch(hs, {floor: 0, sources: [], strongCarbonyl: false}, evidence, () => feas(null));
    expect(names(r).sort()).toEqual(['C6H6', 'C6H6O']);
    expect(r.notSearched.get('comp-C6H7N')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
    expect(r.notSearched.get('comp-C6H7N')?.text).toContain('同 O 數只保留分數最高的一個');
    expect(r.notSearched.get('comp-C6H8O')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
  });
  it('the scoring uses the same window: no oxygenExcess inside it, one step per O above it (D1: floor 2, k = 2)', () => {
    const d1 = inferFixture('D1').composition;
    const by = new Map(d1.hypotheses.map(h => [h.formula, h]));
    const o2 = by.get('C12H14O2'), o4 = by.get('C12H14O4'), o6 = by.get('C12H14O6');
    expect(o2, 'C12H14O2 is listed').toBeDefined();
    if (o4) expect(o4.score).toBeCloseTo(o2!.score, 6);
    if (o6) expect(o6.score).toBeCloseTo(o2!.score - COMPOSITION_CONFIG.weights.oxygenExcess, 6);
    // the enumeration reaches k × floor + 1 for k = 2 (O = 5)
    expect(d1.hypotheses.some(h => h.symmetryMultiple === 2 && (h.counts.O ?? 0) === 5)).toBe(true);
    expect(d1.hypotheses.length).toBeLessThanOrEqual(COMPOSITION_CONFIG.maxHypotheses);
  });
  it('D1 (observation, nothing asserted about the target): whether C12H14O4 is listed, and what the plan does with it', () => {
    const d1 = inferFixture('D1');
    const plan = planFormulaSearch(d1.composition.hypotheses, d1.composition.v121!.oxygenFloor, d1.evidence);
    const facts = {listedRank: d1.composition.hypotheses.findIndex(h => h.formula === 'C12H14O4') + 1, chosen: plan.chosen.some(x => x.hypothesis.formula === 'C12H14O4'), notSearched: plan.notSearched.get('comp-C12H14O4') ?? null, chosenFormulas: plan.chosen.map(x => x.hypothesis.formula)};
    console.info(`[D1 observation, plan only] ${JSON.stringify(facts)}`);
    expect(d1.composition.v121?.oxygenFloor?.floor).toBe(2);
  });
});
