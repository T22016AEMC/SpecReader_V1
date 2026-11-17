import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {canonicalizeMolecule, initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine, StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {coarseClass, envCategoryOfGraph} from '../../src/engines/scientificEngines/h1EnvClass';

/**
 * v1.4.0 stops 10-12: reader of the two truth files (tier 1, Fulmer 2010 SI Table S1, 7 solvents; h1Truth2.json = tier 2, validation only)
 * and the evaluation of the 1H predictor against them.
 * v1.4.2 stop 35: tier 1 is read from the derived file (since stop 36 local-only: tests/fixtures/local-only/fulmer2010/fulmer2010H1.derived.json) (only what the tests read, own arrangement, source on every record);
 * the original transcription and the grade-A entries of tier 2 (SDBS / ChemicalBook / RSC SI, user-looked-up) are local-only files (tests/fixtures/local-only/, git-ignored).
 * loadTier1 / loadTier2 give the same compounds, signals and values in the same order as before when the local files are present (tests/v14/v142LocalOnlyTruth.test.ts). A signal names its hydrogen-bearing atoms by a SMARTS (first atom = the H-bearing atom) resolved on the RDKit canonical SMILES, which is the atom order the predictor uses.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(here, '..', 'fixtures', 'v140');

export const SOLVENTS = ['CDCl3', 'C6D6', 'acetone-d6', 'DMSO-d6', 'CD3CN', 'CD3OD', 'D2O'] as const;
export type SolventKey = (typeof SOLVENTS)[number];
/** Engine solvent ids (NMRSolvent) of the seven solvents. */
export const ENGINE_SOLVENT: Record<SolventKey, string> = {CDCl3: 'CDCl3', C6D6: 'C6D6', 'acetone-d6': 'Acetone-d6', 'DMSO-d6': 'DMSO-d6', CD3CN: 'CD3CN', CD3OD: 'CD3OD', D2O: 'D2O'};

export interface TruthSignal {
  label: string; smarts: string; nH?: number | null; exchangeable?: boolean; note?: string; usable?: boolean; range?: [number, number];
  multiplicityS1?: string | null; s1Row?: number; crossCheckNote?: string;
  /** tier 1: per solvent a number or {mid, range}; null/absent = no value in the table */
  values?: Record<string, number | {mid: number; range: [number, number]}>;
  /** tier 2: one value or alternatives */
  ppm?: number | number[]; mult?: string;
  /** stop 13: an interval-only value. The error is 0 inside `range` and the distance to the nearest end outside it (no point value is claimed). */
  rangeOnly?: boolean;
  /** stop 22: an assignment read from a figure; evaluated and reported, never used to calibrate. */
  validationOnly?: boolean;
}
export interface TruthCompound {name?: string; compound?: string; smiles: string; solvent?: string; tier?: number; grade?: string; source?: string; signals: TruthSignal[]
  /** stop 13: 2 = the second batch of the planner list (2026-11-10). Absent = round 1. */
  round?: number;
  /** stop 13: a journal value that is a tier-1 candidate (the calibration rule treats it like tier 2). */
  candidate?: boolean}
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
/** v1.4.2 stop 35: files kept out of the public repository (tests/fixtures/local-only/, git-ignored). A test that needs one skips with a one-line note when it is absent. */
export const LOCAL_ONLY = {
  /** Fulmer 2010 SI Table S1 as transcribed in v1.4.0 (the original arrangement); the derived file replaces it in every test. */
  tier1Full: path.resolve(FIX, '..', 'local-only', 'fulmer2010', 'h1Truth1.full.json'),
  /** The stop-7 spectra file as it was (Fulmer 2010 SI Table S7); the derived module replaces it in every test. */
  stop7Full: path.resolve(FIX, '..', 'local-only', 'fulmer2010', 'h1Stop7Spectra.full.ts'),
  /** The grade-A entries of h1Truth2.json (user-looked-up SDBS / ChemicalBook / RSC SI values) with their positions. */
  tier2GradeA: path.resolve(FIX, '..', 'local-only', 'restricted-sources', 'h1Truth2.gradeA.json'),
  /** v1.4.2 stop 36 (F): the derived Fulmer 2010 files (tier 1 = Table S1, 677 values; stop-7 spectra = Table S7) are local-only as a whole too. */
  tier1Derived: path.resolve(FIX, '..', 'local-only', 'fulmer2010', 'fulmer2010H1.derived.json'),
  stop7Derived: path.resolve(FIX, '..', 'local-only', 'fulmer2010', 'fulmer2010Stop7.derived.ts'),
  /** v1.4.2 stop 36: test rows that quote a grade-A value (a pinned prediction equal to one). */
  gradeACitations: path.resolve(FIX, '..', 'local-only', 'restricted-sources', 'gradeA.citations.json'),
} as const;
export const hasLocalOnly = (k: keyof typeof LOCAL_ONLY): boolean => fs.existsSync(LOCAL_ONLY[k]);
/** v1.4.2 stop 36 (F): true when the Fulmer 2010 files (tier 1 and the stop-7 spectra) are absent (the public repository); a test that reads them skips. */
export const NEED_FULMER = !hasLocalOnly('tier1Derived') || !hasLocalOnly('stop7Derived');
/** Prints the one-line note once per file and returns NEED_FULMER (use as it.skipIf(needFulmer('file: what'))). */
export const needFulmer = (what: string): boolean => { if (NEED_FULMER) console.info(localOnlyNote(hasLocalOnly('tier1Derived') ? 'stop7Derived' : 'tier1Derived', what)); return NEED_FULMER; };
export type SPeak = {x: number; integration: number; multiplicity: string};
type Stop7Module = {STOP7_SPECTRA: [string, string, string, SPeak[]][]; STOP7_RECORDS: {name: string; smiles: string; formula: string; peaks: [number, number, string][]; source: Record<string, unknown>}[]};
/** v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7, local-only); empty lists when the file is absent. */
export const loadStop7 = async (): Promise<Stop7Module> => (hasLocalOnly('stop7Derived') ? (await import(/* @vite-ignore */ pathToFileURL(LOCAL_ONLY.stop7Derived).href)) as Stop7Module : {STOP7_SPECTRA: [], STOP7_RECORDS: []});
/** v1.4.2 stop 36: the rows of a prediction table kept local-only (none, with a one-line note, when the file is absent). */
export type PredRow = [string, string, string, [number, number][], number];
export const gradeAPredRows = (label: string): PredRow[] => {
  if (!hasLocalOnly('gradeACitations')) { console.info(localOnlyNote('gradeACitations', `the prediction row ${label}`)); return []; }
  const row = JSON.parse(fs.readFileSync(LOCAL_ONLY.gradeACitations, 'utf8')).pred?.[label] as PredRow | undefined;
  return row ? [row] : [];
};
/** v1.4.2 stop 36: the first (user-list) value of a grade-A signal, from the local-only file (call only when hasLocalOnly('tier2GradeA')). */
export const gradeAValue = (compound: string, label: string): number => {
  const d = JSON.parse(fs.readFileSync(LOCAL_ONLY.tier2GradeA, 'utf8')) as {entries: {compound: {compound: string; signals: {label: string; ppm: number | number[]}[]}}[]};
  const ppm = d.entries.find(e => e.compound.compound === compound)!.compound.signals.find(s => s.label === label)!.ppm;
  return Array.isArray(ppm) ? ppm[0] : ppm;
};
/** The one-line note of a test skipped because a local-only file is absent (the public repository). */
export const localOnlyNote = (k: keyof typeof LOCAL_ONLY, what: string): string => `skipped: ${what} needs the local-only file ${path.relative(path.resolve(FIX, '..', '..', '..'), LOCAL_ONLY[k]).split(path.sep).join('/')}, which is not in the public repository (source terms; notes/v1.4.2/STOP35_REPORT.md)`;
interface DerivedTier1 {about: Record<string, unknown>; sources: Record<string, unknown>; compounds: {id: string; name: string; smiles: string; signals: {id: string; label: string; smarts: string; nH: number | null; exchangeable: boolean; note?: string}[]}[]; shifts: {signal: string; solvent: string; ppm: number; source: string}[]}
/** Tier 1 from the derived file, in the shape the studies read: per signal {solvent: ppm} in the order of the records. */
export const loadTier1 = (): {meta: Record<string, unknown>; compounds: (TruthCompound & {name: string})[]} => {
  const d = JSON.parse(fs.readFileSync(LOCAL_ONLY.tier1Derived, 'utf8')) as DerivedTier1;
  const values = new Map<string, Record<string, number>>();
  for (const x of d.shifts) { const v = values.get(x.signal) ?? {}; v[x.solvent] = x.ppm; values.set(x.signal, v); }
  return {meta: {...d.about, sources: d.sources}, compounds: d.compounds.map(c => ({name: c.name, smiles: c.smiles, signals: c.signals.map(s => ({label: s.label, smarts: s.smarts, nH: s.nH, exchangeable: s.exchangeable, ...(s.note ? {note: s.note} : {}), values: values.get(s.id) ?? {}}))}))};
};
/** The original tier-1 transcription (local-only). */
export const loadTier1Full = (): {meta: Record<string, unknown>; compounds: (TruthCompound & {name: string})[]} => JSON.parse(fs.readFileSync(LOCAL_ONLY.tier1Full, 'utf8'));
/** Tier 2. `which`: 'round1' (default: the stop-10 set, so the stop 10-12 tests keep their inputs), 'round2' (the stop-13 batch) or 'all'. */
export type Tier2Which = 'round1' | 'round2' | 'all';
/** Stop 22: the third round (tests/fixtures/v140/h1Truth3.json, planner list 2026-11-13). */
export const loadTier3 = (): {meta: Record<string, unknown>; compounds: (TruthCompound & {compound: string; substituent?: string; validationOnly?: boolean})[]} => readJson('h1Truth3.json');
export const loadTier2 = (which: Tier2Which = 'round1'): {meta: Record<string, unknown>; compounds: (TruthCompound & {compound: string})[]; benzeneIncrements?: any} => {
  const j = readJson('h1Truth2.json');
  // v1.4.2 stop 35: the grade-A entries are local-only; when present they go back to their original positions (ascending index).
  if (hasLocalOnly('tier2GradeA')) for (const e of (JSON.parse(fs.readFileSync(LOCAL_ONLY.tier2GradeA, 'utf8')) as {entries: {index: number; compound: TruthCompound}[]}).entries.sort((a, b) => a.index - b.index)) j.compounds.splice(e.index, 0, e.compound);
  return {...j, compounds: j.compounds.filter((c: TruthCompound) => which === 'all' || (which === 'round2') === (c.round === 2))};
};

// ---------------------------------------------------------------- RDKit instance for substructure matches
let rd: any = null;
export async function initTruthTools(): Promise<void> {
  await initializeRDKit();
  if (!rd) { const factory = (await import('@rdkit/rdkit')).default as any; rd = await factory(); }
}
export interface Resolved {canonical: string; atoms: number[]; hCount: number; error?: string}
const resolveCache = new Map<string, Resolved>();
/** Atoms (canonical-SMILES indices) that match the first atom of the SMARTS; hCount = their hydrogens. */
export function resolveAtoms(smiles: string, smarts: string): Resolved {
  const key = `${smiles}\u0000${smarts}`;
  const hit = resolveCache.get(key); if (hit) return hit;
  const can = canonicalizeMolecule(smiles);
  let res: Resolved;
  if (!can.valid || !can.canonical) res = {canonical: '', atoms: [], hCount: 0, error: 'SMILES does not parse'};
  else {
    const mol = rd.get_mol(can.canonical), q = rd.get_qmol('[$(' + smarts + ')]');   // recursive SMARTS: one match per H-bearing atom (the matcher would otherwise collapse equivalent atoms)
    if (!mol || !q) res = {canonical: can.canonical, atoms: [], hCount: 0, error: !q ? 'SMARTS does not parse' : 'molecule does not parse'};
    else {
      try {
        const raw = JSON.parse(mol.get_substruct_matches(q)) as unknown;
        const matches = Array.isArray(raw) ? (raw as {atoms: number[]}[]) : [];
        const atoms = [...new Set(matches.map(m => m.atoms[0]))].sort((a, b) => a - b);
        const graph = StructureParserAdapter.parseSmilesGraph(can.canonical).graph as ParsedSmilesGraph | undefined;
        res = {canonical: can.canonical, atoms, hCount: atoms.reduce((s, i) => s + (graph?.atoms[i]?.totalHydrogens ?? 0), 0), ...(atoms.length ? {} : {error: 'SMARTS matches nothing'})};
      } finally { mol.delete(); q.delete(); }
    }
  }
  resolveCache.set(key, res); return res;
}

// ---------------------------------------------------------------- environment categories (src/engines/scientificEngines/h1EnvClass.ts)
/** Category of the H-bearing atom, from the structure graph only (no shift value is looked at). The names are the classes of the stop-10/11/12 reports. */
export function envCategory(canonical: string, atomIdx: number): string {
  const g = StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph | undefined;
  return g ? envCategoryOfGraph(g, atomIdx) : 'unparsed';
}
export {coarseClass};

// ---------------------------------------------------------------- prediction and pairing
export interface Setting {name: string; useV140H1: boolean; alkene?: boolean; oxygen?: boolean; coverage?: boolean; solvent?: boolean; matching?: boolean; plausibility?: boolean; calibration2?: boolean; round3?: boolean}
export const SETTINGS = {
  off: {name: 'off', useV140H1: false} as Setting,
  base: {name: 'base (useV140H1, no coverage)', useV140H1: true, alkene: true, oxygen: true, coverage: false, solvent: false} as Setting,
  coverage: {name: 'coverage', useV140H1: true, alkene: true, oxygen: true, coverage: true, solvent: false} as Setting,
  /** The stack of the stops 2-11 (useV140H1, alkene, oxygen) without / with the stop-12 solvent classes. */
  solventOff: {name: 'solvent off', useV140H1: true, alkene: true, oxygen: true, coverage: false, solvent: false} as Setting,
  solventOn: {name: 'solvent on', useV140H1: true, alkene: true, oxygen: true, coverage: false, solvent: true} as Setting,
  alkeneOnly: {name: 'alkene only', useV140H1: true, alkene: true, oxygen: false, coverage: false, solvent: false} as Setting,
  oxygenOn: {name: 'oxygen on', useV140H1: true, alkene: true, oxygen: true, coverage: false, solvent: false} as Setting,
  /** The whole v1.4.0 set the stops 8-9 reported with (matching and plausibility on), station-10 flag off / on. */
  full: {name: 'full', useV140H1: true, alkene: true, oxygen: true, matching: true, plausibility: true, coverage: false, solvent: false} as Setting,
  /** Stop 13: every earlier v1.4.0 prediction flag on (alkene, oxygen, coverage, solvent), without / with the stop-13 calibration. */
  stack: {name: 'stack', useV140H1: true, alkene: true, oxygen: true, coverage: true, solvent: true, calibration2: false} as Setting,
  stackCal2: {name: 'stack + calibration2', useV140H1: true, alkene: true, oxygen: true, coverage: true, solvent: true, calibration2: true} as Setting,
  /** Stop 22: the stack of stop 13 plus the third round (v140.round3), the 'before' of which is stackCal2. */
  stackCal2R3: {name: 'stack + calibration2 + round3', useV140H1: true, alkene: true, oxygen: true, coverage: true, solvent: true, calibration2: true, round3: true} as Setting,
  fullCov: {name: 'fullCov', useV140H1: true, alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: false} as Setting,
};
const V = V12_CONFIG as any;
export function applySetting(s: Setting): void {
  V.useV140H1 = s.useV140H1;
  V.v140.alkene = s.alkene ?? true; V.v140.oxygen = s.oxygen ?? true;
  V.v140.matching = s.matching ?? false; V.v140.plausibility = s.plausibility ?? false;
  V.v140.coverage = s.coverage ?? false; V.v140.solvent = s.solvent ?? false; V.v140.calibration2 = s.calibration2 ?? false;
  V.v140.round3 = s.round3 ?? false;   // stop 22: every setting says it; none of the older settings turns the third round on
}
type Env = {atomIndices?: number[]; shiftPpm: number; integration: number; isExchangeable?: boolean};
const envCache = new Map<string, Env[]>();
export function predictEnvs(canonical: string, solvent: string, setting: Setting): Env[] {
  const key = `${setting.name}|${solvent}|${canonical}`;
  const hit = envCache.get(key); if (hit) return hit;
  applySetting(setting);
  const out = NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: canonical}), {solvent: solvent as never}).environments as unknown as Env[];
  envCache.set(key, out); return out;
}
export const clearEnvCache = () => envCache.clear();

