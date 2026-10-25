import RDKitModuleFactory from '@rdkit/rdkit';

/**
 * Independent brute-force reference for the v1.2 enumerator features (docs/P1C_DESIGN.md §4). It imports NOTHING from src/engines:
 * it expands the atoms itself, tries EVERY bond-order matrix over the atoms that can still take bonds (no symmetry breaking, no pruning
 * beyond per-atom capacity), and then filters each connected molecule independently:
 *   sanitize (RDKit) → required substructures (RDKit) → aromatic atoms ([a]) → no-H-carbon neighbours → equivalence groups and pools,
 * where "equivalent" is decided by trying EVERY label-preserving permutation of the heavy atoms (no backtracking, no refinement).
 * A molecule is an output when at least one labelling of it passes (the atom list is matched to the molecule in some way).
 * Only usable for ≤ 9 heavy atoms.
 */
export interface BFAtom {element: string; fixedH?: number; charge?: number; open?: boolean; flex?: boolean; group?: string; aromatic?: boolean; noHCarbonNeighbors?: boolean; alkeneCH?: boolean}
export interface BFFragment {atoms: BFAtom[]; bonds: {a: number; b: number; order: number}[]; count?: number}
export interface BFSet {
  fragments: BFFragment[];
  equivalentGroups?: string[];
  required?: {smarts: string; minMatches?: number}[];
  equivalencePools?: {group: string; demands: number[]}[];
}

const VALENCE: Record<string, number> = {C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1, S: 2};
const CHARGED: Record<string, Record<number, number>> = {N: {1: 4, [-1]: 2}, O: {1: 3, [-1]: 1}};

let rdkit: any = null;
/** RDKit.js answers {} when nothing matches, else an array of {atoms, bonds}. */
const matchesOf = (mol: any, q: any): {atoms: number[]}[] => { const v = JSON.parse(mol.get_substruct_matches(q)); return Array.isArray(v) ? v : []; };
async function rd() { if (!rdkit) rdkit = await (RDKitModuleFactory as any)(); return rdkit; }

