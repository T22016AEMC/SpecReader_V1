import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {s26RulesOff} from '../helpers/v142S26Off';
import {v140Round3Active} from '../../src/engines/composition/planningGate';
import {ChemistryEngine, StructureParserAdapter, type ParsedSmilesGraph} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {isAromaticThiolHydrogen, round3Class} from '../../src/engines/scientificEngines/h1Round3';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {loadStop7, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_SPECTRA} = await loadStop7();
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {allItems, collectRound3Records, decideRound3, fmt2, fmtSigned, type Round3Decision} from '../helpers/v140Round3Study';
import {knowledgeBase, UNCERTAINTY_PPM, APPROX_SUBSTITUENT_UNCERTAINTY_PPM} from '../../src/engines/scientificEngines/h1AdditiveRules';
import {applySetting, clearEnvCache, evalTier1, evalTier2, initTruthTools, loadTier3, predictEnvs, resolveAtoms, SETTINGS, type Item} from '../helpers/v140Truth';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the class study, before / after and the 31 stop-7 spectra skip without them (one-line note).
const NEED_F = needFulmer('v140Round3: the class study, before / after and the 31 stop-7 spectra');
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.4.1 stop 22 (flag v140.round3, needs useV140H1; DEFAULT OFF): first part of the third 1H round.
//  2.1  =CH2 pairs of vinyl groups whose substituent the alkene rule did not read: sulfone, phosphonate ester, CH(OH)R (split into two 1H); vinyl-SiMe3 has no stand-in row and stays one 2H environment (recorded);
//       CHCl2 and 2-furyl were ALREADY split by the stop-14 stand-in rows (the stop-15 known-limits list was out of date on those two) and must not change.
// Written before the rule: these tests failed against the stop-21 tree. No spectrum of the user's is used.
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
beforeAll(async () => { await initTruthTools(); }, 120000);
afterAll(() => { const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); clearEnvCache(); });
// v1.4.2 stop 26: this file pins a state BEFORE the stop-26 nmrshiftdb2 class shifts (no flag of their own; they sit under v140.oxygen / v140.calibration2), so they are switched off here.
// The combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots. No expected value of this file was changed.
const restoreS26 = s26RulesOff(); afterAll(() => restoreS26());

type Env = {atomIndices?: number[]; shiftPpm: number; integration: number; uncertaintyPpm?: number; isExchangeable?: boolean; appliedCorrections?: {termName: string; applicableCondition?: string}[]};
const envsOf = (smiles: string, round3: boolean): Env[] => {
  const can = resolveAtoms(smiles, '[*]').canonical;
  clearEnvCache();
  applySetting({...SETTINGS.stackCal2, name: `r3-${round3}`, round3} as never);
  return predictEnvs(can, 'CDCl3', {...SETTINGS.stackCal2, name: `r3-${round3}-${smiles}`, round3} as never) as unknown as Env[];
};
/** the environments of the =CH2 carbon (the terminal carbon of C=C...) */
const ch2Envs = (smiles: string, round3: boolean) => {
  const can = resolveAtoms(smiles, '[CH2]=[CH]').canonical;
  const atom = resolveAtoms(smiles, '[CH2]=[CH]').atoms[0];
  return envsOf(smiles, round3).filter(e => e.atomIndices?.[0] === atom || (e.atomIndices?.length === 1 && e.atomIndices[0] === atom)).filter(e => !e.isExchangeable && can.length > 0);
};
const alkenes = () => knowledgeBase().get('ALKENES')!;
const row = (name: string) => { const v = alkenes().rows.get(name); expect(v, name).toBeDefined(); return v!; };

describe('the flag', () => {
  it('is off by default and needs useV140H1', () => {
    expect(was.v.round3).toBe(false);
    const c = V12_CONFIG as unknown as {useV140H1: boolean; v140: {round3: boolean}};
    c.useV140H1 = false; c.v140.round3 = true; expect(v140Round3Active()).toBe(false);
    c.useV140H1 = true; c.v140.round3 = false; expect(v140Round3Active()).toBe(false);
    c.useV140H1 = true; c.v140.round3 = true; expect(v140Round3Active()).toBe(true);
  });
});

