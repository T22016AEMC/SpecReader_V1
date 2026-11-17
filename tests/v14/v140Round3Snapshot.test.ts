import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {NO_PLAUSIBILITY_EVIDENCE, plausibilityViolations} from '../../src/engines/scientificEngines/structurePlausibility';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {loadStop7, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_SPECTRA} = await loadStop7();
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {measureV132, V132_CASES} from '../helpers/v132Samples';
import {applySetting, clearEnvCache, evalTier1, evalTier2, evalTier3, gradeAPredRows, hasLocalOnly, initTruthTools, type Item, localOnlyNote, mae, type Setting} from '../helpers/v140Truth';
import {openV132Gates} from '../helpers/v132Gates';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the tier-1 MAE and the 31 stop-7 spectra skip without them (one-line note).
const NEED_F = needFulmer('v140Round3Snapshot: the tier-1 MAE and the 31 stop-7 spectra');
// v1.4.2 stop 35: these tests read the grade-A entries of tier 2 (user-looked-up SDBS / ChemicalBook / RSC SI values), which are local-only; without them they are skipped.
const NEED_GRADE_A = !hasLocalOnly('tier2GradeA');
if (NEED_GRADE_A) console.info(localOnlyNote('tier2GradeA', 'v140Round3Snapshot.test.ts: 4 test(s) that read the grade-A entries'));

// v1.4.1 stop 22: SNAPSHOT of the whole v1.4.0 set PLUS v140.round3 switched on (useV140H1 and all eight v140 sub-flags, on top of the v1.3.2 defaults) - the state `?exp=h1` gives.
// THIS IS A SNAPSHOT OF THE v1.4.1 STATE AT THE END OF STOP 22 (v1.4.1 current state). IT DOES NOT SAY THAT THESE NUMBERS ARE CORRECT. A change in a pinned number means "the round3-on behaviour changed" and has to be looked at;
// it is not by itself a bug, and a pinned number is not a claim of accuracy. The test sets every flag itself (v140.round3 = true here; tests/v14/v140FlagOnSnapshot.test.ts sets it to false and stays as it was), so it gives the same result under the default, the flag-off and the flag-on configurations.
// Pinned: (1) the truth-set MAE (tier 1, tier 2 rounds 1-3, with n; non-exchangeable signals that have a prediction), (2) the 1H prediction of representative compounds (at least one per prediction sub-flag, and the round3 ones),
// (3) the 1H score of the 31 single-compound spectra (matching layer), (4) the target rank of every ranking sample (V132_CASES, 43 samples) through the whole flow.
// Truth values are literature values (Fulmer 2010 SI, Reich, lists supplied by the planner); no real spectrum of the user's is used.
const FULL: Setting = {name: 'full-on + round3 snapshot', useV140H1: true, alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true, round3: true};
const SUB = ['alkene', 'oxygen', 'matching', 'plausibility', 'coverage', 'solvent', 'calibration2', 'round3'] as const;
// v1.4.1 stop 18: this snapshot pins the 1H state, so the v1.4.1 IR flag is switched off here (the flag-on suite run sets it on; tests/v14/v141FlagOnSnapshot.test.ts pins the IR state).
const was = JSON.parse(JSON.stringify({h1: V12_CONFIG.useV140H1, v: V12_CONFIG.v140, ir141: V12_CONFIG.useV141IR, ir142: V12_CONFIG.useV142IR}));
let restoreGates: (() => void) | null = null;
beforeAll(async () => { await initTruthTools(); await initializeRDKit(); restoreGates = openV132Gates(); applySetting(FULL); V12_CONFIG.useV141IR = false; V12_CONFIG.useV142IR = false; clearEnvCache(); }, 120000);
afterAll(() => { restoreGates?.(); const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.h1; Object.assign(V12_CONFIG.v140, was.v); V12_CONFIG.useV141IR = was.ir141; V12_CONFIG.useV142IR = was.ir142; clearEnvCache(); });

