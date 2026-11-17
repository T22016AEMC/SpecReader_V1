import {StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {calibration2Class} from '../../src/engines/scientificEngines/h1Calibration2';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {evalTier1, evalTier2, SETTINGS, type Item} from './v140Truth';

/**
 * v1.4.0 stop 13: the class-calibration study. The procedure is the planner's rule of stop 13 (see h1Calibration2.ts): per class, >= 3 independent compounds, leave-one-out, lower mean error, one additive shift per class.
 * Data: tier 1 (CDCl3 column), tier 2 round 1 and round 2, the journal candidates; only CDCl3 / unspecified-solvent, non-exchangeable, point-valued (not interval-only) signals; prediction = the stack of the earlier v1.4.0 flags
 * (alkene, oxygen, coverage, solvent) WITHOUT calibration2.
 */
export interface Rec {grade: string; compound: string; canonical: string; l0: string; l1: string | null; tier: number; round: number; candidate: boolean; label: string; truth: number; predicted: number; residual: number}
export interface Fit {key: string; level: 0 | 1; parent: string | null; n: number; nItems: number; compounds: string[]; maeBefore: number; maeLoo: number; delta: number; maeAfterInSample: number; status: 'insufficient data' | 'accurate enough' | 'LOO not lower' | 'calibrate'; perCompound: {name: string; before: number; loo: number; residual: number}[]}

const graphOf = new Map<string, ParsedSmilesGraph | undefined>();
const graph = (canonical: string) => { if (!graphOf.has(canonical)) graphOf.set(canonical, StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph | undefined); return graphOf.get(canonical); };

/** Records of the study (one per item with a class). Call with the stack setting (calibration2 off); the class does not depend on any shift. */
export function collectRecords(): Rec[] {
  const items: Item[] = [...evalTier1(SETTINGS.stack, 'CDCl3'), ...evalTier2(SETTINGS.stack, 'round1'), ...evalTier2(SETTINGS.stack, 'round2')];
  const out: Rec[] = [];
  for (const i of items) {
    if (i.exchangeable || i.rangeOnly || i.predicted === null || i.solvent !== 'CDCl3' || i.atom < 0) continue;
    const g = graph(i.canonical); if (!g) continue;
    const cls = calibration2Class(g, i.atom); if (!cls) continue;
    out.push({grade: i.grade, compound: i.compound, canonical: i.canonical, l0: cls.l0, l1: cls.l1, tier: i.tier, round: i.round, candidate: i.candidate, label: i.label, truth: i.truth, predicted: i.predicted, residual: i.truth - i.predicted});
  }
  return out;
}

/** The compound name without the source suffixes of the duplicated entries. */
export const cleanName = (n: string) => n.replace(/ \((stop 13|Reich(, stop 13)?)\)/, '');
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
/** The fit of one class (a set of records): every compound weighted equally; the compound value is the mean over its signals. */
export function fitClass(key: string, level: 0 | 1, parent: string | null, recs: Rec[], opts = V12_CONFIG.v140Calibration2): Fit {
  const by = new Map<string, Rec[]>();
  for (const r of recs) by.set(r.canonical, [...(by.get(r.canonical) ?? []), r]);
  const names = [...by.keys()];
  const comp = names.map(c => { const rs = by.get(c)!; return {canonical: c, name: [...new Set(rs.map(r => r.compound.replace(/ \(stop 13\)| \(Reich(, stop 13)?\)| \(Reich\)/, '')))].join(' / '), res: mean(rs.map(r => r.residual)), absBefore: mean(rs.map(r => Math.abs(r.residual))), list: rs}; });
  const n = comp.length, delta = mean(comp.map(c => c.res)), maeBefore = mean(comp.map(c => c.absBefore));
  const perCompound = comp.map((c, k) => {
    const dLoo = n > 1 ? mean(comp.filter((_, j) => j !== k).map(o => o.res)) : NaN;
    return {name: c.name, before: c.absBefore, loo: mean(c.list.map(r => Math.abs(r.residual - dLoo))), residual: c.res};
  });
  const maeLoo = mean(perCompound.map(p => p.loo)), maeAfter = mean(comp.map(c => mean(c.list.map(r => Math.abs(r.residual - delta)))));
  const status: Fit['status'] = n < opts.minCompounds ? 'insufficient data' : maeBefore <= opts.withinTolerancePpm ? 'accurate enough' : maeLoo < maeBefore ? 'calibrate' : 'LOO not lower';
  return {key, level, parent, n, nItems: recs.length, compounds: comp.map(c => c.name), maeBefore, maeLoo, delta, maeAfterInSample: maeAfter, status, perCompound};
}

export interface Decision {
  l0: string; n: number; maeBefore: number;
  pooled: Fit; refined: Fit[]; maeLooPooled: number | null; maeLooRefined: number | null;
  choice: 'pooled' | 'refined' | 'none'; reason: string; deployed: Fit[];
}
/**
 * The decision per level-0 class. Candidates: (A) one pooled shift for the class; (B) the declared refinement: every sub-class that itself passes the rule (>= 3 compounds, mean error above the tolerance, leave-one-out lower)
 * gets its own shift and the other sub-classes stay uncorrected. The class-level leave-one-out mean error of A is the mean over the compounds of the class of their leave-one-out error; of B, the same with the leave-one-out error of the
 * sub-class for a compound in a passing sub-class and its uncorrected error otherwise. The candidate with the lower class-level leave-one-out error is deployed, provided it is lower than the class's uncorrected mean error; ties go to A.
 */
export function decide(recs: Rec[], opts = V12_CONFIG.v140Calibration2): Decision[] {
  const out: Decision[] = [];
  for (const l0 of [...new Set(recs.map(r => r.l0))].sort()) {
    const mine = recs.filter(r => r.l0 === l0);
    const pooled = fitClass(l0, 0, null, mine, opts);
    const refined = [...new Set(mine.map(r => r.l1).filter((x): x is string => x !== null))].sort().map(l1 => fitClass(l1, 1, l0, mine.filter(r => r.l1 === l1), opts));
    const base = {l0, n: pooled.n, maeBefore: pooled.maeBefore, pooled, refined};
    if (pooled.n < opts.minCompounds) { out.push({...base, maeLooPooled: null, maeLooRefined: null, choice: 'none', reason: 'insufficient data (' + pooled.n + ' independent compound' + (pooled.n === 1 ? '' : 's') + ')', deployed: []}); continue; }
    if (pooled.maeBefore <= opts.withinTolerancePpm) { out.push({...base, maeLooPooled: null, maeLooRefined: null, choice: 'none', reason: 'accurate enough (mean error ' + fmt2(pooled.maeBefore) + ' <= ' + opts.withinTolerancePpm + ')', deployed: []}); continue; }
    const maeLooPooled = pooled.status === 'calibrate' ? pooled.maeLoo : null;
    const passing = refined.filter(f => f.status === 'calibrate');
    let maeLooRefined: number | null = null;
    if (passing.length) {
      const per = new Map<string, number[]>();
      for (const f of refined) for (const p of f.perCompound) per.set(p.name, [...(per.get(p.name) ?? []), f.status === 'calibrate' ? p.loo : p.before]);
      maeLooRefined = mean([...per.values()].map(v => mean(v)));
    }
    let choice: Decision['choice'] = 'none', reason: string;
    if (maeLooPooled !== null && (maeLooRefined === null || maeLooPooled <= maeLooRefined)) { choice = 'pooled'; reason = 'pooled shift: leave-one-out ' + fmt2(pooled.maeBefore) + ' -> ' + fmt2(maeLooPooled); }
    else if (maeLooRefined !== null && maeLooRefined < pooled.maeBefore) { choice = 'refined'; reason = 'refined shifts for ' + passing.map(f => f.key).join(', ') + ': leave-one-out ' + fmt2(pooled.maeBefore) + ' -> ' + fmt2(maeLooRefined) + (maeLooPooled !== null ? ' (pooled would give ' + fmt2(maeLooPooled) + ')' : ' (pooled leave-one-out ' + fmt2(pooled.maeLoo) + ' not lower)'); }
    else reason = 'leave-one-out not lower than the uncorrected error (pooled ' + fmt2(pooled.maeLoo) + (refined.length ? '; refinement: ' + (refined.map(f => f.key + ' ' + f.status).join(', ')) : '') + ')';
    out.push({...base, maeLooPooled, maeLooRefined, choice, reason, deployed: choice === 'pooled' ? [pooled] : choice === 'refined' ? passing : []});
  }
  return out;
}
/** Source label of a truth grade. */
export const GRADE_SOURCE: Record<string, string> = {T1: 'tier 1, Fulmer 2010 SI Table S1', A: 'tier 2, user-looked-up value (SDBS / ChemicalBook / RSC SI)', T1g: 'tier-1 quality, RSC SI / Chem. Sci. 2020 SI', B: 'tier 2, Reich (hand-read)', J: 'tier-1 candidate, journal value'};
/** The text of V12_CONFIG.v140Calibration2.rules (with the per-rule comment the planner asked for: source, compounds, leave-one-out, mean error before / after). */
export function rulesBlockText(decisions: Decision[], recs: Rec[]): string {
  const out: string[] = [];
  for (const d of decisions) for (const f of d.deployed) {
    const mine = recs.filter(r => (f.level === 0 ? r.l0 === f.key : r.l1 === f.key));
    const describe = (name: string) => {
      const rs = mine.filter(r => f.perCompound.length && cleanName(r.compound) === name);
      return name + ' ' + [...new Set(rs.map(r => r.truth.toFixed(2)))].join('/') + ' [' + [...new Set(rs.map(r => r.grade))].join('+') + ']';
    };
    const sources = [...new Set(mine.map(r => r.grade))].map(g => g + ' = ' + GRADE_SOURCE[g]).join('; ');
    out.push('      // ' + f.key + (f.parent ? ' (refinement of ' + f.parent + ')' : '') + ': ' + d.reason + '.');
    out.push('      //   Source: ' + sources + '. Independent compounds (' + f.n + '; each is calibration point and, in turn, the left-out validation point): ' + f.perCompound.map(p => describe(p.name)).join(', ') + '.');
    out.push('      //   Leave-one-out mean error ' + fmt2(f.maeBefore) + ' -> ' + fmt2(f.maeLoo) + ' ppm (in-sample ' + fmt2(f.maeAfterInSample) + '); per compound before / left-out: ' + f.perCompound.map(p => p.name + ' ' + fmt2(p.before) + '/' + fmt2(p.loo)).join(', ') + '. delta = ' + fmtSigned(f.delta) + ' ppm.');
    out.push("      " + f.key + ': {deltaPpm: ' + f.delta.toFixed(2) + ', level: ' + f.level + ', compounds: ' + JSON.stringify(f.perCompound.map(p => p.name)) + ', maeBefore: ' + f.maeBefore.toFixed(2) + ', maeLeaveOneOut: ' + f.maeLoo.toFixed(2) + '},');
  }
  return out.join('\n');
}
export const fmt2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
export const fmtSigned = (v: number) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '—');
