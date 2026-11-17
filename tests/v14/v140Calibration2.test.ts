import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {s26RulesOff} from '../helpers/v142S26Off';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {calibration2Class, isInsufficientPolyhalo} from '../../src/engines/scientificEngines/h1Calibration2';
import {StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {loadStop7, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_SPECTRA} = await loadStop7();
import type {SPeak} from '../helpers/v140Truth';
import {applySetting, clearEnvCache, evalTier1, evalTier2, hasLocalOnly, initTruthTools, type Item, loadTier2, localOnlyNote, mae, predictEnvs, resolveAtoms, SETTINGS, SOLVENTS} from '../helpers/v140Truth';
import {cleanName, collectRecords, decide, fmt2, fmtSigned, rulesBlockText, type Decision} from '../helpers/v140Calibration2Study';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the class study, before / after and the 31 stop-7 spectra skip without them (one-line note).
const NEED_F = needFulmer('v140Calibration2: the class study, before / after and the 31 stop-7 spectra');
// v1.4.2 stop 35: these tests read the grade-A entries of tier 2 (user-looked-up SDBS / ChemicalBook / RSC SI values), which are local-only; without them they are skipped.
const NEED_GRADE_A = !hasLocalOnly('tier2GradeA');
if (NEED_GRADE_A) console.info(localOnlyNote('tier2GradeA', 'v140Calibration2.test.ts: 4 test(s) that read the grade-A entries'));

// v1.4.0 stop 13 (flag v140.calibration2): round-2 truth values (planner list of 2026-11-10), the class calibration on tier-2 / candidate data under the planner's rule (>= 3 independent compounds, leave-one-out, lower mean error),
// the exchangeable protons (tolerance only), 2-propanol left as it is, the benzene-increment trend, and the 31 single-compound 1H scores. The 16-sample ranking check is in v140Calibration2Rank.test.ts.
// No user spectrum is used anywhere. WRITE_NOTES=1 writes notes/v1.4.0/STOP13_RESULTS.txt.
const here = path.dirname(fileURLToPath(import.meta.url));
const NOTES = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.0');
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
beforeAll(async () => { await initTruthTools(); }, 120000);
afterAll(() => { const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); });
// v1.4.2 stop 26: this file pins a state BEFORE the stop-26 nmrshiftdb2 class shifts (no flag of their own; they sit under v140.oxygen / v140.calibration2), so they are switched off here.
// The combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots. No expected value of this file was changed.
const restoreS26 = s26RulesOff(); afterAll(() => restoreS26());

const graphOf = (canonical: string) => StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph;
const notes: string[] = [];
afterAll(() => { if (process.env.WRITE_NOTES === '1') fs.writeFileSync(path.join(NOTES, 'STOP13_RESULTS.txt'), notes.join('\n') + '\n'); });

describe('round-2 truth values (tests/fixtures/v140/h1Truth2.json, entries with round: 2)', () => {
  it.skipIf(NEED_GRADE_A)('round 1 is unchanged (105 compounds, 208 signals); round 2 adds 56 compounds with 126 signals; every SMILES parses and every SMARTS finds its atoms with the stated H count', () => {
    expect(loadTier2('round1').compounds.length).toBe(105);
    expect(loadTier2('round1').compounds.reduce((s, c) => s + c.signals.length, 0)).toBe(208);
    const r2 = loadTier2('round2');
    expect(r2.compounds.length).toBe(56);
    expect(r2.compounds.reduce((s, c) => s + c.signals.length, 0)).toBe(126);
    for (const c of r2.compounds) {
      expect(c.tier, c.compound).toBe(2);
      expect(['B', 'A', 'J'].includes(c.grade ?? ''), c.compound).toBe(true);
      expect(Boolean(c.candidate), `${c.compound}: candidate only for journal values`).toBe(c.grade === 'J');
      for (const s of c.signals) {
        const r = resolveAtoms(c.smiles, s.smarts);
        expect(r.error, `${c.compound} ${s.label}`).toBeUndefined();
        const group = c.signals.filter(x => x.smarts === s.smarts).length;
        expect(r.hCount, `${c.compound} ${s.label}: H of the matched atoms`).toBe((s.nH ?? 0) * group);
        expect(s.ppm !== undefined, `${c.compound} ${s.label}`).toBe(true);
        if (s.rangeOnly) expect(s.range && s.range[0] <= (s.ppm as number) && (s.ppm as number) <= s.range[1], `${c.compound} ${s.label}`).toBe(true);
      }
    }
  });
  it('the compounds the planner excluded are not in the file; benzaldehyde and propene use the tier-1 values only', () => {
    const names = loadTier2('all').compounds.map(c => c.compound.toLowerCase());
    for (const bad of ['1-butene', 'isobutene', 'isobutylene', '1-butyne', '2-methoxytetrahydropyran', 'benzaldehyde', 'propene', 'propylene']) expect(names.filter(n => n === bad), bad).toEqual([]);
  });
  it('the substituent increments of part H are stored as a trend check, not as compounds', () => {
    const inc = (loadTier2('all') as unknown as {benzeneIncrements: {base: number; substituents: Record<string, {ortho: number; meta: number; para: number}>}}).benzeneIncrements;
    expect(inc.base).toBe(7.36);
    expect(Object.keys(inc.substituents).sort()).toEqual(['CH3', 'N(CH3)2', 'NH2', 'OCH3', 'OH', 'SCH3', 'SH']);
  });
});

