import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {spectrum} from '../fixtures';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {inferComposition} from '../../src/engines/composition/inferComposition';
import {oxygenEvidenceFloor} from '../../src/engines/composition/functionalGroupBounds';
import {parseCounts} from '../../src/engines/composition/goldenRules';
import {h1Feasibility, planFormulaSearch, type Feasibility} from '../../src/engines/composition/searchPlanning';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {COMPOSITION_CONFIG} from '../../src/engines/composition/compositionConfig';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import type {CompositionHypothesis} from '../../src/engines/composition/types';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';
import {fixtureSpectra, inferFixture, loadFixture} from '../helpers/v121Golden';

// SYNTHETIC logic tests for the A class of v1.2.1: S needs S evidence, the O count follows the IR floor, k round-robin with O variant limit, the 1H feasibility filter.
// The shapes S1/G1/E1/G3/D1 are hand-written (tests/fixtures/v121); nothing here claims accuracy.
beforeAll(() => initializeRDKit(), 60000);
const planning = V12_CONFIG.planning;
const saved = {...planning};
afterEach(() => { Object.assign(planning, saved); V12_CONFIG.useV121Planning = true; });
const withFormulaSlots = () => { planning.maxRound1Formulas = 50; };

const hyp = (formula: string, k: number, score = 0, supported = true): CompositionHypothesis => ({
  id: `comp-${formula}`, formula, counts: parseCounts(formula)!, dbe: 0, monoisotopicMass: 0, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null, relativeConfidence: 0, calibrated: false,
  score, support: [], contradiction: [], unknown: [], generatorSupported: supported, unsupportedElements: supported ? [] : ['S'], searched: false, sizeConfirmed: false, symmetryMultiple: k,
});
const ok: Feasibility = {feasible: true, reason: null, templateReading: true, vinylException: false, dbeNeeded: null, ms: 0};
const allFeasible = () => ok;
const evidence = {observations: [], irCoversAldehydeRegion: false, nitrogenAllowed: false};
const names = (r: ReturnType<typeof planFormulaSearch>) => r.chosen.map(x => x.hypothesis.formula);