describe('full-on + round3 snapshot: truth-set MAE (non-exchangeable signals that have a prediction)', () => {
  const stats = (items: Item[]) => { const k = items.filter(i => !i.exchangeable && i.error !== null); return {n: k.length, mae: mae(k)}; };
  it('every flag is on', () => { expect(V12_CONFIG.useV140H1).toBe(true); for (const s of SUB) expect(V12_CONFIG.v140[s], s).toBe(true); });
  it.skipIf(NEED_F)('tier 1 (Fulmer 2010 SI Table S1, CDCl3): n 98, MAE 0.1200', () => {
    const s = stats(evalTier1(FULL)); expect(s.n).toBe(98); expect(s.mae).toBeCloseTo(0.1200, 3);
  });
  it.skipIf(NEED_GRADE_A)('tier 2 round 1 (first list: SDBS / ChemicalBook / RSC SI / Reich): n 200, MAE 0.1944 (0.2001 without round3: the cyclopropane and cyclobutane values; v1.4.2 stop 28: 0.2048 -> 0.1944 = indole / benzofuran H2 and the merged cyclopropane CH +0.12, cyclobutane CH +0.29)', () => {
    const s = stats(evalTier2(FULL, 'round1')); expect(s.n).toBe(200); expect(s.mae).toBeCloseTo(0.1944, 3);
  });
  it.skipIf(NEED_GRADE_A)('tier 2 round 2 (second list, journal candidates included): n 119, MAE 0.1175', () => {
    const s = stats(evalTier2(FULL, 'round2')); expect(s.n).toBe(119); expect(s.mae).toBeCloseTo(0.1175, 3);
  });
  it.skipIf(NEED_GRADE_A)('the three together: n = 417, MAE 0.1550 (0.1577 without round3; 0.1600 / 0.1627 before the v1.4.2 stop-28 class shifts)', () => {
    const s = stats([...evalTier1(FULL), ...evalTier2(FULL, 'round1'), ...evalTier2(FULL, 'round2')]); expect(s.n).toBe(417); expect(s.mae).toBeCloseTo(0.1550, 3);
  });
  it('tier 2 round 3 (planner list 2026-11-13: cyclopropane, cyclobutane, secondary cyclopropanes): n 44, MAE 0.2764 (0.2830 before the v1.4.2 stop-28 class shifts; in-sample: the class shifts were fitted on these; the secondary ones are validation only)', () => {
    const s = stats(evalTier3(FULL)); expect(s.n).toBe(44); expect(s.mae).toBeCloseTo(0.2764, 3);
  });
  it.skipIf(NEED_GRADE_A)('left out of the figure: 26 exchangeable signals and 4 signals without a prediction (the polyhalomethane C-H listed as 資料不足)', () => {
    const all = [...evalTier1(FULL), ...evalTier2(FULL, 'round1'), ...evalTier2(FULL, 'round2')];
    expect(all.filter(i => i.exchangeable).length).toBe(26); expect(all.filter(i => i.error === null).length).toBe(4);
  });
});

