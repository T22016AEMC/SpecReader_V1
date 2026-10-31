import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {parseCounts, dbeOf} from '../../src/engines/composition/goldenRules';
import {h1Feasibility, planFormulaSearch, type Feasibility} from '../../src/engines/composition/searchPlanning';
import {hiddenExchangeableEvidence} from '../../src/engines/composition/functionalGroupBounds';
import {h1SignalsFromObservations} from '../../src/engines/constraints/v12Evidence';
import {classifySignal} from '../../src/engines/constraints/shiftClasses';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import type {CompositionHypothesis} from '../../src/engines/composition/types';
import {canonNoStereo, fixtureSpectra, inferFixture, loadFixture, SHAPE_BUDGET, type V121Fixture} from '../helpers/v121Golden';

// v1.2.1 stage 1c: S2 (OH peak missing, e = 2), D1 with its solvent declared, the two grades of round 2, the two-pass choice of the names. SYNTHETIC generic shapes only.
beforeAll(() => initializeRDKit(), 60000);
const planning = V12_CONFIG.planning;
const saved = {...planning};
afterEach(() => { Object.assign(planning, saved); });

const analyse = async (f: V121Fixture) => {
  const was = ENUMERATION_CONFIG.legacySupplementWhenIncomplete;
  ENUMERATION_CONFIG.legacySupplementWhenIncomplete = false;
  try { return await executeSixStepAnalysis({spectra: fixtureSpectra(f), extraInput: {}}, SHAPE_BUDGET); } finally { ENUMERATION_CONFIG.legacySupplementWhenIncomplete = was; }
};
type Analysis = Awaited<ReturnType<typeof analyse>>;
const cache = new Map<string, Promise<Analysis>>();
const run = (id: string) => { if (!cache.has(id)) cache.set(id, analyse(loadFixture(id))); return cache.get(id)!; };

const hyp = (formula: string, k: number, score = 0, e = 0): CompositionHypothesis => {
  const counts = parseCounts(formula)!;
  return {id: `comp-${formula}`, formula, counts, dbe: dbeOf(counts), monoisotopicMass: 0, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null, relativeConfidence: 0, calibrated: false,
    score, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: false, sizeConfirmed: false, symmetryMultiple: k, extraExchangeable: e};
};
const feas = (needed: number | null): Feasibility => ({feasible: true, reason: null, templateReading: true, vinylException: false, dbeNeeded: needed, ms: 0});
const noEvidence = {observations: [], irCoversAldehydeRegion: false, nitrogenAllowed: false};
const names = (r: ReturnType<typeof planFormulaSearch>) => r.chosen.map(x => x.hypothesis.formula);
const floor1 = {floor: 1, sources: [], strongCarbonyl: false};

