import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.4.0 stop 2, task 1: methanol / THF (and cyclopentane, cyclohexanol …) got NO 1H environment. Root cause (a bug outside the flag): ChemistryEngine.parseStructureInput(<string>) reads a string that is only
// letters and ring digits (no branch, no '=', no aromatic) as a MOLECULAR FORMULA: 'CO' (distinct symbols), 'C1CCOC1' (a digit). The structure then has smiles "" and the 1H / 13C predictors return nothing.
// The candidate ledger passes a SMILES as a bare string, so it was exposed. Fixed under useV140H1 (the {smiles} form is never read as a formula); off = v1.3.2.
const was = {h1: V12_CONFIG.useV140H1, pf: V12_CONFIG.v140.parseFix};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.parseFix = was.pf; });

const fx = (id: string, formula: string, smiles: string, h1: {x: number; integration: number; multiplicity: string}[]): V121Fixture => ({
  id, description: 'Fulmer 2010 SI Table S7 shifts (CDCl3), see tests/fixtures/v140/h1Truth.json', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
});
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;

describe('which strings are read as formulas', () => {
  it('the bare string form loses the SMILES for methanol, THF, cyclopentane, cyclohexanol, cyclohexylamine; the object form never does; a branched / unsaturated / aromatic SMILES is fine either way', () => {
    for (const smi of ['CO', 'C1CCOC1', 'C1CCCC1', 'OC1CCCCC1', 'NC1CCCCC1']) {
      expect(ChemistryEngine.parseStructureInput(smi).smiles, `string ${smi}`).toBe('');
      expect(ChemistryEngine.parseStructureInput({smiles: smi}).smiles, `object ${smi}`).toBe(smi);
    }
    for (const smi of ['CCO', 'CC(C)O', 'C=CCC', 'Cc1ccccc1', 'CC(=O)OCC']) expect(ChemistryEngine.parseStructureInput(smi).smiles, smi).toBe(smi);
  });
  it('the predictor itself is fine: given the SMILES it predicts THF (OCH2 / CH2) and methanol (CH3)', () => {
    const thf = NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: 'C1CCOC1'}), {solvent: 'CDCl3'}).environments;
    expect(thf.length).toBeGreaterThanOrEqual(2);
    expect(NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: 'CO'}), {solvent: 'CDCl3'}).environments.length).toBeGreaterThanOrEqual(1);
    expect(NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput('C1CCOC1'), {solvent: 'CDCl3'}).environments).toHaveLength(0);   // the bug
  });
});

describe('the candidate ledger', () => {
  const THF = fx('THF', 'C4H8O', 'C1CCOC1', [{x: 3.76, integration: 4, multiplicity: 'm'}, {x: 1.85, integration: 4, multiplicity: 'm'}]);
  const MEOH = fx('MEOH', 'CH4O', 'CO', [{x: 3.49, integration: 3, multiplicity: 's'}]);
  const h1Score = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, bundleOf(f)).modalityScores['1H_NMR'] as number;
  it('flag off (v1.3.2): THF and methanol get no 1H support (their own 1H score is the empty-prediction value); flag on: they do', () => {
    V12_CONFIG.v140.parseFix = false; const offThf = h1Score('C1CCOC1', THF), offMe = h1Score('CO', MEOH);
    V12_CONFIG.v140.parseFix = true; const onThf = h1Score('C1CCOC1', THF), onMe = h1Score('CO', MEOH);
    expect(onThf).toBeGreaterThan(offThf + 10); expect(onMe).toBeGreaterThan(offMe + 10);
  });
  // Task 1 alone (the SMILES-vs-formula parse) changes nothing for a candidate the old path already parsed. The flag now ALSO switches on the task-3 additive rules, which move ethyl acetate's OCH2 (4.30 to 4.20,
  // pinned in v140Rules.test.ts), so this check uses toluene, which no additive rule touches (v140Rules: unrecognised / aromatic structures are left alone). The tolerance is unchanged.
  it('flag on or off, a candidate that was never affected scores the same (toluene)', () => {
    const f = fx('TOL', 'C7H8', 'Cc1ccccc1', [{x: 7.17, integration: 5, multiplicity: 'm'}, {x: 2.34, integration: 3, multiplicity: 's'}]);
    V12_CONFIG.useV140H1 = false; const off = scoreScientificEvidence('Cc1ccccc1', bundleOf(f)).totalScore;
    V12_CONFIG.useV140H1 = true; const on = scoreScientificEvidence('Cc1ccccc1', bundleOf(f)).totalScore;
    expect(on).toBeCloseTo(off, 9);
  });
});
