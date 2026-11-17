import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {round3Class} from '../../src/engines/scientificEngines/h1Round3';
import {clearEnvCache, evalTier1, evalTier2, initTruthTools, resolveAtoms, SETTINGS, type Item, needFulmer} from '../helpers/v140Truth';
import {allItems, collectRound3Records, decideRound3, fmt2, fmtSigned, type Round3Decision} from '../helpers/v140Round3Study';
import {refinedRules, withRound3Rules} from '../helpers/v140Round3Refine';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {loadStop7} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_SPECTRA} = await loadStop7();
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the conditions, the refinement scenario and the 31 stop-7 spectra skip without them (one-line note).
const NEED_F = needFulmer('v140Round3CyclopropaneSplit: the conditions, the refinement scenario and the 31 stop-7 spectra');

// v1.4.1 stop 23 (A): the cyclopropane-methine refinement (heteroatom on the ring vs. other) is adopted ONLY IF ALL of the planner conditions hold; otherwise the pooled shift stays. Written before any config change:
//   1. the grouping is chemically writable: a heteroatom (N, O, F, Cl, Br, I) bonded DIRECTLY to a ring carbon = _HETERO; everything else (C, H = the parent, Si, S ...) = _OTHER; the grouping is not adjusted to improve a number.
//   2. each group has >= 3 independent compounds.
//   3. each group's leave-one-out error AND the class-level leave-one-out error are lower than the pooled leave-one-out error (0.27), and the regression of cyclopropanol's ring CH (+0.19 before, -0.79 pooled) is gone
//      (no calibration item gets worse than its uncorrected error by more than 0.15 ppm - the stop-22 rule for 'worse').
//   4. the cyclopropane ring CH2 and the cyclobutane ring CH2 stay pooled (their refinement is not better).
// This test fails while the deployed table disagrees with the outcome of the conditions, whichever way they come out.
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
let decisions: Round3Decision[];
let meth: Round3Decision;
const graphOf = (canonical: string) => StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph;
const POOLED_LOO = () => meth.pooled.maeLoo;

beforeAll(async () => { if (NEED_F) return; await initTruthTools(); clearEnvCache(); decisions = decideRound3(collectRound3Records()); meth = decisions.find(d => d.l0 === 'CYCLOPROPANE_METHINE')!; }, 180000);
afterAll(() => { const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); clearEnvCache(); });

const here = path.dirname(fileURLToPath(import.meta.url));
const NOTES = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.1');
const notes: string[] = [];
afterAll(() => { if (process.env.WRITE_NOTES === '1') fs.writeFileSync(path.join(NOTES, 'STOP23_A_RESULTS.txt'), notes.join('\n') + '\n'); });

/** The calibration item that regressed in stop 22: cyclopropanol, the ring CH that carries the OH. */
const isCyclopropanolCH = (i: Item) => i.compound === 'cyclopropanol' && /Hg/.test(i.label);

describe.skipIf(NEED_F)('A condition 1: the grouping is chemical and fixed', () => {
  it('a heteroatom bonded directly to the ring is _HETERO; carbon, hydrogen (the parent), silicon and sulfur substituents are _OTHER', () => {
    const grp = (smi: string) => { const r = resolveAtoms(smi, '[CH;r3]'); return round3Class(graphOf(r.canonical), r.atoms[0])?.l1; };
    for (const smi of ['ClC1CC1', 'BrC1CC1', 'IC1CC1', 'FC1CC1', 'OC1CC1', 'COC1CC1', 'NC1CC1', 'O=[N+]([O-])C1CC1', 'CC(=O)NC1CC1']) expect(grp(smi), smi).toBe('CYCLOPROPANE_METHINE_HETERO');
    // C substituents (acid, aldehyde, ketone, nitrile, vinyl, phenyl, alkyl), silicon, sulfur (sulfone, thioether): not N, O or halogen, so _OTHER; the grouping is by the atom bonded to the ring, not by what is further away
    for (const smi of ['OC(=O)C1CC1', 'O=CC1CC1', 'CC(=O)C1CC1', 'N#CC1CC1', 'C=CC1CC1', 'c1ccccc1C1CC1', 'CC1CC1', 'C[Si](C)(C)C1CC1', 'CS(=O)(=O)C1CC1', 'CSC1CC1', 'ClCC1CC1', 'OCC1CC1']) expect(grp(smi), smi).toBe('CYCLOPROPANE_METHINE_OTHER');
  });
  it('the 13 calibration compounds fall into 6 _HETERO (Cl, Br, I, OH, NH2, NO2) and 7 _OTHER (acid, aldehyde, methyl ketone, nitrile, vinyl, phenyl, SiMe3); no sulfur compound is among them', () => {
    const recs = collectRound3Records().filter(r => r.l0 === 'CYCLOPROPANE_METHINE');
    const of = (g: string) => [...new Set(recs.filter(r => r.l1 === `CYCLOPROPANE_METHINE_${g}`).map(r => r.compound))].sort();
    expect(of('HETERO')).toEqual(['bromocyclopropane', 'chlorocyclopropane', 'cyclopropanol', 'cyclopropylamine', 'iodocyclopropane', 'nitrocyclopropane']);
    expect(of('OTHER')).toEqual(['cyclopropanecarbonitrile', 'cyclopropanecarboxaldehyde', 'cyclopropanecarboxylic acid', 'cyclopropyl methyl ketone', 'cyclopropylbenzene', 'cyclopropyltrimethylsilane', 'vinylcyclopropane']);
  });
});