// [label, SMILES, solvent, predicted environments [shift ppm, H] in ascending shift, number of environments listed as 資料不足]
const PRED: [string, string, string, [number, number][], number][] = [
  ["alkene:propene", "C=CC", "CDCl3", [[1.71,3],[4.97,1],[5.03,1],[5.7,1]], 0],
  ["alkene:4-vinylpyridine", "C=Cc1ccncc1", "CDCl3", [[5.18,1],[5.61,1],[6.63,1],[7.14,2],[8.53,2]], 0],
  ["alkene:tetramethylethylene", "CC(C)=C(C)C", "CDCl3", [[1.71,12]], 0],
  ["oxygen:isopropyl acetate", "CC(=O)OC(C)C", "CDCl3", [[1.36,6],[2.1,3],[4.98,1]], 0],
  ["oxygen:THF", "C1CCOC1", "CDCl3", [[1.57,4],[3.76,4]], 0],
  // v1.4.2 stop 36: the dimethoxymethane row pins a prediction equal to its grade-A calibration value (acetalCH2 copies it), so the row is read from the local-only file
  ...gradeAPredRows('oxygen:dimethoxymethane'),
  ["coverage:nitromethane", "C[N+](=O)[O-]", "CDCl3", [[4.28,3]], 0],
  ["coverage:TMS", "C[Si](C)(C)C", "CDCl3", [[0.1,12]], 0],
  ["coverage:cyclopropane", "C1CC1", "CDCl3", [[0.66,6]], 0],
  ["solvent:ethyl acetate DMSO-d6", "CC(=O)OCC", "DMSO-d6", [[1.3,3],[2.04,3],[4.2,2]], 0],
  ["solvent:ethyl acetate C6D6", "CC(=O)OCC", "C6D6", [[1.01,3],[1.62,3],[3.89,2]], 0],
  ["solvent:ethyl acetate CDCl3", "CC(=O)OCC", "CDCl3", [[1.36,3],[2.1,3],[4.2,2]], 0],
  ["calibration2:propyne", "C#CC", "CDCl3", [[1.77,3],[1.89,1]], 0],
  ["calibration2:1-chlorobutane", "CCCCCl", "CDCl3", [[0.88,3],[1.25,2],[1.88,2],[3.4,2]], 0],
  ["calibration2:fluoroform", "FC(F)F", "CDCl3", [], 1],
  ["calibration2:chloroform", "ClC(Cl)Cl", "CDCl3", [[7.26,1]], 0],
  ["round3:methyl vinyl sulfone", "C=CS(C)(=O)=O", "CDCl3", [[2.32,3],[6.18,1],[6.41,1],[6.8,1]], 0],
  ["round3:diethyl vinylphosphonate", "C=CP(=O)(OCC)OCC", "CDCl3", [[1.2,6],[3.6,4],[5.91,1],[5.92,1],[6.13,1]], 0],
  ["round3:3-buten-2-ol", "C=CC(C)O", "CDCl3", [[1.2,3],[2.15,1],[4.08,1],[5.23,1],[5.24,1],[5.89,1]], 0],
  ["round3:vinyltrimethylsilane (unsplit)", "C=C[Si](C)(C)C", "CDCl3", [[0.1,9],[5.25,2],[5.25,1]], 0],
  ["round3:thiophenol", "Sc1ccccc1", "CDCl3", [[3.35,1],[7.11,1],[7.18,2],[7.21,2]], 0],
  ["round3:ethanethiol", "CCS", "CDCl3", [[0.88,3],[1.55,1],[2.69,2]], 0],
  ["round3:cyclopropanol", "OC1CC1", "CDCl3", [[0.98,4],[2.15,1],[2.69,1]], 0],   // v1.4.2 stop 28 (nmrshiftdb2 + Reich merged refit, CYCLOPROPANE_CH +0.12, under v140.calibration2 + round3): 
  ["round3:chlorocyclopropane", "ClC1CC1", "CDCl3", [[0.66,4],[2.84,1]], 0],   // v1.4.2 stop 28: 2.72 -> 2.84
  ["round3:cyclopropanecarboxylic acid", "OC(=O)C1CC1", "CDCl3", [[0.88,4],[1.91,1],[11.5,1]], 0],   // v1.4.2 stop 28: 1.79 -> 1.91
  ["round3:cyclobutane", "C1CCC1", "CDCl3", [[1.79,8]], 0],
  ["round3:cyclobutanone", "O=C1CCC1", "CDCl3", [[2.23,2],[3.11,4]], 0],
  ["round3:benzocyclobutene", "C1Cc2ccccc12", "CDCl3", [[3.46,4],[7.05,2],[7.06,2]], 0],
  ["round3:cyclobutene (not in class)", "C1=CCC1", "CDCl3", [[2,4],[5.66,2]], 0],
];
describe('full-on + round3 snapshot: 1H prediction of representative compounds (at least one per prediction sub-flag)', () => {
  for (const [label, smiles, solvent, env, insufficient] of PRED) {
    it(label, () => {
      applySetting(FULL);
      const r = NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles}), {solvent: solvent as never}) as unknown as {environments: {shiftPpm: number; integration: number}[]; insufficientDataEnvironments?: unknown[]};
      const got = r.environments.map(e => [Number(e.shiftPpm.toFixed(2)), e.integration] as [number, number]).sort((a, b) => a[0] - b[0]);
      expect(got.map(g => g[1])).toEqual(env.map(g => g[1]));
      got.forEach((g, i) => expect(g[0], `${label} environment ${i + 1}`).toBeCloseTo(env[i][0], 2));
      expect((r.insufficientDataEnvironments ?? []).length).toBe(insufficient);
    });
  }
});