// ------------------------------------------------------------------------------------------------ the study
let recs: ReturnType<typeof collectRecords>;
let decisions: Decision[];
beforeAll(() => { if (NEED_F) return; clearEnvCache(); recs = collectRecords(); decisions = decide(recs); }, 120000);

const USER_CLASSES: [string, string[]][] = [
  ['propargylic C-H and terminal alkyne C-H', ['PROPARGYL_CH', 'ALKYNE_CH']], ['alkyl halide CH2X / beta', ['HALO_CH2X', 'HALO_BETA_CH', 'HALO_CHX_SECONDARY', 'HALO_CH3X']],
  ['epoxide and oxetane ring H', ['SMALL_RING_ETHER_H']], ['cyclopropane / cyclobutane', ['SMALL_CARBOCYCLE_CH']], ['indole / benzofuran (H2, H3)', ['FUSED_5RING_HETEROAROMATIC_H']],
  ['dialkyl sulfide / thiol / sulfone / sulfoxide', ['S_ALPHA_CH']], ['amine beta', ['AMINE_BETA_CH']], ['acetal C-H', ['ACETAL_CH']], ['cyclohexyl ester O-CH', ['CYCLIC_ESTER_OCH']],
  ['monosubstituted alkene (vinyl)', ['VINYL_MONO']], ['aldehyde CHO', ['ALDEHYDE_CHO']], ['lactam', ['LACTAM_CH']], ['polyhalomethane', ['POLYHALO_CH']],
];