describe.skipIf(NEED_F)('A conditions 2-4 evaluated, and the deployed table follows the outcome', () => {
  let conds: {c1: boolean; c2: boolean; c3a: boolean; c3b: boolean; c4: boolean; adopt: boolean};
  it('evaluates the four conditions from the fits and the engine (the refinement is injected for the engine run, the source table is restored afterwards)', () => {
    const fits = meth.refined;
    const c2 = fits.length === 2 && fits.every(f => f.n >= 3);
    const c3a = fits.every(f => f.status === 'calibrate' && f.maeLoo < POOLED_LOO()) && meth.maeLooRefined !== null && meth.maeLooRefined < POOLED_LOO();
    const rules = refinedRules(meth);
    const before = allItems(SETTINGS.stackCal2);
    const afterRef = withRound3Rules(rules, ['CYCLOPROPANE_METHINE'], () => allItems(SETTINGS.stackCal2R3));
    const afterPooled = allItems(SETTINGS.stackCal2R3);
    const worse = (arr: Item[]) => before.map((b, i) => ({b, a: arr[i]})).filter(({b, a}) => b.error !== null && a.error !== null && !b.exchangeable && !b.validationOnly && round3Class(graphOf(b.canonical), b.atom)?.l0 === 'CYCLOPROPANE_METHINE' && Math.abs(a.error) - Math.abs(b.error) > 0.15);
    const cp = (arr: Item[]) => arr.find(isCyclopropanolCH)!;
    const c3b = worse(afterRef).length === 0;
    const c4 = ['CYCLOPROPANE_CH2', 'CYCLOBUTANE_CH2'].every(k => { const d = decisions.find(x => x.l0 === k)!; return d.choice === 'pooled' && (d.maeLooRefined === null || d.maeLooRefined >= d.pooled.maeLoo); });
    conds = {c1: true, c2, c3a, c3b, c4, adopt: c2 && c3a && c3b && c4};
    const rows = [
      'condition 3 detail: calibration items of the cyclopropane methine that get worse by > 0.15 ppm (|error after| - |error before|)',
      'item | truth | before | after pooled (deployed) | after refinement (in the engine)',
      ...before.map((b, i) => ({b, i})).filter(({b}) => b.error !== null && !b.exchangeable && !b.validationOnly && round3Class(graphOf(b.canonical), b.atom)?.l0 === 'CYCLOPROPANE_METHINE')
        .map(({b, i}) => `${b.compound} ${b.label} | ${fmt2(b.truth)} | ${fmtSigned(b.error!)} | ${fmtSigned(afterPooled[i].error!)} | ${fmtSigned(afterRef[i].error!)}`),
      `cyclopropanol ring CH: before ${fmtSigned(cp(before).error!)}, pooled ${fmtSigned(cp(afterPooled).error!)}, refinement ${fmtSigned(cp(afterRef).error!)}`,
      `items worse by > 0.15 under the refinement: ${worse(afterRef).map(w => w.b.compound).join(', ') || 'none'}`,
    ];
    notes.push('=== A conditions', `fits: ${meth.refined.map(f => `${f.key} n=${f.n} delta ${fmtSigned(f.delta)} leave-one-out ${fmt2(f.maeLoo)} (${f.status})`).join('; ')}; class-level leave-one-out ${meth.maeLooRefined === null ? 'n/a' : fmt2(meth.maeLooRefined)}; pooled leave-one-out ${fmt2(POOLED_LOO())}`,
      `cond1 grouping chemical: ${conds.c1}; cond2 each group >= 3 compounds: ${c2}; cond3a leave-one-out lower (groups and class): ${c3a}; cond3b regression gone: ${c3b}; cond4 CH2 classes stay pooled: ${c4}; ADOPT: ${conds.adopt}`, ...rows, '');
    expect(fits.map(f => f.key).sort()).toEqual(['CYCLOPROPANE_METHINE_HETERO', 'CYCLOPROPANE_METHINE_OTHER']);
  }, 600000);
  it('the deployed rule table is the refinement if and only if all conditions hold; the CH2 classes and the cyclobutane classes are pooled either way', () => {
    const rules = V12_CONFIG.v140Round3.rules;
    if (conds.adopt) {
      expect(Object.keys(rules).sort()).toEqual(['CYCLOBUTANE_CH2', 'CYCLOPROPANE_CH2', 'CYCLOPROPANE_METHINE_HETERO', 'CYCLOPROPANE_METHINE_OTHER']);
      for (const f of meth.refined) {
        const r = rules[f.key]; expect(r.level).toBe(1); expect(Math.abs(r.deltaPpm - f.delta)).toBeLessThan(0.006); expect(r.compounds).toEqual(f.perCompound.map(p => p.name));
        expect(Math.abs(r.maeLeaveOneOut - f.maeLoo)).toBeLessThan(0.006);
      }
    } else {
      expect(Object.keys(rules).sort()).toEqual(['CYCLOBUTANE_CH2', 'CYCLOPROPANE_CH2', 'CYCLOPROPANE_METHINE']);
      expect(rules.CYCLOPROPANE_METHINE.level).toBe(0);
    }
    expect(rules.CYCLOPROPANE_CH2.level).toBe(0); expect(rules.CYCLOBUTANE_CH2.level).toBe(0);
  });
  it('the cyclopropane / cyclobutane ring CH2 refinements are no better than the pooled shift (they stay pooled): class-level leave-one-out refined vs pooled', () => {
    const rows = ['class | pooled leave-one-out | refined class-level leave-one-out'];
    for (const k of ['CYCLOPROPANE_CH2', 'CYCLOBUTANE_CH2']) { const d = decisions.find(x => x.l0 === k)!; rows.push(`${k} | ${fmt2(d.pooled.maeLoo)} | ${d.maeLooRefined === null ? 'n/a' : fmt2(d.maeLooRefined)}`); }
    notes.push('=== A condition 4', ...rows, '');
    expect(conds.c4).toBe(true);
  });
});

