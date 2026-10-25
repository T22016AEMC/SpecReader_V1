import {describe, expect, it} from 'vitest';
import {canPackDemands, orbitPartition, sameOrbit, type AutGraph} from '../../src/engines/enumeration/automorphism';
import {requiredFromEvidence, strongIrBands} from '../../src/engines/constraints/requiredSubstructures';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';

// Exactness of the orbit computation against trying every permutation, on seeded random labelled graphs (including highly symmetric ones).
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function orbitsByAllPermutations(g: AutGraph): number[] {
  const n = g.n;
  const edge = new Map<number, number>();
  for (const e of g.edges) { edge.set(Math.min(e.a, e.b) * n + Math.max(e.a, e.b), e.label); }
  const parent = Array.from({length: n}, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const perm: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = (k: number): void => {
    if (k === n) {
      if (g.edges.every(e => edge.get(Math.min(perm[e.a], perm[e.b]) * n + Math.max(perm[e.a], perm[e.b])) === e.label) && g.vertexLabel.every((l, i) => g.vertexLabel[perm[i]] === l)) for (let i = 0; i < n; i++) parent[find(i)] = find(perm[i]);
      return;
    }
    for (let v = 0; v < n; v++) if (!used[v]) { used[v] = true; perm[k] = v; rec(k + 1); used[v] = false; }
  };
  rec(0);
  const root = Array.from({length: n}, (_, i) => find(i));
  return root.map(r => root.findIndex(x => x === r));   // smallest member of the class
}
const randomGraph = (seed: number): AutGraph => {
  const r = rng(seed);
  const n = 3 + Math.floor(r() * 5);
  const labels = 1 + Math.floor(r() * 2), edgeLabels = 1 + Math.floor(r() * 2), p = 0.25 + r() * 0.4;
  const edges: AutGraph['edges'] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (r() < p) edges.push({a, b, label: 1 + Math.floor(r() * edgeLabels)});
  return {n, vertexLabel: Array.from({length: n}, () => Math.floor(r() * labels)), edges};
};
const ring = (n: number, label = 1): AutGraph => ({n, vertexLabel: new Array(n).fill(0), edges: Array.from({length: n}, (_, i) => ({a: i, b: (i + 1) % n, label}))});

describe('automorphism orbits are exact', () => {
  it('300 random graphs (≤ 7 vertices): same partition as trying every permutation', () => {
    let nontrivial = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = randomGraph(seed);
      const expected = orbitsByAllPermutations(g);
      expect(orbitPartition(g), `seed ${seed}`).toEqual(expected);
      if (new Set(expected).size < g.n) nontrivial++;
    }
    expect(nontrivial).toBeGreaterThan(60);
  });
  it('rings, a star and a path', () => {
    expect(new Set(orbitPartition(ring(6))).size).toBe(1);
    expect(new Set(orbitPartition({n: 5, vertexLabel: [0, 1, 1, 1, 1], edges: [1, 2, 3, 4].map(b => ({a: 0, b, label: 1}))})).size).toBe(2);
    expect(orbitPartition({n: 4, vertexLabel: [0, 0, 0, 0], edges: [{a: 0, b: 1, label: 1}, {a: 1, b: 2, label: 1}, {a: 2, b: 3, label: 1}]})).toEqual([0, 1, 1, 0]);
  });
  it('edge labels matter (an aromatic-style ring with one different bond has fewer symmetries)', () => {
    const g = ring(6);
    g.edges[0] = {...g.edges[0], label: 2};
    expect(new Set(orbitPartition(g)).size).toBe(3);
  });
  it('the orbit of a restricted vertex list gives the same answer for those vertices', () => {
    const g = randomGraph(7);
    const all = orbitPartition(g)!, some = orbitPartition(g, [0, 1])!;
    expect(sameOrbit(some, [0, 1])).toBe(sameOrbit(all, [0, 1]));
  });
});

