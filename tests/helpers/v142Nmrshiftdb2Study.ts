import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {S26_CLASSES, s26Class} from '../../src/engines/scientificEngines/h1Nmrshiftdb2';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initTruthTools, predictEnvs, SETTINGS, type Setting} from './v140Truth';
import {fitClass, type Fit, type Rec} from './v140Calibration2Study';
import {halves} from './v140SolventStudy';

/**
 * v1.4.2 stop 26: the nmrshiftdb2 1H class study (declared in notes/v1.4.2/STOP26_CHECKPOINT.md before any error number was computed).
 * Two inputs: (1) the full extraction (scripts/nmrshiftdb2/extract_h1.py output, OUTSIDE the repository; only the scratch study reads it), (2) the truth table kept in the repository
 * (tests/fixtures/v140/nmrshiftdb2/h1TruthNmrshiftdb2.json: adopted classes only). Both give the same items for the same compound.
 * Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License (https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
export const TRUTH_FILE = path.resolve(here, '..', 'fixtures', 'v140', 'nmrshiftdb2', 'h1TruthNmrshiftdb2.json');
export const CDCL3_LABELS = ['Chloroform-D1 (CDCl3)', 'CDCL3,TMS'];
/** The stack every v1.4.x 1H layer on (the "before" of this stop) and with the stop-26 rules (the "after"). The rules are switched by V12_CONFIG.v142Nmrshiftdb2.rules, not by a flag. */
export const BEFORE: Setting = {...SETTINGS.stackCal2R3, name: 'stop26 before (all v1.4.x 1H layers)'};
export const OFF: Setting = SETTINGS.off;
const CLUSTER_PPM = 0.02;

let rd: any = null;
export const rdkitInstance = (): any => rd;
export async function initStudy(): Promise<void> { await initTruthTools(); if (!rd) { const factory = (await import('@rdkit/rdkit')).default as any; rd = await factory(); } }

export interface RawRec {id: string; spectrum: number; solvent: string; temperatureK?: string; fieldMHz?: string; assignment: string; unreadableSignal: boolean; inchikey: string; molblock: string; shifts: Record<string, number[]>}
export interface Compound {id: string; spectrum: number; solvent: string; canonical: string; values: Map<number, number[]>; duplicateIds: string[]}
export interface BuildStats {records: number; cdcl3: number; molblockFailed: number; parserFailed: number; mappingFailed: number; elementMismatch: number; duplicatesMerged: number; compounds: number; stereoFreeDuplicates: number}

