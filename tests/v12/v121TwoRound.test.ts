import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import {mergeRounds, type StructureGenerationRequest, type StructureGenerator} from '../../src/engines/composition/structureGenerator';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {REASON_LABEL} from '../../src/engines/enumeration/compositionPanelModel';
import {canonNoStereo, fixtureSpectra, inferFixture, loadFixture, SHAPE_BUDGET} from '../helpers/v121Golden';

// SYNTHETIC logic tests for the two-round search (A4): round 1 = readings without an alkene CH under a step cap, never a fallback;
// round 2 = the alkene readings; honest completeness. Budgets are steps only (timeMs is far away), so every number here is reproducible.
beforeAll(() => initializeRDKit(), 60000);
const saved = {...V12_CONFIG.planning};
afterEach(() => { Object.assign(V12_CONFIG.planning, saved); V12_CONFIG.useV121Planning = true; });

let legacyCalls = 0;
const legacy: StructureGenerator = {generateStructures: async () => { legacyCalls++; throw new Error('the legacy search must not run under planning'); }};
const generator = createExhaustiveGenerator(legacy);
const BIG = 3_600_000;
const request = (shape: string, formula: string, planning: {round: 1 | 2; maxStates?: number}, poolSteps = 10_000_000): StructureGenerationRequest => ({
  formula, hints: {} as never, budget: {timeMs: BIG, maxStates: poolSteps, maxResults: 48, maxFrontier: 4096, beamWidth: 64},
  enumerationBudget: {timeMs: BIG, maxStates: poolSteps, maxCandidates: 20000}, constraintEvidence: inferFixture(shape).evidence, planning, sharedPool: true,
});
const diag = (r: Awaited<ReturnType<StructureGenerator['generateStructures']>>) => r.enumeration!.runs[0];

