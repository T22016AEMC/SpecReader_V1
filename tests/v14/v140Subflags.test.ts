import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {s26RulesOff} from '../helpers/v142S26Off';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {buildAtomInventory} from '../../src/engines/constraints/atomInventory';
import type {H1Signal} from '../../src/engines/constraints/atomInventory';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';

// v1.4.0 stop 4: the rules under useV140H1 are two groups, V12_CONFIG.v140.alkene and V12_CONFIG.v140.oxygen (each default true = follow useV140H1; effective = useV140H1 AND the group).
// Four combinations are pinned here: both off (= v1.3.2, item by item), only alkene, only oxygen, both on. The THF / methanol parse fix has its own flag v140.parseFix (stop 21).
// Which group owns an environment: an sp3 C-H with an oxygen neighbour = oxygen (even if it is also allylic, e.g. the OCH2 of allyl acetate); every other allylic C-H and every alkene C-H = alkene.
const was = {h1: V12_CONFIG.useV140H1, a: V12_CONFIG.v140.alkene, o: V12_CONFIG.v140.oxygen, pf: V12_CONFIG.v140.parseFix};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.alkene = was.a; V12_CONFIG.v140.oxygen = was.o; V12_CONFIG.v140.parseFix = was.pf; });
// v1.4.2 stop 26: this file pins a state BEFORE the stop-26 nmrshiftdb2 class shifts (no flag of their own; they sit under v140.oxygen / v140.calibration2), so they are switched off here.
// The combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots. No expected value of this file was changed.
const restoreS26 = s26RulesOff(); afterAll(() => restoreS26());

const set = (h1: boolean, alkene: boolean, oxygen: boolean) => { V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.alkene = alkene; V12_CONFIG.v140.oxygen = oxygen; };
/** environments keyed by the predictor's atom index/indices; each value is the sorted list of "nH@shift" of the environments on that atom(s) */
const byAtom = (smi: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const e of NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'}).environments) {
    const k = (e.atomIndices ?? []).join('/');
    (out[k] ??= []).push(`${e.integration}H@${e.shiftPpm.toFixed(2)}`);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
};
const M = {off: [false, true, true], h1OnGroupsOff: [true, false, false], both: [true, true, true], alkene: [true, true, false], oxygen: [true, false, true]} as const;
const run = (smi: string, m: readonly [boolean, boolean, boolean]) => { set(m[0], m[1], m[2]); return byAtom(smi); };

// atom keys as the predictor numbers them (see the printed lists in notes/v1.4.0/STOP04_CHECKPOINT.md)
const CASES: {smi: string; alkene: string[]; oxygen: string[]}[] = [
  {smi: 'C=CCCCCCC', alkene: ['0', '1', '2'], oxygen: []},
  {smi: 'C=CC', alkene: ['0', '1', '2'], oxygen: []},
  {smi: 'CC(=O)OCC=C', alkene: ['0', '1'], oxygen: ['2']},
  {smi: 'C=COCC', alkene: ['0', '1'], oxygen: ['3']},
  {smi: 'CC(=O)OCC', alkene: [], oxygen: ['1']},
  {smi: 'CCOCC', alkene: [], oxygen: ['1/3']},
  {smi: 'CC(OCC)OCC', alkene: [], oxygen: ['3', '1/6']},
  {smi: 'CC(=O)OC(C)C', alkene: [], oxygen: ['4']},
  {smi: 'CCO', alkene: [], oxygen: ['1']},
  {smi: 'Cc1ccccc1', alkene: [], oxygen: []},
];