export function loadExtraction(dir: string): RawRec[] {
  return fs.readFileSync(path.join(dir, 'h1_records.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as RawRec);
}
const elementsOfMolblock = (mb: string): string[] => { const L = mb.split('\n'); const n = parseInt(L[3].slice(0, 3), 10); return L.slice(4, 4 + n).map(l => l.slice(31, 34).trim()); };
const graphCache = new Map<string, ParsedSmilesGraph | undefined>();
export const graphOf = (canonical: string) => { if (!graphCache.has(canonical)) graphCache.set(canonical, StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph | undefined); return graphCache.get(canonical); };

/** canonical SMILES without stereo marks, re-canonicalised */
export const stereoFree = (can: string): string => canonicalizeMolecule(can.replace(/@+/g, '').replace(/[\\/]/g, '')).canonical || can;
/**
 * Molblock records (one solvent set) -> one compound per STEREO-FREE canonical SMILES (lowest nmrshiftdb2 ID, then spectrum number; the kept record's own canonical SMILES is used), values keyed by the canonical-SMILES atom index.
 * Stereo-free (decided in the outlier review, after the phase-1 numbers): the same compound was in twice (strychnine 10009153 without stereo, 40265284 with stereo); the predictor does not read stereo. Diastereomers count once (conservative).
 * stats.stereoFreeDuplicates = merged records whose own canonical SMILES differed from the kept one only by stereo.
 */
/**
 * Outlier review (|truth - before| > 1.0 ppm: 22 items, all checked against the structure and the other signals of the record): the records whose assignment / structure is CONFIRMED wrong. Removed before the dedup.
 * The other 20 outliers were kept (see notes/v1.4.2/S26_OUTLIERS.txt and the stop-26 report).
 */
export const S26_EXCLUDED: {id: string; spectrum: number; reason: string}[] = [
  {id: '10114558', spectrum: 3, reason: 'cyclopentanol: the CH-O value (2.36) and the O-H value (4.26) are swapped (the CH-O of a secondary alcohol is 3.4-4.4 ppm; 2.36 is not possible for it)'},
  {id: '20092495', spectrum: 1, reason: 'the two O-CH3 of the structure carry 2.15 and 2.06 ppm, which are acetyl CH3 values (an O-CH3 is 3.2-3.9 ppm): the structure of the record does not match its signals'},
];
export function buildCompounds(recs: RawRec[], solvents: string[] = CDCL3_LABELS, excluded = S26_EXCLUDED): {compounds: Compound[]; stats: BuildStats} {
  const st: BuildStats = {records: recs.length, cdcl3: 0, molblockFailed: 0, parserFailed: 0, mappingFailed: 0, elementMismatch: 0, duplicatesMerged: 0, compounds: 0, stereoFreeDuplicates: 0};
  const sel = recs.filter(r => solvents.includes(r.solvent) && !excluded.some(x => x.id === r.id && x.spectrum === r.spectrum)).sort((a, b) => Number(a.id) - Number(b.id) || a.spectrum - b.spectrum);
  st.cdcl3 = sel.length;
  const byCan = new Map<string, Compound>();
  for (const r of sel) {
    const mol = rd.get_mol(r.molblock);
    if (!mol || !mol.is_valid()) { mol?.delete(); st.molblockFailed++; continue; }
    let can = '', match: number[] | null = null;
    try {
      can = canonicalizeMolecule(mol.get_smiles()).canonical;
      const tgt = can ? rd.get_mol(can) : null;
      if (tgt) { try { const m = JSON.parse(tgt.get_substruct_match(mol)); match = Array.isArray(m.atoms) ? m.atoms : null; } finally { tgt.delete(); } }
    } finally { mol.delete(); }
    if (!can || !match) { st.mappingFailed++; continue; }
    const g = graphOf(can);
    if (!g || g.atoms.length !== match.length) { st.parserFailed++; continue; }
    const els = elementsOfMolblock(r.molblock);
    if (match.some((t, q) => g.atoms[t].element.toLowerCase() !== els[q].toLowerCase())) { st.elementMismatch++; continue; }
    const values = new Map<number, number[]>();
    for (const [k, v] of Object.entries(r.shifts)) values.set(match[Number(k)], [...(values.get(match[Number(k)]) ?? []), ...v]);
    const key = stereoFree(can);
    const prev = byCan.get(key);
    if (prev) { prev.duplicateIds.push(`${r.id}/${r.spectrum}`); st.duplicatesMerged++; if (prev.canonical !== can) st.stereoFreeDuplicates++; continue; }
    byCan.set(key, {id: r.id, spectrum: r.spectrum, solvent: r.solvent, canonical: can, values, duplicateIds: []});
  }
  const compounds = [...byCan.values()];
  st.compounds = compounds.length;
  return {compounds, stats: st};
}

// ---------------------------------------------------------------- classes
const qCache = new Map<string, any>();
/** SMARTS class of every atom (first class in S26_CLASSES order); multi = atoms matched by more than one class. */
export function smartsClasses(canonical: string): {cls: Map<number, string>; multi: [number, string[]][]} {
  const mol = rd.get_mol(canonical), hits = new Map<number, string[]>();
  try {
    for (const d of S26_CLASSES) {
      let q = qCache.get(d.smarts); if (!q) { q = rd.get_qmol(d.smarts); if (!q) throw new Error('SMARTS does not parse: ' + d.id); qCache.set(d.smarts, q); }
      const raw = JSON.parse(mol.get_substruct_matches(q)); const ms = Array.isArray(raw) ? raw : [];
      for (const m of ms) hits.set(m.atoms[0], [...new Set([...(hits.get(m.atoms[0]) ?? []), d.id])]);
    }
  } finally { mol.delete(); }
  const cls = new Map<number, string>(), multi: [number, string[]][] = [];
  for (const [a, ids] of hits) { const sorted = S26_CLASSES.map(d => d.id).filter(id => ids.includes(id)); cls.set(a, sorted[0]); if (sorted.length > 1) multi.push([a, sorted]); }
  return {cls, multi};
}

// ---------------------------------------------------------------- items
type Env = {atomIndices?: number[]; shiftPpm: number; integration: number; isExchangeable?: boolean};
export interface S26Item {id: string; spectrum: number; canonical: string; cls: string; graphCls: string | null; atoms: number[]; truth: number; predicted: number; residual: number; offPredicted?: number | null; pair?: 'low' | 'high' | 'same'}
export interface Skip {id: string; canonical: string; cls: string; atoms: number[]; reason: string; values: number[]}
const clusters = (v: number[]): number[] => {
  const s = [...v].sort((a, b) => a - b), out: number[][] = [];
  for (const x of s) { const last = out[out.length - 1]; if (last && x - last[0] <= CLUSTER_PPM) last.push(x); else out.push([x]); }
  return out.map(c => c.reduce((a, b) => a + b, 0) / c.length);
};
/** The groups of predicted environments (one group per atom set; a split =CH2 is one atom with two environments). */
const groupsOf = (envs: Env[]) => {
  const m = new Map<string, {atoms: number[]; envs: Env[]}>();
  for (const e of envs) { if (e.isExchangeable || !e.atomIndices?.length) continue; const k = [...e.atomIndices].sort((a, b) => a - b).join(','); const g = m.get(k) ?? {atoms: [...e.atomIndices].sort((a, b) => a - b), envs: []}; g.envs.push(e); m.set(k, g); }
  return m;
};
/**
 * The unambiguous items of one compound for the class atoms (rules of the checkpoint): exchangeable never; two values > 0.02 apart on one sp3 atom = diastereotopic, skipped; atoms of one environment with different values, skipped;
 * a value (to 0.01) shared by atoms of different environments = lumped, skipped; =CH2 with two environments: two values paired in ascending order, one value compared with both.
 */
export function itemsOfCompound(c: {id: string; spectrum: number; canonical: string; values: Map<number, number[]>}, classOf: Map<number, string>, setting: Setting = BEFORE, withOff = false): {items: S26Item[]; skips: Skip[]} {
  const items: S26Item[] = [], skips: Skip[] = [];
  const classAtoms = [...classOf.keys()].filter(a => c.values.has(a));
  if (!classAtoms.length) return {items, skips};
  const envs = predictEnvs(c.canonical, 'CDCl3', setting) as unknown as Env[];
  const groups = groupsOf(envs);
  const g = graphOf(c.canonical)!;
  // lumped values: a value given to atoms of two or more different groups
  const owner = new Map<string, Set<string>>();
  for (const [k, gr] of groups) for (const a of gr.atoms) for (const v of c.values.get(a) ?? []) { const key = v.toFixed(2); owner.set(key, new Set([...(owner.get(key) ?? []), k])); }
  const offEnvs = withOff ? groupsOf(predictEnvs(c.canonical, 'CDCl3', OFF) as unknown as Env[]) : null;
  const done = new Set<string>();
  for (const a of classAtoms) {
    const entry = [...groups.entries()].find(([, gr]) => gr.atoms.includes(a));
    const cls = classOf.get(a)!;
    const vals = c.values.get(a)!;
    if (!entry) { skips.push({id: c.id, canonical: c.canonical, cls, atoms: [a], reason: 'no predicted environment holds the atom', values: vals}); continue; }
    const [key, gr] = entry; if (done.has(key)) continue; done.add(key);
    const withVals = gr.atoms.filter(x => c.values.has(x)), all = withVals.flatMap(x => c.values.get(x)!);
    const skip = (reason: string) => skips.push({id: c.id, canonical: c.canonical, cls, atoms: gr.atoms, reason, values: all});
    if (new Set(gr.atoms.map(x => classOf.get(x))).size > 1) { skip('atoms of one environment in different classes'); continue; }
    if (all.some(v => [...(owner.get(v.toFixed(2)) ?? [])].some(k => k !== key))) { skip('value shared with another environment (lumped)'); continue; }
    const graphCls = s26Class(g, a);
    const offOf = (k: number): number | null => { if (!offEnvs) return null; const og = offEnvs.get(key); if (!og) return null; const s = [...og.envs].sort((x, y) => x.shiftPpm - y.shiftPpm); return (s[k] ?? s[0]).shiftPpm; };
    const push = (truth: number, e: Env, k: number, pair?: S26Item['pair']) => items.push({id: c.id, spectrum: c.spectrum, canonical: c.canonical, cls, graphCls, atoms: gr.atoms, truth, predicted: e.shiftPpm, residual: truth - e.shiftPpm, ...(withOff ? {offPredicted: offOf(k)} : {}), ...(pair ? {pair} : {})});
    if (gr.envs.length === 1) {
      if (withVals.some(x => clusters(c.values.get(x)!).length > 1)) { skip('diastereotopic (two values on one atom)'); continue; }
      if (clusters(withVals.map(x => clusters(c.values.get(x)!)[0])).length > 1) { skip('atoms of one environment with different values'); continue; }
      push(all.reduce((s, v) => s + v, 0) / all.length, gr.envs[0], 0);
    } else if (gr.envs.length === 2) {
      const cl = clusters(all), es = [...gr.envs].sort((x, y) => x.shiftPpm - y.shiftPpm);
      if (cl.length === 2) { push(cl[0], es[0], 0, 'low'); push(cl[1], es[1], 1, 'high'); }
      else if (cl.length === 1) { push(cl[0], es[0], 0, 'same'); push(cl[0], es[1], 1, 'same'); }
      else skip('more than two values for two environments');
    } else skip('more than two environments on one atom set');
  }
  return {items, skips};
}

// ---------------------------------------------------------------- fit
export const toRecs = (items: S26Item[]): Rec[] => items.map(i => ({grade: 'NMRShiftDB2', compound: `nmrshiftdb2 ${i.id}`, canonical: i.canonical, l0: i.cls, l1: null, tier: 0, round: 0, candidate: false, label: i.atoms.join(','), truth: i.truth, predicted: i.predicted, residual: i.residual}));
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const median = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Compound-level absolute errors (each compound: mean |residual - shift| over its items). */
export function compoundErrors(items: S26Item[], shift = 0, pick: (i: S26Item) => number | null = i => i.residual): number[] {
  const by = new Map<string, number[]>();
  for (const i of items) { const r = pick(i); if (r === null) continue; by.set(i.canonical, [...(by.get(i.canonical) ?? []), Math.abs(r - shift)]); }
  return [...by.values()].map(mean);
}
export const errorSummary = (e: number[]) => ({n: e.length, mean: mean(e), median: median(e), over03: e.length ? e.filter(x => x > 0.3).length / e.length : NaN});
export interface HeldOut {seed: number; nFit: number; nHeld: number; delta: number; before: number; after: number; falls: boolean}
/** Stop-12 halves (seeded Fisher-Yates over the canonical SMILES; half A fits, half B is held out). */
export function heldOutCheck(items: S26Item[], seed = V12_CONFIG.v142Nmrshiftdb2.heldOutSeed): HeldOut {
  const {A, B} = halves([...new Set(items.map(i => i.canonical))], seed);
  const fitItems = items.filter(i => A.has(i.canonical)), held = items.filter(i => B.has(i.canonical));
  const byA = new Map<string, number[]>(); for (const i of fitItems) byA.set(i.canonical, [...(byA.get(i.canonical) ?? []), i.residual]);
  const delta = mean([...byA.values()].map(mean));
  const before = mean(compoundErrors(held)), after = mean(compoundErrors(held, delta));
  return {seed, nFit: A.size, nHeld: B.size, delta, before, after, falls: after < before};
}
export interface S26Decision {cls: string; n: number; nItems: number; fit: Fit; heldOut: HeldOut | null; adopt: boolean; reason: string}
export function decideS26(items: S26Item[], opts = V12_CONFIG.v142Nmrshiftdb2): S26Decision[] {
  const out: S26Decision[] = [];
  for (const d of S26_CLASSES) {
    const mine = items.filter(i => i.cls === d.id);
    const fit = fitClass(d.id, 0, null, toRecs(mine), {...V12_CONFIG.v140Calibration2, minCompounds: opts.minCompounds, withinTolerancePpm: opts.withinTolerancePpm});
    const n = fit.n;
    let heldOut: HeldOut | null = null, adopt = false, reason: string;
    if (n < opts.minCompounds) reason = `insufficient data (${n} compound${n === 1 ? '' : 's'})`;
    else if (fit.maeBefore <= opts.withinTolerancePpm) reason = `accurate enough (mean error ${fit.maeBefore.toFixed(2)} <= ${opts.withinTolerancePpm})`;
    else if (!(fit.maeLoo < fit.maeBefore)) reason = `leave-one-out not lower (${fit.maeBefore.toFixed(2)} -> ${fit.maeLoo.toFixed(2)})`;
    else if (n >= opts.heldOutMinCompounds) {
      heldOut = heldOutCheck(mine, opts.heldOutSeed);
      adopt = heldOut.falls;
      reason = `leave-one-out ${fit.maeBefore.toFixed(2)} -> ${fit.maeLoo.toFixed(2)}; held-out half (seed ${opts.heldOutSeed}, ${heldOut.nHeld} compounds) ${heldOut.before.toFixed(2)} -> ${heldOut.after.toFixed(2)}${adopt ? '' : ' NOT lower'}`;
    } else { adopt = true; reason = `leave-one-out ${fit.maeBefore.toFixed(2)} -> ${fit.maeLoo.toFixed(2)} (fewer than ${opts.heldOutMinCompounds} compounds: no held-out half)`; }
    out.push({cls: d.id, n, nItems: mine.length, fit, heldOut, adopt, reason});
  }
  return out;
}

// ---------------------------------------------------------------- the repository truth table
export interface TruthEntry {id: string; spectrum: number; solvent: string; smiles: string; cls: string; atoms: number[]; ppm: number | [number, number]}
export interface TruthFile {meta: Record<string, unknown>; entries: TruthEntry[]; excluded: (TruthEntry & {reason: string})[]}
export const loadTruthFile = (): TruthFile => JSON.parse(fs.readFileSync(TRUTH_FILE, 'utf8'));
/** Items from the repository truth table (the same pairing as itemsOfCompound; the ambiguity filters were applied when the table was written). */
export function itemsFromTruth(entries: TruthEntry[], setting: Setting = BEFORE): S26Item[] {
  const out: S26Item[] = [];
  for (const t of entries) {
    const envs = (predictEnvs(t.smiles, 'CDCl3', setting) as unknown as Env[]).filter(e => !e.isExchangeable && e.atomIndices && [...e.atomIndices].sort((a, b) => a - b).join(',') === t.atoms.join(',')).sort((a, b) => a.shiftPpm - b.shiftPpm);
    const g = graphOf(t.smiles)!;
    const base = {id: t.id, spectrum: t.spectrum, canonical: t.smiles, cls: t.cls, graphCls: s26Class(g, t.atoms[0]), atoms: t.atoms};
    if (!envs.length) throw new Error(`no environment for ${t.id} ${t.smiles} ${t.atoms}`);
    if (typeof t.ppm === 'number') {
      if (envs.length === 1) out.push({...base, truth: t.ppm, predicted: envs[0].shiftPpm, residual: t.ppm - envs[0].shiftPpm});
      else envs.forEach(e => out.push({...base, truth: t.ppm as number, predicted: e.shiftPpm, residual: (t.ppm as number) - e.shiftPpm, pair: 'same'}));
    } else { const [lo, hi] = t.ppm; out.push({...base, truth: lo, predicted: envs[0].shiftPpm, residual: lo - envs[0].shiftPpm, pair: 'low'}, {...base, truth: hi, predicted: envs[1].shiftPpm, residual: hi - envs[1].shiftPpm, pair: 'high'}); }
  }
  return out;
}
/** Truth entries (for the repository table) from items: one entry per environment group. */
export function entriesOf(items: S26Item[], solventOf: (id: string, spectrum: number) => string): TruthEntry[] {
  const by = new Map<string, S26Item[]>();
  for (const i of items) { const k = `${i.id}|${i.atoms.join(',')}`; by.set(k, [...(by.get(k) ?? []), i]); }
  return [...by.values()].map(list => {
    const i = list[0];
    const ppm: TruthEntry['ppm'] = list.length === 2 && list[0].pair !== 'same' ? [Number(list[0].truth.toFixed(4)), Number(list[1].truth.toFixed(4))] : Number(i.truth.toFixed(4));
    return {id: i.id, spectrum: i.spectrum, solvent: solventOf(i.id, i.spectrum), smiles: i.canonical, cls: i.cls, atoms: i.atoms, ppm};
  });
}
