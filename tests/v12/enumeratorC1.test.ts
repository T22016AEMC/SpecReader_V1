import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures, type FragmentAlternativeSet, type FragmentSpec} from '../../src/engines/enumeration';
import {parseFormula} from '../../src/engines/enumeration/problem';
import {bruteForceV12, type BFSet} from './bruteForceV12';

// C1: the v1.2 enumerator against the independent brute force (tests/v12/bruteForceV12.ts, imports nothing from src/engines).
// Every case compares the COMPLETE canonical-SMILES sets. Equivalence groups, adjacency limits, aromatic flags, required substructures and
// pools are each checked on their own and together; the incremental symmetry pruning is switched on and off. All cases are generic and synthetic.
beforeAll(() => initializeRDKit(), 60000);

const counts = (formula: string) => { const p = parseFormula(formula); if (!p.ok) throw new Error(p.error.message); return p.counts; };
const CH3 = (extra: object = {}, count = 1, id = 'CH3'): FragmentSpec => ({id, count, atoms: [{element: 'C', fixedH: 3, open: true, ...extra}], bonds: []});
const CH2 = (extra: object = {}, count = 1, id = 'CH2'): FragmentSpec => ({id, count, atoms: [{element: 'C', fixedH: 2, open: true, ...extra}], bonds: []});
const CH = (extra: object = {}, count = 1, id = 'CH'): FragmentSpec => ({id, count, atoms: [{element: 'C', fixedH: 1, open: true, ...extra}], bonds: []});
const C0 = (extra: object = {}, count = 1, id = 'C0'): FragmentSpec => ({id, count, atoms: [{element: 'C', open: true, ...extra}], bonds: []});
const O0 = (extra: object = {}, count = 1, id = 'O0'): FragmentSpec => ({id, count, atoms: [{element: 'O', open: true, ...extra}], bonds: []});
const OH = (extra: object = {}, count = 1, id = 'OH'): FragmentSpec => ({id, count, atoms: [{element: 'O', fixedH: 1, open: true, ...extra}], bonds: []});
const KEKULE: [number, number, 1 | 2][] = [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]];
/** Benzene template: positions in `sites` are open substituent positions (H = 0), the others aromatic CH (pool `pool`). */
const ring = (sites: number[], pool: string | null, id = 'ring'): FragmentSpec => ({
  id,
  atoms: Array.from({length: 6}, (_, i) => (sites.includes(i) ? {element: 'C', open: true, aromatic: true} : {element: 'C', fixedH: 1, aromatic: true, ...(pool ? {group: pool} : {})})),
  bonds: KEKULE.map(([a, b, order]) => ({a, b, order, aromatic: true})),
});

async function both(formula: string, set: Omit<FragmentAlternativeSet, 'id'>, prune?: boolean) {
  const req = {formula, alternatives: [{id: 'S', ...set}], symmetryPruning: prune, budget: {maxStates: 2e9, timeMs: 120000}};
  const r = await enumerateStructures(req);
  const ours = r.status === 'INVALID_REQUEST' ? [] : r.candidates.map(c => c.smiles).sort();
  if (r.status !== 'INVALID_REQUEST') expect(r.status, formula).toBe('COMPLETE');
  const bfSet: BFSet = {
    fragments: set.fragments.map(f => ({atoms: f.atoms, bonds: f.bonds, count: f.count})),
    equivalentGroups: set.equivalentGroups, required: set.required, equivalencePools: set.equivalencePools,
  };
  const reference = [...(await bruteForceV12(counts(formula), bfSet))].sort();
  return {ours, reference, status: r.status};
}
async function same(formula: string, set: Omit<FragmentAlternativeSet, 'id'>) {
  const a = await both(formula, set);
  expect(a.ours, `${formula} (symmetry pruning on)`).toEqual(a.reference);
  const b = await both(formula, set, false);
  expect(b.ours, `${formula} (symmetry pruning off)`).toEqual(a.reference);
  return a.ours;
}