export interface Item {
  compound: string; label: string; category: string; coarse: string; tier: 1 | 2; grade: string; solvent: string; exchangeable: boolean;
  round: number; candidate: boolean; rangeOnly: boolean; validationOnly?: boolean; atom: number; truth: number; alt?: number[]; predicted: number | null; error: number | null; nH: number; predH: number | null; problem?: string; smiles: string; canonical: string;
}
const nearest = (vals: number[], p: number) => vals.reduce((best, v) => (Math.abs(p - v) < Math.abs(p - best) ? v : best), vals[0]);
/**
 * Pairs the signals of one compound with predicted environments. Signals with the same SMARTS form a group. Equal numbers of predicted environments and group entries are paired in ascending order of shift
 * (the two =CH2 hydrogens); one entry with several environments is compared with each environment; several entries with fewer environments: every entry is compared with the nearest environment.
 */
export function evalCompound(c: TruthCompound, solvent: string, setting: Setting, valueOf: (s: TruthSignal) => number[] | null): Item[] {
  const items: Item[] = [];
  const name = (c as any).name ?? (c as any).compound;
  const groups = new Map<string, TruthSignal[]>();
  for (const s of c.signals) { if (s.usable === false) continue; const v = valueOf(s); if (!v) continue; groups.set(s.smarts, [...(groups.get(s.smarts) ?? []), s]); }
  for (const [smarts, list] of groups) {
    const r = resolveAtoms(c.smiles, smarts);
    const base = {rangeOnly: false, atom: -1, round: (c as any).round ?? 1, candidate: Boolean((c as any).candidate), compound: name, tier: ((c as any).tier ?? 1) as 1 | 2, grade: (c as any).grade ?? 'T1', solvent, smiles: c.smiles, canonical: r.canonical};
    if (r.error || !r.atoms.length) { for (const s of list) items.push({...base, label: s.label, category: 'unresolved', coarse: 'other', exchangeable: Boolean(s.exchangeable), truth: valueOf(s)![0], predicted: null, error: null, nH: s.nH ?? 0, predH: null, problem: r.error ?? 'no atoms'}); continue; }
    const all = predictEnvs(r.canonical, solvent, setting);
    const hit = all.filter(e => e.atomIndices?.some(a => r.atoms.includes(a))).sort((a, b) => a.shiftPpm - b.shiftPpm);
    const sorted = [...list].sort((a, b) => valueOf(a)![0] - valueOf(b)![0]);
    const cat = envCategory(r.canonical, r.atoms[0]);
    const push = (s: TruthSignal, e: Env | undefined) => {
      const vals = valueOf(s)!, p = e ? e.shiftPpm : null;
      const t = p === null ? vals[0] : s.rangeOnly && s.range ? Math.min(Math.max(p, s.range[0]), s.range[1]) : nearest(vals, p);
      items.push({...base, ...(s.validationOnly || (c as any).validationOnly ? {validationOnly: true} : {}), rangeOnly: Boolean(s.rangeOnly), atom: e?.atomIndices?.[0] ?? r.atoms[0], label: s.label, category: cat, coarse: coarseClass(cat), exchangeable: Boolean(s.exchangeable), truth: t, ...(vals.length > 1 ? {alt: vals} : {}), predicted: p, error: p === null ? null : p - t, nH: s.nH ?? r.hCount, predH: e ? e.integration : null, ...(e ? {} : {problem: 'no predicted environment holds the atom'})});
    };
    if (hit.length === list.length && list.length > 1) sorted.forEach((s, k) => push(s, hit[k]));
    else if (list.length === 1) { if (hit.length === 0) push(list[0], undefined); else for (const e of hit) push(list[0], e); }
    else for (const s of list) { const vals = valueOf(s)!; push(s, hit.length ? [...hit].sort((a, b) => Math.abs(a.shiftPpm - vals[0]) - Math.abs(b.shiftPpm - vals[0]))[0] : undefined); }
  }
  return items;
}
export const tier1Value = (solventKey: string) => (s: TruthSignal): number[] | null => { const v = s.values?.[solventKey]; if (v === undefined || v === null) return null; return [typeof v === 'number' ? v : v.mid]; };
export const tier2Value = (s: TruthSignal): number[] | null => (s.ppm === undefined ? null : Array.isArray(s.ppm) ? s.ppm : [s.ppm]);
export function evalTier1(setting: Setting, solventKey: SolventKey = 'CDCl3'): Item[] {
  return loadTier1().compounds.flatMap(c => evalCompound(c, ENGINE_SOLVENT[solventKey], setting, tier1Value(solventKey)));
}
/** Engine solvent id of a round-2 compound's stated solvent ('unspecified' = CDCl3, as for round 1). */
const ENGINE_OF_STATED: Record<string, string> = {CDCl3: 'CDCl3', unspecified: 'CDCl3', 'DMSO-d6': 'DMSO-d6', 'acetone-d6': 'Acetone-d6', C6D6: 'C6D6', CD3CN: 'CD3CN', CD3OD: 'CD3OD', D2O: 'D2O'};
export function evalTier2(setting: Setting, which: Tier2Which = 'round1'): Item[] {
  return loadTier2(which).compounds.flatMap(c => evalCompound(c, c.round === 2 ? (ENGINE_OF_STATED[c.solvent ?? 'unspecified'] ?? 'CDCl3') : 'CDCl3', setting, tier2Value));
}
/** Stop 22: the third-round compounds (all unspecified-solvent = CDCl3). */
export function evalTier3(setting: Setting): Item[] {
  return loadTier3().compounds.flatMap(c => evalCompound(c, 'CDCl3', setting, tier2Value));
}
export const mae = (items: Item[]) => { const e = items.filter(i => i.error !== null).map(i => Math.abs(i.error!)); return e.length ? e.reduce((s, v) => s + v, 0) / e.length : NaN; };
export const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