describe.skipIf(NEED_F)('the class study under the planner rule', () => {
  it('every class of the planner list has a definition and data (or is reported as having none)', () => {
    const got = new Set(decisions.map(d => d.l0));
    for (const [, ids] of USER_CLASSES) for (const id of ids) expect(got.has(id), id).toBe(true);
  });
  it.skipIf(NEED_GRADE_A)('decisions (pinned): which classes are calibrated, pooled or refined, which stay as they are', () => {
    const pick = (d: Decision) => `${d.l0}: ${d.choice}${d.choice === 'refined' ? ' [' + d.deployed.map(f => f.key).join(', ') + ']' : ''}`;
    expect(decisions.map(pick)).toEqual([
      'ACETAL_CH: none', 'ALDEHYDE_CHO: none', 'ALKYNE_CH: refined [ALKYNE_CH_ALKYL, ALKYNE_CH_HETERO]', 'AMINE_BETA_CH: pooled', 'CYCLIC_ESTER_OCH: none', 'FUSED_5RING_HETEROAROMATIC_H: none',
      'HALO_BETA_CH: refined [HALO_BETA_CH_Br, HALO_BETA_CH_Cl, HALO_BETA_CH_F, HALO_BETA_CH_I]', 'HALO_CH2X: none', 'HALO_CH3X: none', 'HALO_CHX_SECONDARY: pooled', 'LACTAM_CH: none',
      'POLYHALO_CH: none', 'PROPARGYL_CH: refined [PROPARGYL_CH_ALKYL, PROPARGYL_CH_HALOGEN]', 'SMALL_CARBOCYCLE_CH: none', 'SMALL_RING_ETHER_H: refined [SMALL_RING_ETHER_H_3]', 'S_ALPHA_CH: pooled', 'VINYL_MONO: none',
    ]);
  });
  it('no class is calibrated on fewer than 3 independent compounds, none with a mean error already within 0.15 ppm, and every deployed shift lowers the leave-one-out mean error of its class', () => {
    for (const d of decisions) for (const f of d.deployed) {
      expect(f.n, f.key).toBeGreaterThanOrEqual(V12_CONFIG.v140Calibration2.minCompounds);
      expect(f.maeBefore, f.key).toBeGreaterThan(V12_CONFIG.v140Calibration2.withinTolerancePpm);
      expect(f.maeLoo, f.key).toBeLessThan(f.maeBefore);
    }
    for (const d of decisions) if (d.choice === 'refined') expect(d.maeLooRefined!, d.l0).toBeLessThan(d.maeBefore);
  });
  it.skipIf(NEED_GRADE_A)('the deployed rules in V12_CONFIG.v140Calibration2.rules are exactly the fit (shift +-0.006, compounds, mean errors +-0.006)', () => {
    const deployed = decisions.flatMap(d => d.deployed);
    const rules = V12_CONFIG.v140Calibration2.rules;
    expect(Object.keys(rules).sort()).toEqual(deployed.map(f => f.key).sort());
    for (const f of deployed) {
      const r = rules[f.key];
      expect(r.level, f.key).toBe(f.level);
      expect(Math.abs(r.deltaPpm - f.delta), f.key).toBeLessThan(0.006);
      expect(r.compounds, f.key).toEqual(f.perCompound.map(p => p.name));
      expect(Math.abs(r.maeBefore - f.maeBefore), f.key).toBeLessThan(0.006);
      expect(Math.abs(r.maeLeaveOneOut - f.maeLoo), f.key).toBeLessThan(0.006);
    }
    if (process.env.WRITE_CAL2_BLOCK) fs.writeFileSync(process.env.WRITE_CAL2_BLOCK, rulesBlockText(decisions, recs));
  });
  it('class membership does not read any shift: the class of the same atom is the same whatever the prediction', () => {
    const g = graphOf(resolveAtoms('CCCl', '[CH3]').canonical);
    const cls = calibration2Class(g, resolveAtoms('CCCl', '[CH3]').atoms[0]);
    expect(cls).toEqual({l0: 'HALO_BETA_CH', l1: 'HALO_BETA_CH_Cl'});
  });
});

// ------------------------------------------------------------------------------------------------ before / after with the engine
let before: Item[], after: Item[], before2: Item[], after2: Item[];
const allItems = (setting: typeof SETTINGS.stack) => [...evalTier1(setting, 'CDCl3'), ...evalTier2(setting, 'round1'), ...evalTier2(setting, 'round2')];
beforeAll(() => { if (NEED_F) return; clearEnvCache(); before = allItems(SETTINGS.stack); after = allItems(SETTINGS.stackCal2); }, 120000);

