import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irCandidateBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {measureV132, V132_CASES} from '../helpers/v132Samples';
import {applySetting, clearEnvCache, initTruthTools, type Setting} from '../helpers/v140Truth';
import {openV132Gates} from '../helpers/v132Gates';
import {carbonylProbe, irProbe, setV141} from '../helpers/v141Probe';

// v1.4.1 stop 18: SNAPSHOT of the IR round-1 rules (V12_CONFIG.useV141IR and the four groups alkylBend / esterCO / ringCarbonyl / sp2CH), flag OFF and flag ON, on top of the v1.4.0 full-on state.
// THIS IS A SNAPSHOT OF THE v1.4.1 STATE AT THE END OF STOP 18. IT DOES NOT SAY THAT THESE NUMBERS ARE CORRECT. A change in a pinned number means "the behaviour changed" and has to be looked at; it is not by itself a bug, and a pinned
// number is not a claim of accuracy. The ranges of the new bands are textbook-style and UNCALIBRATED, the +-10 cm-1 uncertainty is engineering judgement. The test sets every flag itself (so it gives the same result under the default,
// the flag-off and the flag-on configurations). Pinned: (1) the IR score of the carbonyl probes and of the D1 / D2 / D5 / ester lists (hand-written textbook positions, not measured spectra), off and on, (2) the five samples the design
// report named (M4, M5, M5b, CR0, CR2: IR and total score of the target and its rival, off and on), (3) how many of the 55 panel structures each new band applies to, (4) the target rank of every ranking sample through the whole flow
// with the v1.4.0 set and all four v1.4.1 groups on (the flag-off ranks are pinned by tests/v14/v140FlagOnSnapshot.test.ts).
const FULL: Setting = {name: 'full-on', useV140H1: true, alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true};
const SUB = ['alkylBend', 'esterCO', 'ringCarbonyl', 'sp2CH'] as const;
const was = JSON.parse(JSON.stringify({h1: V12_CONFIG.useV140H1, v: V12_CONFIG.v140, p: V12_CONFIG.useV141IR, s: V12_CONFIG.v141IR}));
let restoreGates: (() => void) | null = null;
let restoreFlags: (() => void) | null = null;
const flags = (parent: boolean, sub: Partial<typeof V12_CONFIG.v141IR> = {}) => { restoreFlags?.(); restoreFlags = setV141(parent, sub); };
beforeAll(async () => { await initTruthTools(); await initializeRDKit(); restoreGates = openV132Gates(); applySetting(FULL); clearEnvCache(); }, 120000);
afterAll(() => { restoreFlags?.(); restoreGates?.(); const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.h1; Object.assign(V12_CONFIG.v140, was.v); V12_CONFIG.useV141IR = was.p; Object.assign(V12_CONFIG.v141IR, was.s); clearEnvCache(); });

describe('v1.4.1 snapshot: flags', () => {
  it('defaults in the source: useV141IR true (v1.4.2 stop 36: on by default; was false), the four groups true (effective state = parent AND group); +-10 and 8 cm-1', () => {
    // read from the source text, because the full-on test setup (tests/helpers/v140FlagOnSetup.ts) switches the parent flag on before any test runs
    const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'engines', 'constraints', 'v12Config.ts'), 'utf8');
    expect(src).toMatch(/useV141IR: true as boolean/);   // v1.4.2 stop 36 (E): the planner switched the default on (this test reads the default itself, so the expected value changed)
    expect(src).toMatch(/v141IR: {alkylBend: true as boolean, esterCO: true as boolean, ringCarbonyl: true as boolean, sp2CH: true as boolean, bandUncertaintyCm1: 10, aliphaticChUpperUncertaintyCm1: 8}/);
    for (const s of SUB) expect(was.s[s], s).toBe(true);
    expect(V12_CONFIG.v141IR.bandUncertaintyCm1).toBe(10); expect(V12_CONFIG.v141IR.aliphaticChUpperUncertaintyCm1).toBe(8);
  });
});