describe('2.1 =CH2 pairs of vinyl groups the alkene rule did not read', () => {
  it('BEFORE (round3 off): sulfone, phosphonate (Et, Me), CH(OH)CH3 and vinyl-TMS come out as ONE 2H =CH2 environment; CHCl2 and 2-furyl are already two 1H', () => {
    for (const smi of ['C=CS(C)(=O)=O', 'C=CS(=O)(=O)c1ccccc1', 'C=CP(=O)(OCC)OCC', 'C=CP(=O)(OC)OC', 'C=CC(C)O', 'C=C[Si](C)(C)C']) {
      const e = ch2Envs(smi, false);
      expect(e.length, smi).toBe(1); expect(e[0].integration, smi).toBe(2);
    }
    for (const smi of ['C=CC(Cl)Cl', 'C=Cc1ccco1']) { const e = ch2Envs(smi, false); expect(e.length, smi).toBe(2); expect(e.map(x => x.integration), smi).toEqual([1, 1]); }
  });
  it('sulfone: the tabulated -SO2- row, two 1H at 5.25 + cis and 5.25 + trans, no stand-in surcharge', () => {
    const r = row('-SO2-');
    for (const smi of ['C=CS(C)(=O)=O', 'C=CS(=O)(=O)c1ccccc1']) {
      const e = ch2Envs(smi, true);
      expect(e.length, smi).toBe(2); expect(e.map(x => x.integration), smi).toEqual([1, 1]);
      expect(e.map(x => x.shiftPpm).sort((a, b) => a - b), smi).toEqual([5.25 + r[2], 5.25 + r[1]].sort((a, b) => a - b).map(x => Number(x.toFixed(3))));
      for (const x of e) expect(x.uncertaintyPpm, smi).toBeCloseTo(UNCERTAINTY_PPM, 6);
    }
  });
  it('phosphonate: diethyl uses the tabulated -PO(OCH2CH3)2 row as it is; dimethyl borrows the same row with the +0.2 stand-in surcharge', () => {
    const r = row('-PO(OCH2CH3)2');
    const et = ch2Envs('C=CP(=O)(OCC)OCC', true), me = ch2Envs('C=CP(=O)(OC)OC', true);
    for (const e of [et, me]) { expect(e.length).toBe(2); expect(e.map(x => x.integration)).toEqual([1, 1]); expect(e.map(x => x.shiftPpm).sort((a, b) => a - b)).toEqual([5.25 + r[2], 5.25 + r[1]].sort((a, b) => a - b).map(x => Number(x.toFixed(3)))); }
    for (const x of et) expect(x.uncertaintyPpm).toBeCloseTo(UNCERTAINTY_PPM, 6);
    for (const x of me) expect(x.uncertaintyPpm).toBeCloseTo(UNCERTAINTY_PPM + APPROX_SUBSTITUENT_UNCERTAINTY_PPM, 6);
  });
  it('CH(OH)CH3 borrows the -CH2O row (an sp3 carbon with one oxygen), +0.2 surcharge; the term names the stand-in', () => {
    const r = row('-CH2O');
    const e = ch2Envs('C=CC(C)O', true);
    expect(e.length).toBe(2); expect(e.map(x => x.integration)).toEqual([1, 1]);
    expect(e.map(x => x.shiftPpm).sort((a, b) => a - b)).toEqual([5.25 + r[2], 5.25 + r[1]].sort((a, b) => a - b).map(x => Number(x.toFixed(3))));
    for (const x of e) { expect(x.uncertaintyPpm).toBeCloseTo(UNCERTAINTY_PPM + APPROX_SUBSTITUENT_UNCERTAINTY_PPM, 6); expect(JSON.stringify(x.appliedCorrections)).toContain('closest tabulated row'); }
  });
  it('the CH(O)R rule is narrow: CH(OCH3)CH3 (an ether on the same carbon) is read the same way; CH(OH)Ph, C(OH)(CH3)2 and CH2OH (read before) are not changed by round3', () => {
    const e = ch2Envs('C=CC(C)OC', true);
    expect(e.length).toBe(2); expect(e.map(x => x.integration)).toEqual([1, 1]);
    for (const x of e) expect(x.uncertaintyPpm).toBeCloseTo(UNCERTAINTY_PPM + APPROX_SUBSTITUENT_UNCERTAINTY_PPM, 6);
    for (const smi of ['C=CC(O)c1ccccc1', 'C=CC(C)(C)O', 'C=CCO']) expect(envsOf(smi, true), smi).toEqual(envsOf(smi, false));
  });
  it('vinyl-SiMe3 has no stand-in row (no tabulated group is electronically close to silicon): it stays ONE 2H environment with round3 on, identical to round3 off', () => {
    const on = ch2Envs('C=C[Si](C)(C)C', true), off = ch2Envs('C=C[Si](C)(C)C', false);
    expect(on).toEqual(off); expect(on.length).toBe(1); expect(on[0].integration).toBe(2);
  });
  it('CHCl2 and 2-furyl: already split by the stop-14 stand-in rows; round3 changes nothing for them', () => {
    for (const smi of ['C=CC(Cl)Cl', 'C=Cc1ccco1', 'C=Cc1ccncc1']) expect(envsOf(smi, true), smi).toEqual(envsOf(smi, false));
  });
  it('round3 changes nothing for a molecule with none of these groups', () => {
    for (const smi of ['C=CC', 'CC(C)=C(C)C', 'CC(=O)OC(C)C', 'CCO', 'c1ccccc1', 'C=CC(C)=O', 'C=CC#N']) expect(envsOf(smi, true), smi).toEqual(envsOf(smi, false));
  });
  it('a sulfone elsewhere (not on an alkene) is not touched', () => {
    expect(envsOf('CS(C)(=O)=O', true)).toEqual(envsOf('CS(C)(=O)=O', false));
  });
  it('with useV140H1 off, round3 has no effect at all', () => {
    const can = resolveAtoms('C=CS(C)(=O)=O', '[*]').canonical;
    const off = {name: 'h1off-r3on', useV140H1: false, round3: true} as never, base = {name: 'h1off-r3off', useV140H1: false, round3: false} as never;
    clearEnvCache();
    expect(predictEnvs(can, 'CDCl3', off)).toEqual(predictEnvs(can, 'CDCl3', base));
  });
});