describe.skipIf(NEED_F)('before / after (the engine: stack of the earlier v1.4.0 flags, without / with calibration2)', () => {
  it('the same items in the same order; the flag off equals the stack (nothing is added when v140.calibration2 is false)', () => {
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) { expect(after[i].compound).toBe(before[i].compound); expect(after[i].label).toBe(before[i].label); }
    applySetting(SETTINGS.stack); clearEnvCache();
    const again = allItems(SETTINGS.stack);
    expect(again.map(i => i.predicted)).toEqual(before.map(i => i.predicted));
  });
  it('only the items of a deployed class move, and by exactly the class shift; exchangeable centres never move', () => {
    const deployed = V12_CONFIG.v140Calibration2.rules;
    let moved = 0;
    before.forEach((b, i) => {
      const a = after[i];
      if (b.predicted === null || a.predicted === null) return;
      const d = a.predicted - b.predicted;
      if (b.exchangeable) { expect(Math.abs(d), `${b.compound} ${b.label} (exchangeable)`).toBeLessThan(1e-9); return; }
      const cls = b.atom >= 0 ? calibration2Class(graphOf(b.canonical), b.atom) : null;
      const rule = cls ? (deployed[cls.l0] ?? (cls.l1 ? deployed[cls.l1] : undefined)) : undefined;
      if (!rule) expect(Math.abs(d), `${b.compound} ${b.label} has no deployed class`).toBeLessThan(1e-9);
      else { moved++; expect(Math.abs(d - rule.deltaPpm), `${b.compound} ${b.label}`).toBeLessThan(0.002); }
    });
    expect(moved).toBeGreaterThan(50);
  });
  it('BEFORE table of the round-2 data alone (current predictor, no rule changed): by class of this stop and by older category', () => {
    const r2 = before.filter(b => b.round === 2 && !b.exchangeable && !b.rangeOnly && b.predicted !== null && b.solvent === 'CDCl3');
    const rows: string[] = ['round-2 data, CDCl3 / unspecified, point values, exchangeable excluded: ' + r2.length + ' signals of ' + new Set(r2.map(i => i.canonical)).size + ' compounds, mean |error| ' + fmt2(mae(r2)), 'class of this stop | compounds (round 2) | signals | mean |error| | mean signed error (predicted - truth)'];
    const cls = (i: Item) => (i.atom >= 0 ? calibration2Class(graphOf(i.canonical), i.atom) : null);
    for (const id of [...new Set(r2.map(i => cls(i)?.l0).filter((x): x is string => Boolean(x)))].sort()) {
      const m = r2.filter(i => cls(i)?.l0 === id);
      rows.push(id + ' | ' + new Set(m.map(i => i.canonical)).size + ' | ' + m.length + ' | ' + fmt2(mae(m)) + ' | ' + fmtSigned(m.reduce((s, i) => s + i.error!, 0) / m.length));
    }
    const rest = r2.filter(i => !cls(i));
    rows.push('(no class of this stop) | ' + new Set(rest.map(i => i.canonical)).size + ' | ' + rest.length + ' | ' + fmt2(mae(rest)) + ' | ' + fmtSigned(rest.reduce((s, i) => s + i.error!, 0) / rest.length));
    rows.push('older category | signals | mean |error|');
    for (const c of [...new Set(r2.map(i => i.category))].sort()) { const m = r2.filter(i => i.category === c); rows.push(c + ' | ' + m.length + ' | ' + fmt2(mae(m))); }
    notes.push('=== BEFORE (round-2 data alone)', ...rows, '');
    expect(r2.length).toBeGreaterThan(80);
  });
  it.skipIf(NEED_GRADE_A)('per class: errors before and after (compound-weighted mean absolute error; in-sample after, leave-one-out in the decision table)', () => {
    const rows: string[] = ['user class | class id | compounds | before | after (engine, all compounds of the class) | leave-one-out (deployed) | decision'];
    for (const [name, ids] of USER_CLASSES) for (const id of ids) {
      const d = decisions.find(x => x.l0 === id)!;
      const byC = new Map<string, number[]>(), byCBefore = new Map<string, number[]>(), dropped = new Set<string>();
      before.forEach((bf, i) => {
        // stop 14: a polyhalomethane carbon with F or I has no predicted number with the flag (資料不足): it leaves the 'after' mean; it is the ONLY way a prediction may disappear
        if (!bf.exchangeable && !bf.rangeOnly && bf.predicted !== null && after[i].predicted === null && bf.solvent === 'CDCl3' && bf.atom >= 0 && calibration2Class(graphOf(bf.canonical), bf.atom)?.l0 === id) dropped.add(bf.canonical);
        if (bf.exchangeable || bf.rangeOnly || bf.predicted === null || after[i].predicted === null || bf.solvent !== 'CDCl3' || bf.atom < 0) return;
        if (calibration2Class(graphOf(bf.canonical), bf.atom)?.l0 !== id) return;
        byC.set(bf.canonical, [...(byC.get(bf.canonical) ?? []), Math.abs(after[i].error!)]);
        byCBefore.set(bf.canonical, [...(byCBefore.get(bf.canonical) ?? []), Math.abs(bf.error!)]);
      });
      const meanOf = (m: Map<string, number[]>) => { const v = [...m.values()].map(x => x.reduce((a, b) => a + b, 0) / x.length); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
      for (const c of dropped) expect(id === 'POLYHALO_CH' && [...before.keys()].some(i => before[i].canonical === c && isInsufficientPolyhalo(graphOf(c), before[i].atom)), `${c}: a prediction disappears only for an F / I polyhalomethane carbon`).toBe(true);
      const afterMae = [...byC.values()].map(v => v.reduce((s, x) => s + x, 0) / v.length);
      const aft = afterMae.length ? afterMae.reduce((s, x) => s + x, 0) / afterMae.length : NaN;
      const loo = d.choice === 'pooled' ? d.maeLooPooled : d.choice === 'refined' ? d.maeLooRefined : null;
      rows.push(`${name} | ${id} | ${d.n} | ${fmt2(d.maeBefore)} | ${fmt2(aft)} | ${loo === null ? '—' : fmt2(loo)} | ${d.choice === 'none' ? d.reason : d.reason}`);
      // an uncorrected class is unchanged on the compounds that keep a prediction (all of them, except the F / I polyhalomethanes of stop 14: 1.02 -> 0.07 over the Cl / Br compounds that remain)
      if (d.choice === 'none') expect(aft, id).toBeCloseTo(dropped.size ? meanOf(byCBefore) : d.maeBefore, 6);
      else expect(aft, id).toBeLessThan(d.maeBefore);
    }
    notes.push('=== per class: before / after', ...rows, '');
  });
  it('error by older environment category (tier 1 CDCl3 + tier 2 round 1 + round 2, non-exchangeable): no category gets worse by more than 0.02 ppm unless listed', () => {
    const cats = [...new Set(before.map(i => i.category))].sort();
    const rows: string[] = ['category | n signals | before | after | change'];
    const worse: string[] = [];
    for (const c of cats) {
      const idx = before.map((b, i) => i).filter(i => before[i].category === c && !before[i].exchangeable && !before[i].rangeOnly && before[i].predicted !== null && before[i].solvent === 'CDCl3');
      if (!idx.length) continue;
      const m = (arr: Item[]) => idx.reduce((s, i) => s + Math.abs(arr[i].error!), 0) / idx.length;
      const b = m(before), a = m(after);
      rows.push(`${c} | ${idx.length} | ${fmt2(b)} | ${fmt2(a)} | ${fmtSigned(a - b)}`);
      if (a - b > 0.02) worse.push(`${c} ${fmt2(b)} -> ${fmt2(a)}`);
    }
    notes.push('=== per category', ...rows, 'categories worse by > 0.02: ' + (worse.length ? worse.join('; ') : 'none'), '');
    expect(worse).toEqual([]);
  });
  it('items that got worse by more than 0.15 ppm (class shift larger than the item error): listed for the report', () => {
    const rows: string[] = [];
    before.forEach((b, i) => { const a = after[i]; if (b.error === null || a.error === null || b.exchangeable) return; if (Math.abs(a.error) - Math.abs(b.error) > 0.15) rows.push(`${b.compound} | ${b.label} | ${b.category} | truth ${fmt2(b.truth)} | before ${fmtSigned(b.error)} | after ${fmtSigned(a.error)} | tier ${b.tier}${b.round === 2 ? ' round 2' : ''}${b.candidate ? ' candidate' : ''}`); });
    notes.push('=== items worse by > 0.15 ppm', ...rows, '');
    expect(Array.isArray(rows)).toBe(true);
  });
  it('tier 1 in the other six solvents (non-exchangeable): the mean error per solvent before and after', () => {
    const rows: string[] = ['solvent | n | before | after'];
    for (const sv of SOLVENTS) {
      const b = evalTier1(SETTINGS.stack, sv).filter(i => !i.exchangeable && i.error !== null), a = evalTier1(SETTINGS.stackCal2, sv).filter(i => !i.exchangeable && i.error !== null);
      rows.push(`${sv} | ${b.length} | ${fmt2(mae(b))} | ${fmt2(mae(a))}`);
      expect(mae(a), sv).toBeLessThanOrEqual(mae(b) + 1e-9);
    }
    notes.push('=== tier 1 by solvent', ...rows, '');
  });
});

