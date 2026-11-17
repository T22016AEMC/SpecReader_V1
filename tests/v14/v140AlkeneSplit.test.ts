import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {knowledgeBase} from '../../src/engines/scientificEngines/h1AdditiveRules';

// v1.4.0 stop 14: a terminal =CH2 whose other carbon carries a substituent that is not a row of the ALKENES block (a heteroaryl such as 4-pyridyl, a perhalogenated / dihalogenated methyl such as CCl3)
// used to come out as ONE 2H environment at 5.25 (alkeneShifts returned null, the atom kept the graph value). The two hydrogens are not equivalent (one cis, one trans to the substituent), so under
// useV140H1 + v140.alkene they are now two 1H environments; the substituent is read as the closest tabulated row, with a wider uncertainty.
const was = {h1: V12_CONFIG.useV140H1, a: V12_CONFIG.v140.alkene};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.alkene = was.a; });
const envs = (smi: string, h1: boolean, alkene: boolean) => {
  V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.alkene = alkene;
  return NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'}).environments as any[];
};
const sig = (e: any[]) => e.map(x => `${x.integration}H@${x.shiftPpm.toFixed(2)}[${(x.atomIndices ?? []).join('/')}]`);
const row = (name: string) => knowledgeBase().get('ALKENES')!.rows.get(name)!;
const ALK = knowledgeBase().get('ALKENES')!.base;

describe('=CH2 next to an untabulated substituent is split in two 1H', () => {
  it('4-vinylpyridine: =CH2 = two 1H (5.25 + cis/trans of the phenyl row), =CH = 5.25 + gem phenyl', () => {
    const e = envs('C=Cc1ccncc1', true, true);
    const ch2 = e.filter(x => (x.atomIndices ?? []).join() === '0');
    expect(ch2.map(x => x.integration)).toEqual([1, 1]);
    expect(ch2.map(x => x.shiftPpm).sort((a, b) => a - b).map(x => +x.toFixed(2))).toEqual([+(ALK + row('-phenyl')[2]).toFixed(2), +(ALK + row('-phenyl')[1]).toFixed(2)]);
    expect(ch2[0].shiftPpm).not.toBe(ch2[1].shiftPpm);
    const ch = e.filter(x => (x.atomIndices ?? []).join() === '1');
    expect(ch.length).toBe(1); expect(+ch[0].shiftPpm.toFixed(2)).toBe(+(ALK + row('-phenyl')[0]).toFixed(2));
    // the ring is untouched
    expect(sig(e).filter(s => /\[4\/6\]|\[3\/7\]/.test(s))).toEqual(['2H@8.53[4/6]', '2H@7.14[3/7]']);
    // the approximation is declared and the uncertainty is wider than a plain rule
    expect(ch2[0].uncertaintyPpm).toBeGreaterThan(0.3);
    expect(JSON.stringify(ch2[0].appliedCorrections)).toMatch(/closest tabulated row/);
  });
  it('3,3,3-trichloropropene: =CH2 = two 1H (CCl3 read as the -CF3 row), =CH = 5.25 + gem -CF3', () => {
    const e = envs('C=CC(Cl)(Cl)Cl', true, true);
    const ch2 = e.filter(x => (x.atomIndices ?? []).join() === '0');
    expect(ch2.map(x => x.integration)).toEqual([1, 1]);
    expect(ch2.map(x => +x.shiftPpm.toFixed(2)).sort((a, b) => a - b)).toEqual([+(ALK + row('-CF3')[2]).toFixed(2), +(ALK + row('-CF3')[1]).toFixed(2)]);
    const ch = e.filter(x => (x.atomIndices ?? []).join() === '1');
    expect(+ch[0].shiftPpm.toFixed(2)).toBe(+(ALK + row('-CF3')[0]).toFixed(2));
  });
  it('flags: useV140H1 off or v140.alkene off = the stop-13 output (one 2H at 5.25)', () => {
    for (const smi of ['C=Cc1ccncc1', 'C=CC(Cl)(Cl)Cl']) {
      const off = envs(smi, false, true);
      expect(sig(off).filter(s => /\[0\]/.test(s)), `${smi} useV140H1 off`).toEqual(['2H@5.25[0]']);
      expect(sig(envs(smi, true, false)), `${smi} alkene off`).toEqual(sig(off));
    }
  });
  it('already tabulated substituents are not touched (propene, styrene, acrylonitrile)', () => {
    expect(sig(envs('C=CC', true, true))).toEqual(['1H@5.70[1]', '1H@5.03[0]', '1H@4.97[0]', '3H@1.71[2]']);
    expect(sig(envs('C=Cc1ccccc1', true, true))).toEqual(['2H@7.20[4/6]', '2H@7.12[3/7]', '1H@7.11[5]', '1H@6.63[1]', '1H@5.61[0]', '1H@5.18[0]']);
    expect(sig(envs('C=CC#N', true, true))).toEqual(['1H@5.52[1]', '1H@6.00[0]', '1H@5.80[0]']);
  });
});