describe('planFormulaSearch (A3, A5)', () => {
  it('takes the formulas by k round-robin: best of k=1, k=2, k=3, then the second of each', () => {
    const hs = [hyp('C7H8O2', 1, 0), hyp('C8H8O2', 1, -0.1), hyp('C11H16O2', 2, -0.07), hyp('C12H16O2', 2, -0.17), hyp('C15H24O2', 3, -0.15), hyp('C16H24O2', 3, -0.25)];
    planning.maxOxygenVariantsPerKey = 2;
    expect(names(planFormulaSearch(hs, null, evidence, allFeasible))).toEqual(['C7H8O2', 'C11H16O2', 'C15H24O2', 'C8H8O2', 'C12H16O2', 'C16H24O2']);
  });
  it('keeps at most N O variants per (k, C) key, best score first, and lists the rest as not searched', () => {
    const hs = [hyp('C7H8O', 1, -0.5), hyp('C7H8O2', 1, 0), hyp('C7H8O3', 1, -0.2), hyp('C7H8O4', 1, -1)];
    planning.maxOxygenVariantsPerKey = 2;
    const r = planFormulaSearch(hs, null, evidence, allFeasible);
    expect(names(r)).toEqual(['C7H8O2', 'C7H8O3']);
    expect(r.notSearched.get('comp-C7H8O')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
    expect(r.notSearched.get('comp-C7H8O4')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
    expect(r.notSearched.get('comp-C7H8O')?.text).toContain('同骨架 O 變體超過保留數');
    planning.maxOxygenVariantsPerKey = 3;
    expect(names(planFormulaSearch(hs, null, evidence, allFeasible))).toHaveLength(3);
  });
  it('different C counts are different keys', () => {
    const hs = [hyp('C7H8O2', 1), hyp('C8H8O2', 1), hyp('C9H8O2', 1)];
    planning.maxOxygenVariantsPerKey = 1;
    expect(names(planFormulaSearch(hs, null, evidence, allFeasible))).toEqual(['C7H8O2', 'C8H8O2', 'C9H8O2']);
  });
  it('with an O floor only O in [floor, floor + 1] is a candidate; the others are listed with a reason', () => {
    const hs = ['C9H12', 'C9H12O', 'C9H12O2', 'C9H12O3', 'C9H12O4'].map(f => hyp(f, 1));
    planning.maxOxygenVariantsPerKey = 5;
    const r = planFormulaSearch(hs, {floor: 2, sources: [], strongCarbonyl: false}, evidence, allFeasible);
    expect(names(r)).toEqual(['C9H12O2', 'C9H12O3']);
    expect([...r.notSearched.values()].map(x => x.reason)).toEqual(['OXYGEN_OUTSIDE_RANGE', 'OXYGEN_OUTSIDE_RANGE', 'OXYGEN_OUTSIDE_RANGE']);
    expect(r.notSearched.get('comp-C9H12O4')?.text).toContain('超過');
    expect(r.notSearched.get('comp-C9H12')?.text).toContain('少於');
  });
  it('stops at maxRound1Formulas; later formulas get "k 輪流名額已滿"', () => {
    planning.maxRound1Formulas = 3;
    const hs = [hyp('C7H8O2', 1), hyp('C8H8O2', 1), hyp('C11H16O2', 2), hyp('C12H16O2', 2)];
    const r = planFormulaSearch(hs, null, evidence, allFeasible);
    expect(names(r)).toEqual(['C7H8O2', 'C11H16O2', 'C8H8O2']);
    expect(r.notSearched.get('comp-C12H16O2')?.reason).toBe('K_ROUND_ROBIN_FULL');
  });
  it('an infeasible formula is listed with its reason, does not take a slot and does not stop its k', () => {
    planning.maxRound1Formulas = 2;
    const hs = [hyp('C11H16O2', 2), hyp('C15H16O2', 2), hyp('C16H16O2', 2)];
    const feas = (f: string): Feasibility => (f === 'C11H16O2' ? {...ok, feasible: false, reason: 'FORMULA_ELEMENT_SHORTAGE：片段需要 12 個 C'} : ok);
    const r = planFormulaSearch(hs, null, evidence, feas);
    expect(names(r)).toEqual(['C15H16O2', 'C16H16O2']);
    expect(r.notSearched.get('comp-C11H16O2')).toEqual({reason: 'H1_INFEASIBLE', text: '¹H 清單不可行：FORMULA_ELEMENT_SHORTAGE：片段需要 12 個 C'});
  });
  it('treats k = 1, 2, 3 alike (feasibility is asked for every k, nothing is preferred by k)', () => {
    const asked: string[] = [];
    const hs = [hyp('C7H8O2', 1), hyp('C11H16O2', 2), hyp('C15H24O2', 3)];
    planFormulaSearch(hs, null, evidence, f => { asked.push(f); return ok; });
    expect(asked).toEqual(['C7H8O2', 'C11H16O2', 'C15H24O2']);
  });
  it('is deterministic: the same hypotheses in any input order give the same search order', () => {
    const hs = ['C7H8O', 'C7H8O2', 'C8H8O', 'C8H8O2', 'C10H8O2'].map(f => hyp(f, 1)).concat(['C11H16O2', 'C12H16O2'].map(f => hyp(f, 2)));
    const a = names(planFormulaSearch(hs, null, evidence, allFeasible));
    const b = names(planFormulaSearch([...hs].reverse(), null, evidence, allFeasible));
    const c = names(planFormulaSearch([...hs].sort((x, y) => x.formula.localeCompare(y.formula)), null, evidence, allFeasible));
    expect(b).toEqual(a); expect(c).toEqual(a);
    // equal scores are ordered by C ascending (numeric), not by the formula string where C10 would precede C4
    expect(names(planFormulaSearch([hyp('C10H8O2', 1), hyp('C4H8O2', 1)], null, evidence, allFeasible))).toEqual(['C4H8O2', 'C10H8O2']);
  });
  it('formulas the generator does not support are never chosen', () => {
    const r = planFormulaSearch([hyp('C4H8OS', 1, 0, false), hyp('C4H8O2', 1)], null, evidence, allFeasible);
    expect(names(r)).toEqual(['C4H8O2']);
  });
});

describe('h1Feasibility (A5) on the synthetic shapes', () => {
  it('S1: the two-ring formula is feasible, formulas too small for two rings are not (no search is run)', () => {
    const {evidence: ev} = inferFixture('S1');
    expect(h1Feasibility('C15H16O2', ev).feasible).toBe(true);
    const small = h1Feasibility('C11H16O2', ev);
    expect(small.feasible).toBe(false);
    expect(small.reason).toContain('模板讀法');
  });
  it('G3: no formula has a reading without an alkene CH, and a signal at 5.84 ppm only the alkene class explains → feasible by the alkene exception', () => {
    const {evidence: ev} = inferFixture('G3');
    const f = h1Feasibility('C5H8O2', ev);
    expect(f).toMatchObject({feasible: true, vinylException: true, templateReading: false});
  });
  it('costs milliseconds per formula (measured on 40 formulas of S1; the bound is loose on purpose)', () => {
    const {evidence: ev, composition} = inferFixture('S1');
    const t0 = performance.now();
    for (const h of composition.hypotheses.slice(0, 40)) h1Feasibility(h.formula, ev);
    expect((performance.now() - t0) / 40).toBeLessThan(100);
  });
});

describe('oxygenEvidenceFloor (A2)', () => {
  const ir = (value: number, rel: number, shape: 'BROAD' | 'SHARP' = 'SHARP'): ObservedEvidence => ({id: `IR:t:${value}`, modality: 'IR', value, relativeIntensity: rel, shape, optional: false} as unknown as ObservedEvidence);
  const h1 = (value: number, broad: boolean): ObservedEvidence => ({id: `1H:t:${value}`, modality: '1H_NMR', value, relativeIntensity: null, shape: broad ? 'BROAD' : 'SHARP', multiplicity: broad ? 'br s' : 's', optional: false} as unknown as ObservedEvidence);
  const weak = [ir(3030, 40), ir(2965, 100), ir(1612, 20), ir(830, 15)];
  it('is null without IR observations', () => { expect(oxygenEvidenceFloor([h1(4.7, true)], false)).toBeNull(); });
  it('a broad O–H band alone gives 1', () => { expect(oxygenEvidenceFloor([...weak, ir(3350, 90, 'BROAD')], false)?.floor).toBe(1); });
  it('a strong C=O alone gives 1; a strong C–O alone gives 1', () => {
    expect(oxygenEvidenceFloor([...weak, ir(1715, 100)], false)?.floor).toBe(1);
    expect(oxygenEvidenceFloor([...weak, ir(1245, 100)], false)?.floor).toBe(1);
  });
  it('strong C=O and strong C–O together give 2', () => {
    const f = oxygenEvidenceFloor([...weak, ir(1715, 100), ir(1275, 90)], false)!;
    expect(f.floor).toBe(2);
    expect(f.sources[0].text).toContain('1715');
    expect(f.sources[0].observationIds).toContain('IR:t:1275');
  });
  it('an anhydride-type pair of strong C=O bands with a strong C–O gives 3', () => {
    expect(oxygenEvidenceFloor([...weak, ir(1820, 90), ir(1760, 100), ir(1050, 80)], false)?.floor).toBe(3);
  });
  it('bands that are only range matches (weak bands at 3030, 2965, 1612) do not count', () => {
    expect(oxygenEvidenceFloor(weak, false)).toEqual({floor: 0, sources: [], strongCarbonyl: false});
    // a weak band inside the C=O window is not "strong" either
    expect(oxygenEvidenceFloor([...weak, ir(1715, 20), ir(3350, 10)], false)?.floor).toBe(0);
    // a strong band outside the windows does not help either
    expect(oxygenEvidenceFloor([...weak, ir(2850, 100)], false)?.floor).toBe(0);
  });
  it('a broad exchangeable 1H signal gives 1 only when nothing points to N', () => {
    expect(oxygenEvidenceFloor([...weak, h1(4.7, true)], false)?.floor).toBe(1);
    expect(oxygenEvidenceFloor([...weak, h1(4.7, true)], true)?.floor).toBe(0);
  });
  it('the shapes give the floors the design expected (measured, see the stage report)', () => {
    const floors = Object.fromEntries(['S1', 'G1', 'E1', 'G3', 'D1'].map(id => [id, inferFixture(id).composition.v121?.oxygenFloor?.floor]));
    expect(floors).toEqual({S1: 1, G1: 1, E1: 2, G3: 2, D1: 2});
  });
  it('records whether a strong C=O was seen (used by the DBE sort key only)', () => {
    expect(inferFixture('E1').composition.v121?.oxygenFloor?.strongCarbonyl).toBe(true);
    expect(inferFixture('S1').composition.v121?.oxygenFloor?.strongCarbonyl).toBe(false);
  });
});

describe('composition inference with the planning flag (A1, A2)', () => {
  it('S1: no S formula is listed, the panel text says why; with the flag off the S formulas are back', () => {
    const on = inferFixture('S1').composition;
    expect(on.hypotheses.some(h => /S(?![a-z])/.test(h.formula))).toBe(false);
    expect(on.elementsExcluded.find(e => e.element === 'S')?.reason).toBe('未考慮 S（沒有 S 專屬證據；組成層白名單不含 S）');
    expect(on.v121).toMatchObject({sulfurConsidered: false});
    V12_CONFIG.useV121Planning = false;
    const off = inferFixture('S1').composition;
    expect(off.hypotheses.filter(h => /S(?![a-z])/.test(h.formula)).length).toBeGreaterThan(30);
    expect(off.elementsExcluded.find(e => e.element === 'S')).toBeUndefined();
    expect(off.v121).toBeUndefined();
  });
  it('the S rule applies to the MS route too: S needs S-specific (isotope) evidence', () => {
    const ei = (peaks: Partial<SpectralPeak>[]): ExperimentalSpectrumData => ({...spectrum('MS', peaks.map((p, i) => ({id: `MS-${i}`, manualPeak: true, y: 100, ...p})) as SpectralPeak[]), msParams: {msType: 'EI-MS', ionization: 'EI'}});
    const infer = (peaks: Partial<SpectralPeak>[]) => {
      const prepared = WorkbenchOrchestrator.prepareModeAEvidence({MS: ei(peaks)} as never, {});
      const plan = createReasoningPlan(prepared.bundle);
      return inferComposition({bundle: prepared.bundle, observations: plan.observations, userFormula: plan.userFormula});
    };
    const hasS = (r: ReturnType<typeof infer>) => r.hypotheses.some(h => (h.counts.S ?? 0) > 0);
    const noS = [{x: 150, y: 30}, {x: 151, y: 3.0}, {x: 152, y: 0.3}, {x: 105, y: 100}, {x: 77, y: 60}];
    V12_CONFIG.useV121Planning = false;
    expect(hasS(infer(noS))).toBe(true);
    V12_CONFIG.useV121Planning = true;
    expect(hasS(infer(noS))).toBe(false);
    // a clear S signature: M+2 about 4.5 % of M (S1 ≈ 4.5 %) opens S again
    const withS = [{x: 62, y: 100}, {x: 63, y: 3.2}, {x: 64, y: 4.6}, {x: 47, y: 60}, {x: 45, y: 50}];
    expect(hasS(infer(withS))).toBe(true);
  });
  it('h1-only: a single-O formula (G1) is now listed; with the flag off the soft IR bounds had pushed it out', () => {
    const on = inferFixture('G1').composition;
    expect(on.hypotheses.map(h => h.formula)).toContain('C9H12O');
    V12_CONFIG.useV121Planning = false;
    const off = inferFixture('G1').composition;
    expect(off.hypotheses.map(h => h.formula)).not.toContain('C9H12O');
  });
  it('O above the window [floor, k × floor + 1] is scored down one step per extra O and is not removed (S1: floor 1)', () => {
    const c = inferFixture('S1').composition;
    const siblings = (k: number, o: number) => c.hypotheses.filter(h => h.symmetryMultiple === k && h.counts.O === o).map(h => ({h, base: c.hypotheses.find(x => x.symmetryMultiple === k && x.counts.C === h.counts.C && x.counts.H === h.counts.H && x.counts.O === 1)})).filter(x => x.base);
    let checked = 0;
    for (const [k, o] of [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5]] as const) {
      const limit = k * 1 + COMPOSITION_CONFIG.weights.oxygenExcess * 0 + V12_CONFIG.planning.oxygenAllowedAboveFloor;
      for (const {h, base} of siblings(k, o)) {
        const expected = base!.score - COMPOSITION_CONFIG.weights.oxygenExcess * Math.max(0, o - limit);
        expect(h.score, `${h.formula} (k=${k})`).toBeCloseTo(expected, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
    // not removed: formulas above the window are still in the list
    expect(c.hypotheses.some(h => h.symmetryMultiple === 1 && (h.counts.O ?? 0) >= 3)).toBe(true);
    expect(c.hypotheses.some(h => h.symmetryMultiple === 2 && (h.counts.O ?? 0) >= 4)).toBe(true);
    const e1 = inferFixture('E1').composition; // floor 2, k = 1: O = 2 and 3 are free
    const e2 = e1.hypotheses.find(h => h.formula === 'C10H12O2')!, e3 = e1.hypotheses.find(h => h.formula === 'C10H12O3')!;
    expect(e3.score).toBeCloseTo(e2.score, 6);
  });
  it('the enumeration minimum uses the HARD bounds only (an IR-only O ≥ 2 no longer removes the O = 1 formulas)', () => {
    const c = inferFixture('S1').composition;
    expect(c.hypotheses.some(h => h.counts.O === 1)).toBe(true);
    expect(c.bounds.heteroMinimums.O ?? 0).toBeLessThanOrEqual(1);
  });
  it('the user formula path is not touched: it has no v121 block, and S in the formula is kept', () => {
    const withFormula = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(loadFixture('G1')), {molecularFormula: 'C9H10O2S'});
    const plan = createReasoningPlan(withFormula.bundle);
    const r = inferComposition({bundle: withFormula.bundle, observations: plan.observations, userFormula: plan.userFormula});
    expect(r.status).toBe('USER_FORMULA');
    expect(r.hypotheses[0].formula).toBe('C9H10O2S');
    expect(r.v121).toBeUndefined();
  });
});
