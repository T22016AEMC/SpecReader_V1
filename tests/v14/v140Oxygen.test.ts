import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {s26RulesOff} from '../helpers/v142S26Off';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from '../helpers/v121Golden';
import {applySetting, clearEnvCache, evalTier1, evalTier2, gradeAValue, hasLocalOnly, initTruthTools, type Item, localOnlyNote, mae, SETTINGS, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the calibration / held-out tests (they read tier 1) skip without them (one-line note).
const NEED_F = needFulmer('v140Oxygen: the calibration / held-out tests (they read tier 1)');
// v1.4.2 stop 35: these tests read the grade-A entries of tier 2 (user-looked-up SDBS / ChemicalBook / RSC SI values), which are local-only; without them they are skipped.
const NEED_GRADE_A = !hasLocalOnly('tier2GradeA');
if (NEED_GRADE_A) console.info(localOnlyNote('tier2GradeA', 'v140Oxygen.test.ts: 3 test(s) that read the grade-A entries'));

// v1.4.0 stop 11 (v140.oxygen, with useV140H1): four finer oxygen environments (esterMethine +0.67, acetalCH2 -0.88, cyclicEther +0.39, glycolOCH3 +0.16), each calibrated on ONE point (tier 1, tier-1 quality, or the point the planner
// named) and checked on held-out points that took no part in the calibration. Environments without a calibration point or without a held-out partner got no rule (listed in the stop-11 report). The numbers below are pinned.
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140, o: V12_CONFIG.v140Oxygen.enabled}));
beforeAll(async () => { await initTruthTools(); }, 120000);
afterAll(() => { const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); V12_CONFIG.v140Oxygen.enabled = was.o; });
// v1.4.2 stop 26: this file pins a state BEFORE the stop-26 nmrshiftdb2 class shifts (no flag of their own; they sit under v140.oxygen / v140.calibration2), so they are switched off here.
// The combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots. No expected value of this file was changed.
const restoreS26 = s26RulesOff(); afterAll(() => restoreS26());

const at = (items: Item[], compound: string, label?: string) => items.filter(i => i.compound.startsWith(compound) && (label === undefined || i.label === label));
let off1: Item[], alk1: Item[], oxBefore1: Item[], ox1: Item[], off2: Item[], alk2: Item[], oxBefore2: Item[], ox2: Item[];
beforeAll(() => { if (NEED_F) return;
  clearEnvCache(); off1 = evalTier1(SETTINGS.off); alk1 = evalTier1(SETTINGS.alkeneOnly); off2 = evalTier2(SETTINGS.off); alk2 = evalTier2(SETTINGS.alkeneOnly);
  V12_CONFIG.v140Oxygen.enabled = false; clearEnvCache(); oxBefore1 = evalTier1(SETTINGS.oxygenOn); oxBefore2 = evalTier2(SETTINGS.oxygenOn);
  V12_CONFIG.v140Oxygen.enabled = true; clearEnvCache(); ox1 = evalTier1(SETTINGS.oxygenOn); ox2 = evalTier2(SETTINGS.oxygenOn);
}, 120000);
const grp = (c: string) => c.startsWith('acetal_') ? 'acetal / ketal / orthoester' : /^O_CH\d?_alcohol$/.test(c) ? 'alcohol' : /^O_CH\d?_ester$/.test(c) ? 'ester (acyloxy C-H)' : /^O_CH\d?_arylether$/.test(c) ? 'aryl ether' : /^O_CH\d?_ether$/.test(c) ? 'ether' : null;