describe('full-on + round3 snapshot: matching layer (1H score of single-compound spectra, CDCl3 literature tables) and ring-strain plausibility rules', () => {
  const SCORES: Record<string, number> = {"ethyl acetate":98.6,"diethyl ether":99.7,"THF":92.2,"1,4-dioxane":96.8,"ethanol":95.1,"2-propanol":86.7,"methanol":92.3,"butanone":98.5,"n-hexane":100,"toluene":98.8,"dichloromethane":99.2,"propylene":99.3,"ethylene":97.5,"allyl acetate":97.8,"diallyl carbonate":98,"acetone":99.8,"acetonitrile":98.9,"1,2-dichloroethane":79.5,"chloroform":100,"cyclohexane":100,"DMSO":95.6,"nitromethane":99.4,"pyridine":99.7,"furan":99.9,"benzene":97.3,"triethylamine":92.1,"1,2-dimethoxyethane":100,"dimethyl carbonate":98.4,"dimethyl malonate":91.3,"18-crown-6":98.1,"ethylene glycol":93.2};
  const fx = (id: string, formula: string, smiles: string, peaks: {x: number; integration: number; multiplicity: string}[]): V121Fixture => ({
    id, description: 'literature 1H table (CDCl3)', targetSmiles: smiles, formula, h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
  } as V121Fixture);
  it.skipIf(NEED_F)('the 31 single-compound spectra: 1H score (one decimal)', () => {
    const got: Record<string, number> = {};
    for (const [name, smi, formula, peaks] of STOP7_SPECTRA) {
      applySetting(FULL);
      const bundle = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(fx(name, formula, smi, peaks), {denseBaseline: true}), {}).bundle;
      got[name] = Number((scoreScientificEvidence(smi, bundle).modalityScores['1H_NMR'] as number).toFixed(1));
    }
    expect(Object.keys(got).sort()).toEqual(Object.keys(SCORES).sort());
    for (const k of Object.keys(SCORES)) expect(got[k], k).toBeCloseTo(SCORES[k], 1);
  });
  const IDS = ['FORBIDDEN_OXETE_RING_ALKENE', 'FORBIDDEN_ALKYLIDENE_OXIRANE_OXETANE', 'FORBIDDEN_ALPHA_LACTONE', 'FORBIDDEN_OXYGEN_ON_EPOXIDE_CARBON'];
  const rulesOf = (smi: string) => plausibilityViolations(smi, NO_PLAUSIBILITY_EVIDENCE).map(v => v.rule).filter(r => IDS.includes(r)).sort();
  const PLAUS: Record<string, string[]> = {"CC(C)OC1(C)OC1=O":["FORBIDDEN_ALPHA_LACTONE","FORBIDDEN_OXYGEN_ON_EPOXIDE_CARBON"],"C1=CCO1":["FORBIDDEN_OXETE_RING_ALKENE"],"C=C1CO1":["FORBIDDEN_ALKYLIDENE_OXIRANE_OXETANE"],"O=C1OC1":["FORBIDDEN_ALPHA_LACTONE"],"C1CO1":[],"C=C1COC1":[]};
  it('the ring-strain rules stop exactly these structures (and not the near-identical real ones)', () => {
    applySetting(FULL);
    for (const [smi, rules] of Object.entries(PLAUS)) expect(rulesOf(smi), smi).toEqual(rules);
  });
  it('no structure of the real-compound panel is stopped by the four ring-strain rules', () => {
    applySetting(FULL);
    expect(REAL_STRUCTURE_PANEL.filter(([, smi]) => rulesOf(smi).length).map(r => r[0])).toEqual([]);
  });
});