// probes: IR score and the class of the missing-carbonyl item ('' = none). Carbonyl probe = peaks 2960 / C=O / 1170 / 1020 (y chosen so that ethyl acetate at 1745 scores 39.3, the figure of the design report).
const CO_PROBES: [string, string, number | number[]][] = [
  ["ethyl acetate 1745","CCOC(C)=O",1745],
  ["ethyl benzoate 1720","CCOC(=O)c1ccccc1",1720],
  ["d-valerolactone 1735","O=C1CCCCO1",1735],
  ["GBL 1795","O=C1CCCO1",1795],
  ["GBL 1775","O=C1CCCO1",1775],
  ["GBL 1760","O=C1CCCO1",1760],
  ["butenolide 1760","O=C1C=CCO1",1760],
  ["a-methylene-GBL 1765","C=C1CCOC1=O",1765],
  ["b-propiolactone 1840","O=C1CCO1",1840],
  ["b-propiolactone 1820","O=C1CCO1",1820],
  ["ethylene carbonate 1800","O=C1OCCO1",1800],
  ["ethylene carbonate 1775","O=C1OCCO1",1775],
  ["b-lactam 1765","O=C1CCN1",1765],
  ["b-lactam 1750","O=C1CCN1",1750],
  ["b-lactam 1735","O=C1CCN1",1735],
  ["NMP 1690","CN1CCCC1=O",1690],
  ["N-methylacetamide 1650","CNC(C)=O",1650],
  ["cyclopentanone 1745","O=C1CCCC1",1745],
  ["cyclohexanone 1715","O=C1CCCCC1",1715],
  ["cyclobutanone 1780","O=C1CCC1",1780],
  ["acetic anhydride 1820+1750","CC(=O)OC(C)=O",[1820,1750]],
  ["acetyl chloride 1800","CC(=O)Cl",1800],
  ["acetic acid 1710","CC(=O)O",1710],
  ["succinic anhydride 1865+1785","O=C1CCC(=O)O1",[1865,1785]],
  ["dimethyl carbonate 1750","COC(=O)OC",1750],
  ["ethyl acetate @1775","CCOC(C)=O",1775],
  ["ethyl acetate @1800","CCOC(C)=O",1800],
  ["cyclohexanone @1775","O=C1CCCCC1",1775],
  ["N-methylacetamide @1750","CNC(C)=O",1750],
  ["d-valerolactone @1775","O=C1CCCCO1",1775],
];
const CO_OFF: Record<string, [number, string]> = {
  "ethyl acetate 1745": [39.3,""],
  "ethyl benzoate 1720": [34.2,""],
  "d-valerolactone 1735": [39.3,""],
  "GBL 1795": [17.5,"ESTER"],
  "GBL 1775": [27.9,"ESTER"],
  "GBL 1760": [39.3,""],
  "butenolide 1760": [27,""],
  "a-methylene-GBL 1765": [20.2,"ESTER"],
  "b-propiolactone 1840": [13.3,"ESTER"],
  "b-propiolactone 1820": [13.5,"ESTER"],
  "ethylene carbonate 1800": [19.1,""],
  "ethylene carbonate 1775": [33.5,""],
  "b-lactam 1765": [13.3,"AMIDE"],
  "b-lactam 1750": [13.5,"AMIDE"],
  "b-lactam 1735": [14.8,"AMIDE"],
  "NMP 1690": [29.6,""],
  "N-methylacetamide 1650": [29.6,""],
  "cyclopentanone 1745": [39.3,""],
  "cyclohexanone 1715": [39.3,""],
  "cyclobutanone 1780": [39.3,""],
  "acetic anhydride 1820+1750": [50,""],
  "acetyl chloride 1800": [39.3,""],
  "acetic acid 1710": [36.4,""],
  "succinic anhydride 1865+1785": [37.8,""],
  "dimethyl carbonate 1750": [39.3,""],
  "ethyl acetate @1775": [27.9,"ESTER"],
  "ethyl acetate @1800": [15.9,"ESTER"],
  "cyclohexanone @1775": [14.8,"KETONE"],
  "N-methylacetamide @1750": [13.5,"AMIDE"],
  "d-valerolactone @1775": [27.9,"ESTER"],
};
const CO_ON: Record<string, [number, string]> = {
  "ethyl acetate 1745": [71.5,""],
  "ethyl benzoate 1720": [66.4,""],
  "d-valerolactone 1735": [71.5,""],
  "GBL 1795": [71.5,""],
  "GBL 1775": [71.5,""],
  "GBL 1760": [71.5,""],
  "butenolide 1760": [71.5,""],
  "a-methylene-GBL 1765": [71.5,""],
  "b-propiolactone 1840": [58.1,""],
  "b-propiolactone 1820": [58.1,""],
  "ethylene carbonate 1800": [39.3,""],
  "ethylene carbonate 1775": [39.3,""],
  "b-lactam 1765": [29.6,""],
  "b-lactam 1750": [29.6,""],
  "b-lactam 1735": [29.6,""],
  "NMP 1690": [29.6,""],
  "N-methylacetamide 1650": [29.6,""],
  "cyclopentanone 1745": [39.3,""],
  "cyclohexanone 1715": [39.3,""],
  "cyclobutanone 1780": [39.3,""],
  "acetic anhydride 1820+1750": [50,""],
  "acetyl chloride 1800": [39.3,""],
  "acetic acid 1710": [36.4,""],
  "succinic anhydride 1865+1785": [37.8,""],
  "dimethyl carbonate 1750": [39.3,""],
  "ethyl acetate @1775": [54.8,"ESTER"],
  "ethyl acetate @1800": [42.7,"ESTER"],
  "cyclohexanone @1775": [14.8,"KETONE"],
  "N-methylacetamide @1750": [13.5,"AMIDE"],
  "d-valerolactone @1775": [54.8,"ESTER"],
};
const LIST_PEAKS: Record<string, number[][]> = {
  D1: [[2960,10],[2930,15],[2870,40],[1465,55],[1375,60]],
  D2: [[3030,50],[2920,60],[1605,65],[1495,40],[1460,60],[730,15],[695,10]],
  D5: [[3020,60],[2960,10],[2930,15],[1655,85],[1460,55],[965,45]],
  ESTER: [[2985,40],[1745,8],[1470,70],[1375,35],[1240,12],[1050,25]],
};
const LIST_SMILES: Record<string, string[]> = {
  D1: ["CCCCCCC","CC(C)CCCC","Cc1ccccc1","CCCCOCC"],
  D2: ["Cc1ccccc1","c1ccccc1","C=CCCCCCC","CCCCCCC"],
  D5: ["CCCCCCCC","C=CCCCCCC","CCCCC=CCC","C1=CCCCCCC1"],
  ESTER: ["CCOC(C)=O","CCOCC","CC(C)=O","CCCCCC","O=C1CCCO1"],
};
const LISTS_OFF: Record<string, number[]> = {
  "D1": [69.2,69.2,75.5,69.2],
  "D2": [72.3,61.6,13.5,10.7],
  "D5": [53.9,62.3,62.3,62.3],
  "ESTER": [32.7,39.9,28.3,14.4,32.7],
};
const LISTS_ON: Record<string, number[]> = {
  "D1": [84.9,84.9,84.9,84.9],
  "D2": [78.1,70.1,36.1,24.9],
  "D5": [56.2,74.5,74.5,74.5],
  "ESTER": [77.8,59.5,47.8,33.9,66.5],
};
const coOf = (mode: 'off' | 'on') => Object.fromEntries(CO_PROBES.map(([n, s, c]) => { const p = carbonylProbe(s, c); return [n, [p.ir, p.missing.map(m => m.replace('IR:carbonyl-missing:', '')).join('+')]]; }));
const listsOf = () => Object.fromEntries(Object.entries(LIST_PEAKS).map(([n, pk]) => [n, LIST_SMILES[n].map(s => irProbe(s, pk.map(([x, y]) => ({x, y}))).ir)]));