describe('orbit search safety limit', () => {
  it('returns null (so that nothing is excluded) when the node limit is spent, and the exact answer otherwise', () => {
    expect(orbitPartition(ring(6), undefined, 1)).toBeNull();
    expect(orbitPartition(ring(6), undefined, 1000)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('canPackDemands', () => {
  it('demands must each fit inside one orbit, and share the orbit capacity', () => {
    expect(canPackDemands([2, 2], [2, 2])).toBe(true);
    expect(canPackDemands([2, 2], [4])).toBe(true);
    expect(canPackDemands([2, 2], [3, 1])).toBe(false);
    expect(canPackDemands([3], [2, 2])).toBe(false);
    expect(canPackDemands([4, 4], [4, 4])).toBe(true);
    expect(canPackDemands([], [1])).toBe(true);
  });
});

describe('strong-evidence rules (requiredSubstructures)', () => {
  const ob = (o: Partial<ObservedEvidence> & {id: string; modality: ObservedEvidence['modality']; value: number}): ObservedEvidence => ({
    signalId: o.id, sourceId: 't', unit: '', relativeIntensity: null, relativeIntegral: null, multiplicity: null, jHz: [], shape: 'UNKNOWN', uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {}, coverage: 'PARTIAL', unknown: [], ...o} as ObservedEvidence);
  const ir = (value: number, relativeIntensity: number | null) => ob({id: `IR:${value}`, modality: 'IR', value, relativeIntensity});
  const h = (value: number, integral: number, multiplicity: string, jHz: number[] = []) => ob({id: `H:${value}`, modality: '1H_NMR', value, relativeIntegral: integral, multiplicity, jHz});
  const ids = (o: ObservedEvidence[]) => requiredFromEvidence(o).map(r => r.id);
  it('a strong C=O needs ≥ 0.5 × the strongest band in 1650–1800; weak or unknown-intensity bands do not count', () => {
    expect(ids([ir(1720, 100), ir(2950, 40)])).toEqual(['STRONG_CARBONYL']);
    expect(ids([ir(1720, 40), ir(2950, 100)])).toEqual([]);
    expect(ids([ir(1720, 50), ir(2950, 100)])).toEqual(['STRONG_CARBONYL']);
    expect(ids([ir(1720, null), ir(2950, null)])).toEqual([]);
    expect(ids([ir(1620, 100)])).toEqual([]);
  });
  it('a nitrile needs 2210–2260 at ≥ 0.3 of the strongest band', () => {
    expect(ids([ir(2230, 35), ir(1000, 100)])).toEqual(['NITRILE']);
    expect(ids([ir(2230, 25), ir(1000, 100)])).toEqual([]);
  });
  it('para-benzene: two equal aromatic doublets with J 7–9 Hz', () => {
    expect(ids([h(7.2, 2, 'd', [8.5]), h(6.8, 2, 'd', [8.5])])).toEqual(['PARA_BENZENE']);
    expect(ids([h(7.2, 2, 'd', [8.5]), h(6.8, 4, 'd', [8.5])])).toEqual([]);
    expect(ids([h(7.2, 2, 'd', [2.0]), h(6.8, 2, 'd', [2.0])])).toEqual([]);
    expect(ids([h(7.2, 2, 'm'), h(6.8, 2, 'm')])).toEqual([]);
  });
  it('ethyl: q and t, 2:3, shared J', () => {
    expect(ids([h(4.3, 2, 'q', [7.1]), h(1.4, 3, 't', [7.1])])).toEqual(['ETHYL']);
    expect(ids([h(4.3, 2, 'q', [7.1]), h(1.4, 3, 't', [4.0])])).toEqual([]);
    expect(ids([h(4.3, 3, 'q', [7.1]), h(1.4, 3, 't', [7.1])])).toEqual([]);
  });
  it('strongIrBands lists the qualifying observations', () => {
    expect(strongIrBands([ir(1720, 100), ir(1700, 60), ir(1740, 20)], [1650, 1800], 0.5).map(o => o.value)).toEqual([1720, 1700]);
  });
});
