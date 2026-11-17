import {afterAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {StructureParserAdapter} from '../../src/engines/chemistryEngine';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';

// v1.4.2 stop 28 (D.1): the SMILES parser gave an N-substituted aromatic n (n(C), n(-aryl), n(C=O)) one phantom H (its bonds 1 + 1.5 + 1.5 = 4 made it look like N(V)). Fixed under useV140H1 AND v140.matching
// (where the stop-8 thiophene fix sits); with either flag off every result is as before. The bit-for-bit check over 1,241 structures (panel, tier 1-3 truth, 1,040 nmrshiftdb2 compounds) was run on the commit before / after
// (notes/v1.4.2/STOP28_CHECKPOINT.md); this test pins the behaviour on named structures.
const was = {h1: V12_CONFIG.useV140H1, m: V12_CONFIG.v140.matching};
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.matching = was.m; });
const hOf = (smi: string) => { const g = StructureParserAdapter.parseSmilesGraph(smi).graph!; return {H: g.atomCounts.H, nH: g.atoms.filter(a => a.element === 'N').map(a => a.totalHydrogens).join('/')}; };
// [name, smiles, H flags off, N hydrogens flags off, H fixed, N hydrogens fixed]
const CASES: [string, string, number, string, number, string][] = [
  ['N-methylindole C9H9N', 'Cn1ccc2ccccc21', 10, '1', 9, '0'],
  ['N-methylpyrrole C5H7N', 'Cn1cccc1', 8, '1', 7, '0'],
  ['N-phenylindole C14H11N', 'c1ccc(-n2ccc3ccccc32)cc1', 12, '1', 11, '0'],
  ['N-Boc-indole C13H15NO2', 'CC(C)(C)OC(=O)n1ccc2ccccc21', 16, '1', 15, '0'],
  ['caffeine C8H10N4O2', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 13, '1/0/1/1', 10, '0/0/0/0'],
  ['1-methylimidazole C4H6N2', 'Cn1ccnc1', 7, '1/0', 6, '0/0'],
  // not touched: [nH] (explicit count), pyridine, imidazole N-H, pyridinium (charged)
  ['indole', 'c1ccc2[nH]ccc2c1', 7, '1', 7, '1'], ['pyridine', 'c1ccncc1', 5, '0', 5, '0'], ['imidazole', 'c1c[nH]cn1', 4, '1/0', 4, '1/0'], ['N-methylpyridinium', 'C[n+]1ccccc1', 8, '0', 8, '0'],
];
describe('stop 28 D.1: N-substituted aromatic n has no hydrogen (under useV140H1 + v140.matching)', () => {
  it('named structures: flags off, only useV140H1, only matching = the old counts; both on = fixed', async () => {
    await initializeRDKit();
    for (const [name, smi, hOff, nOff, hOn, nOn] of CASES) {
      for (const [h1, m] of [[false, false], [true, false], [false, true]] as const) { V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.matching = m; expect(hOf(smi), `${name} h1=${h1} matching=${m}`).toEqual({H: hOff, nH: nOff}); }
      V12_CONFIG.useV140H1 = true; V12_CONFIG.v140.matching = true;
      expect(hOf(smi), `${name} fixed`).toEqual({H: hOn, nH: nOn});
    }
  });
  it('the formula of the fixed graphs is the real one (RDKit): C9H9N, C8H10N4O2', async () => {
    await initializeRDKit(); V12_CONFIG.useV140H1 = true; V12_CONFIG.v140.matching = true;
    expect(hOf('Cn1ccc2ccccc21').H).toBe(9); expect(hOf('Cn1cnc2c1c(=O)n(C)c(=O)n2C').H).toBe(10);
  });
});