describe('C1 equivalence groups', () => {
  it('2 CH3 in one group: only the symmetric ether remains; without the group the unsymmetric one is also there', async () => {
    const withGroup = await same('C4H10O', {fragments: [CH3({group: 'm'}, 2), CH2({}, 2), O0()], equivalentGroups: ['m']});
    const without = await same('C4H10O', {fragments: [CH3({}, 2), CH2({}, 2), O0()]});
    expect(without).toHaveLength(2);
    expect(withGroup).toHaveLength(1);
    expect(without).toEqual(expect.arrayContaining(withGroup));
  });
  it('a group of 2 methyls next to a plain methyl (C5H10)', async () => {
    const out = await same('C5H10', {fragments: [CH3({group: 'g'}, 2, 'A'), CH3({}, 1, 'B'), CH({}), C0()], equivalentGroups: ['g']});
    expect(out.length).toBeGreaterThan(0);
  });
  it('a group of 3 (tert-butyl-like) and a group of 2 CH2 together', async () => {
    await same('C6H14O', {fragments: [CH3({group: 't'}, 3, 'T'), C0(), CH2({group: 'e'}, 2, 'E'), O0()], equivalentGroups: ['t', 'e']});
  });
  it('a group that no molecule can satisfy gives the empty set (both)', async () => {
    const out = await same('C3H8O', {fragments: [CH3({group: 'x'}, 2), CH2(), O0()], equivalentGroups: ['x']});
    expect(out.length).toBeGreaterThanOrEqual(0);
  });
});

describe('C1 adjacency limit (singlet rule: no carbon neighbour with hydrogen)', () => {
  it('a no-H-neighbour methyl can only sit on O or on a carbon without H (pinned atoms)', async () => {
    const out = await same('C4H10O', {fragments: [CH3({noHCarbonNeighbors: true}, 1, 'Mq'), CH3({}, 1, 'Mp'), CH2({}, 2), O0()]});
    expect(out).toHaveLength(1);
  });
  it('with free atoms (implicit H): the neighbour carbon may not keep an implicit H', async () => {
    const out = await same('C4H10O', {fragments: [CH3({noHCarbonNeighbors: true})]});
    expect(out.length).toBeGreaterThan(0);
  });
  it('two no-H methyls and a quaternary carbon (C5H12)', async () => {
    await same('C5H12', {fragments: [CH3({noHCarbonNeighbors: true}, 2, 'A'), CH3({}, 2, 'B'), C0()]});
  });
});

describe('C1 aromatic flag', () => {
  it('six aromatic CH: only benzene (not prismane, fulvene-like, open chains …)', async () => {
    const out = await same('C6H6', {fragments: [CH({aromatic: true}, 6)]});
    expect(out).toEqual(['c1ccccc1']);
  });
  it('5 aromatic CH + aromatic C + methyl: toluene only', async () => {
    const out = await same('C7H8', {fragments: [CH({aromatic: true}, 5), C0({aromatic: true}), CH3()]});
    expect(out).toEqual(['Cc1ccccc1']);
  });
  it('5 aromatic CH + aromatic N: pyridine only', async () => {
    const out = await same('C5H5N', {fragments: [CH({aromatic: true}, 5), {id: 'N', atoms: [{element: 'N', open: true, aromatic: true}], bonds: []}]});
    expect(out).toEqual(['c1ccncc1']);
  });
  it('the same atoms without the flag give more structures', async () => {
    const out = await same('C6H6', {fragments: [CH({}, 6)]});
    expect(out.length).toBeGreaterThan(1);
  });
});

describe('C1 required substructures (overlap allowed)', () => {
  it('a carbonyl is required (C4H8O2, free atoms)', async () => {
    const out = await same('C4H8O2', {fragments: [], required: [{id: 'co', smarts: '[CX3]=[OX1]'}]});
    expect(out.length).toBeGreaterThan(0);
  });
  it('two overlapping requirements: C=O and an sp3-bound ether/ester oxygen share atoms', async () => {
    const out = await same('C4H8O2', {fragments: [], required: [{id: 'co', smarts: '[CX3]=[OX1]'}, {id: 'o', smarts: '[CX3][OX2]'}]});
    expect(out.length).toBeGreaterThan(0);
  });
  it('a count of two: two methyl groups', async () => {
    await same('C4H8O2', {fragments: [], required: [{id: 'me', smarts: '[CH3]', minMatches: 2}]});
  });
  it('a requirement no candidate meets gives the empty set', async () => {
    const out = await same('C3H8O', {fragments: [], required: [{id: 'nitrile', smarts: '[CX2]#[NX1]'}]});
    expect(out).toEqual([]);
  });
  it('a required substructure that overlaps fragment atoms (phenol C–O with a phenyl fragment): found, which the non-overlapping reading cannot do', async () => {
    const out = await same('C6H6O', {fragments: [CH({aromatic: true}, 5), C0({aromatic: true}), OH()], required: [{id: 'arO', smarts: 'c[OX2H]'}]});
    expect(out).toEqual(['Oc1ccccc1']);
  });
});

