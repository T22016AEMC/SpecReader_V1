import {StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {round3Class} from '../../src/engines/scientificEngines/h1Round3';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {evalTier1, evalTier2, evalTier3, SETTINGS, type Item} from './v140Truth';
import {fitClass, fmt2, fmtSigned, GRADE_SOURCE, type Fit, type Rec} from './v140Calibration2Study';

/**
 * v1.4.1 stop 22: the class-calibration study of the third round (cyclopropane, cyclobutane). Same machinery and the same facts as stop 13 (fitClass: one additive shift per class, compounds weighted equally, leave-one-out),
 * with the policy the planner wrote for this stop: per class try the POOLED shift first; only if the pooled shift does not pass (>= 3 independent compounds, leave-one-out error lower than the uncorrected error) try ONE declared refinement
 * (sub-classes that pass on their own are corrected, the others stay uncorrected), deploy it when its class-level leave-one-out error is lower than the uncorrected error. A class that is already within the tier-2 tolerance is not changed.
 * Data: tier 1 (CDCl3), tier 2 rounds 1-3 (round 3 = tests/fixtures/v140/h1Truth3.json), without the signals marked validationOnly; prediction = the stack of the earlier flags (alkene, oxygen, coverage, solvent, calibration2) WITHOUT round3.
 */
const graphOf = new Map<string, ParsedSmilesGraph | undefined>();
const graph = (canonical: string) => { if (!graphOf.has(canonical)) graphOf.set(canonical, StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph | undefined); return graphOf.get(canonical); };

export function allItems(setting = SETTINGS.stackCal2): Item[] { return [...evalTier1(setting, 'CDCl3'), ...evalTier2(setting, 'round1'), ...evalTier2(setting, 'round2'), ...evalTier3(setting)]; }
/** Records of the calibration data (validation-only signals excluded). */
export function collectRound3Records(items: Item[] = allItems()): Rec[] {
  const out: Rec[] = [];
  for (const i of items) {
    if (i.exchangeable || i.rangeOnly || i.validationOnly || i.predicted === null || i.solvent !== 'CDCl3' || i.atom < 0) continue;
    const g = graph(i.canonical); if (!g) continue;
    const cls = round3Class(g, i.atom); if (!cls) continue;
    out.push({grade: i.grade, compound: i.compound, canonical: i.canonical, l0: cls.l0, l1: cls.l1, tier: i.tier, round: i.round, candidate: i.candidate, label: i.label, truth: i.truth, predicted: i.predicted, residual: i.truth - i.predicted});
  }
  return out;
}
export interface Round3Decision {l0: string; n: number; maeBefore: number; pooled: Fit; refined: Fit[]; maeLooPooled: number | null; maeLooRefined: number | null; choice: 'pooled' | 'refined' | 'none'; reason: string; deployed: Fit[]; refinementTried: boolean}
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
export function decideRound3(recs: Rec[], opts = V12_CONFIG.v140Calibration2): Round3Decision[] {
  const out: Round3Decision[] = [];
  for (const l0 of [...new Set(recs.map(r => r.l0))].sort()) {
    const mine = recs.filter(r => r.l0 === l0);
    const pooled = fitClass(l0, 0, null, mine, opts);
    const refined = [...new Set(mine.map(r => r.l1).filter((x): x is string => x !== null))].sort().map(l1 => fitClass(l1, 1, l0, mine.filter(r => r.l1 === l1), opts));
    const base = {l0, n: pooled.n, maeBefore: pooled.maeBefore, pooled, refined};
    if (pooled.n < opts.minCompounds) { out.push({...base, maeLooPooled: null, maeLooRefined: null, choice: 'none', reason: 'insufficient data (' + pooled.n + ' independent compound' + (pooled.n === 1 ? '' : 's') + ')', deployed: [], refinementTried: false}); continue; }
    if (pooled.maeBefore <= opts.withinTolerancePpm) { out.push({...base, maeLooPooled: null, maeLooRefined: null, choice: 'none', reason: 'accurate enough (mean error ' + fmt2(pooled.maeBefore) + ' <= ' + opts.withinTolerancePpm + ')', deployed: [], refinementTried: false}); continue; }
    const passing = refined.filter(f => f.status === 'calibrate');
    let maeLooRefined: number | null = null;
    if (passing.length) {
      const per = new Map<string, number[]>();
      for (const f of refined) for (const p of f.perCompound) per.set(p.name, [...(per.get(p.name) ?? []), f.status === 'calibrate' ? p.loo : p.before]);
      maeLooRefined = mean([...per.values()].map(v => mean(v)));
    }
    if (pooled.status === 'calibrate') { out.push({...base, maeLooPooled: pooled.maeLoo, maeLooRefined, choice: 'pooled', reason: 'pooled shift: leave-one-out ' + fmt2(pooled.maeBefore) + ' -> ' + fmt2(pooled.maeLoo) + ' (refinement not used: the pooled shift passed)', deployed: [pooled], refinementTried: false}); continue; }
    if (maeLooRefined !== null && maeLooRefined < pooled.maeBefore) { out.push({...base, maeLooPooled: null, maeLooRefined, choice: 'refined', reason: 'pooled leave-one-out ' + fmt2(pooled.maeLoo) + ' not lower than ' + fmt2(pooled.maeBefore) + '; refined shifts for ' + passing.map(f => f.key).join(', ') + ': leave-one-out ' + fmt2(pooled.maeBefore) + ' -> ' + fmt2(maeLooRefined), deployed: passing, refinementTried: true}); continue; }
    out.push({...base, maeLooPooled: null, maeLooRefined, choice: 'none', reason: 'pooled leave-one-out ' + fmt2(pooled.maeLoo) + ' not lower than ' + fmt2(pooled.maeBefore) + (passing.length ? '; refinement ' + (maeLooRefined === null ? 'n/a' : fmt2(maeLooRefined)) + ' not lower either' : '; no sub-class passes (' + refined.map(f => f.key + ' ' + f.status).join(', ') + ')'), deployed: [], refinementTried: true});
  }
  return out;
}
export {fmt2, fmtSigned, GRADE_SOURCE};
