import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures, type FragmentSpec} from '../../src/engines/enumeration';
import {parseFormula} from '../../src/engines/enumeration/problem';
import {bruteForce, type BFFragment} from './bruteForce';
import {methyl, nitro, paraPhenylene, phenyl} from './fragments';

// T3 (formula only) and T4 (fragment assembly): the enumerator must give exactly the brute-force set. Synthetic, generic cases.
beforeAll(() => initializeRDKit(), 60000);
const toBF = (frags: FragmentSpec[]): BFFragment[] => frags.map(f => ({atoms: f.atoms, bonds: f.bonds, count: f.count}));
const counts = (formula: string) => { const p = parseFormula(formula); if (!p.ok) throw new Error(p.error.message); return p.counts; };
async function compare(formula: string, frags: FragmentSpec[] = []) {
  const r = await enumerateStructures({formula, alternatives: frags.length ? [{id: 'S', fragments: frags}] : undefined, budget: {maxStates: 2e9, timeMs: 100000}});
  expect(r.status, formula).toBe('COMPLETE');
  const ours = r.candidates.map(c => c.smiles).sort();
  const reference = [...bruteForce(counts(formula), toBF(frags))].sort();
  expect(ours).toEqual(reference);
  return {ours, r};
}

describe('T3 independent brute-force comparison (≤ 7 heavy atoms, C/N/O)', () => {
  const formulas = ['CH5N', 'C3H9N', 'C3H7N', 'C4H9N', 'C2H5NO', 'C3H5NO', 'C3H6O2', 'C5H10O', 'C4H8O2'];
  it.each(formulas)('%s: same count and same SMILES set', async formula => {
    const {ours} = await compare(formula);
    expect(ours.length).toBeGreaterThan(0);
  }, 120000);
});

describe('T4 fragment assembly versus brute force', () => {
  it('(i) 2 phenyl + 2 methyl + 1 free C = C15H16: contains 2,2-diphenylpropane and equals brute force', async () => {
    const {ours} = await compare('C15H16', [phenyl(2), methyl(2)]);
    const target = canonicalizeMolecule('CC(C)(c1ccccc1)c1ccccc1').canonical;
    expect(ours).toContain(target);
    expect(ours).toEqual([target]);
  });
  it('(ii) a para-disubstituted benzene fragment (2 open valences) + free C2O: equals brute force', async () => {
    const {ours} = await compare('C8H10O', [paraPhenylene()]);
    expect(ours.length).toBeGreaterThan(0);
  });
  it('(ii-b) para fragment + a methyl + a nitro group: one structure, equals brute force', async () => {
    const {ours} = await compare('C7H7NO2', [paraPhenylene(), methyl(), nitro()]);
    expect(ours).toEqual([canonicalizeMolecule('Cc1ccc([N+](=O)[O-])cc1').canonical]);
  });
  it('(iii) phenyl + methyl + free C2N: equals brute force', async () => {
    await compare('C9H13N', [phenyl(), methyl()]);
  });
  it('(iv) two identical phenyl copies + free C2O2 (copies interchangeable, no duplicate outputs): equals brute force', async () => {
    const {r} = await compare('C14H12O2', [phenyl(2)]);
    expect(new Set(r.candidates.map(c => c.smiles)).size).toBe(r.candidates.length);
  });
});
