import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irCandidateBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {measureV132, V132_CASES} from '../helpers/v132Samples';
import {applySetting, clearEnvCache, initTruthTools, type Setting} from '../helpers/v140Truth';
import {openV132Gates} from '../helpers/v132Gates';
import {setV141} from '../helpers/v141Probe';
import {BASE6, ir2Probe, negProbe, setV142, withPeaks} from '../helpers/v142Probe';

// v1.4.2 stop 25 (4): SNAPSHOT of the IR round-2 rules (V12_CONFIG.useV142IR with ir2.alkeneOOP AND ir2.negativeEvidence all on) on top of the v1.4.0 full-on state and the four v1.4.1 groups.
// THIS IS A SNAPSHOT OF THE v1.4.2 STATE: IT DOES NOT SAY THAT THESE NUMBERS ARE CORRECT. A change in a pinned number means "the behaviour changed" and has to be looked at; it is not by itself a bug and a pinned number is
// not a claim of accuracy. The ranges of the new bands are textbook-style and UNCALIBRATED, the +-10 cm-1, the shares, the cap and the data gate are engineering judgement, and the probe tables are hand-written (positions in the middle of the windows:
// circular; they test wiring). The test sets every flag itself, so it gives the same result under the default, the flag-off and the flag-on configurations (the v1.4.1 and v1.4.0 snapshots set ir2 to false in their own setups).
const FULL: Setting = {name: 'full-on', useV140H1: true, alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true};
const was = JSON.parse(JSON.stringify({h1: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
let restoreGates: (() => void) | null = null, restore141: (() => void) | null = null, restore142: (() => void) | null = null;
const flags142 = (parent: boolean, sub: Parameters<typeof setV142>[1] = {}) => { restore142?.(); restore142 = setV142(parent, sub); };
beforeAll(async () => { await initTruthTools(); await initializeRDKit(); restoreGates = openV132Gates(); restore141 = setV141(true); applySetting(FULL); clearEnvCache(); }, 120000);
afterAll(() => { restore142?.(); restore141?.(); restoreGates?.(); const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.h1; Object.assign(V12_CONFIG.v140, was.v); clearEnvCache(); });

describe('v1.4.2 snapshot: flags and bands', () => {
  it('defaults in the source: useV142IR true (v1.4.2 stop 36: on by default; was false), alkeneOOP true, negativeEvidence false; +-10; the negative-evidence constants', () => {
    const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'engines', 'constraints', 'v12Config.ts'), 'utf8');
    expect(src).toMatch(/useV142IR: true as boolean/);   // v1.4.2 stop 36 (E): the planner switched the default on (this test reads the default itself, so the expected value changed)
    expect(src).toMatch(/v142IR: {alkeneOOP: true as boolean, negativeEvidence: false as boolean, bandUncertaintyCm1: 10,/);
    expect(src).toMatch(/neg: {shareA: 0\.15, shareB: 0\.075, cap: 0\.20, minMarkedPeaks: 6, edgeToleranceCm1: 10, presentNitrilePct: 3, presentNitroPct: 30, presentAlkynePct: 10}/);
  });
  it('the panel (55): how many structures each new band applies to (final SMARTS), flag on; flag off: none', () => {
    flags142(true, {negativeEvidence: true});
    const ids = ['vinylidene-oop', 'alkene-trans-oop', 'alkene-cis-oop', 'alkene-tri-oop', 'ch2-rock-720'];
    expect(ids.map(id => REAL_STRUCTURE_PANEL.filter(([, smi]) => irCandidateBands(smi, true).some(k => k.id === id)).length)).toEqual([2, 0, 1, 1, 0]);
    flags142(false); for (const id of ids) expect(REAL_STRUCTURE_PANEL.some(([, smi]) => irCandidateBands(smi, true).some(k => k.id === id)), id).toBe(false);
  });
});

describe('v1.4.2 snapshot: octene-isomer probes (IR score; candidates 1-octene, 2-octene, 2-methyl-1-heptene, 2-methyl-2-heptene, cyclohexene, vinylcyclohexane, octane)', () => {
  const CANDS = ['C=CCCCCCC', 'CC=CCCCCC', 'C=C(C)CCCCC', 'CC(C)=CCCCC', 'C1=CCCCC1', 'C=CC1CCCCC1', 'CCCCCCCC'];
  const TABLES: [string, {x: number; y: number}[], string, string][] = [
    // name, table, flag off, flag on (IR scores in CANDS order)
    // stop 29 (A, approved): the ir2 bands score only inside their cited range (strictRange, stop 27 0.2a), so the Gaussian tails outside the range are gone. Two rows changed, every drop is a WRONG candidate, the target did not move:
    //  - 1-octene row: 2-octene 70.6 -> 67.9 and 2-methyl-1-heptene 69.7 -> 67.9 (the 992 mark was 12 cm-1 outside the trans band 960-980); target 1-octene 82.6 unchanged.
    //  - cis 700 row: 1-octene, 2-methyl-1-heptene and octane 76.9 -> 75.9 (the 700 mark was 20 outside the rocking band 720-725); target cis-2-octene 83.2 unchanged.
    ['1-octene: =C-H 3080, C=C 1641, 992 / 910, rocking 722', withPeaks({x: 3080, y: 60}, {x: 1641, y: 60}, {x: 992, y: 40}, {x: 910, y: 40}, {x: 722, y: 60}), '77.7/63/63/63/57.5/72.2/50.1', '82.6/67.9/67.9/63/62.4/72.2/55'],
    ['trans-2-octene: 965 and 722', withPeaks({x: 965, y: 40}, {x: 722, y: 70}), '67.3/67.3/67.3/67.3/59.8/59.8/67.3', '73.3/80.7/73.3/67.3/65.9/59.8/73.3'],
    ['vinylidene: 890', withPeaks({x: 890, y: 40}), '75.1/75.1/75.1/75.1/66.8/66.8/75.1', '75.1/75.1/83.5/75.1/66.8/66.8/75.1'],
    ['trisubstituted: 815', withPeaks({x: 815, y: 50}), '75.5/75.5/75.5/75.5/67.2/67.2/75.5', '75.5/75.5/75.5/83.3/67.2/67.2/75.5'],
    ['cis: 700', withPeaks({x: 700, y: 60}), '75.9/75.9/75.9/75.9/67.5/67.5/75.9', '75.9/83.2/75.9/75.9/74.8/67.5/75.9'],
    ['chain rocking only: 722', withPeaks({x: 722, y: 60}), '75.9/75.9/75.9/75.9/67.5/67.5/75.9', '83.2/83.2/83.2/75.9/74.8/67.5/83.2'],
  ];
  for (const [name, table, off, on] of TABLES) it(name, () => {
    flags142(false); expect(CANDS.map(s => ir2Probe(s, table).ir).join('/'), 'off').toBe(off);
    flags142(true, {negativeEvidence: true}); expect(CANDS.map(s => ir2Probe(s, table).ir).join('/'), 'on').toBe(on);
  });
});

describe('v1.4.2 snapshot: negative-evidence probes (peak table of 6 marks = the C-H base table + 1050; the band, where present, at the middle of its window)', () => {
  const P: [string, string, number, number, string, number, number][] = [
    // name, smiles, band x, IR missing, deducted item, share, IR with the band (no item)
    ['acetonitrile', 'CC#N', 2245, 65.5, 'IR:neg:nitrile', 0.15, 76.3],
    ['nitromethane', 'C[N+](=O)[O-]', 1555, 58.3, 'IR:neg:nitro', 0.15, 76.3],
    ['1-hexyne', 'C#CCCCC', 3300, 70.1, 'IR:neg:alkyneCH', 0.075, 72.2],
  ];
  for (const [name, smi, bx, irMissing, item, share, irBand] of P) it(name, () => {
    flags142(true, {negativeEvidence: true});
    const miss = negProbe(smi), has = negProbe(smi, {peaks: [...BASE6, {x: bx, y: 40}]});
    expect(miss.ids).toEqual([item]); expect(miss.share[0]).toBeCloseTo(share, 6); expect(miss.ir).toBe(irMissing);
    expect(has.ids).toEqual([]); expect(has.ir).toBe(irBand);
    flags142(true, {negativeEvidence: false}); const off = negProbe(smi); expect(off.ids).toEqual([]); expect(off.ir).toBeGreaterThan(irMissing); // sub-flag off: no deduction, the IR score is higher
  });
});

// [sample, formula typed in, rank of the target structure, number of ranked candidates] - through the whole flow (executeSixStepAnalysis, step budget only), the v1.4.0 set, the four v1.4.1 groups and ALL of v1.4.2 (alkeneOOP and
// negativeEvidence) on. Against the v1.4.1 snapshot (tests/v14/v141FlagOnSnapshot.test.ts): ALK0 5 -> 1, ALK1 5 -> 4; the others as they were (no sample of the ranking set has a nitrile, nitro or terminal alkyne target).
const RANKS: [string, boolean, number | null, number][] = [
  // v1.4.2 stop 34 (deferred second pass, V12_CONFIG.v123.deferredSecondPass): M4 277 -> 289 candidates (target still not generated), M5 and M5b target not generated -> 1 (172 -> 274 candidates); STOP34_REPORT.md A.7
  ["M1", false, 1, 239], ["M1b", false, 1, 240], ["M4", false, null, 289], ["M5", false, 1, 274], ["M5b", false, 1, 274], ["M6", false, 1, 7], ["M7", false, 1, 36], ["Q1", false, 1, 38], ["Q2", false, 1, 42], ["Q3", false, 1, 153],
  ["P1", false, 1, 12], ["P2", false, 1, 13], ["P3", false, 1, 12], ["P4", false, 1, 12], ["B1", false, 3, 12], ["v121/S1", false, 1, 13], ["v121/S2", false, 3, 12], ["v121/S3", false, 4, 9], ["v121/G1", false, 1, 11], ["v121/G3", false, 1, 6],
  ["v121/E1", false, 1, 6], ["v121/D1", false, null, 0], ["v130/ALK0", false, 1, 211], ["v130/ALK1", false, 4, 211], ["v130/AMD1", false, 1, 11], ["v130/CR0", false, 2, 10], ["v130/CR1", false, 1, 12], ["v130/EST1", false, 1, 3], ["v130/NITROX", false, 1, 12],
  ["v130/HCA", true, 1, 230], ["v131/ASY1", false, 1, 24], ["v131/CR2", false, 2, 13], ["v131/ETH1", false, 1, 10], ["v132/M1y575", false, 1, 239], ["v132/M1y625", false, 1, 239], ["v132/M1y70", false, 1, 239], ["v132/M1y80", false, null, 91],
  ["v132/XYL_weak", false, 1, 1], ["v132/XYL_mod", false, 1, 1], ["v132/CYHEX_A", false, 1, 157], ["v132/CYHEX_B", false, 1, 157], ["v130/ALK1", true, 1, 1], ["v130/ALK0", true, 1, 1],
];
const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS = path.resolve(here, '..', '..', '..', 'notes', 'v1.4.2', 'STOP25_SNAPSHOT_RANKS.txt');
describe('v1.4.2 snapshot: target rank of the ranking samples (V132_CASES, whole flow), all of v1.4.2 on', () => {
  beforeAll(() => { try { fs.writeFileSync(PROGRESS, 'sample | typed | target rank | ranked | pinned rank | pinned ranked\n'); } catch { /* the progress file is a convenience */ } });
  it('the pinned list is the list of samples', () => { expect(RANKS.map(r => [r[0], r[1]])).toEqual(V132_CASES.map(c => [c.sample, c.typed])); });
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}`, async () => {
      applySetting(FULL); flags142(true, {alkeneOOP: true, negativeEvidence: true});
      const pinned = RANKS.find(r => r[0] === c.sample && r[1] === c.typed)!;
      const m = await measureV132(c, 1);
      try { fs.appendFileSync(PROGRESS, `${c.sample} | ${c.typed ? 'typed' : ''} | ${m.targetRank ?? 'none'} | ${m.ranked} | ${pinned[2] ?? 'none'} | ${pinned[3]}\n`); } catch { /* convenience */ }
      expect(m.targetRank, `${c.sample} target rank`).toBe(pinned[2]);
      expect(m.ranked, `${c.sample} candidates`).toBe(pinned[3]);
    }, 600000);
  }
});