// ================================================================================================ 2.2 and 2.3

const here = path.dirname(fileURLToPath(import.meta.url));
const NOTES = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.1');
const notes: string[] = [];
afterAll(() => { if (process.env.WRITE_NOTES === '1') fs.writeFileSync(path.join(NOTES, 'STOP22_RESULTS.txt'), notes.join('\n') + '\n'); });
const graphOf = (canonical: string) => StructureParserAdapter.parseSmilesGraph(canonical).graph as ParsedSmilesGraph;

describe('round-3 truth values (tests/fixtures/v140/h1Truth3.json, planner list 2026-11-13)', () => {
  it('24 compounds, 45 signals; every SMILES parses and every SMARTS finds its atoms with the stated H count; the three secondary cyclopropanes are validation only', () => {
    const t = loadTier3();
    expect(t.compounds.length).toBe(24);
    expect(t.compounds.reduce((s, c) => s + c.signals.length, 0)).toBe(45);
    for (const c of t.compounds) {
      expect(c.tier, c.compound).toBe(2); expect(c.round, c.compound).toBe(3);
      for (const s of c.signals) {
        const r = resolveAtoms(c.smiles, s.smarts);
        expect(r.error, `${c.compound} ${s.label}`).toBeUndefined();
        expect(r.hCount, `${c.compound} ${s.label}: H of the matched atoms`).toBe((s.nH ?? 0) * c.signals.filter(x => x.smarts === s.smarts).length);
        expect(typeof s.ppm).toBe('number');
      }
    }
    expect(t.compounds.filter(c => c.validationOnly).map(c => c.compound).sort()).toEqual(['(bromomethyl)cyclopropane', '(chloromethyl)cyclopropane', 'cyclopropylmethanol']);
    expect(t.compounds.map(c => c.compound.toLowerCase()).some(n => n.includes('cubane'))).toBe(false);   // a cage, not a cyclobutane
    expect(t.compounds.some(c => /\[(Sn|Hg|Li|Mg)|Mg\]/.test(c.smiles))).toBe(false);   // organometallics are not used
  });
});