describe('v1.4.1 snapshot: IR probes, flag off and flag on', () => {
  it('flag off (useV141IR false): the carbonyl probes are the v1.4.0 scores', () => { flags(false); expect(coOf('off')).toEqual(CO_OFF); });
  it('flag off: the D1 / D2 / D5 / ester lists are the v1.4.0 scores', () => { flags(false); expect(listsOf()).toEqual(LISTS_OFF); });
  it('flag on (all four groups): the carbonyl probes', () => { flags(true); expect(coOf('on')).toEqual(CO_ON); });
  it('flag on (all four groups): the D1 / D2 / D5 / ester lists', () => { flags(true); expect(listsOf()).toEqual(LISTS_ON); });
  it('parent on with the four groups off = flag off', () => { flags(true, {alkylBend: false, esterCO: false, ringCarbonyl: false, sp2CH: false}); expect(coOf('off')).toEqual(CO_OFF); expect(listsOf()).toEqual(LISTS_OFF); });
  it('parent off with the four groups on = flag off', () => { flags(false); expect(V12_CONFIG.v141IR.ringCarbonyl).toBe(true); expect(coOf('off')).toEqual(CO_OFF); });
});

const PAIRS: [string, string, string][] = [["M4","CC(C)=CCCOC(C)=O","CC(=O)CCOC=C(C)C"],
  ["M5","CC(C)=CCOC(C)=O","CC(=O)COC=C(C)C"],
  ["M5b","CC(C)=CCOC(C)=O","CC(=O)COC=C(C)C"],
  ["v130/CR0","Cc1ccc(O)cc1","Cc1ccc(Oc2ccc(C)cc2)cc1"],
  ["v131/CR2","Cc1ccc(O)cc1","Cc1ccc(C2OC2c2ccc(C)cc2)cc1"]];
