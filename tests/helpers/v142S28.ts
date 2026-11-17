import {canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {smallestRingAtoms} from '../../src/engines/scientificEngines/h1Calibration2';
import {s26Class} from '../../src/engines/scientificEngines/h1Nmrshiftdb2';
import type {ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {BEFORE, graphOf, itemsFromTruth, rdkitInstance, stereoFree, type S26Item, type TruthEntry} from './v142Nmrshiftdb2Study';
import {halves} from './v140SolventStudy';
import {applySetting, clearEnvCache, evalTier1, evalTier2, evalTier3, SOLVENTS, type Item, type Setting} from './v140Truth';

/**
 * v1.4.2 stop 28: the adoption gate A of the planner (notes/v1.4.2/STOP28_CHECKPOINT.md, written before any number was computed) for the class shifts that derive from nmrshiftdb2.
 *  A.1 >= 3 different skeletons (Bemis-Murcko scaffold; an acyclic molecule is its own skeleton) among the fitted compounds. The fit is the SKELETON-WEIGHTED mean (every skeleton weight 1, shared by its compounds).
 *  A.2 leave-one-out mean error lower (compound-weighted: leave one compound out; skeleton-weighted: leave one SKELETON out), and for >= 20 compounds a 50 % held-out half (fixed seed, split by skeleton) lower; both weightings.
 *  A.3 no older-truth signal (tier 1 every solvent, tier 2, round 3) that the class shift moves gets worse by more than 0.15 ppm; where old truth and nmrshiftdb2 data share a class the shift is the MERGED refit and the mean
 *      error of each source (old, new) rises by at most 0.05 ppm.
 * Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License (https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).
 */
export const GATE = {minSkeletons: 3, heldOutMinCompounds: 20, seed: 20261114, worseItemPpm: 0.15, worseSourcePpm: 0.05};

// ---------------------------------------------------------------- skeleton
const skelCache = new Map<string, string>();
/** Bemis-Murcko skeleton key of a molecule (stereo-free canonical SMILES of the scaffold; 'acyclic:' + the stereo-free canonical SMILES when there is no ring). */
export function skeletonOf(smiles: string): string {
  const key = stereoFree(smiles);
  const hit = skelCache.get(key); if (hit !== undefined) return hit;
  const rd = rdkitInstance();
  let out = 'acyclic:' + key;
  const mol = rd.get_mol(key);
  try {
    const L: string[] = mol.get_molblock().split('\n');
    const n = parseInt(L[3].slice(0, 3), 10), m = parseInt(L[3].slice(3, 6), 10);
    const atoms = L.slice(4, 4 + n), bonds = L.slice(4 + n, 4 + n + m).map(l => [parseInt(l.slice(0, 3), 10) - 1, parseInt(l.slice(3, 6), 10) - 1, parseInt(l.slice(6, 9), 10)] as [number, number, number]);
    const chg = new Map<number, number>();
    for (const l of L) if (l.startsWith('M  CHG')) { const t = l.trim().split(/\s+/).slice(3); for (let i = 0; i + 1 < t.length; i += 2) chg.set(parseInt(t[i], 10) - 1, parseInt(t[i + 1], 10)); }
    const alive = new Set<number>(atoms.map((_, i) => i));
    const deg = (a: number) => bonds.filter(b => (b[0] === a || b[1] === a) && alive.has(b[0]) && alive.has(b[1])).length;
    for (let changed = true; changed;) { changed = false; for (const a of [...alive]) if (deg(a) <= 1) { alive.delete(a); changed = true; } }
    if (alive.size) {
      // atoms double-bonded to a scaffold atom stay in the scaffold (exocyclic C=O, =CH2: the RDKit convention)
      const keep = new Set(alive);
      for (const b of bonds) if (b[2] === 2) { if (alive.has(b[0]) && !alive.has(b[1])) keep.add(b[1]); if (alive.has(b[1]) && !alive.has(b[0])) keep.add(b[0]); }
      const idx = [...keep].sort((x, y) => x - y), map = new Map(idx.map((a, k) => [a, k + 1]));
      const nb = bonds.filter(b => keep.has(b[0]) && keep.has(b[1]));
      const c = [...chg].filter(([a]) => keep.has(a));
      const pad = (x: number, w = 3) => String(x).padStart(w, ' ');
      const mb = [L[0], L[1], L[2], `${pad(idx.length)}${pad(nb.length)}  0  0  0  0  0  0  0  0999 V2000`, ...idx.map(a => atoms[a]), ...nb.map(b => `${pad(map.get(b[0])!)}${pad(map.get(b[1])!)}${pad(b[2])}  0`),
        ...(c.length ? [`M  CHG${pad(c.length)}` + c.map(([a, q]) => `${pad(map.get(a)!, 4)}${pad(q, 4)}`).join('')] : []), 'M  END'].join('\n');
      const sm = rd.get_mol(mb);
      try { if (sm && sm.is_valid()) out = canonicalizeMolecule(sm.get_smiles()).canonical || ('scaffold:' + mb); else out = 'unparsed:' + key; } finally { sm?.delete(); }
    }
  } finally { mol.delete(); }
  skelCache.set(key, out); return out;
}

// ---------------------------------------------------------------- items and compounds
export interface PoolItem {src: 'new' | 'old'; origin: string; canonical: string; skeleton: string; cls: string; label: string; solvent: string; truth: number; predicted: number; residual: number; fit: boolean}
export interface Comp {key: string; canonical: string; skeleton: string; src: 'new' | 'old'; items: PoolItem[]; res: number}
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);

/** The class function of this stop: the stop-26 class of the H-bearing atom (the split of OCH2O is inside s26Class), optionally re-partitioned. */
export type Partition = (g: ParsedSmilesGraph, idx: number, cls: string | null) => string | null;
export const plainPartition: Partition = (_g, _i, cls) => cls;

/** The new source: nmrshiftdb2 truth entries, items with the rules switched off in the caller. */
export function newItems(entries: TruthEntry[], part: Partition = plainPartition, setting: Setting = BEFORE): PoolItem[] {
  return itemsFromTruth(entries, setting).map((i: S26Item) => {
    const g = graphOf(i.canonical)!, cls = part(g, i.atoms[0], s26Class(g, i.atoms[0]));
    return {src: 'new' as const, origin: `nmrshiftdb2 ${i.id}/${i.spectrum}`, canonical: i.canonical, skeleton: skeletonOf(i.canonical), cls: cls ?? 'none', label: i.atoms.join(','), solvent: 'CDCl3', truth: i.truth, predicted: i.predicted, residual: i.residual, fit: true};
  });
}
export interface OldAll {items: PoolItem[]}
/** The older truth sets (tier 1 every solvent column, tier 2 rounds 1-2, round 3), point-valued non-exchangeable, 'before' = the given setting (the caller switches the stop-26 rules off). fit = CDCl3 and not validation-only. */
export function oldItems(part: Partition = plainPartition, setting: Setting = BEFORE): PoolItem[] {
  const raw: Item[] = [...SOLVENTS.flatMap(sv => evalTier1(setting, sv)), ...evalTier2(setting, 'round1'), ...evalTier2(setting, 'round2'), ...evalTier3(setting)];
  const out: PoolItem[] = [];
  for (const i of raw) {
    if (i.exchangeable || i.rangeOnly || i.predicted === null || i.error === null || i.atom < 0) continue;
    const g = graphOf(i.canonical); if (!g) continue;
    const cls = part(g, i.atom, s26Class(g, i.atom)); if (!cls) continue;
    out.push({src: 'old', origin: `${i.grade} ${i.compound}`, canonical: i.canonical, skeleton: skeletonOf(i.canonical), cls, label: i.label, solvent: i.solvent, truth: i.truth, predicted: i.predicted, residual: i.truth - i.predicted, fit: i.solvent === 'CDCl3' && !i.validationOnly});
  }
  return out;
}

export function compsOf(items: PoolItem[]): Comp[] {
  const by = new Map<string, PoolItem[]>();
  for (const i of items) { const k = `${i.src}|${stereoFree(i.canonical)}`; by.set(k, [...(by.get(k) ?? []), i]); }
  return [...by.entries()].map(([key, list]) => ({key, canonical: list[0].canonical, skeleton: list[0].skeleton, src: list[0].src, items: list, res: mean(list.map(x => x.residual))}));
}
const sizes = (c: Comp[]) => { const m = new Map<string, number>(); for (const x of c) m.set(x.skeleton, (m.get(x.skeleton) ?? 0) + 1); return m; };
/** Skeleton-weighted shift: the mean over skeletons of the mean compound residual. */
export function shiftOf(c: Comp[]): number { const s = new Map<string, number[]>(); for (const x of c) s.set(x.skeleton, [...(s.get(x.skeleton) ?? []), x.res]); return mean([...s.values()].map(mean)); }
export const errOf = (c: Comp, d: number) => mean(c.items.map(i => Math.abs(i.residual - d)));
/** compound-weighted mean error and skeleton-weighted mean error of a set at a shift */
export function errors(c: Comp[], d: number): {comp: number; skel: number} {
  if (!c.length) return {comp: NaN, skel: NaN};
  const s = new Map<string, number[]>(); for (const x of c) s.set(x.skeleton, [...(s.get(x.skeleton) ?? []), errOf(x, d)]);
  return {comp: mean(c.map(x => errOf(x, d))), skel: mean([...s.values()].map(mean))};
}
export const skeletonsOf = (c: Comp[]) => [...new Set(c.map(x => x.skeleton))];
/** leave-one-out: compound-weighted = leave one compound out; skeleton-weighted = leave one skeleton out. */
export function looErrors(c: Comp[]): {comp: number; skel: number} {
  const comp = mean(c.map((x, k) => errOf(x, shiftOf(c.filter((_, j) => j !== k)))));
  const sk = skeletonsOf(c);
  const skel = mean(sk.map(s => mean(c.filter(x => x.skeleton === s).map(x => errOf(x, shiftOf(c.filter(o => o.skeleton !== s)))))));
  return {comp, skel};
}
export interface HeldOutS28 {nFit: number; nHeld: number; delta: number; before: {comp: number; skel: number}; after: {comp: number; skel: number}; falls: boolean}
export function heldOut(c: Comp[], seed = GATE.seed): HeldOutS28 {
  const {A, B} = halves(skeletonsOf(c), seed);
  const fit = c.filter(x => A.has(x.skeleton)), held = c.filter(x => B.has(x.skeleton));
  const d = shiftOf(fit), before = errors(held, 0), after = errors(held, d);
  return {nFit: fit.length, nHeld: held.length, delta: d, before, after, falls: after.comp < before.comp && after.skel < before.skel};
}

export interface ClassResultS28 {
  cls: string; nCompoundsNew: number; nCompoundsOld: number; nCompounds: number; nSkeletons: number; skeletonKeys: string[]; merged: boolean; delta: number; deltaNewOnly: number;
  before: {comp: number; skel: number}; after: {comp: number; skel: number}; loo: {comp: number; skel: number}; held: HeldOutS28 | null;
  src: {new: {n: number; before: number; after: number} | null; old: {n: number; before: number; after: number} | null};
  oldMoved: {origin: string; label: string; solvent: string; before: number; after: number}[]; oldWorse: {origin: string; label: string; solvent: string; before: number; after: number}[];
  a1: boolean; a2: boolean; a3a: boolean; a3b: boolean; pass: boolean; reasons: string[];
}
/**
 * Gate A on one class. `newI` = nmrshiftdb2 items of the class, `oldFit` = old items that may be fitted (CDCl3, not validation-only), `oldCheck` = every old item of the class (all solvents, validation included) for the no-regression check.
 * With old fit items the shift is the merged refit; without, the nmrshiftdb2-only fit (the old items are still checked).
 */
export function gateClass(cls: string, newI: PoolItem[], oldFit: PoolItem[], oldCheck: PoolItem[]): ClassResultS28 {
  const nc = compsOf(newI), oc = compsOf(oldFit), merged = oc.length > 0, all = merged ? [...nc, ...oc] : nc;
  const reasons: string[] = [];
  const deltaNewOnly = shiftOf(nc), delta = shiftOf(all);
  const sk = skeletonsOf(all);
  const before = errors(all, 0), after = errors(all, delta), loo = all.length > 1 ? looErrors(all) : {comp: NaN, skel: NaN};
  const a1 = sk.length >= GATE.minSkeletons; if (!a1) reasons.push(`A.1: ${sk.length} skeleton(s) < ${GATE.minSkeletons}`);
  let held: HeldOutS28 | null = null, a2 = a1 && loo.comp < before.comp && loo.skel < before.skel;
  if (a1 && !a2) reasons.push(`A.2: leave-one-out not lower (compound ${before.comp.toFixed(2)} -> ${loo.comp.toFixed(2)}; skeleton ${before.skel.toFixed(2)} -> ${loo.skel.toFixed(2)})`);
  if (a1 && a2 && all.length >= GATE.heldOutMinCompounds) { held = heldOut(all); if (!held.falls) { a2 = false; reasons.push(`A.2: held-out half not lower (compound ${held.before.comp.toFixed(2)} -> ${held.after.comp.toFixed(2)}; skeleton ${held.before.skel.toFixed(2)} -> ${held.after.skel.toFixed(2)})`); } }
  const moved = oldCheck.map(i => ({origin: i.origin, label: i.label, solvent: i.solvent, before: i.residual, after: i.residual - delta}));
  const oldWorse = moved.filter(m => Math.abs(m.after) - Math.abs(m.before) > GATE.worseItemPpm + 1e-9);
  const a3a = oldWorse.length === 0; if (!a3a) reasons.push(`A.3a: ${oldWorse.length} old signal(s) worse by > ${GATE.worseItemPpm}: ${oldWorse.map(w => `${w.origin} ${w.label}${w.solvent !== 'CDCl3' ? ' (' + w.solvent + ')' : ''} ${w.before >= 0 ? '+' : ''}${w.before.toFixed(2)} -> ${w.after >= 0 ? '+' : ''}${w.after.toFixed(2)}`).join('; ')}`);
  const srcStat = (c: Comp[]) => (c.length ? {n: c.length, before: errors(c, 0).comp, after: errors(c, delta).comp} : null);
  const sNew = srcStat(nc), sOld = srcStat(oc);
  let a3b = true;
  if (merged) for (const [nm, s] of [['new', sNew], ['old', sOld]] as const) if (s && s.after - s.before > GATE.worseSourcePpm + 1e-9) { a3b = false; reasons.push(`A.3b: the ${nm} source mean error rises ${s.before.toFixed(2)} -> ${s.after.toFixed(2)}`); }
  return {cls, nCompoundsNew: nc.length, nCompoundsOld: oc.length, nCompounds: all.length, nSkeletons: sk.length, skeletonKeys: sk, merged, delta, deltaNewOnly, before, after, loo, held, src: {new: sNew, old: sOld},
    oldMoved: moved, oldWorse, a1, a2, a3a, a3b, pass: a1 && a2 && a3a && a3b, reasons};
}

// ---------------------------------------------------------------- features of the ether O-CH ring class (C of the planner)
const A = (g: ParsedSmilesGraph, i: number) => g.atoms[i];
export const ringSizeOf = (g: ParsedSmilesGraph, idx: number): number | null => smallestRingAtoms(g, idx)?.length ?? null;
/** a carbon neighbour of the O-CH carbon (not through O) that has no H and four heavy neighbours */
export const alphaQuaternary = (g: ParsedSmilesGraph, idx: number): boolean => A(g, idx).neighbors.some(n => { const a = A(g, n.toAtom); return a.element === 'C' && !a.isAromatic && a.neighbors.length === 4 && a.totalHydrogens === 0; });
/** the ether oxygen of the O-CH carbon is NOT a member of the smallest ring of the CH carbon (alkoxy / glycosyl substituent) */
export const oxygenOutsideRing = (g: ParsedSmilesGraph, idx: number): boolean => { const o = A(g, idx).neighbors.find(n => A(g, n.toAtom).element === 'O'); const r = smallestRingAtoms(g, idx); return !!o && !!r && !r.includes(o.toAtom); };
/** The three pre-approved features of the ether O-CH ring class (C of the planner) and the acetal ring / chain split; they re-partition the classes that START with OCH_ETHER_RING / ACETAL_CH (the deployed classes already contain the adopted splits). */
export const PARTITIONS: Record<string, Partition> = {
  size: (g, i, cls) => (cls?.startsWith('OCH_ETHER_RING') ? `OCH_ETHER_RING.ring${ringSizeOf(g, i)}` : cls),
  alphaQuaternary: (g, i, cls) => (cls?.startsWith('OCH_ETHER_RING') ? `OCH_ETHER_RING.${alphaQuaternary(g, i) ? 'alphaQuat' : 'alphaNoQuat'}` : cls),
  acetalRing: (g, i, cls) => (cls?.startsWith('ACETAL_CH') ? `ACETAL_CH.${smallestRingAtoms(g, i) ? 'ring' : 'chain'}` : cls),
  oxygenOutside: (g, i, cls) => (cls?.startsWith('OCH_ETHER_RING') ? `OCH_ETHER_RING.${oxygenOutsideRing(g, i) ? 'oxOutside' : 'oxInRing'}` : cls),
};

/** run fn with the stop-26 rules off and a clean cache (the 'before' of every number of this stop) */
export function withRulesOff<T>(fn: () => T): T {
  const cfg = V12_CONFIG.v142Nmrshiftdb2 as {rules: Record<string, unknown>}, saved = cfg.rules;
  cfg.rules = {}; clearEnvCache();
  try { applySetting(BEFORE); return fn(); } finally { cfg.rules = saved; clearEnvCache(); }
}