describe('2.2 aromatic S-H: its own class, centre 3.35, tolerance 0.5, not calibrated', () => {
  const shOf = (smiles: string, round3: boolean) => { const r = resolveAtoms(smiles, '[SX2;H1]'); return envsOf(smiles, round3).filter(e => e.atomIndices?.some(a => r.atoms.includes(a)) && e.isExchangeable); };
  it('BEFORE: thiophenol S-H 1.55 (the same value as an alkyl thiol)', () => {
    const e = shOf('Sc1ccccc1', false); expect(e.length).toBe(1); expect(e[0].shiftPpm).toBeCloseTo(1.55, 2);
    expect(shOf('CCS', false)[0].shiftPpm).toBeCloseTo(1.55, 2);
  });
  it('AFTER: aromatic S-H 3.35 +- 0.5; alkyl S-H, thiophene (aromatic S, no S-H), phenol O-H and thioanisole unchanged; a substituted thiophenol is the same class', () => {
    const e = shOf('Sc1ccccc1', true)[0];
    expect(e.shiftPpm).toBe(V12_CONFIG.v140Round3.arylSH.centrePpm); expect(e.shiftPpm).toBe(3.35); expect(e.uncertaintyPpm).toBe(0.5);
    expect(JSON.stringify(e.appliedCorrections)).toContain('not calibrated');
    for (const smi of ['CCS', 'CCCS', 'CC(C)(C)S', 'c1ccsc1', 'Oc1ccccc1', 'CSc1ccccc1']) expect(envsOf(smi, true), smi).toEqual(envsOf(smi, false));
    expect(shOf('Cc1ccc(S)cc1', true)[0].shiftPpm).toBe(3.35);
    expect(isAromaticThiolHydrogen(graphOf(resolveAtoms('Sc1ccccc1', '[*]').canonical), 0)).toBe(true);
    expect(isAromaticThiolHydrogen(graphOf(resolveAtoms('CCS', '[*]').canonical), 2)).toBe(false);
  });
  it('validation on the one compound (not independent of the centre): benzenethiol 3.29 (Reich) and 3.40 (CDCl3, 89.56 MHz) against 1.55 before and 3.35 after', () => {
    const rows = ['benzenethiol S-H: truth | predicted before | after | error before | error after'];
    for (const truth of [3.29, 3.40]) {
      const b = shOf('Sc1ccccc1', false)[0].shiftPpm, a = shOf('Sc1ccccc1', true)[0].shiftPpm;
      rows.push(`${truth.toFixed(2)} | ${b.toFixed(2)} | ${a.toFixed(2)} | ${fmtSigned(b - truth)} | ${fmtSigned(a - truth)}`);
      expect(Math.abs(b - truth)).toBeGreaterThan(1.7); expect(Math.abs(a - truth)).toBeLessThan(0.1);
    }
    notes.push('=== 2.2 aromatic S-H', ...rows, 'center 3.35 = middle of the textbook range 3.3-3.4 (planner); tolerance 0.5; NOT calibrated; a single compound, validation only', '');
  });
});