// [sample, formula typed in, rank of the target structure, number of ranked candidates] - through the whole flow (executeSixStepAnalysis, step budget only), everything on
const RANKS: [string, boolean, number | null, number][] = [
  ["M1", false, 1, 239],
  ["M1b", false, 1, 240],
  // v1.4.2 stop 34 (deferred second pass, V12_CONFIG.v123.deferredSecondPass): M4 277 -> 289 candidates (target still not generated), M5 and M5b target not generated -> 1 (172 -> 274 candidates); STOP34_REPORT.md A.7
  ["M4", false, null, 289],
  ["M5", false, 1, 274],
  ["M5b", false, 1, 274],
  ["M6", false, 1, 7],
  ["M7", false, 1, 36],
  ["Q1", false, 1, 38],
  ["Q2", false, 1, 42],
  ["Q3", false, 1, 153],
  ["P1", false, 1, 12],
  ["P2", false, 1, 13],
  ["P3", false, 1, 12],
  ["P4", false, 1, 12],
  ["B1", false, 3, 12],
  ["v121/S1", false, 1, 13],
  ["v121/S2", false, 3, 12],
  ["v121/S3", false, 4, 9],
  ["v121/G1", false, 1, 11],
  ["v121/G3", false, 1, 6],
  ["v121/E1", false, 1, 6],
  ["v121/D1", false, null, 0],
  ["v130/ALK0", false, 2, 211],   // 6 without round3 (tests/v14/v140FlagOnSnapshot.test.ts)
  ["v130/ALK1", false, 2, 211],   // 5 without round3
  ["v130/AMD1", false, 1, 11],
  ["v130/CR0", false, 2, 10],
  ["v130/CR1", false, 1, 12],
  ["v130/EST1", false, 1, 3],
  ["v130/NITROX", false, 1, 12],
  ["v130/HCA", true, 1, 230],
  ["v131/ASY1", false, 1, 24],
  ["v131/CR2", false, 2, 13],
  ["v131/ETH1", false, 1, 10],
  ["v132/M1y575", false, 1, 239],
  ["v132/M1y625", false, 1, 239],
  ["v132/M1y70", false, 1, 239],
  ["v132/M1y80", false, null, 91],
  ["v132/XYL_weak", false, 1, 1],
  ["v132/XYL_mod", false, 1, 1],
  ["v132/CYHEX_A", false, 1, 157],
  ["v132/CYHEX_B", false, 1, 157],
  ["v130/ALK1", true, 1, 1],
  ["v130/ALK0", true, 1, 1],
];
// The ONLY two samples whose target rank differs from the round3-off snapshot (tests/v14/v140FlagOnSnapshot.test.ts): the alkylcyclopropane / alkylcyclobutane competitors of the 1-octene target lose about 5 points when their ring CH2 shifts move (cyclopropane / cyclobutane classes), so the acyclic target moves up. No sample got worse.
const RANK_WITHOUT_ROUND3: Record<string, number> = {'v130/ALK0': 6, 'v130/ALK1': 5};
const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.1', 'S22_R3_SNAPSHOT_RANKS.txt');
describe('full-on + round3 snapshot: target rank of the ranking samples (V132_CASES, whole flow)', () => {
  beforeAll(() => { try { fs.writeFileSync(PROGRESS, 'sample | typed | target rank | ranked | pinned rank | pinned ranked\n'); } catch { /* the progress file is a convenience */ } });
  it('no pinned target rank is worse than the round3-off rank (only ALK0 and ALK1 differ, both better)', () => { for (const [name, , rank] of RANKS) { const was = RANK_WITHOUT_ROUND3[name]; if (was !== undefined) expect(rank!, name).toBeLessThan(was); } expect(Object.keys(RANK_WITHOUT_ROUND3).sort()).toEqual(['v130/ALK0', 'v130/ALK1']); });
  it('the pinned list is the list of samples', () => { expect(RANKS.map(r => [r[0], r[1]])).toEqual(V132_CASES.map(c => [c.sample, c.typed])); });
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}`, async () => {
      applySetting(FULL);
      const pinned = RANKS.find(r => r[0] === c.sample && r[1] === c.typed)!;
      const m = await measureV132(c, 1);
      try { fs.appendFileSync(PROGRESS, `${c.sample} | ${c.typed ? 'typed' : ''} | ${m.targetRank ?? 'none'} | ${m.ranked} | ${pinned[2] ?? 'none'} | ${pinned[3]}\n`); } catch { /* convenience */ }
      expect(m.targetRank, `${c.sample} target rank`).toBe(pinned[2]);
      expect(m.ranked, `${c.sample} candidates`).toBe(pinned[3]);
    }, 600000);
  }
});
