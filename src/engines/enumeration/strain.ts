import type {StrainProfile} from './enumerationConfig';

export type StrainRule = 'TRIPLE_BOND_IN_SMALL_RING' | 'CUMULATED_CENTRE' | 'MULTIPLE_SMALL_RINGS';
export interface HeavyBond {a: number; b: number; order: number; aromatic?: boolean}

/**
 * Optional ring/bond strain rules (a project-owned implementation of three avoid-rules named in the Surge paper/README):
 *  - TRIPLE_BOND_IN_SMALL_RING: a triple bond in a ring of size ≤ profile.tripleBondRingMaxSize;
 *  - CUMULATED_CENTRE: an atom with two double bonds whose other neighbours are only hydrogens (allene/cumulene centre);
 *  - MULTIPLE_SMALL_RINGS: an atom on more than profile.maxSmallRingsPerAtom rings of a size in profile.smallRingSizes.
 * Hydrogens are not atoms here. Bonds flagged aromatic are not counted as double bonds for CUMULATED_CENTRE.
 */
export function strainViolations(n: number, bonds: HeavyBond[], profile: StrainProfile): StrainRule[] {
  const out = new Set<StrainRule>();
  const adj: {to: number; order: number; aromatic: boolean}[][] = Array.from({length: n}, () => []);
  for (const b of bonds) { adj[b.a].push({to: b.b, order: b.order, aromatic: Boolean(b.aromatic)}); adj[b.b].push({to: b.a, order: b.order, aromatic: Boolean(b.aromatic)}); }

  if (profile.forbidCumulatedCentre) {
    for (let i = 0; i < n; i++) {
      if (adj[i].length === 2 && adj[i].every(e => e.order === 2 && !e.aromatic)) out.add('CUMULATED_CENTRE');
    }
  }
  for (const b of bonds) {
    if (b.order !== 3) continue;
    // Shortest path a→b that does not use this bond; ring size = path length + 1.
    const dist = new Array<number>(n).fill(-1);
    dist[b.a] = 0;
    const queue = [b.a];
    for (let h = 0; h < queue.length && dist[b.b] < 0; h++) {
      const x = queue[h];
      for (const e of adj[x]) {
        if ((x === b.a && e.to === b.b) || (x === b.b && e.to === b.a)) continue;
        if (dist[e.to] < 0) { dist[e.to] = dist[x] + 1; queue.push(e.to); }
      }
    }
    if (dist[b.b] >= 0 && dist[b.b] + 1 <= profile.tripleBondRingMaxSize) out.add('TRIPLE_BOND_IN_SMALL_RING');
  }
  if (profile.maxSmallRingsPerAtom >= 0) {
    const count = new Array<number>(n).fill(0);
    for (const size of profile.smallRingSizes) {
      // Simple cycles of exactly `size` atoms: start at the smallest index, second index < last index (one direction only).
      const path: number[] = [];
      const onPath = new Array<boolean>(n).fill(false);
      const extend = (start: number): void => {
        const last = path[path.length - 1];
        if (path.length === size) {
          if (adj[last].some(e => e.to === start) && path[1] < last) for (const v of path) count[v]++;
          return;
        }
        for (const e of adj[last]) {
          if (e.to <= start || onPath[e.to]) continue;
          path.push(e.to); onPath[e.to] = true;
          extend(start);
          path.pop(); onPath[e.to] = false;
        }
      };
      for (let s = 0; s < n; s++) { path.length = 0; path.push(s); onPath.fill(false); onPath[s] = true; extend(s); }
    }
    if (count.some(c => c > profile.maxSmallRingsPerAtom)) out.add('MULTIPLE_SMALL_RINGS');
  }
  return [...out];
}
