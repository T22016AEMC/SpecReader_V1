import {coarseClass, envCategory, evalTier1, loadTier1, resolveAtoms, SETTINGS, SOLVENTS, type Item, type Setting, type SolventKey} from './v140Truth';

/**
 * v1.4.0 stop 12: study of the solvent shift (shift in solvent minus shift in CDCl3) by environment class, on tier 1 (Fulmer 2010 SI Table S1, 7 solvents).
 * Pre-registered procedure (written before any number was looked at):
 *  C1 diagnosis: per solvent and class, mean and standard deviation of the shift difference, number of signals and of compounds; the global figure is the same over all non-exchangeable classes of the solvent.
 *  C2 a (solvent, class) pair is a candidate only if the class has at least 3 compounds AND its standard deviation is at most CLASS_SD_RATIO (0.6) times the global standard deviation of the solvent.
 *  C3 the compounds are split into two halves with a seeded shuffle (SEED); half A estimates the class means, half B validates; a candidate is adopted if, on the signals of its class in half B, the mean absolute error of
 *     the class correction is not larger than that of the correction the predictor applies now ("global correction": the predictor's own solvent difference).
 *  C4 exchangeable protons (OH, NH, SH, COOH): the centre is never corrected, only the tolerance (uncertainty) is widened from the spread of the shift difference.
 */
export const SEED = 20261109;
export const CLASS_SD_RATIO = 0.6;
export const MIN_COMPOUNDS = 3;
export const NON_CDCL3: SolventKey[] = ['C6D6', 'acetone-d6', 'DMSO-d6', 'CD3CN', 'CD3OD', 'D2O'];

/** The solvent classes: the coarse classes of the stop-12 text; exchangeable ones are kept apart by kind. */
export function solventClass(category: string): string {
  if (category === 'exch_OH_acid' || category === 'exch_OH_alcohol' || category === 'exch_OH_phenol' || category === 'exch_OH_water' || category === 'exch_NH' || category === 'exch_SH') return 'exchangeable';
  return coarseClass(category);
}

/** mulberry32 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Compound names in a seeded Fisher-Yates order; the first half is A (estimates), the rest B (validates). */
export function halves(names: string[], seed = SEED): {A: Set<string>; B: Set<string>} {
  const a = [...names].sort(), r = prng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const k = Math.ceil(a.length / 2);
  return {A: new Set(a.slice(0, k)), B: new Set(a.slice(k))};
}

export interface DeltaItem {compound: string; label: string; cls: string; category: string; solvent: SolventKey; delta: number; exchangeable: boolean; engineDelta: number | null}
const mid = (v: number | {mid: number}) => (typeof v === 'number' ? v : v.mid);
/** Every (compound, signal, solvent) with a value in both CDCl3 and the solvent. engineDelta = the predictor's own difference for the matching environment(s), under `setting`. */
export function deltaItems(setting: Setting = SETTINGS.base): DeltaItem[] {
  const ref = evalTier1(setting, 'CDCl3');
  const out: DeltaItem[] = [];
  const byKey = (items: Item[]) => { const m = new Map<string, Item[]>(); for (const i of items) { const k = `${i.compound}|${i.label}`; m.set(k, [...(m.get(k) ?? []), i]); } return m; };
  const refBy = byKey(ref);
  const bySolv = new Map<SolventKey, Map<string, Item[]>>();
  for (const sv of NON_CDCL3) bySolv.set(sv, byKey(evalTier1(setting, sv)));
  for (const c of loadTier1().compounds) for (const s of c.signals) {
    if (s.usable === false || s.values?.CDCl3 === undefined) continue;
    const r = resolveAtoms(c.smiles, s.smarts); if (r.error || !r.atoms.length) continue;
    const category = envCategory(r.canonical, r.atoms[0]);
    for (const sv of NON_CDCL3) {
      const v = s.values?.[sv]; if (v === undefined) continue;
      const k = `${c.name}|${s.label}`;
      const a = refBy.get(k)?.filter(i => i.predicted !== null).map(i => i.predicted!), b = bySolv.get(sv)!.get(k)?.filter(i => i.predicted !== null).map(i => i.predicted!);
      const engine = a && b && a.length && a.length === b.length ? b.reduce((x, y) => x + y, 0) / b.length - a.reduce((x, y) => x + y, 0) / a.length : null;
      out.push({compound: c.name, label: s.label, cls: solventClass(category), category, solvent: sv, delta: mid(v) - mid(s.values.CDCl3), exchangeable: Boolean(s.exchangeable), engineDelta: engine});
    }
  }
  return out;
}
export const stat = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return {n: a.length, mean: m, sd: a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0}; };

