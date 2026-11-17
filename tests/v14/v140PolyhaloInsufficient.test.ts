import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {NMREngine} from '../../src/engines/nmrEngine';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';

// v1.4.0 stop 14: a polyhalomethane carbon whose halogens include F or I (CHF3, CH2F2, CHI3, ...) has only two compounds per halogen in the truth sets, so it must not be calibrated; the predicted number
// (10.32 / 7.36 / 6.20 against 6.25 / 5.45 / 4.91) is wrong by more than the tolerance. Under useV140H1 + v140.calibration2 that environment is not output as a number: it is listed as 資料不足 and never used in the ranking.
// Cl and Br polyhalomethanes stay as they were.
const was = {...(V12_CONFIG.v140 as any), h1: V12_CONFIG.useV140H1};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; Object.assign(V12_CONFIG.v140, {alkene: was.alkene, oxygen: was.oxygen, coverage: was.coverage, calibration2: was.calibration2, matching: was.matching}); });
const set = (h1: boolean, coverage: boolean, cal2: boolean) => { V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.coverage = coverage; V12_CONFIG.v140.calibration2 = cal2; };
const pred = (smi: string) => NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'}) as any;
const sig = (e: any[]) => e.map(x => `${x.integration}H@${x.shiftPpm.toFixed(2)}[${(x.atomIndices ?? []).join('/')}]`);

describe('F / I polyhalomethane C-H: 資料不足 instead of a number', () => {
  const INSUFF = [['FC(F)F', 'CHF3'], ['FCF', 'CH2F2'], ['IC(I)I', 'CHI3'], ['FC(Cl)Cl', 'CHFCl2 (mixed, contains F)']] as const;
  for (const [smi, name] of INSUFF) {
    it(`${name}: no environment with a number, listed as 資料不足 (POLYHALO_CH)`, () => {
      set(true, true, false);
      expect(pred(smi).environments.length, `${name} without calibration2 keeps its number`).toBeGreaterThan(0);
      set(true, true, true);
      const r = pred(smi);
      expect(r.environments, `${name} environments`).toEqual([]); expect(r.peaks).toEqual([]);
      expect(r.insufficientDataEnvironments).toHaveLength(1);
      expect(r.insufficientDataEnvironments[0]).toMatchObject({classId: 'POLYHALO_CH', labelZh: '資料不足'});
      expect(r.insufficientDataEnvironments[0].shiftPpm).toBeUndefined();
      // the prediction shown to the user (nmrEngine) also has no peak and does not fall back to another empirical number
      const shown = NMREngine.predictEmpirical1HNMR(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'} as any);
      expect(shown.spectrum.peaks).toEqual([]); expect(shown.environments).toEqual([]);
      expect(shown.spectrum.predictionNotes?.join(' ')).toMatch(/資料不足/);
    });
  }
  it('Cl and Br polyhalomethanes (CHCl3, CH2Cl2, CHBr3, CH2Br2) keep their numbers; so does everything else; flags off = no field', () => {
    for (const smi of ['ClC(Cl)Cl', 'ClCCl', 'BrC(Br)Br', 'BrCBr', 'CCOCC']) {
      set(true, true, true); const on = pred(smi);
      set(true, true, false); const off = pred(smi);
      expect(sig(on.environments), smi).toEqual(sig(off.environments)); expect(on.insufficientDataEnvironments).toBeUndefined();
    }
    set(false, true, true); const flagOff = pred('FC(F)F'); expect(flagOff.environments.length).toBeGreaterThan(0); expect(flagOff.insufficientDataEnvironments).toBeUndefined();
    set(true, true, true);
    // the other hydrogens of a molecule that contains an F-polyhalo carbon are still predicted
    const mix = pred('FC(F)(F)CBr'); expect(mix.insufficientDataEnvironments ?? []).toHaveLength(0);
  });
});

describe('ranking: a 資料不足 environment is not a basis (CHF3 as candidate)', () => {
  const fx = (h1: {x: number; integration: number; multiplicity: string}[]): V121Fixture => ({
    id: 'CHF3', description: 'CHF3 6.25 (Reich), synthetic test input', targetSmiles: 'FC(F)F', formula: 'CHF3',
    h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 1150, y: 20}]},
  });
  const h1Entries = (observed: number) => {
    const b = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(fx([{x: observed, integration: 1, multiplicity: 'q'}]), {denseBaseline: true}), {}).bundle;
    return scoreScientificEvidence('FC(F)F', b).entries.filter(e => e.sourceModality === '1H_NMR');
  };
  it('the observed signal inside the polyhalo window (5.0-7.7) is 資料不足 (compatibility null, weight 0) and the result does not depend on where it lies in the window', () => {
    set(true, true, true);
    const a = h1Entries(6.25), b = h1Entries(5.4);
    for (const es of [a, b]) {
      const o = es.find(e => !e.evidenceId.startsWith('1H:'))!;
      expect(o.compatibility).toBeNull(); expect(o.weight).toBe(0); expect(o.method).toMatch(/資料不足/);
    }
    expect(a.map(e => [e.compatibility, e.weight])).toEqual(b.map(e => [e.compatibility, e.weight]));
  });
  it('flags off: the signal is scored against the old number (compatibility is a number)', () => {
    set(true, true, false);
    const o = h1Entries(6.25).find(e => !e.evidenceId.startsWith('1H:'))!;
    expect(typeof o.compatibility).toBe('number');
  });
});