describe.skipIf(NEED_F)('round 2 compounds with another stated solvent and the interval-only signals (validation only, never calibration)', () => {
  it('DMSO-d6 / acetone-d6 journal values and interval signals: errors with / without the flag (the flag moves none of them except through a class shift)', () => {
    const rows: string[] = ['compound | signal | solvent | truth | before | after'];
    before.forEach((b, i) => { const a = after[i]; if (b.round !== 2 || !(b.solvent !== 'CDCl3' || b.rangeOnly)) return; rows.push(`${b.compound} | ${b.label} | ${b.solvent} | ${b.rangeOnly ? 'interval' : fmt2(b.truth)} | ${b.error === null ? '—' : fmtSigned(b.error)} | ${a.error === null ? '—' : fmtSigned(a.error)}`); });
    notes.push('=== validation-only round-2 signals (other solvents, intervals)', ...rows, '');
    expect(rows.length).toBeGreaterThan(10);
  });
  it('exchangeable protons: the centre is not touched, the tolerance is at least 0.5 ppm with the flag on; errors against +-0.5 listed', () => {
    const rows: string[] = ['compound | signal | solvent | truth | predicted | error | within 0.5'];
    let n = 0;
    before.forEach((b, i) => {
      if (!b.exchangeable || b.round !== 2) return;
      const a = after[i];
      expect(a.predicted).toBe(b.predicted);
      n++;
      rows.push(`${b.compound} | ${b.label} | ${b.solvent} | ${fmt2(b.truth)} | ${fmt2(b.predicted ?? NaN)} | ${b.error === null ? '—' : fmtSigned(b.error)} | ${b.error !== null && Math.abs(b.error) <= 0.5 ? 'yes' : 'NO'}`);
    });
    notes.push('=== exchangeable protons of round 2 (tolerance only)', ...rows, '');
    expect(n).toBeGreaterThan(10);
    applySetting(SETTINGS.stackCal2); clearEnvCache();
    const envs = predictEnvs(resolveAtoms('Oc1ccccc1', '[OH]c').canonical, 'CDCl3', SETTINGS.stackCal2).filter(e => (e as unknown as {isExchangeable?: boolean}).isExchangeable);
    expect(envs.length).toBe(1);
    expect((envs[0] as unknown as {uncertaintyPpm: number}).uncertaintyPpm).toBeGreaterThanOrEqual(0.5);
  });
});