/** The classes that can carry a correction (the residual 'other' and the 2-compound 'CHCl3-type' never do). */
export const NAMED_CLASSES = ['alkyl CH', 'O-CH', 'N-CH', 'aromatic CH', 'vinyl CH', 'next to carbonyl'];
export interface StudyRow {solvent: SolventKey; cls: string; compounds: number; signals: number; mean: number; sd: number; globalSd: number; c2: boolean; meanA: number | null; maeClassB: number | null; maeEngineB: number | null; c3: boolean; adopted: boolean}
/** The pre-registered procedure (C1-C3) on the delta items. `table` = deployed (all compounds), `tableA` = estimated on half A only (for the engine-level held-out check). */
export function runStudy(items: DeltaItem[], seed = SEED): {rows: StudyRow[]; table: Record<string, Record<string, number>>; tableA: Record<string, Record<string, number>>; exchangeableSd: Record<string, number>; halves: {A: Set<string>; B: Set<string>}} {
  const {A, B} = halves([...new Set(items.map(i => i.compound))], seed);
  const rows: StudyRow[] = [], table: Record<string, Record<string, number>> = {}, tableA: Record<string, Record<string, number>> = {}, exchangeableSd: Record<string, number> = {};
  const ENGINE_ID: Record<string, string> = {C6D6: 'C6D6', 'acetone-d6': 'Acetone-d6', 'DMSO-d6': 'DMSO-d6', CD3CN: 'CD3CN', CD3OD: 'CD3OD', D2O: 'D2O'};
  for (const sv of NON_CDCL3) {
    const non = items.filter(i => i.solvent === sv && i.cls !== 'exchangeable');
    const globalSd = stat(non.map(i => i.delta)).sd;
    for (const k of NAMED_CLASSES) {
      const a = items.filter(i => i.solvent === sv && i.cls === k); if (!a.length) continue;
      const comps = new Set(a.map(i => i.compound)).size, full = stat(a.map(i => i.delta));
      const inA = a.filter(i => A.has(i.compound)), inB = a.filter(i => B.has(i.compound));
      const c2 = comps >= MIN_COMPOUNDS && full.sd <= CLASS_SD_RATIO * globalSd;
      let meanA: number | null = null, maeClassB: number | null = null, maeEngineB: number | null = null, c3 = false;
      if (c2 && inA.length && inB.length) {
        meanA = stat(inA.map(i => i.delta)).mean;
        maeClassB = inB.reduce((s, i) => s + Math.abs(i.delta - meanA!), 0) / inB.length;
        const eng = inB.filter(i => i.engineDelta !== null);
        maeEngineB = eng.reduce((s, i) => s + Math.abs(i.delta - i.engineDelta!), 0) / eng.length;
        c3 = maeClassB <= maeEngineB;
      }
      const adopted = c2 && c3;
      rows.push({solvent: sv, cls: k, compounds: comps, signals: full.n, mean: full.mean, sd: full.sd, globalSd, c2, meanA, maeClassB, maeEngineB, c3, adopted});
      if (adopted) { (table[ENGINE_ID[sv]] ??= {})[k] = Number(full.mean.toFixed(3)); (tableA[ENGINE_ID[sv]] ??= {})[k] = Number(meanA!.toFixed(3)); }
    }
    const ex = items.filter(i => i.solvent === sv && i.cls === 'exchangeable');
    if (new Set(ex.map(i => i.compound)).size >= MIN_COMPOUNDS) exchangeableSd[ENGINE_ID[sv]] = Number(stat(ex.map(i => i.delta)).sd.toFixed(2));
  }
  return {rows, table, tableA, exchangeableSd, halves: {A, B}};
}