// ------------------------------------------------------------------------------------------------ 2.3 the class study
let recs: ReturnType<typeof collectRound3Records>;
let decisions: Round3Decision[];
let before: Item[], after: Item[];
beforeAll(() => { if (NEED_F) return; clearEnvCache(); recs = collectRound3Records(); decisions = decideRound3(recs); before = allItems(SETTINGS.stackCal2); after = allItems(SETTINGS.stackCal2R3); }, 180000);

describe.skipIf(NEED_F)('2.3 cyclopropane / cyclobutane: the class study under the planner rule', () => {
  it('decisions (pinned): the pooled shift passes for the three ring classes (so no refinement is deployed); the cyclobutane C-H has one compound = insufficient data', () => {
    const pick = (d: Round3Decision) => `${d.l0}: n=${d.n} ${d.choice}`;
    expect(decisions.map(pick)).toEqual(['CYCLOBUTANE_CH: n=1 none', 'CYCLOBUTANE_CH2: n=6 pooled', 'CYCLOPROPANE_CH2: n=14 pooled', 'CYCLOPROPANE_METHINE: n=13 pooled']);
    expect(decisions.find(d => d.l0 === 'CYCLOBUTANE_CH')!.reason).toContain('insufficient data');
    for (const d of decisions) expect(d.refinementTried, d.l0).toBe(false);
  });
  it('no class is calibrated on fewer than 3 independent compounds, none with a mean error already within 0.15 ppm, and every deployed shift lowers the leave-one-out mean error of its class', () => {
    for (const d of decisions) for (const f of d.deployed) {
      expect(f.n, f.key).toBeGreaterThanOrEqual(V12_CONFIG.v140Calibration2.minCompounds);
      expect(f.maeBefore, f.key).toBeGreaterThan(V12_CONFIG.v140Calibration2.withinTolerancePpm);
      expect(f.maeLoo, f.key).toBeLessThan(f.maeBefore);
    }
  });
  it('the deployed rules in V12_CONFIG.v140Round3.rules are exactly the fit (shift +-0.006, compounds, mean errors +-0.006); stop 13 has no rule for these rings', () => {
    const deployed = decisions.flatMap(d => d.deployed), rules = V12_CONFIG.v140Round3.rules;
    expect(Object.keys(rules).sort()).toEqual(deployed.map(f => f.key).sort());
    for (const f of deployed) {
      const r = rules[f.key];
      expect(r.level, f.key).toBe(f.level);
      expect(Math.abs(r.deltaPpm - f.delta), f.key).toBeLessThan(0.006);
      expect(r.compounds, f.key).toEqual(f.perCompound.map(p => p.name));
      expect(Math.abs(r.maeBefore - f.maeBefore), f.key).toBeLessThan(0.006);
      expect(Math.abs(r.maeLeaveOneOut - f.maeLoo), f.key).toBeLessThan(0.006);
    }
    expect(Object.keys(V12_CONFIG.v140Calibration2.rules).filter(k => /CARBOCYCLE|CYCLOPROPANE|CYCLOBUTANE/.test(k))).toEqual([]);
  });
  it('the class of an atom does not read any shift; cyclopropenes and larger rings are not in the class', () => {
    const cls = (smi: string, smarts: string) => { const r = resolveAtoms(smi, smarts); return round3Class(graphOf(r.canonical), r.atoms[0]); };
    expect(cls('ClC1CC1', '[CH;r3]')).toEqual({l0: 'CYCLOPROPANE_METHINE', l1: 'CYCLOPROPANE_METHINE_HETERO'});
    expect(cls('C=CC1CC1', '[CH2;r3]')).toEqual({l0: 'CYCLOPROPANE_CH2', l1: 'CYCLOPROPANE_CH2_OTHER'});
    expect(cls('O=C1CCC1', '[CH2;r4]')).toEqual({l0: 'CYCLOBUTANE_CH2', l1: 'CYCLOBUTANE_CH2_RING_CARBONYL'});
    expect(cls('C1Cc2ccccc12', '[CH2;r4]')).toEqual({l0: 'CYCLOBUTANE_CH2', l1: 'CYCLOBUTANE_CH2_NO_RING_CARBONYL'});
    expect(cls('C1=CC1', '[CH]')).toBeNull();
    expect(cls('C1=CCC1', '[CH2]')).toBeNull(); expect(cls('C=C1CCC1', '[CH2;r4]')).toBeNull();   // a ring or exocyclic C=C is outside the data (cyclobutene, methylenecyclobutane)
    expect(cls('CCCC', '[CH2]')).toBeNull(); expect(cls('C1CCCC1', '[CH2]')).toBeNull(); expect(cls('C1CCCCC1', '[CH2]')).toBeNull();
  });
});

