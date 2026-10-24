import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures, type FragmentSpec} from '../../src/engines/enumeration';
import {parseFormula} from '../../src/engines/enumeration/problem';
import {bruteForce, type BFFragment} from './bruteForce';
import {methyl, phenyl} from './fragments';

// F1/F2: flex atoms (H count not fixed; remaining valence may be implicit H or new bonds). Generic synthetic skeletons.
beforeAll(() => initializeRDKit(), 60000);
const toBF = (frags: FragmentSpec[]): BFFragment[] => frags.map(f => ({atoms: f.atoms, bonds: f.bonds, count: f.count}));
const counts = (formula: string) => { const p = parseFormula(formula); if (!p.ok) throw new Error(p.error.message); return p.counts; };
const run = (formula: string, frags: FragmentSpec[]) => enumerateStructures({formula, alternatives: [{id: 'S', fragments: frags}], budget: {maxStates: 2e9, timeMs: 100000}});
async function compare(formula: string, frags: FragmentSpec[]) {
  const r = await run(formula, frags);
  expect(r.status, formula).toBe('COMPLETE');
  const ours = r.candidates.map(c => c.smiles).sort();
  expect(ours).toEqual([...bruteForce(counts(formula), toBF(frags))].sort());
  return ours;
}
const flexAtoms = (...els: string[]) => els.map(element => ({element, flex: true}));
const carbonylFlex = (id = 'carbonyl', count = 1): FragmentSpec => ({id, count, atoms: flexAtoms('C', 'O'), bonds: [{a: 0, b: 1, order: 2}]});
const ethylFlex = (id = 'ethyl', count = 1): FragmentSpec => ({id, count, atoms: flexAtoms('C', 'C'), bonds: [{a: 0, b: 1, order: 1}]});
const ringFlex = (id = 'ring', count = 1): FragmentSpec => ({
  id, count, atoms: flexAtoms('C', 'C', 'C', 'C', 'C', 'C'),
  bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]].map(([a, b, order]) => ({a, b, order: order as 1 | 2, aromatic: true})),
});

describe('F1 flex fragments versus the independent brute force', () => {
  it('(a) carbonyl skeleton C=O + free C3 (C4H8O)', async () => {
    const out = await compare('C4H8O', [carbonylFlex()]);
    expect(out).toContain(canonicalizeMolecule('CCCC=O').canonical);
    expect(out).toContain(canonicalizeMolecule('CCC(C)=O').canonical);
    expect(out).toContain(canonicalizeMolecule('CC(C)C=O').canonical);
  });
  it('(b) aromatic skeleton (Kekulé ring, all flex) + free C2 (C8H10): ethylbenzene and the three xylenes', async () => {
    const out = await compare('C8H10', [ringFlex()]);
    expect(out).toEqual(['CCc1ccccc1', 'Cc1ccc(C)cc1', 'Cc1cccc(C)c1', 'Cc1ccccc1C'].map(s => canonicalizeMolecule(s).canonical).sort());
  });
  it('(b2) aromatic skeleton + free C and O (C7H8O): cresols, benzyl alcohol, anisole', async () => {
    const out = await compare('C7H8O', [ringFlex()]);
    expect(out).toEqual(['Cc1ccccc1O', 'Cc1cccc(O)c1', 'Cc1ccc(O)cc1', 'OCc1ccccc1', 'COc1ccccc1'].map(s => canonicalizeMolecule(s).canonical).sort());
  });
  it('(c) two identical flex copies (count 2) + a free O (C4H10O)', async () => {
    const out = await compare('C4H10O', [ethylFlex('e', 2)]);
    expect(out).toContain(canonicalizeMolecule('CCOCC').canonical);
    expect(out).toContain(canonicalizeMolecule('CCCCO').canonical);
  });
  it('(c2) two identical carbonyl copies + free C2 (C4H6O2)', async () => {
    await compare('C4H6O2', [carbonylFlex('c', 2)]);
  });
  it('(d) flex mixed with open: flex C=O + one open methyl + free C (C3H6O)', async () => {
    const out = await compare('C3H6O', [carbonylFlex(), methyl()]);
    expect(out).toEqual(['CC(C)=O', 'CCC=O'].map(s => canonicalizeMolecule(s).canonical).sort());
  });
  it('(d2) open phenyl + flex C=O + free C (C8H8O): flex and open in one set', async () => {
    const out = await compare('C8H8O', [phenyl(), carbonylFlex()]);
    expect(out).toContain(canonicalizeMolecule('CC(=O)c1ccccc1').canonical);
    expect(out).toContain(canonicalizeMolecule('O=CCc1ccccc1').canonical);
  });
});

describe('F2 flex versus open with the H count fixed', () => {
  const open = (h1: number, h2: number): FragmentSpec => ({id: 'ethyl', atoms: [{element: 'C', fixedH: h1, open: true}, {element: 'C', fixedH: h2, open: true}], bonds: [{a: 0, b: 1, order: 1}]});
  it.each([[2, 3], [1, 3], [2, 2], [0, 3], [1, 2], [0, 2]] as const)('C–C skeleton with H = (%i,%i) fixed and open ⊆ the flex output (C5H12O)', async (h1, h2) => {
    const formula = 'C5H12O';
    const flex = new Set((await run(formula, [ethylFlex()])).candidates.map(c => c.smiles));
    const fixed = await run(formula, [open(h1, h2)]);
    expect(fixed.status).toBe('COMPLETE');
    for (const c of fixed.candidates) expect(flex.has(c.smiles), `${c.smiles} with H=(${h1},${h2})`).toBe(true);
  });
  it('flex is strictly larger than any single fixed-H reading', async () => {
    const flex = (await run('C5H12O', [ethylFlex()])).candidates.length;
    const one = (await run('C5H12O', [open(2, 3)])).candidates.length;
    expect(flex).toBeGreaterThan(one);
  });
  it('errors: open+flex together, fixedH on a flex atom', async () => {
    const both: FragmentSpec = {id: 'x', atoms: [{element: 'C', open: true, flex: true}], bonds: []};
    expect((await run('CH4', [both])).errors.map(e => e.code)).toEqual(['INVALID_FRAGMENT']);
    const withH: FragmentSpec = {id: 'y', atoms: [{element: 'C', flex: true, fixedH: 1}], bonds: []};
    expect((await run('CH4', [withH])).errors.map(e => e.code)).toEqual(['INVALID_FRAGMENT']);
  });
});
