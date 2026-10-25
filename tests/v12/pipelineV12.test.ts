import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {canonicalizeMolecule, initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {mk} from '../helpers/p1bScenarios';

// Complete flow through the same entry the Web Worker uses, with useV12Constraints = true. SYNTHETIC peak lists; program behaviour only.
beforeAll(() => initializeRDKit(), 60000);
afterEach(() => { V12_CONFIG.useV12Constraints = true; });   // the 1.2.0 default
const canon = (s: string) => canonicalizeMolecule(s).canonical;
const h1 = (peaks: {x: number; integration: number; multiplicity: string; jValues?: number[]; isBroad?: boolean}[]) => mk('1H_NMR', peaks as never, {nmrSolvent: 'CDCl3', observationCoverage: 'CONFIRMED_COMPLETE'});

describe('executeSixStepAnalysis with the v1.2 constraints', () => {
  it('ethyl ester shape + strong C=O + user formula: the inventory path runs, the target is a ranked candidate, the run is COMPLETE', async () => {
    V12_CONFIG.useV12Constraints = true;
    const spectra = {
      '1H_NMR': h1([{x: 8.04, integration: 2, multiplicity: 'm'}, {x: 7.55, integration: 1, multiplicity: 'm'}, {x: 7.43, integration: 2, multiplicity: 'm'}, {x: 4.37, integration: 2, multiplicity: 'q', jValues: [7.1]}, {x: 1.39, integration: 3, multiplicity: 't', jValues: [7.1]}]),
      IR: mk('IR', [{x: 1720, y: 100}, {x: 2980, y: 30}, {x: 1270, y: 70}, {x: 710, y: 60}]),
    };
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C9H10O2'}}, {});
    const run = r.reasoningTrace!.compositionSearch!.runs[0];
    expect(run.enumeration?.v12?.path).toBe('INVENTORY');
    expect(run.enumeration?.v12?.required.map(x => x.id).sort()).toEqual(['ETHYL', 'STRONG_CARBONYL']);
    expect(run.enumeration?.complete).toBe(true);
    expect(r.solvedConstraintSpace.searchResult!.smiles).toContain(canon('CCOC(=O)c1ccccc1'));
    expect(r.rankedCandidates.map(c => c.smiles)).toContain(canon('CCOC(=O)c1ccccc1'));
    expect(r.reasoningTrace!.stages).toHaveLength(6);
  }, 120000);

  it('the same request with the flag off has no v1.2 diagnostics', async () => {
    V12_CONFIG.useV12Constraints = false;
    const spectra = {'1H_NMR': h1([{x: 6.84, integration: 4, multiplicity: 's'}, {x: 3.77, integration: 6, multiplicity: 's'}])};
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C8H10O2'}}, {timeMs: 8000, maxStates: 500000});
    expect(r.reasoningTrace!.compositionSearch!.runs[0].enumeration?.v12).toBeUndefined();
  }, 120000);

  it('p-dimethoxybenzene shape with the flag on: the target is in the search result (its run is COMPLETE)', async () => {
    V12_CONFIG.useV12Constraints = true;
    const spectra = {'1H_NMR': h1([{x: 6.84, integration: 4, multiplicity: 's'}, {x: 3.77, integration: 6, multiplicity: 's'}])};
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C8H10O2'}}, {});
    const run = r.reasoningTrace!.compositionSearch!.runs[0];
    expect(run.enumeration?.v12?.path).toBe('INVENTORY');
    expect(run.enumeration?.complete).toBe(true);
    expect(r.solvedConstraintSpace.searchResult!.smiles).toContain(canon('COc1ccc(OC)cc1'));
  }, 120000);
});