describe('2-propanol is left as it is', () => {
  it('the secondary-alcohol rule predicts 3.57 for 2-propanol (observed 4.04), 3.55 for cyclohexanol (grade A, observed value local-only) and 3-methyl-2-butanol (3.54); the flag changes none of the three; 2-propanol stays the outlier', () => {
    const pred = (smi: string, setting: typeof SETTINGS.stack) => { const r = resolveAtoms(smi, '[CH](O)(C)C'); return predictEnvs(r.canonical, 'CDCl3', setting).find(e => e.atomIndices?.includes(r.atoms[0]))!.shiftPpm; };
    const rows: string[] = ['compound | observed | predicted (stack) | predicted (with calibration2)'];
    // v1.4.2 stop 36: the cyclohexanol value is grade A (SDBS / ChemicalBook), not quoted here; the observed column is only printed
    for (const [name, smi, obs] of [['2-propanol', 'CC(C)O', 4.04], ['cyclohexanol', 'OC1CCCCC1', 'grade A (local-only)'], ['3-methyl-2-butanol', 'CC(C)C(C)O', 3.54]] as [string, string, number | string][]) {
      const b = pred(smi, SETTINGS.stack), a = pred(smi, SETTINGS.stackCal2);
      expect(a).toBe(b);
      rows.push(`${name} | ${obs} | ${b.toFixed(2)} | ${a.toFixed(2)}`);
    }
    expect(pred('CC(C)O', SETTINGS.stack)).toBeCloseTo(3.57, 2);
    expect(pred('OC1CCCCC1', SETTINGS.stack)).toBeCloseTo(3.55, 2);
    expect(pred('CC(C)C(C)O', SETTINGS.stack)).toBeCloseTo(3.55, 2);
    notes.push('=== secondary alcohol O-CH', ...rows, 'no single-point calibration: the rule agrees with two of three independent compounds (3-methyl-2-butanol 3.54, cyclohexanol); 2-propanol (4.04) is the outlier', '');
  });
});