describe.skipIf(NEED_F)('oxygen rules: calibration and held-out points (B2, B3, B5)', () => {
  it('B2 ester O-CH (acyloxy methine, ester O not in a ring): calibration isopropyl acetate 4.98; held out cyclohexyl acetate 4.75 (0.21: NOT within the 0.2 asked for) and isopropyl formate 5.13 (0.15)', () => {
    expect(at(oxBefore2, 'isopropyl acetate', 'OCH')[0].predicted).toBeCloseTo(4.31, 2);
    expect(at(ox2, 'isopropyl acetate', 'OCH')[0].predicted).toBeCloseTo(4.98, 2);
    expect(Math.abs(at(ox2, 'isopropyl acetate', 'OCH')[0].error!)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(at(ox2, 'cyclohexyl acetate', 'OCH')[0].error!)).toBeCloseTo(0.21, 2);
    expect(Math.abs(at(ox2, 'isopropyl formate', 'OCH')[0].error!)).toBeCloseTo(0.15, 2);
    // a lactone (ester O in a ring) is not this environment
    expect(at(ox2, 'beta-propiolactone', 'OCH2')[0].predicted).toBe(at(oxBefore2, 'beta-propiolactone', 'OCH2')[0].predicted);
  });
  it.skipIf(NEED_GRADE_A)('B3 acetal O-CH2-O: calibration dimethoxymethane (tier 2, grade A, named by the planner); held out 1,3-dioxolane OCH2O (0.33: NOT within 0.2: cyclic vs acyclic, one point each)', () => {
    expect(at(oxBefore2, 'dimethoxymethane', 'OCH2O')[0].predicted).toBeCloseTo(5.45, 2);
    expect(at(ox2, 'dimethoxymethane', 'OCH2O')[0].predicted).toBeCloseTo(gradeAValue('dimethoxymethane', 'OCH2O'), 2);   // v1.4.2 stop 36: the grade-A value is read from the local-only file
    expect(Math.abs(at(ox2, '1,3-dioxolane', 'OCH2O')[0].error!)).toBeCloseTo(0.33, 2);
    // no calibration point for the acetal C-H and the orthoester C-H: unchanged knowledge-base sums
    for (const [n, l] of [['1,1-diethoxyethane', 'CH'], ['trimethyl orthoformate', 'CH'], ['bromoacetaldehyde dimethyl acetal', 'CH'], ['2,2-dimethoxypropane', 'OCH3']] as const) expect(at(ox2, n, l)[0].predicted, n).toBe(at(oxBefore2, n, l)[0].predicted);
  });
  it('cyclic single ether O-CH2 (5/6-ring, one O): calibration THF 3.76 (tier 1); held out tetrahydropyran 3.65 (tier 2, 0.11); dioxane / 18-crown-6 (two or more O) and oxetane are not this class', () => {
    expect(at(oxBefore1, 'tetrahydrofuran', 'CH2(2,5)')[0].predicted).toBeCloseTo(3.37, 2);
    expect(at(ox1, 'tetrahydrofuran', 'CH2(2,5)')[0].predicted).toBeCloseTo(3.76, 2);
    expect(Math.abs(at(ox2, 'tetrahydropyran', 'OCH2')[0].error!)).toBeCloseTo(0.11, 2);
    for (const n of ['1,4-dioxane', '18-crown-6']) expect(at(ox1, n)[0].predicted).toBe(at(oxBefore1, n)[0].predicted);
    expect(at(ox2, 'oxetane', 'OCH2')[0].predicted).toBe(at(oxBefore2, 'oxetane', 'OCH2')[0].predicted);
  });
  it('glycol-type methyl ether OCH3 (CH3-O-CH2-C-O): calibration 1,2-dimethoxyethane CH3 3.40 (tier 1); held out diglyme OCH3 3.39 (tier 1, other compound); the acetal OCH3 of bromoacetaldehyde dimethyl acetal is not this class', () => {
    expect(at(oxBefore1, '1,2-dimethoxyethane', 'CH3')[0].predicted).toBeCloseTo(3.24, 2);
    expect(at(ox1, '1,2-dimethoxyethane', 'CH3')[0].predicted).toBeCloseTo(3.40, 2);
    expect(Math.abs(at(ox1, 'diglyme', 'OCH3')[0].error!)).toBeLessThanOrEqual(0.011);
    expect(at(ox2, 'bromoacetaldehyde dimethyl acetal', 'OCH3')[0].predicted).toBeCloseTo(3.24, 2);
  });
  it.skipIf(NEED_GRADE_A)('B4 alcohol C-H: NO rule (one acyclic point only): 2-propanol CH stays 3.57 (observed 4.04); the cyclic one, cyclohexanol (grade A), is predicted 3.55', () => {
    expect(at(ox1, '2-propanol', 'CH')[0].predicted).toBeCloseTo(3.57, 2);
    expect(at(ox2, 'cyclohexanol', 'CHOH')[0].predicted).toBeCloseTo(3.55, 2);
  });
  it.skipIf(NEED_GRADE_A)('B1 mean absolute error by class: flag off / alkene only / oxygen on before stop 11 / oxygen on now; the oxygen rules are never worse than the flag off except the alcohols of tier 1 (2-propanol)', () => {
    const rows = ['tier | class | n | flag off | alkene only | oxygen on (before) | oxygen on (now)'];
    const worse: string[] = [];
    for (const [t, a, b, c, d] of [['1', off1, alk1, oxBefore1, ox1], ['2', off2, alk2, oxBefore2, ox2]] as const) {
      const classes = [...new Set(a.map(i => grp(i.category)).filter(Boolean))].sort() as string[];
      for (const k of classes) {
        const f = (x: Item[]) => x.filter(i => grp(i.category) === k && !i.exchangeable);
        rows.push(`${t} | ${k} | ${f(a).length} | ${mae(f(a)).toFixed(2)} | ${mae(f(b)).toFixed(2)} | ${mae(f(c)).toFixed(2)} | ${mae(f(d)).toFixed(2)}`);
        if (mae(f(d)) > mae(f(a)) + 1e-9) worse.push(`${t} ${k}`);
      }
    }
    console.log(rows.join('\n'));
    expect(worse).toEqual(['1 alcohol']);
  });
});