/** Atom pairs (i,j) of the heavy-atom graph and the labelled bonds → orbit id (smallest index) per atom, by trying every label-preserving permutation. */
function orbitsByPermutation(n: number, label: string[], bondLabel: Map<number, string>): number[] {
  const classes = new Map<string, number[]>();
  label.forEach((l, i) => classes.set(l, [...(classes.get(l) ?? []), i]));
  const groups = [...classes.values()];
  const parent = Array.from({length: n}, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const perm = Array.from({length: n}, (_, i) => i);
  const edges = [...bondLabel.entries()].map(([key, l]) => ({a: Math.floor(key / n), b: key % n, l}));
  const check = (): boolean => edges.every(e => bondLabel.get(Math.min(perm[e.a], perm[e.b]) * n + Math.max(perm[e.a], perm[e.b])) === e.l);
  // every combination of permutations inside the label classes
  const permute = (g: number): void => {
    if (g === groups.length) {
      if (check()) for (let i = 0; i < n; i++) parent[find(i)] = find(perm[i]);
      return;
    }
    const members = groups[g];
    const idx = members.map((_, i) => i);
    const heap = (k: number): void => {
      if (k === 1) { members.forEach((m, i) => { perm[m] = members[idx[i]]; }); permute(g + 1); return; }
      heap(k - 1);
      for (let i = 0; i < k - 1; i++) { const j = k % 2 === 0 ? i : 0; [idx[j], idx[k - 1]] = [idx[k - 1], idx[j]]; heap(k - 1); }
    };
    heap(members.length);
  };
  permute(0);
  return Array.from({length: n}, (_, i) => find(i));
}

export async function bruteForceV12(formula: Record<string, number>, set: BFSet): Promise<Set<string>> {
  const R = await rd();
  const el: string[] = [], charge: number[] = [], fixedH: number[] = [], room: number[] = [], must: boolean[] = [], free: boolean[] = [];
  const group: (string | null)[] = [], arom: boolean[] = [], noHC: boolean[] = [], alk: boolean[] = [];
  const fixedBonds: [number, number, number][] = [];
  const used: Record<string, number> = {};
  let hUsed = 0;
  for (const f of set.fragments) {
    for (let c = 0; c < (f.count ?? 1); c++) {
      const base = el.length;
      const sum = f.atoms.map(() => 0);
      for (const b of f.bonds) { sum[b.a] += b.order; sum[b.b] += b.order; }
      f.atoms.forEach((a, i) => {
        const q = a.charge ?? 0, val = q === 0 ? VALENCE[a.element] : CHARGED[a.element][q];
        el.push(a.element); charge.push(q); fixedH.push(a.fixedH ?? 0);
        room.push(a.flex ? val - sum[i] : a.open ? val - sum[i] - (a.fixedH ?? 0) : 0); must.push(Boolean(a.open)); free.push(Boolean(a.flex));
        group.push(a.group ?? null); arom.push(Boolean(a.aromatic)); noHC.push(Boolean(a.noHCarbonNeighbors)); alk.push(Boolean(a.alkeneCH));
        used[a.element] = (used[a.element] ?? 0) + 1; hUsed += a.fixedH ?? 0;
      });
      for (const b of f.bonds) fixedBonds.push([base + b.a, base + b.b, b.order]);
    }
  }
  for (const [e, count] of Object.entries(formula)) {
    if (e === 'H') continue;
    for (let k = 0; k < count - (used[e] ?? 0); k++) { el.push(e); charge.push(0); fixedH.push(0); room.push(VALENCE[e]); must.push(false); free.push(true); group.push(null); arom.push(false); noHC.push(false); alk.push(false); }
  }
  const hFree = (formula.H ?? 0) - hUsed;
  const n = el.length;
  const fixedPair = new Set(fixedBonds.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (room[i] > 0 && room[j] > 0 && !fixedPair.has(`${i}-${j}`)) pairs.push([i, j]);
  const left = room.slice();
  const chosen: [number, number, number][] = [];
  const out = new Set<string>();
  const connected = (): boolean => {
    const parent = Array.from({length: n}, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const [a, b] of fixedBonds) parent[find(a)] = find(b);
    for (const [a, b] of chosen) parent[find(a)] = find(b);
    return new Set(Array.from({length: n}, (_, i) => find(i))).size === 1;
  };
  const queries = (set.required ?? []).map(r => ({q: R.get_qmol(r.smarts), min: r.minMatches ?? 1}));
  const qAtom = R.get_qmol('[a]'), qBond = R.get_qmol('[a]:[a]');
  const eqAtoms = (set.equivalentGroups ?? []).map(g => group.flatMap((x, i) => (x === g ? [i] : [])));
  const pools = (set.equivalencePools ?? []).map(p => ({atoms: group.flatMap((x, i) => (x === p.group ? [i] : [])), demands: p.demands.filter(d => d >= 2)}));

  const leaf = () => {
    for (let i = 0; i < n; i++) if (must[i] && left[i] !== 0) return;
    const hOnFree = free.reduce((s, isFree, i) => s + (isFree ? left[i] : 0), 0);
    if (hOnFree !== hFree || !connected()) return;
    const hCount = (i: number) => fixedH[i] + (free[i] ? left[i] : 0);
    // singlet rule, stated on the final molecule: no bond from a no-H-neighbour atom to a carbon that carries hydrogen
    for (const [a, b] of chosen) {
      if (noHC[a] && el[b] === 'C' && hCount(b) > 0) return;
      if (noHC[b] && el[a] === 'C' && hCount(a) > 0) return;
    }
    const bonds = [...fixedBonds, ...chosen];
    const lines = ['bf', '  bf', '', `${String(n).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0            999 V2000`];
    for (let i = 0; i < n; i++) lines.push(`    0.0000    0.0000    0.0000 ${el[i].padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const [a, b, o] of bonds) lines.push(`${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}${String(o).padStart(3)}  0  0  0  0`);
    const ch = charge.map((q, i) => [i + 1, q] as const).filter(x => x[1] !== 0);
    if (ch.length) lines.push(`M  CHG${String(ch.length).padStart(3)}${ch.map(([i, q]) => `${String(i).padStart(4)}${String(q).padStart(4)}`).join('')}`);
    lines.push('M  END');
    const mol = R.get_mol(lines.join('\n'));
    if (!mol) return;
    try {
      if (!mol.is_valid()) return;
      const smiles: string = mol.get_smiles();
      if (out.has(smiles)) return;
      for (const r of queries) if (matchesOf(mol, r.q).length < r.min) return;
      const aromaticAtom = new Set<number>(matchesOf(mol, qAtom).map(m => m.atoms[0]));
      for (let i = 0; i < n; i++) if (arom[i] && !aromaticAtom.has(i)) return;
      const aromaticBond = new Set<number>();
      if (alk.some(Boolean) || eqAtoms.some(a => a.length > 1) || pools.some(p => p.demands.length)) {
        for (const m of matchesOf(mol, qBond)) aromaticBond.add(Math.min(...m.atoms) * n + Math.max(...m.atoms));
      }
      // vinyl CH, stated on the final molecule: exactly one double bond, no triple bond, the partner is carbon, and the bond is not aromatic
      for (let i = 0; i < n; i++) {
        if (!alk[i]) continue;
        const mine = bonds.filter(([a, b]) => a === i || b === i);
        const doubles = mine.filter(([, , o]) => o === 2), triples = mine.filter(([, , o]) => o === 3);
        if (doubles.length !== 1 || triples.length) return;
        const [a, b] = doubles[0];
        const partner = a === i ? b : a;
        if (el[partner] !== 'C' || aromaticBond.has(Math.min(a, b) * n + Math.max(a, b))) return;
      }
      if (eqAtoms.some(a => a.length > 1) || pools.some(p => p.demands.length)) {
        const label = el.map((e, i) => `${e}|${charge[i]}|${hCount(i)}|${aromaticAtom.has(i) ? 1 : 0}`);
        const bondLabel = new Map<number, string>();
        for (const [a, b, o] of bonds) { const key = Math.min(a, b) * n + Math.max(a, b); bondLabel.set(key, aromaticBond.has(key) ? 'ar' : String(o)); }
        const orbit = orbitsByPermutation(n, label, bondLabel);
        for (const atoms of eqAtoms) if (atoms.length > 1 && !atoms.every(a => orbit[a] === orbit[atoms[0]])) return;
        for (const p of pools) {
          if (!p.demands.length) continue;
          const sizes = new Map<number, number>();
          for (const a of p.atoms) sizes.set(orbit[a], (sizes.get(orbit[a]) ?? 0) + 1);
          const room2 = [...sizes.values()];
          // try every assignment of the demands to orbits
          const assign = (k: number): boolean => {
            if (k === p.demands.length) return true;
            for (let o = 0; o < room2.length; o++) if (room2[o] >= p.demands[k]) { room2[o] -= p.demands[k]; const ok = assign(k + 1); room2[o] += p.demands[k]; if (ok) return true; }
            return false;
          };
          if (!assign(0)) return;
        }
      }
      out.add(smiles);
    } finally { mol.delete(); }
  };
  const go = (k: number): void => {
    if (k === pairs.length) { leaf(); return; }
    const [i, j] = pairs[k];
    for (let v = 0; v <= 3 && v <= left[i] && v <= left[j]; v++) {
      left[i] -= v; left[j] -= v;
      if (v > 0) chosen.push([i, j, v]);
      go(k + 1);
      if (v > 0) chosen.pop();
      left[i] += v; left[j] += v;
    }
  };
  go(0);
  for (const r of queries) r.q.delete();
  qAtom.delete(); qBond.delete();
  return out;
}