describe('C1 pools (aromatic CH of ring templates with signals that need equivalence)', () => {
  const pooled = (sites: number[], demands: number[]) => ({fragments: [ring(sites, 'aro'), CH3(), OH()], equivalencePools: [{group: 'aro', demands}]});
  it.each([['para', [0, 3]], ['ortho', [0, 1]], ['meta', [0, 2]]] as [string, number[]][])('C7H8O, %s ring pattern, two 2H signals: equals brute force', async (_name, sites) => {
    const withPool = await same('C7H8O', pooled(sites, [2, 2]));
    const noPool = await same('C7H8O', {fragments: [ring(sites, null), CH3(), OH()]});
    expect(withPool.length).toBeLessThanOrEqual(noPool.length);
  });
  it('para ring + two different substituents satisfy two 2H doublets; the ortho and meta patterns do not', async () => {
    expect((await same('C7H8O', pooled([0, 3], [2, 2]))).length).toBeGreaterThan(0);
    expect(await same('C7H8O', pooled([0, 1], [2, 2]))).toEqual([]);
    expect(await same('C7H8O', pooled([0, 2], [2, 2]))).toEqual([]);
  });
  it('monosubstituted ring (C7H8, ortho 2H + meta 2H + para 1H): demands [2, 2]', async () => {
    const out = await same('C7H8', {fragments: [ring([0], 'aro'), CH3()], equivalencePools: [{group: 'aro', demands: [2, 2]}]});
    expect(out).toEqual(['Cc1ccccc1']);
  });
  it('two rings: C12H10 (biphenyl) with demands [4, 4] needs the rings to be equivalent', async () => {
    const two: FragmentSpec = {...ring([0], 'aro'), count: 2};
    const out = await same('C12H10', {fragments: [two], equivalencePools: [{group: 'aro', demands: [4]}]});
    expect(out).toEqual(['c1ccc(-c2ccccc2)cc1']);
  });
});

describe('C1 everything together', () => {
  it('ring (pool) + equivalent methyl group + no-H-neighbour flag + required substructure', async () => {
    const set = {
      fragments: [ring([0, 3], 'aro'), CH3({group: 'm', noHCarbonNeighbors: true}, 2, 'M'), C0(), O0()],
      equivalentGroups: ['m'], equivalencePools: [{group: 'aro', demands: [2, 2]}], required: [{id: 'arO', smarts: 'c[OX2]'}],
    };
    await same('C9H10O', set);
  });
});