describe.skipIf(NEED_F)('2.3 before / after (the engine: stack of the earlier flags incl. calibration2, without / with round3)', () => {
  it('the same items in the same order; the flag off equals the stack', () => {
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) { expect(after[i].compound).toBe(before[i].compound); expect(after[i].label).toBe(before[i].label); }
    clearEnvCache();
    expect(allItems(SETTINGS.stackCal2).map(i => i.predicted)).toEqual(before.map(i => i.predicted));
  });
  it('only the items of a deployed class (or an aromatic S-H) move, and by exactly the class shift; every other exchangeable centre stays', () => {
    const rules = V12_CONFIG.v140Round3.rules; let moved = 0;
    before.forEach((b, i) => {
      const a = after[i]; if (b.predicted === null || a.predicted === null) return;
      const d = a.predicted - b.predicted;
      if (b.exchangeable) {
        const isArSH = b.smiles.replace(/\s/g, '') === 'Sc1ccccc1' && b.label === 'SH';
        if (isArSH) { expect(a.predicted, `${b.compound} ${b.label}`).toBeCloseTo(3.35, 6); moved++; } else expect(Math.abs(d), `${b.compound} ${b.label} (exchangeable)`).toBeLessThan(1e-9);
        return;
      }
      const cls = b.atom >= 0 ? round3Class(graphOf(b.canonical), b.atom) : null;
      const rule = cls ? (rules[cls.l0] ?? (cls.l1 ? rules[cls.l1] : undefined)) : undefined;
      if (!rule) expect(Math.abs(d), `${b.compound} ${b.label} has no deployed class`).toBeLessThan(1e-9);
      else { moved++; expect(Math.abs(d - rule.deltaPpm), `${b.compound} ${b.label}`).toBeLessThan(0.002); }
    });
    expect(moved).toBeGreaterThan(40);
  });
  it('BEFORE / AFTER per class, calibration data (compound-weighted mean absolute error; AFTER is in-sample, the leave-one-out is in the decision table), and the validation-only signals', () => {
    const rows: string[] = ['class | compounds | before | after (engine, in-sample) | leave-one-out | decision'];
    for (const d of decisions) {
      const mine = before.map((b, i) => ({b, a: after[i]})).filter(({b}) => !b.exchangeable && !b.rangeOnly && !b.validationOnly && b.predicted !== null && b.solvent === 'CDCl3' && b.atom >= 0 && round3Class(graphOf(b.canonical), b.atom)?.l0 === d.l0);
      const per = (pick: (x: {b: Item; a: Item}) => number) => { const m = new Map<string, number[]>(); for (const x of mine) m.set(x.b.canonical, [...(m.get(x.b.canonical) ?? []), pick(x)]); const v = [...m.values()].map(z => z.reduce((s, t) => s + t, 0) / z.length); return v.reduce((s, t) => s + t, 0) / v.length; };
      const bef = per(x => Math.abs(x.b.error!)), aft = per(x => Math.abs(x.a.error!));
      rows.push(`${d.l0} | ${d.n} | ${fmt2(bef)} | ${fmt2(aft)} | ${d.choice === 'none' ? '—' : fmt2(d.pooled.maeLoo)} | ${d.reason}`);
      expect(bef).toBeCloseTo(d.maeBefore, 6);
      if (d.choice === 'none') expect(aft).toBeCloseTo(bef, 6); else expect(aft).toBeLessThan(bef);
    }
    notes.push('=== 2.3 per class: before / after', ...rows, '');
    const val = ['compound | signal | truth | before | after (error pred - truth)'];
    before.forEach((b, i) => { if (!b.validationOnly) return; const a = after[i]; val.push(`${b.compound} | ${b.label} | ${fmt2(b.truth)} | ${b.error === null ? '—' : fmtSigned(b.error)} | ${a.error === null ? '—' : fmtSigned(a.error)}`); });
    notes.push('=== 2.3 validation-only signals (assignment read from the figure)', ...val, '');
    expect(val.length).toBe(10);
  });
  it('per-compound before / left-out detail and the refinement that was NOT used (information only)', () => {
    const rows: string[] = [];
    for (const d of decisions) {
      rows.push(`${d.l0}: n=${d.n} before ${fmt2(d.maeBefore)}; pooled delta ${fmtSigned(d.pooled.delta)} leave-one-out ${fmt2(d.pooled.maeLoo)} (${d.pooled.status}); ${d.choice}`);
      rows.push('  per compound before/left-out: ' + d.pooled.perCompound.map(p => `${p.name} ${fmt2(p.before)}/${fmt2(p.loo)}`).join('; '));
      for (const f of d.refined) rows.push(`  refinement (not used) ${f.key}: n=${f.n} delta ${fmtSigned(f.delta)} before ${fmt2(f.maeBefore)} leave-one-out ${fmt2(f.maeLoo)} (${f.status})`);
      if (d.maeLooRefined !== null) rows.push(`  refinement class-level leave-one-out ${fmt2(d.maeLooRefined)} (pooled ${fmt2(d.pooled.maeLoo)})`);
    }
    notes.push('=== 2.3 leave-one-out detail', ...rows, '');
    expect(rows.length).toBeGreaterThan(8);
  });
  it('items that got worse by more than 0.15 ppm (the pooled shift is larger than that item error): listed for the report', () => {
    const rows: string[] = [];
    before.forEach((b, i) => { const a = after[i]; if (b.error === null || a.error === null || b.exchangeable || b.validationOnly) return; if (Math.abs(a.error) - Math.abs(b.error) > 0.15) rows.push(`${b.compound} | ${b.label} | truth ${fmt2(b.truth)} | before ${fmtSigned(b.error)} | after ${fmtSigned(a.error)}`); });
    notes.push('=== items worse by > 0.15 ppm (calibration data)', ...rows, '');
    expect(rows.length).toBeLessThan(10);
  });
  it('the old categories (tier 1 CDCl3 + tier 2 rounds 1-2, non-exchangeable): none gets worse by more than 0.02 ppm', () => {
    const oldN = evalTier1(SETTINGS.stackCal2, 'CDCl3').length + evalTier2(SETTINGS.stackCal2, 'round1').length + evalTier2(SETTINGS.stackCal2, 'round2').length;
    const idx = before.map((_, i) => i).filter(i => i < oldN && !before[i].exchangeable && !before[i].rangeOnly && before[i].predicted !== null && before[i].solvent === 'CDCl3');
    const rows: string[] = ['category | n signals | before | after | change'], worse: string[] = [];
    for (const c of [...new Set(idx.map(i => before[i].category))].sort()) {
      const sel = idx.filter(i => before[i].category === c), m = (arr: Item[]) => sel.reduce((s, i) => s + Math.abs(arr[i].error!), 0) / sel.length;
      const b = m(before), a = m(after);
      rows.push(`${c} | ${sel.length} | ${fmt2(b)} | ${fmt2(a)} | ${fmtSigned(a - b)}`);
      if (a - b > 0.02) worse.push(`${c} ${fmt2(b)} -> ${fmt2(a)}`);
    }
    const all = (arr: Item[]) => idx.reduce((s, i) => s + Math.abs(arr[i].error!), 0) / idx.length;
    rows.push(`ALL old signals | ${idx.length} | ${fmt2(all(before))} | ${fmt2(all(after))} | ${fmtSigned(all(after) - all(before))}`);
    notes.push('=== old categories (417-signal truth set of stops 10-13)', ...rows, 'categories worse by > 0.02: ' + (worse.length ? worse.join('; ') : 'none'), '');
    expect(worse).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ the 31 single-compound 1H scores and the 55-structure panel
type SPeakT = {x: number; integration: number; multiplicity: string};
const fx = (id: string, formula: string, smiles: string, h1: SPeakT[]): V121Fixture => ({
  id, description: 'literature 1H table (CDCl3)', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
} as V121Fixture);
const h1Score = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle).modalityScores['1H_NMR'] as number;
const setStack = (round3: boolean) => { V12_CONFIG.useV140H1 = true; Object.assign(V12_CONFIG.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true, round3}); };
describe.skipIf(NEED_F)('the 31 single-compound 1H scores of the stop-7 audit (all earlier v1.4.0 flags on), round3 off / on', () => {
  it('no spectrum scores more than 2 points lower with round3; the changes are listed', () => {
    const run = (r3: boolean) => STOP7_SPECTRA.map(([name, smi, formula, peaks]) => { setStack(r3); return {name, v: h1Score(smi, fx(name, formula, smi, peaks))}; });
    const off = run(false), on = run(true);
    expect(on.length).toBe(31);
    const rows: string[] = ['compound | 1H score round3 off | on | change'], worse: string[] = [];
    on.forEach((r, i) => { const d = r.v - off[i].v; if (Math.abs(d) >= 0.05) rows.push(`${r.name} | ${off[i].v.toFixed(1)} | ${r.v.toFixed(1)} | ${fmtSigned(d)}`); if (d < -2) worse.push(`${r.name} ${off[i].v.toFixed(1)} -> ${r.v.toFixed(1)}`); });
    notes.push('=== 31 single-compound 1H scores (changed ones only)', ...rows, `unchanged: ${on.filter((r, i) => Math.abs(r.v - off[i].v) < 0.05).length} of 31; worse by > 2 points: ${worse.length ? worse.join('; ') : 'none'}`, '');
    expect(worse).toEqual([]);
  }, 600000);
});

describe('the 55-structure real-compound panel: each structure scored against ITS OWN round3-off prediction, round3 off / on', () => {
  it('lists every structure whose 1H score changes (a structure whose prediction round3 moves can only lose against its old own list: this finds which structures round3 touches)', () => {
    const rows: string[] = ['structure | SMILES | 1H score round3 off | on | change'], touched: string[] = [], dropped: string[] = [];
    for (const [name, smi] of REAL_STRUCTURE_PANEL.map(r => [r[0], r[1]] as [string, string])) {
      setStack(false);
      const st = ChemistryEngine.parseStructureInput({smiles: smi});
      const envs = NMRGraphPredictor.predict1HFromStructureGraph(st, {solvent: 'CDCl3'}).environments.filter(e => !e.isExchangeable);
      const peaks = envs.map(e => ({x: Number(e.shiftPpm.toFixed(2)), integration: e.integration ?? 1, multiplicity: 's'}));
      const f = fx(name, st.molecularFormula, smi, peaks.length ? peaks : [{x: 1, integration: 1, multiplicity: 's'}]);
      setStack(false); const a = h1Score(smi, f); setStack(true); const b = h1Score(smi, f);
      if (Math.abs(b - a) >= 0.05) { rows.push(`${name} | ${smi} | ${a.toFixed(1)} | ${b.toFixed(1)} | ${fmtSigned(b - a)}`); touched.push(name); if (b < a - 0.05) dropped.push(name); }
    }
    notes.push('=== 55-structure panel (1H score against the structure own round3-off prediction)', ...rows, `structures changed: ${touched.length}; score lower: ${dropped.length ? dropped.join(', ') : 'none'}`, '');
    expect(REAL_STRUCTURE_PANEL.length).toBe(55);
  }, 600000);
});