const PAIRS_OFF: Record<string, number[]> = {
  "M4": [44.3,60.3,76.6,69.7],
  "M5": [44.3,60.3,76.1,69.6],
  "M5b": [44.3,60.3,75,68.6],
  "v130/CR0": [45.7,58.8,71.9,81.7],
  "v131/CR2": [45.7,58.8,71.6,75],
};
const PAIRS_ON: Record<string, number[]> = {
  "M4": [75,73.5,89,75],
  "M5": [75,73.5,88.6,75],
  "M5b": [75,73.5,87.5,73.9],
  "v130/CR0": [48.6,61.8,73.3,82.9],
  "v131/CR2": [48.6,61.8,72.9,76.3],
};
describe('v1.4.1 snapshot: the five samples of the design report (IR target / IR rival / total target / total rival)', () => {
  const run = () => Object.fromEntries(PAIRS.map(([id, t, r]) => {
    const f = loadV123(id), b = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
    const lt = scoreScientificEvidence(t, b), lr = scoreScientificEvidence(r, b), r1 = (v: number) => Number(v.toFixed(1));
    return [id, [r1(lt.modalityScores.IR as number), r1(lr.modalityScores.IR as number), r1(lt.totalScore), r1(lr.totalScore)]];
  }));
  it('flag off', () => { flags(false); expect(run()).toEqual(PAIRS_OFF); });
  it('flag on: M4 / M5 / M5b target IR no longer below the rival (-16.0 -> +1.5); CR0 / CR2 do not move relative to the rival (-13.1)', () => {
    flags(true); const got = run(); expect(got).toEqual(PAIRS_ON);
    for (const id of ['M4', 'M5', 'M5b']) expect(got[id][0] - got[id][1], id).toBeGreaterThanOrEqual(0);
    for (const id of ['v130/CR0', 'v131/CR2']) expect(got[id][0] - got[id][1], id).toBeCloseTo(PAIRS_OFF[id][0] - PAIRS_OFF[id][1], 0);
  });
});

const GATES: Record<string, number> = {
  "lactone-r5": 4,
  "lactone-r4": 1,
  "lactam-r4": 0,
  "carbonate-r5": 1,
  "sp2-ch": 25,
  "alkyl-bend-asym": 51,
  "ch3-bend-sym": 11,
  "ester-co-hi": 8,
  "ester-co-lo": 8,
};
describe('v1.4.1 snapshot: how many of the 55 panel structures each new band applies to', () => {
  it('flag on', () => {
    flags(true);
    const count = (id: string) => REAL_STRUCTURE_PANEL.filter(([, smi]) => irCandidateBands(smi, true).some(k => k.id === id)).length;
    expect(Object.fromEntries(Object.keys(GATES).map(id => [id, count(id)]))).toEqual(GATES);
  });
  it('flag off: none', () => { flags(false); for (const id of Object.keys(GATES)) expect(REAL_STRUCTURE_PANEL.some(([, smi]) => irCandidateBands(smi, true).some(k => k.id === id)), id).toBe(false); });
});

// [sample, formula typed in, rank of the target structure, number of ranked candidates] - through the whole flow (executeSixStepAnalysis, step budget only), the v1.4.0 set and all four v1.4.1 groups on
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
  ["v130/ALK0", false, 5, 211],
  ["v130/ALK1", false, 5, 211],
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
const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.1', 'STOP18_SNAPSHOT_RANKS.txt');
describe('v1.4.1 snapshot: target rank of the ranking samples (V132_CASES, whole flow), flag on', () => {
  beforeAll(() => { try { fs.writeFileSync(PROGRESS, 'sample | typed | target rank | ranked | pinned rank | pinned ranked\n'); } catch { /* the progress file is a convenience */ } });
  it('the pinned list is the list of samples', () => { expect(RANKS.map(r => [r[0], r[1]])).toEqual(V132_CASES.map(c => [c.sample, c.typed])); });
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}`, async () => {
      applySetting(FULL); flags(true);
      const pinned = RANKS.find(r => r[0] === c.sample && r[1] === c.typed)!;
      const m = await measureV132(c, 1);
      try { fs.appendFileSync(PROGRESS, `${c.sample} | ${c.typed ? 'typed' : ''} | ${m.targetRank ?? 'none'} | ${m.ranked} | ${pinned[2] ?? 'none'} | ${pinned[3]}\n`); } catch { /* convenience */ }
      expect(m.targetRank, `${c.sample} target rank`).toBe(pinned[2]);
      expect(m.ranked, `${c.sample} candidates`).toBe(pinned[3]);
    }, 600000);
  }
});