describe('benzene substituent increments (Reich, part H): trend check of the predicted aromatic region, not a per-peak truth', () => {
  it('predicted ortho / meta / para shifts of seven monosubstituted benzenes against 7.36 + Z, flag off and on (the flag does not touch aromatic C-H)', () => {
    const inc = (loadTier2('all') as unknown as {benzeneIncrements: {base: number; substituents: Record<string, {smiles: string; ortho: number; meta: number; para: number}>}}).benzeneIncrements;
    const rows: string[] = ['substituent | position | 7.36 + Z | predicted | difference'];
    let worst = 0;
    for (const [sub, e] of Object.entries(inc.substituents)) {
      const smi = resolveAtoms(e.smiles, '[*]').canonical;
      const probe: [string, string, number][] = [['ortho', '[cH]:c-[!#6;!#1,$(C)]', e.ortho], ['meta', '[cH]:[cH]:c-[!#6;!#1,$(C)]', e.meta], ['para', '[cH]:[cH]:[cH]:c-[!#6;!#1,$(C)]', e.para]];
      for (const [pos, smarts, z] of probe) {
        const r = resolveAtoms(e.smiles, smarts);
        if (!r.atoms.length) continue;
        const envs = predictEnvs(smi, 'CDCl3', SETTINGS.stack).filter(x => x.atomIndices?.some(a => r.atoms.includes(a)));
        const envsOn = predictEnvs(smi, 'CDCl3', SETTINGS.stackCal2).filter(x => x.atomIndices?.some(a => r.atoms.includes(a)));
        expect(envsOn.map(x => x.shiftPpm)).toEqual(envs.map(x => x.shiftPpm));
        const p = envs.reduce((s, x) => s + x.shiftPpm, 0) / envs.length;
        rows.push(`${sub} | ${pos} | ${(inc.base + z).toFixed(2)} | ${p.toFixed(2)} | ${fmtSigned(p - (inc.base + z))}`);
        worst = Math.max(worst, Math.abs(p - (inc.base + z)));
      }
    }
    notes.push('=== benzene increments trend', ...rows, `largest |difference| ${worst.toFixed(2)}`, '');
    expect(rows.length).toBeGreaterThan(15);
  });
});

// ------------------------------------------------------------------------------------------------ the 31 single-compound 1H scores
const P = (x: number, integration: number, multiplicity: string): SPeak => ({x, integration, multiplicity});
const fx = (id: string, formula: string, smiles: string, h1: SPeak[]): V121Fixture => ({
  id, description: 'literature 1H table (CDCl3)', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
});
const h1Score = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle).modalityScores['1H_NMR'] as number;
const setAll = (cal2: boolean) => { V12_CONFIG.useV140H1 = true; Object.assign(V12_CONFIG.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: cal2}); };

describe.skipIf(NEED_F)('the 31 single-compound 1H scores of the stop-7 audit (all earlier v1.4.0 flags on), without / with calibration2', () => {
  it('no spectrum scores more than 2 points lower with the flag; the changes are listed', () => {
    const run = (cal2: boolean) => STOP7_SPECTRA.map(([name, smi, formula, peaks]) => { setAll(cal2); return {name, v: h1Score(smi, fx(name, formula, smi, peaks))}; });
    const off = run(false), on = run(true);
    expect(on.length).toBe(31);
    const rows: string[] = ['compound | 1H score without | with | change'];
    const worse: string[] = [];
    on.forEach((r, i) => { const d = r.v - off[i].v; if (Math.abs(d) >= 0.05) rows.push(`${r.name} | ${off[i].v.toFixed(1)} | ${r.v.toFixed(1)} | ${fmtSigned(d)}`); if (d < -2) worse.push(`${r.name} ${off[i].v.toFixed(1)} -> ${r.v.toFixed(1)}`); });
    notes.push('=== 31 single-compound 1H scores (changed ones only)', ...rows, `unchanged: ${on.filter((r, i) => Math.abs(r.v - off[i].v) < 0.05).length} of 31; worse by > 2 points: ${worse.length ? worse.join('; ') : 'none'}`, '');
    expect(worse).toEqual([]);
  }, 600000);
});
void cleanName;
