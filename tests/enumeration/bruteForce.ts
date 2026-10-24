import {canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';

/**
 * Independent brute-force reference for the enumerator tests (T3/T4). It shares NO logic with src/engines/enumeration:
 * it expands atoms itself, tries EVERY bond-order matrix over the atoms that can still take bonds (no symmetry breaking, no
 * pruning beyond per-atom capacity), keeps the connected ones with the right hydrogen total, and de-duplicates with RDKit.
 */
export interface BFAtom {element: string; fixedH?: number; charge?: number; open?: boolean; flex?: boolean}
export interface BFFragment {atoms: BFAtom[]; bonds: {a: number; b: number; order: number}[]; count?: number}

const VALENCE: Record<string, number> = {C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1, S: 2};
const CHARGED: Record<string, Record<number, number>> = {N: {1: 4, [-1]: 2}, O: {1: 3, [-1]: 1}};

export function bruteForce(formula: Record<string, number>, fragments: BFFragment[] = []): Set<string> {
  const el: string[] = [], charge: number[] = [], fixedH: number[] = [];
  const room: number[] = [], must: boolean[] = [], free: boolean[] = [];
  const fixedBonds: [number, number, number][] = [];
  const used: Record<string, number> = {};
  let hUsed = 0;
  for (const f of fragments) {
    for (let c = 0; c < (f.count ?? 1); c++) {
      const base = el.length;
      const sum = f.atoms.map(() => 0);
      for (const b of f.bonds) { sum[b.a] += b.order; sum[b.b] += b.order; }
      f.atoms.forEach((a, i) => {
        const q = a.charge ?? 0, val = q === 0 ? VALENCE[a.element] : CHARGED[a.element][q];
        el.push(a.element); charge.push(q); fixedH.push(a.fixedH ?? 0);
        room.push(a.flex ? val - sum[i] : a.open ? val - sum[i] - (a.fixedH ?? 0) : 0); must.push(Boolean(a.open)); free.push(Boolean(a.flex));
        used[a.element] = (used[a.element] ?? 0) + 1; hUsed += a.fixedH ?? 0;
      });
      for (const b of f.bonds) fixedBonds.push([base + b.a, base + b.b, b.order]);
    }
  }
  for (const [e, count] of Object.entries(formula)) {
    if (e === 'H') continue;
    for (let k = 0; k < count - (used[e] ?? 0); k++) { el.push(e); charge.push(0); fixedH.push(0); room.push(VALENCE[e]); must.push(false); free.push(true); }
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
  const leaf = () => {
    for (let i = 0; i < n; i++) if (must[i] && left[i] !== 0) return;
    const hOnFree = free.reduce((s, isFree, i) => s + (isFree ? left[i] : 0), 0);
    if (hOnFree !== hFree || !connected()) return;
    const bonds = [...fixedBonds, ...chosen];
    const lines = ['bf', '  bf', '', `${String(n).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0            999 V2000`];
    for (let i = 0; i < n; i++) lines.push(`    0.0000    0.0000    0.0000 ${el[i].padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const [a, b, o] of bonds) lines.push(`${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}${String(o).padStart(3)}  0  0  0  0`);
    const ch = charge.map((q, i) => [i + 1, q] as const).filter(x => x[1] !== 0);
    if (ch.length) lines.push(`M  CHG${String(ch.length).padStart(3)}${ch.map(([i, q]) => `${String(i).padStart(4)}${String(q).padStart(4)}`).join('')}`);
    lines.push('M  END');
    const c = canonicalizeMolecule(lines.join('\n'));
    if (c.valid) out.add(c.canonical);
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
  return out;
}