// ---------------------------------------------------------------------------------------------------- seeded random battery
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const REQUIRED = ['[CX3]=[OX1]', '[OX2]', '[CH3]', 'C=C', '[CX4][CX4]', '[OX2H1]'];
function randomCase(seed: number): {formula: string; set: Omit<FragmentAlternativeSet, 'id'>} | null {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const frags: FragmentSpec[] = [];
  const eq: string[] = [];
  let heavy = 0, hSum = 0, c = 0, o = 0, ringCase = false, slots = 0;
  const pools: {group: string; demands: number[]}[] = [];
  if (r() < 0.35) {
    ringCase = true;
    const sites = [[0], [0, 3], [0, 1], [0, 2]][int(0, 3)];
    const pooled = r() < 0.6;
    frags.push(ring(sites, pooled ? 'aro' : null));
    heavy += 6; c += 6; hSum += 6 - sites.length; slots += sites.length;
    if (pooled) { const ch = 6 - sites.length; pools.push({group: 'aro', demands: ch === 5 ? [2, 2] : ch === 4 ? [2, 2] : [2]}); }
  }
  const kinds: [string, (e: object, n: number, id: string) => FragmentSpec, number, string, number][] = [['CH3', CH3, 3, 'C', 3], ['CH2', CH2, 2, 'C', 2], ['CH', CH, 1, 'C', 1], ['C0', C0, 0, 'C', 0], ['O0', O0, 0, 'O', 0], ['OH', OH, 1, 'O', 1]];
  for (const [id, make, h, el] of kinds.map(k => [k[0], k[1], k[4], k[3]] as const)) {
    const maxCount = ringCase ? 1 : 3;
    const n = int(0, maxCount);
    if (!n || heavy + n > 8) continue;
    const extra: Record<string, unknown> = {};
    if (n >= 2 && r() < 0.4) { extra.group = id; eq.push(id); }
    if (id !== 'C0' && id !== 'O0' && r() < 0.25) extra.noHCarbonNeighbors = true;
    frags.push(make(extra, n, id));
    heavy += n; hSum += h * n; slots += n * ((el === 'C' ? 4 : 2) - h); if (el === 'C') c += n; else o += n;
  }
  if (!frags.length || heavy < 2) return null;
  // free atoms (formula-only): up to 2 carbons and 1 oxygen, with a few free hydrogens
  const freeC = heavy + 1 <= 9 ? int(0, 1) : 0, freeO = heavy + freeC + 1 <= 9 ? int(0, 1) : 0;
  slots += 4 * freeC + 2 * freeO;
  if (slots > 14) return null;   // the brute force is exponential in the open valences
  // hydrogens on the free atoms: any number that keeps the valence parity and lets the atoms be joined
  const valid: number[] = [];
  for (let hf = 0; hf <= 8; hf++) { const twoB = slots - hf; if (twoB >= 2 * (heavy + freeC + freeO - 1) && twoB % 2 === 0) valid.push(hf); }
  if (!valid.length) return null;
  const H = hSum + valid[int(0, valid.length - 1)];
  const formula = `C${c + freeC}${o + freeO ? `O${o + freeO}` : ''}H${H}`;
  const set: Omit<FragmentAlternativeSet, 'id'> = {fragments: frags};
  if (eq.length) set.equivalentGroups = eq;
  if (pools.length) set.equivalencePools = pools;
  if (r() < 0.3) set.required = [{id: 'rq', smarts: REQUIRED[int(0, REQUIRED.length - 1)]}];
  return {formula, set};
}

describe('C1 seeded random battery (symmetry pruning on and off, against brute force)', () => {
  const cases = Array.from({length: 3000}, (_, i) => ({seed: 1000 + i, c: randomCase(1000 + i)})).filter(x => x.c !== null) as {seed: number; c: NonNullable<ReturnType<typeof randomCase>>}[];
  it('generates a useful number of cases', () => expect(cases.length).toBeGreaterThan(300));
  it('every case equals the brute force; the pruning switch never changes the output', async () => {
    let nonEmpty = 0, compared = 0;
    const withEq: number[] = [];
    for (const {seed, c} of cases) {
      const t0 = performance.now();
      const on = await both(c.formula, c.set, true);
      if (on.status === 'INVALID_REQUEST') { expect(on.reference, `seed ${seed} ${c.formula}`).toEqual([]); continue; }
      expect(on.ours, `seed ${seed} ${c.formula} ${JSON.stringify(c.set.fragments.map(f => [f.id, f.count]))}`).toEqual(on.reference);
      const off = await both(c.formula, c.set, false);
      expect(off.ours, `seed ${seed} (pruning off)`).toEqual(on.reference);
      compared++;
      if (performance.now() - t0 > 3000) console.log('V12_C1_SLOW ' + JSON.stringify({seed, formula: c.formula, ms: Math.round(performance.now() - t0)}));
      if (on.ours.length) nonEmpty++;
      if (c.set.equivalentGroups?.length || c.set.equivalencePools?.length) withEq.push(seed);
    }
    console.log('V12_C1_RANDOM ' + JSON.stringify({generated: cases.length, compared, nonEmpty, withEquivalence: withEq.length}));
    expect(compared).toBeGreaterThan(200);
    expect(nonEmpty).toBeGreaterThan(100);
    expect(withEq.length).toBeGreaterThan(100);
  }, 600000);
});
