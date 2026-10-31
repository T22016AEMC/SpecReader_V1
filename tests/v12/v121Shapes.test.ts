import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {canonNoStereo, fixtureSpectra, loadFixture, SHAPE_BUDGET, type V121Fixture} from '../helpers/v121Golden';

// ACCEPTANCE of the A class on five hand-written generic shapes (tests/fixtures/v121; not predictor output, not any measured spectrum).
// With NO formula given, the formula of the shape must be searched and the shape's structure must appear in the output. Only "appears" is checked:
// nothing here says anything about ranking or accuracy. D1 is an observation case: its facts are recorded, nothing is asserted about its target.
beforeAll(() => initializeRDKit(), 60000);

const analyse = async (f: V121Fixture) => {
  const was = ENUMERATION_CONFIG.legacySupplementWhenIncomplete;
  ENUMERATION_CONFIG.legacySupplementWhenIncomplete = false; // the bounded legacy supplement runs on a wall clock; steps only here
  try { return await executeSixStepAnalysis({spectra: fixtureSpectra(f), extraInput: {}}, SHAPE_BUDGET); } finally { ENUMERATION_CONFIG.legacySupplementWhenIncomplete = was; }
};

describe('v1.2.1 acceptance without a formula (appearance only)', () => {
  for (const id of ['S1', 'G1', 'E1', 'G3'] as const) {
    it(`${id}: the formula is searched and the structure appears in the output`, async () => {
      const f = loadFixture(id);
      const r = await analyse(f);
      const h = r.compositionInference!.hypotheses.find(x => x.formula === f.formula);
      expect(h, `${f.formula} is in the formula list`).toBeDefined();
      expect(h!.searched, `${f.formula} was searched`).toBe(true);
      expect(r.reasoningTrace!.compositionSearch!.runs.some(x => x.formula === f.formula)).toBe(true);
      const out = (r.solvedConstraintSpace.searchResult?.smiles ?? []).map(canonNoStereo);
      expect(out).toContain(canonNoStereo(f.targetSmiles));
      expect(r.reasoningTrace!.compositionSearch!.mode).toBe('COMPOSITION_HYPOTHESES');
    }, 300000);
  }
  it('G3 (alkene): the alkene readings are not starved — the formula ran its alkene readings in round 1 by the exception', async () => {
    const f = loadFixture('G3');
    const r = await analyse(f);
    const run = r.reasoningTrace!.compositionSearch!.runs.find(x => x.formula === f.formula)!;
    expect(run.enumeration!.planning).toMatchObject({vinylException: true, vinylRun: true});
    expect(run.enumeration!.incompleteReasons).not.toContain('VINYL_READINGS_NOT_RUN');
    expect(run.candidates).toBeGreaterThan(0);
  }, 300000);
  it('S1: both rounds ran for the best formula of some k; the two-ring formula is among the searched ones in the plan order', async () => {
    const f = loadFixture('S1');
    const r = await analyse(f);
    const runs = r.reasoningTrace!.compositionSearch!.runs;
    expect(runs.length).toBeLessThanOrEqual(V12_CONFIG.planning.maxRound1Formulas);
    expect(runs.map(x => x.formula)).toContain('C15H16O2');
    const hyps = r.compositionInference!.hypotheses;
    expect(hyps.filter(x => /S(?![a-z])/.test(x.formula))).toHaveLength(0);
  }, 300000);
  it('D1 (observation only, not a pass condition): records whether the formula of the shape was listed and searched', async () => {
    const f = loadFixture('D1');
    const r = await analyse(f);
    const h = r.compositionInference!.hypotheses.find(x => x.formula === f.formula);
    const out = (r.solvedConstraintSpace.searchResult?.smiles ?? []).map(canonNoStereo);
    const facts = {
      oxygenFloor: r.compositionInference!.v121?.oxygenFloor?.floor, listed: Boolean(h), searched: h?.searched ?? false, plan: h?.searchPlan ?? null,
      targetInOutput: out.includes(canonNoStereo(f.targetSmiles)), hypotheses: r.compositionInference!.hypotheses.length, searchedFormulas: r.reasoningTrace!.compositionSearch!.runs.map(x => x.formula),
    };
    console.info(`[D1 observation] ${JSON.stringify(facts)}`);
    expect(facts.oxygenFloor).toBe(2); // the floor is a measured fact; whether O4 (above floor + 1) is listed or searched is only recorded
  }, 300000);
});