describe.skipIf(NEED_F)('A refinement scenario, measured in the engine (information; the deployed table is what the conditions decide)', () => {
  it('old categories: per category mean error with the pooled table (deployed) and with the refinement', () => {
    const oldN = evalTier1(SETTINGS.stackCal2, 'CDCl3').length + evalTier2(SETTINGS.stackCal2, 'round1').length + evalTier2(SETTINGS.stackCal2, 'round2').length;
    const before = allItems(SETTINGS.stackCal2), pooled = allItems(SETTINGS.stackCal2R3);
    const ref = withRound3Rules(refinedRules(meth), ['CYCLOPROPANE_METHINE'], () => allItems(SETTINGS.stackCal2R3));
    const idx = before.map((_, i) => i).filter(i => i < oldN && !before[i].exchangeable && !before[i].rangeOnly && before[i].predicted !== null && before[i].solvent === 'CDCl3');
    const m = (arr: Item[], sel: number[]) => sel.reduce((s, i) => s + Math.abs(arr[i].error!), 0) / sel.length;
    const rows = ['category | n | before round3 | merged (deployed) | refinement'];
    for (const c of [...new Set(idx.map(i => before[i].category))].sort()) {
      const sel = idx.filter(i => before[i].category === c);
      if (Math.abs(m(pooled, sel) - m(ref, sel)) > 1e-9 || /cyclo/.test(c)) rows.push(`${c} | ${sel.length} | ${fmt2(m(before, sel))} | ${fmt2(m(pooled, sel))} | ${fmt2(m(ref, sel))}`);
    }
    rows.push(`ALL old signals | ${idx.length} | ${fmt2(m(before, idx))} | ${fmt2(m(pooled, idx))} | ${fmt2(m(ref, idx))}`);
    notes.push('=== old categories (only categories that differ between merged and refinement, and the cyclo categories)', ...rows, '');
    expect(idx.length).toBeGreaterThan(300);
  }, 600000);
});