describe('1c-1 S2: the OH peak is missing from the 1H table (extra exchangeable H, e = 2)', () => {
  it('S2: the target formula is on the search list and the target structure is in the output without a formula', async () => {
    const f = loadFixture('S2');
    const r = await run('S2');
    const ci = r.compositionInference!;
    const h = ci.hypotheses.find(x => x.formula === f.formula)!;
    expect(h, 'C15H16O2 is in the formula list').toBeDefined();
    expect(h.symmetryMultiple).toBe(2);
    expect(h.extraExchangeable).toBe(2); // 16 H = 2 × 7 + 2
    expect(h.searched).toBe(true);
    const out = (r.solvedConstraintSpace.searchResult?.smiles ?? []).map(canonNoStereo);
    expect(out).toContain(canonNoStereo(f.targetSmiles));
  }, 300000);
  it('S2: the search list carries formulas with extra exchangeable H (before 1c every searched formula of k = 2 had e = 0)', async () => {
    const r = await run('S2');
    const ci = r.compositionInference!;
    const searched = r.reasoningTrace!.compositionSearch!.runs.map(x => ci.hypotheses.find(h => h.formula === x.formula)!);
    expect(searched.filter(h => (h.extraExchangeable ?? 0) > 0).length).toBeGreaterThan(0);
    expect(searched.filter(h => h.symmetryMultiple === 2).every(h => h.extraExchangeable === 2)).toBe(true);
    expect(searched).toHaveLength(V12_CONFIG.planning.maxRound1Formulas);
  }, 300000);
  it('evidence of a hidden exchangeable H: S2 (broad IR O–H, no broad 1H signal) yes; S1 (the OH peak is in the table) and the shapes without an IR O–H band no', () => {
    expect(hiddenExchangeableEvidence(inferFixture('S2').evidence.observations).present).toBe(true);
    for (const id of ['S1', 'G1', 'E1', 'G3', 'D1']) expect(hiddenExchangeableEvidence(inferFixture(id).evidence.observations).present, id).toBe(false);
  });
  it('the e > 0 variant of a (k, C, O) key is kept next to its e = 0 neighbour (it used to be swallowed: one formula per O count)', () => {
    // same (k = 2, C = 15, O = 2): e = 0 scores best, e = 2 and e = 1 follow; the best e > 0 one is kept, the other e > 0 one is not
    const hs = [hyp('C15H14O2', 2, -0.075, 0), hyp('C15H15O2', 2, -0.375, 1), hyp('C15H16O2', 2, -0.675, 2)];
    const r = planFormulaSearch(hs, floor1, noEvidence, () => feas(8));
    expect(names(r).sort()).toEqual(['C15H14O2', 'C15H15O2']);
    expect(r.notSearched.get('comp-C15H16O2')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
  });
  it('with hidden-exchangeable evidence the order key does not charge the missing-exchangeable prior (DBE excess decides); without it e = 0 stays first', () => {
    const hs = [hyp('C15H14O2', 2, -0.075, 0), hyp('C15H16O2', 2, -0.675, 2)];
    const hidden = inferFixture('S2').evidence; // broad IR O–H, no broad 1H signal
    const shown = inferFixture('S1').evidence; // the OH peak (br s) is in the 1H table
    const need = (f: string) => feas(f === 'C15H14O2' ? 8 : 8); // two benzene rings either way
    expect(names(planFormulaSearch(hs, floor1, hidden, need))).toEqual(['C15H16O2', 'C15H14O2']); // equal ordering score; DBE 8 (no excess) before DBE 9 (excess 1)
    expect(names(planFormulaSearch(hs, floor1, shown, need))).toEqual(['C15H14O2', 'C15H16O2']);
    expect(planFormulaSearch(hs, floor1, hidden, need).hiddenExchangeable).toBe(true);
    expect(planFormulaSearch(hs, floor1, shown, need).hiddenExchangeable).toBe(false);
  });
  it('the hypothesis scores are untouched by the evidence rule (it only changes the order key)', () => {
    const s2 = inferFixture('S2');
    const before = s2.composition.hypotheses.map(h => h.score);
    planFormulaSearch(s2.composition.hypotheses, s2.composition.v121!.oxygenFloor, s2.evidence);
    expect(s2.composition.hypotheses.map(h => h.score)).toEqual(before);
  });
});

describe('1c-2 the solvent of a fixture reaches the pipeline', () => {
  it('every shape (S1, G1, E1, G3, D1, S2) is read as CDCl3 (the helper used to write properties nothing reads: "Unknown")', () => {
    for (const id of ['S1', 'G1', 'E1', 'G3', 'D1', 'S2']) expect(h1SignalsFromObservations(inferFixture(id).evidence.observations).solvent, id).toBe('CDCl3');
  });
  it('D1: the 8.10 ppm 4H singlet is read as an aromatic CH only (the CDCl3 OH window is 0.5–6 ppm); there is no four-OH reading, so the tetraols are not feasible', () => {
    const d1 = inferFixture('D1');
    const h1 = h1SignalsFromObservations(d1.evidence.observations);
    const s = h1.signals.find(x => Math.abs(x.shiftPpm - 8.1) < 1e-9)!;
    const ctx = {solvent: h1.solvent, formulaElements: new Set(['C', 'H', 'O']), nitrogenAllowed: false, ir: {present: true, coversAldehydeRegion: true, strongCarbonyl: true} as never};
    expect(classifySignal(s, ctx).matches.map(m => m.classId)).toEqual(['ARO_CH']);
    for (const f of ['C6H14O4', 'C7H14O4', 'C3H8O3']) expect(h1Feasibility(f, d1.evidence).feasible, f).toBe(false);
    expect(h1Feasibility('C12H14O4', d1.evidence)).toMatchObject({feasible: true, dbeNeeded: 4});
  });
  it('with the solvent unknown the old reading is still there (the union of the solvent windows reaches 12 ppm): the helper option keeps the v1.2.0 golden input', () => {
    const f = loadFixture('D1');
    const spectra = fixtureSpectra(f, {declareSolvent: false});
    expect((spectra['1H_NMR'] as unknown as {nmrSolvent?: string}).nmrSolvent).toBeUndefined();
  });
});

describe('1c-3 round 2: grade A / grade B', () => {
  it('S1: k = 3 has no grade-A formula, so its grade-B formula explores under round2ExploreMaxSteps and is reported as an exploration', async () => {
    const r = await run('S1');
    const ci = r.compositionInference!;
    const runs = r.reasoningTrace!.compositionSearch!.runs;
    const k3 = runs.find(x => x.formula === 'C22H24O')!;
    const h = ci.hypotheses.find(x => x.formula === 'C22H24O')!;
    expect(h.searchPlan).toMatchObject({status: 'ROUND_2', round2: 'RAN', round2Grade: 'B'});
    expect(k3.candidates).toBe(0);
    expect(k3.enumeration!.planning!.round2Visited).toBeLessThanOrEqual(V12_CONFIG.planning.round2ExploreMaxSteps);
    expect(k3.enumeration!.incompleteReasons).toContain('ROUND2_EXPLORE_CAP');
    // the budget is not spent on it: the grade-A formula of k = 2 gets the rest of the pool
    const k2 = runs.find(x => x.formula === 'C15H16O2')!;
    expect(ci.hypotheses.find(x => x.formula === 'C15H16O2')!.searchPlan).toMatchObject({round2: 'RAN', round2Grade: 'A'});
    expect(k2.enumeration!.planning!.round2Visited).toBeGreaterThan(5 * k3.enumeration!.planning!.round2Visited);
  }, 300000);
  it('S1: a k with an A formula picks the A formula, the B formula of that k is not picked; wasted steps (0-candidate runs) are below 1 M (3.93 M with one level)', async () => {
    const r = await run('S1');
    const ci = r.compositionInference!;
    const b = ci.hypotheses.find(x => x.formula === 'C15H16O')!;
    expect(b.searchPlan).toMatchObject({round2: 'NOT_PICKED', round2Grade: 'B'});
    const runs = r.reasoningTrace!.compositionSearch!.runs;
    const wasted = runs.filter(x => x.candidates === 0).reduce((a, x) => a + (x.enumeration!.planning!.round1Visited + x.enumeration!.planning!.round2Visited), 0);
    expect(wasted).toBeLessThan(1_000_000);
  }, 300000);
  it('a formula that hit the round-1 step cap with nothing, or had no candidate and did not finish, is not eligible (neither grade)', async () => {
    const r = await run('S1');
    const c = r.compositionInference!.hypotheses.find(x => x.formula === 'C22H24O2')!;
    expect(c.searchPlan?.round2).toBe('NOT_ELIGIBLE');
    expect(c.searchPlan?.round2Grade).toBeUndefined();
  }, 300000);
  it('the exploration cap is an engineering default marked as such in the config', () => {
    expect(V12_CONFIG.planning.round2ExploreMaxSteps).toBe(500_000);
  });
});

describe('1c-4 names in two passes (config nameOrder TWO_PASS; the default stays ONE_PASS)', () => {
  // k = 2 (floor 1, window O 1–3): C14…C17 × O1…O3, equal scores, no DBE information. Four names: one-pass fills them with the first two C values.
  const grid = () => ['C14', 'C15', 'C16', 'C17'].flatMap(c => [1, 2, 3].map(o => hyp(`${c}H16${o === 1 ? 'O' : `O${o}`}`, 2)));
  const cs = (r: ReturnType<typeof planFormulaSearch>) => [...new Set(r.chosen.map(x => x.hypothesis.counts.C))];
  it('the default is ONE_PASS and unchanged: the names go to the O variants of the lowest C first', () => {
    expect(V12_CONFIG.planning.nameOrder).toBe('ONE_PASS');
    planning.maxRound1Formulas = 4;
    const r = planFormulaSearch(grid(), floor1, noEvidence, () => feas(null));
    expect(names(r)).toEqual(['C14H16O', 'C14H16O2', 'C14H16O3', 'C15H16O']);
    expect(cs(r)).toEqual([14, 15]);
  });
  it('TWO_PASS: the same four names cover four C values, one representative per (k, C)', () => {
    planning.maxRound1Formulas = 4;
    planning.nameOrder = 'TWO_PASS';
    const r = planFormulaSearch(grid(), floor1, noEvidence, () => feas(null));
    expect(cs(r)).toEqual([14, 15, 16, 17]);
    expect(r.chosen).toHaveLength(4); // the total number of names is unchanged
    expect(names(r)).toEqual(['C14H16O', 'C15H16O', 'C16H16O', 'C17H16O']); // 'EITHER': equal candidates, the smaller O
  });
  it('TWO_PASS representativeOxygen K_FLOOR: O = k × floor represents the key', () => {
    planning.maxRound1Formulas = 4;
    planning.nameOrder = 'TWO_PASS';
    planning.representativeOxygen = 'K_FLOOR';
    expect(names(planFormulaSearch(grid(), floor1, noEvidence, () => feas(null)))).toEqual(['C14H16O2', 'C15H16O2', 'C16H16O2', 'C17H16O2']);
  });
  it('TWO_PASS: the second pass fills the remaining names with the other O variants, in the order key', () => {
    planning.maxRound1Formulas = 6;
    planning.nameOrder = 'TWO_PASS';
    const r = planFormulaSearch(grid(), floor1, noEvidence, () => feas(null));
    expect(names(r)).toEqual(['C14H16O', 'C15H16O', 'C16H16O', 'C17H16O', 'C14H16O2', 'C14H16O3']);
  });
  it('TWO_PASS is a k round-robin in each pass and never exceeds maxRound1Formulas', () => {
    planning.nameOrder = 'TWO_PASS';
    planning.maxRound1Formulas = 5;
    const hs = [...grid(), ...['C7', 'C8', 'C9'].map(c => hyp(`${c}H8O`, 1)), ...['C22', 'C23'].map(c => hyp(`${c}H24O`, 3))];
    const r = planFormulaSearch(hs, floor1, noEvidence, () => feas(null));
    expect(r.chosen.map(x => x.hypothesis.symmetryMultiple)).toEqual([1, 2, 3, 1, 2]);
    expect(r.chosen).toHaveLength(5);
  });
  it('S1 coverage (real list): TWO_PASS widens k = 2 over C15–C18; with EITHER the target formula C15H16O2 is not the representative of C15 and loses its name, with K_FLOOR it keeps it', () => {
    const s1 = inferFixture('S1');
    const plan = () => planFormulaSearch(s1.composition.hypotheses, s1.composition.v121!.oxygenFloor, s1.evidence);
    const k2 = (r: ReturnType<typeof planFormulaSearch>) => r.chosen.filter(x => x.hypothesis.symmetryMultiple === 2).map(x => x.hypothesis.formula);
    expect(k2(plan())).toContain('C15H16O2'); // ONE_PASS (default)
    planning.nameOrder = 'TWO_PASS';
    const either = k2(plan());
    expect(either).not.toContain('C15H16O2');
    expect(new Set(either.map(f => parseCounts(f)!.C)).size).toBe(either.length); // one name per C
    planning.representativeOxygen = 'K_FLOOR';
    expect(k2(plan())).toContain('C15H16O2');
  });
});