describe('round 1 (A4)', () => {
  it('a formula without a usable reading reports ROUND1_NO_TEMPLATE_READING in no time and does not fall back (S1, C11H16O2)', async () => {
    legacyCalls = 0;
    const r = await generator.generateStructures(request('S1', 'C11H16O2', {round: 1, maxStates: 50_000}));
    const d = diag(r);
    expect(d.used).toBe(true);
    expect(d.fallbackReason).toBeNull();
    expect(d.incompleteReasons).toContain('ROUND1_NO_TEMPLATE_READING');
    expect(d.complete).toBe(false);
    expect(d.visited).toBe(0);
    expect(r.visited).toBe(0);
    expect(r.smiles).toEqual([]);
    expect(d.elapsedMs).toBeLessThan(1000);
    expect(d.v12?.path).toBe('INVENTORY');
    expect(legacyCalls).toBe(0);
  });
  it('runs only the readings without an alkene CH, finds the target, and says honestly that the alkene readings have not run (S1, C15H16O2)', async () => {
    legacyCalls = 0;
    const r = await generator.generateStructures(request('S1', 'C15H16O2', {round: 1, maxStates: 100_000}));
    const d = diag(r);
    expect(d.incompleteReasons).toContain('VINYL_READINGS_NOT_RUN');
    expect(d.incompleteReasons).not.toContain('ROUND1_NO_TEMPLATE_READING');
    expect(d.complete).toBe(false);
    expect(r.complete).toBe(false);
    expect(d.planning).toMatchObject({round: 1, templateReading: true, vinylException: false, vinylPending: true, vinylRun: false});
    expect(r.smiles.map(canonNoStereo)).toContain(canonNoStereo(loadFixture('S1').targetSmiles));
    expect(Object.values(r.enumeration!.origins!).every(o => o.round === 1)).toBe(true);
    // the plain readings themselves finished: no budget reason at all (the 64-alternative inventory cap of v1.2.0 is the only other reason this formula has)
    expect(d.incompleteReasons.filter(x => x !== 'VINYL_READINGS_NOT_RUN' && x !== 'INVENTORY_ALTERNATIVES_TRUNCATED')).toEqual([]);
    expect(legacyCalls).toBe(0);
  });
  it('alkene exception: when only the alkene class explains a signal, round 1 runs the alkene readings under the same cap and is not ROUND1_NO_TEMPLATE_READING (G3, C5H8O2)', async () => {
    const r = await generator.generateStructures(request('G3', 'C5H8O2', {round: 1, maxStates: 50_000}));
    const d = diag(r);
    expect(d.planning).toMatchObject({round: 1, templateReading: false, vinylException: true, vinylPending: false, vinylRun: true});
    expect(d.incompleteReasons).not.toContain('ROUND1_NO_TEMPLATE_READING');
    expect(d.incompleteReasons).not.toContain('VINYL_READINGS_NOT_RUN');
    expect(d.complete).toBe(true);
    expect(r.smiles.map(canonNoStereo)).toContain(canonNoStereo(loadFixture('G3').targetSmiles));
  });
  it('stops at the step cap with ROUND1_STEP_CAP (not STATE_BUDGET), reproducibly', async () => {
    const run = () => generator.generateStructures(request('S1', 'C10H8O2', {round: 1, maxStates: 3000}));
    const a = await run(), b = await run();
    expect(diag(a).incompleteReasons).toContain('ROUND1_STEP_CAP');
    expect(diag(a).incompleteReasons).not.toContain('STATE_BUDGET');
    expect(diag(a).complete).toBe(false);
    // each reading gets an equal share of the cap, so the total can stop a little short of it; it never goes past it by more than one check interval
    expect(a.visited).toBeGreaterThan(0);
    expect(a.visited).toBeLessThan(3000 + 1000);
    expect(a.termination).toBe('STATE_BUDGET');
    expect([b.visited, b.smiles]).toEqual([a.visited, a.smiles]);
  });
  it('when the analysis pool is smaller than the cap, the stop is a plain STATE_BUDGET (the cap was not the limit)', async () => {
    const r = await generator.generateStructures(request('S1', 'C10H8O2', {round: 1, maxStates: 50_000}, 1500));
    expect(diag(r).incompleteReasons).toContain('STATE_BUDGET');
    expect(diag(r).incompleteReasons).not.toContain('ROUND1_STEP_CAP');
  });
  it('the new reason codes have panel wording', () => {
    for (const code of ['VINYL_READINGS_NOT_RUN', 'ROUND1_STEP_CAP', 'ROUND1_NO_TEMPLATE_READING'] as const) expect(REASON_LABEL[code].length).toBeGreaterThan(10);
  });
});

describe('round 2 and the merge of the rounds (A4)', () => {
  it('round 2 runs only the alkene readings; the merged run is complete only if both rounds are (S1, C7H8O)', async () => {
    const r1 = await generator.generateStructures(request('S1', 'C7H8O', {round: 1, maxStates: 50_000}));
    expect(diag(r1).complete).toBe(false);
    const r2 = await generator.generateStructures(request('S1', 'C7H8O', {round: 2}));
    expect(diag(r2).planning?.round).toBe(2);
    const m = mergeRounds(r1, r2);
    const d = diag(m);
    expect(d.incompleteReasons).not.toContain('VINYL_READINGS_NOT_RUN');
    expect(d.planning).toMatchObject({round: 2, vinylPending: false, vinylRun: true});
    expect(d.complete).toBe(diag(r2).incompleteReasons.length === 0);
    expect(m.complete).toBe(d.complete);
    expect(d.visited).toBe(diag(r1).visited + diag(r2).visited);
    expect(new Set(m.smiles)).toEqual(new Set([...r1.smiles, ...r2.smiles]));
  });
  it('a round 2 that runs out of steps keeps the run incomplete with VINYL_READINGS_BUDGET (S1, C15H16O2)', async () => {
    const r1 = await generator.generateStructures(request('S1', 'C15H16O2', {round: 1, maxStates: 100_000}));
    const r2 = await generator.generateStructures(request('S1', 'C15H16O2', {round: 2}, 20_000));
    expect(diag(r2).incompleteReasons).toContain('VINYL_READINGS_BUDGET');
    const m = mergeRounds(r1, r2);
    expect(diag(m).complete).toBe(false);
    expect(diag(m).incompleteReasons).toContain('VINYL_READINGS_BUDGET');
    expect(diag(m).incompleteReasons).not.toContain('VINYL_READINGS_NOT_RUN');
    // the target found in round 1 stays, with its round-1 origin
    const target = r1.smiles.find(s => canonNoStereo(s) === canonNoStereo(loadFixture('S1').targetSmiles))!;
    expect(target).toBeDefined();
    expect(m.smiles).toContain(target);
    expect(m.enumeration!.origins![target].round).toBe(1);
  });
});