// ------------------------------------------------------------------------------------------------ the 31 spectra and the 55-structure panel under the refinement (information)
type SPeakT = {x: number; integration: number; multiplicity: string};
const fx = (id: string, formula: string, smiles: string, h1: SPeakT[]): V121Fixture => ({
  id, description: 'literature 1H table (CDCl3)', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
} as V121Fixture);
const h1Score = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle).modalityScores['1H_NMR'] as number;
const setStack = (round3: boolean) => { V12_CONFIG.useV140H1 = true; Object.assign(V12_CONFIG.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true, round3}); };
describe.skipIf(NEED_F)('A refinement scenario: the 31 single-compound 1H scores and the 55-structure panel (round3 off / merged table / refinement)', () => {
  it('31 spectra: scores that differ between the merged table and the refinement', () => {
    const run = (r3: boolean) => STOP7_SPECTRA.map(([name, smi, formula, peaks]) => { setStack(r3); return {name, v: h1Score(smi, fx(name, formula, smi, peaks))}; });
    const off = run(false), merged = run(true), ref = withRound3Rules(refinedRules(meth), ['CYCLOPROPANE_METHINE'], () => run(true));
    const rows = ['compound | round3 off | merged (deployed) | refinement'];
    ref.forEach((r, i) => { if (Math.abs(r.v - merged[i].v) >= 0.05 || Math.abs(merged[i].v - off[i].v) >= 0.05) rows.push(`${r.name} | ${off[i].v.toFixed(1)} | ${merged[i].v.toFixed(1)} | ${r.v.toFixed(1)}`); });
    rows.push(`changed by merged: ${merged.filter((r, i) => Math.abs(r.v - off[i].v) >= 0.05).length} of 31; changed by refinement: ${ref.filter((r, i) => Math.abs(r.v - off[i].v) >= 0.05).length} of 31; refinement worse than round3 off by > 2 points: ${ref.filter((r, i) => r.v - off[i].v < -2).length}`);
    notes.push('=== 31 single-compound 1H scores', ...rows, '');
    expect(ref.length).toBe(31);
  }, 600000);
  it('55-structure panel: structures whose 1H score (against the structure own round3-off prediction) changes', () => {
    const rows = ['structure | SMILES | round3 off | merged (deployed) | refinement'];
    const run = () => REAL_STRUCTURE_PANEL.map(([name, smi]) => {
      setStack(false);
      const st = ChemistryEngine.parseStructureInput({smiles: smi});
      const envs = NMRGraphPredictor.predict1HFromStructureGraph(st, {solvent: 'CDCl3'}).environments.filter(e => !e.isExchangeable);
      const peaks = envs.map(e => ({x: Number(e.shiftPpm.toFixed(2)), integration: e.integration ?? 1, multiplicity: 's'}));
      const f = fx(name, st.molecularFormula, smi, peaks.length ? peaks : [{x: 1, integration: 1, multiplicity: 's'}]);
      setStack(false); const a = h1Score(smi, f); setStack(true); const b = h1Score(smi, f);
      return {name, smi, a, b};
    });
    const merged = run(), ref = withRound3Rules(refinedRules(meth), ['CYCLOPROPANE_METHINE'], run);
    ref.forEach((r, i) => { if (Math.abs(r.b - r.a) >= 0.05 || Math.abs(merged[i].b - merged[i].a) >= 0.05) rows.push(`${r.name} | ${r.smi} | ${r.a.toFixed(1)} | ${merged[i].b.toFixed(1)} | ${r.b.toFixed(1)}`); });
    notes.push('=== 55-structure panel', ...rows, '');
    expect(merged.length).toBe(55);
  }, 600000);
});