describe('the four combinations of the two groups (predictor)', () => {
  for (const c of CASES) {
    it(`${c.smi}: both off = v1.3.2; useV140H1 off = v1.3.2 whatever the groups say; only alkene / only oxygen change only their own atoms; both on = the union`, () => {
      const base = run(c.smi, M.off);
      set(false, false, false); expect(byAtom(c.smi), 'useV140H1 off, groups off').toEqual(base);
      set(false, true, false); expect(byAtom(c.smi), 'useV140H1 off, alkene on').toEqual(base);
      set(false, false, true); expect(byAtom(c.smi), 'useV140H1 off, oxygen on').toEqual(base);
      expect(run(c.smi, M.h1OnGroupsOff), 'useV140H1 on, both groups off').toEqual(base);
      const both = run(c.smi, M.both), alk = run(c.smi, M.alkene), oxy = run(c.smi, M.oxygen);
      for (const k of Object.keys(base)) {
        const a = c.alkene.includes(k), o = c.oxygen.includes(k);
        expect(alk[k] ?? null, `${c.smi} atom ${k} only alkene`).toEqual(a ? both[k] ?? null : base[k]);
        expect(oxy[k] ?? null, `${c.smi} atom ${k} only oxygen`).toEqual(o ? both[k] ?? null : base[k]);
      }
      // the split =CH2 has new keys of its own (same atom, two environments): they are in 'both' and 'alkene' under the same atom key, so the loop above covers them
      expect(Object.keys(alk).sort(), 'only alkene: same atoms').toEqual(Object.keys(both).sort());
      // not vacuous: each group really changes something where the structure has that group
      // (an individual atom can keep its value: the =CH rule 5.25 + 0.45 = 5.70 equals the v1.3.2 value, so the check is on the group as a whole)
      if (c.alkene.length) expect(c.alkene.some(k => JSON.stringify(both[k]) !== JSON.stringify(base[k])), `${c.smi}: the alkene group changes something`).toBe(true);
      if (c.oxygen.length) expect(c.oxygen.some(k => JSON.stringify(both[k]) !== JSON.stringify(base[k])), `${c.smi}: the oxygen group changes something`).toBe(true);
      if (!c.alkene.length && !c.oxygen.length) expect(both).toEqual(base);
    });
  }
  it('pinned values: 1-octene alkene-only 5.03 / 4.97 / 1.96 and 1.25 for the rest; ethyl acetate OCH2 4.30 (alkene only) / 4.20 (oxygen only); acetal CH 6.25 / 4.37; allyl acetate OCH2 4.30 (alkene only) / 4.83 (oxygen only)', () => {
    expect(run('C=CCCCCCC', M.alkene)['0']).toEqual(['1H@4.97', '1H@5.03']);
    expect(run('C=CCCCCCC', M.alkene)['2']).toEqual(['2H@1.96']);
    expect(run('C=CCCCCCC', M.oxygen)['0']).toEqual(['2H@5.25']);
    expect(run('CC(=O)OCC', M.alkene)['1']).toEqual(['2H@4.30']); expect(run('CC(=O)OCC', M.oxygen)['1']).toEqual(['2H@4.20']);
    expect(run('CC(OCC)OCC', M.alkene)['3']).toEqual(['1H@6.25']); expect(run('CC(OCC)OCC', M.oxygen)['3']).toEqual(['1H@4.37']);
    expect(run('CC(=O)OCC=C', M.alkene)['2']).toEqual(['2H@4.30']); expect(run('CC(=O)OCC=C', M.oxygen)['2']).toEqual(['2H@4.83']);
  });
});

describe('the constraint-layer "two 1H signals = one =CH2 carbon" reading belongs to the alkene group', () => {
  const sig = (id: string, d: number, n: number, m: string): H1Signal => ({observationId: id, shiftPpm: d, relativeIntegral: n, multiplicity: m, broad: false, optional: false});
  const OCTENE = [sig('a', 5.81, 1, 'm'), sig('b', 4.99, 1, 'd'), sig('c', 4.93, 1, 'd'), sig('d', 2.04, 2, 'q'), sig('e', 1.3, 8, 'm'), sig('f', 0.89, 3, 't')];
  const pairs = (m: readonly [boolean, boolean, boolean]) => { set(m[0], m[1], m[2]); return buildAtomInventory({signals: OCTENE, formula: {C: 8, H: 16}, solvent: 'CDCl3', coverageComplete: true, vinylWindows: true}).alternatives.filter(x => x.id.startsWith('gp:')).length; };
  it('both off / useV140H1 off / only oxygen: no pair reading; only alkene / both on: the pair reading is added', () => {
    expect(pairs(M.off)).toBe(0); expect(pairs(M.h1OnGroupsOff)).toBe(0); expect(pairs(M.oxygen)).toBe(0);
    expect(pairs(M.alkene)).toBeGreaterThan(0); expect(pairs(M.both)).toBeGreaterThan(0);
    set(false, true, true); expect(buildAtomInventory({signals: OCTENE, formula: {C: 8, H: 16}, solvent: 'CDCl3', coverageComplete: true, vinylWindows: true}).alternatives.some(x => x.id.startsWith('gp:'))).toBe(false);
  });
});

describe('the THF / methanol parse fix is switched by v140.parseFix alone', () => {
  const fx = (id: string, formula: string, smiles: string, h1: {x: number; integration: number; multiplicity: string}[]): V121Fixture => ({
    id, description: 'Fulmer 2010 SI Table S7 shifts (CDCl3), see tests/fixtures/v140/h1Truth.json', targetSmiles: smiles, formula,
    h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
  });
  const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
  const THF = fx('THF', 'C4H8O', 'C1CCOC1', [{x: 3.76, integration: 4, multiplicity: 'm'}, {x: 1.85, integration: 4, multiplicity: 'm'}]);
  const MEOH = fx('MEOH', 'CH4O', 'CO', [{x: 3.49, integration: 3, multiplicity: 's'}]);
  const score = (m: readonly [boolean, boolean, boolean], parseFix: boolean) => { set(m[0], m[1], m[2]); V12_CONFIG.v140.parseFix = parseFix; const h = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, bundleOf(f)).modalityScores['1H_NMR'] as number; return {thf: h('C1CCOC1', THF), me: h('CO', MEOH)}; };
  it('parseFix on with both groups off still gives THF / methanol their 1H support (the parse fix); parseFix off gives the v1.3.2 empty-prediction value whatever the groups say', () => {
    const off = score(M.off, false), offGroupsOff = score([false, false, false], false);
    const fixOnly = score(M.h1OnGroupsOff, true);
    expect(offGroupsOff).toEqual(off);
    expect(fixOnly.thf).toBeGreaterThan(off.thf + 10); expect(fixOnly.me).toBeGreaterThan(off.me + 10);
    // with the groups off the predictor is the v1.3.2 one, so THF / methanol are scored on v1.3.2 predictions (fix only); both on changes them further
    const both = score(M.both, true);
    expect(both.thf).not.toBe(fixOnly.thf);
  });
});