describe('2-propanol and dimethyl malonate: 1H score of the correct structure (B6)', () => {
  const P = (x: number, integration: number, multiplicity: string) => ({x, integration, multiplicity});
  const score = (name: string, smiles: string, formula: string, peaks: ReturnType<typeof P>[]) => {
    const f = {id: name, description: 'Fulmer 2010 SI', targetSmiles: smiles, formula, h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks}, ir: {yAxis: 'transmittance percent' as const, coverageCm1: [4000, 450] as [number, number], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]}};
    const bundle = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f as never, {denseBaseline: true}), {}).bundle;
    return (scoreScientificEvidence(smiles, bundle) as unknown as {modalityScores: Record<string, number>}).modalityScores['1H_NMR'];
  };
  it('flag off 94.4; the stack with the oxygen rules 86.7 (the alcohol C-H rule is missing, see B4); dimethyl malonate: off 90.3, stack 91.3', () => {
    applySetting(SETTINGS.off);
    const p0 = score('2-propanol', 'CC(C)O', 'C3H8O', [P(4.04, 1, 'sept'), P(1.22, 6, 'd')]), m0 = score('dimethyl malonate', 'COC(=O)CC(=O)OC', 'C5H8O4', [P(3.75, 6, 's'), P(3.40, 2, 's')]);
    applySetting(SETTINGS.full);
    const p1 = score('2-propanol', 'CC(C)O', 'C3H8O', [P(4.04, 1, 'sept'), P(1.22, 6, 'd')]), m1 = score('dimethyl malonate', 'COC(=O)CC(=O)OC', 'C5H8O4', [P(3.75, 6, 's'), P(3.40, 2, 's')]);
    expect(p0).toBeCloseTo(94.4, 1); expect(p1).toBeCloseTo(86.7, 1);
    expect(m0).toBeCloseTo(90.3, 1); expect(m1).toBeCloseTo(91.3, 1);
  });
});