describe('the planned pipeline (A3 + A4 + A5 together)', () => {
  it('S1: round 2 gives at most one formula per k (at most 3), every other formula keeps VINYL_READINGS_NOT_RUN, and round 1 stays within its cap', async () => {
    legacyCalls = 0;
    const saved = ENUMERATION_CONFIG.legacySupplementWhenIncomplete;
    ENUMERATION_CONFIG.legacySupplementWhenIncomplete = false;
    try {
      const r = await executeSixStepAnalysis({spectra: fixtureSpectra(loadFixture('S1')), extraInput: {}}, SHAPE_BUDGET);
      const runs = r.reasoningTrace!.compositionSearch!.runs;
      const hyps = new Map(r.compositionInference!.hypotheses.map(h => [h.formula, h]));
      const round2 = runs.filter(x => x.enumeration?.planning?.round === 2);
      expect(round2.length).toBeGreaterThan(0);
      expect(round2.length).toBeLessThanOrEqual(V12_CONFIG.planning.maxRound2Formulas);
      const ks = round2.map(x => hyps.get(x.formula!)!.symmetryMultiple);
      expect(new Set(ks).size).toBe(ks.length);
      for (const x of runs) {
        const p = x.enumeration!.planning!;
        expect(p.round1Visited).toBeLessThanOrEqual(V12_CONFIG.planning.round1MaxStatesPerFormula + 600);
        if (p.round === 1 && p.vinylPending) expect(x.enumeration!.incompleteReasons).toContain('VINYL_READINGS_NOT_RUN');
        if (p.round === 2) expect(x.enumeration!.incompleteReasons).not.toContain('VINYL_READINGS_NOT_RUN');
        expect(x.enumeration!.used).toBe(true);
        expect(x.enumeration!.fallbackReason).toBeNull();
      }
      // every formula that has no run says why (a searchPlan reason), and the searched ones are marked with their round
      for (const h of r.compositionInference!.hypotheses) {
        const run = runs.find(x => x.formula === h.formula);
        if (run) expect(h.searchPlan?.status).toBe(run.enumeration!.planning!.round === 2 ? 'ROUND_2' : 'ROUND_1');
        else if (h.generatorSupported) expect(h.searchPlan?.status).toBe('NOT_SEARCHED');
      }
      expect(legacyCalls).toBe(0);
    } finally { ENUMERATION_CONFIG.legacySupplementWhenIncomplete = saved; }
  }, 300000);
  it('is reproducible with step budgets: two runs of G3 give the same runs, reasons and candidates', async () => {
    const run = async () => {
      const r = await executeSixStepAnalysis({spectra: fixtureSpectra(loadFixture('G3')), extraInput: {}}, SHAPE_BUDGET);
      return r.reasoningTrace!.compositionSearch!.runs.map(x => ({f: x.formula, t: x.termination, v: x.visited, c: x.candidates, r: x.enumeration!.incompleteReasons}));
    };
    const a = await run(), b = await run();
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(5);
  }, 300000);
});
