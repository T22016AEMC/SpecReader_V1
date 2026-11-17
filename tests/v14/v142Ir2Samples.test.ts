import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {s26RulesOff} from '../helpers/v142S26Off';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {applySetting, clearEnvCache, initTruthTools, type Setting} from '../helpers/v140Truth';
import {openV132Gates} from '../helpers/v132Gates';
import {setV141} from '../helpers/v141Probe';
import {setV142} from '../helpers/v142Probe';

// v1.4.2 stop 25 (1): the five tie samples of the design report (notes/v1.4.2/IR_ROUND2_DESIGN.md, 3a) through the whole flow, ir.alkeneOOP off and on, on top of the v1.4.0 full-on set and all four v1.4.1 groups.
// 1-octene samples ALK0 / ALK1 (the target has four or more CH2 in a row, the rivals in the top ranks have none) improve; bisphenol A and its two diaryl-butene isomers (B1, v121/S2, v121/S3) are NOT separated by ANY IR rule of this round
// (the rings are all para-substituted with OH, the C=C is tetrasubstituted): ranks, IR difference and score difference are pinned to "unchanged" and MUST NOT be tuned to separate them (design report 7, point 1).
// THIS IS A SNAPSHOT OF THE v1.4.2 STATE: the numbers come from synthetic peak lists and do not say that any number is correct. ALK0 / ALK1 improve only because the synthetic tables mark 722-725.
const FULL: Setting = {name: 'full-on', useV140H1: true, alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true};
const was = JSON.parse(JSON.stringify({h1: V12_CONFIG.useV140H1, v: V12_CONFIG.v140}));
let restoreGates: (() => void) | null = null, restore141: (() => void) | null = null, restore142: (() => void) | null = null;
const flag142 = (on: boolean) => { restore142?.(); restore142 = setV142(on); };
beforeAll(async () => { await initTruthTools(); await initializeRDKit(); restoreGates = openV132Gates(); restore141 = setV141(true); applySetting(FULL); clearEnvCache(); }, 120000);
afterAll(() => { restore142?.(); restore141?.(); restoreGates?.(); const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.h1; Object.assign(V12_CONFIG.v140, was.v); clearEnvCache(); });
// v1.4.2 stop 26: this file pins a state BEFORE the stop-26 nmrshiftdb2 class shifts (no flag of their own; they sit under v140.oxygen / v140.calibration2), so they are switched off here.
// The combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots. No expected value of this file was changed.
const restoreS26 = s26RulesOff(); afterAll(() => restoreS26());

interface Row {rank: number | null; ranked: number; irDiff: number; totalDiff: number; targetIr: number; targetTotal: number}
async function measure(sample: string): Promise<Row> {
  applySetting(FULL);
  const f = loadV123(sample), spectra = () => fixtureSpectra(f, {denseBaseline: true});
  const r = await executeSixStepAnalysis({spectra: spectra(), extraInput: {}}, SHAPE_BUDGET);
  const tc = canonNoStereo(f.targetSmiles), ranked = r.rankedCandidates, i = ranked.findIndex(x => canonNoStereo(x.smiles) === tc);
  const bundle = WorkbenchOrchestrator.prepareModeAEvidence(spectra(), {}).bundle;
  const pool = [...new Set([...ranked.slice(0, 30).map(x => x.smiles), f.targetSmiles])];
  const led = pool.map(s => ({s, l: scoreScientificEvidence(s, bundle), t: canonNoStereo(s) === tc}));
  const T = led.find(x => x.t)!, others = led.filter(x => !x.t);
  const ir = (x: typeof T) => x.l.modalityScores.IR as number;
  return {rank: i < 0 ? null : i + 1, ranked: ranked.length, irDiff: ir(T) - Math.max(...others.map(ir)), totalDiff: T.l.totalScore - Math.max(...others.map(x => x.l.totalScore)), targetIr: ir(T), targetTotal: T.l.totalScore};
}
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'notes', 'v1.4.2', 'S25_SAMPLES.txt');
const log = (s: string) => { try { fs.appendFileSync(OUT, s + '\n'); } catch { /* convenience */ } };
const r1 = (x: number) => Math.round(x * 10) / 10;

describe('v1.4.2 ir.alkeneOOP on the five tie samples (whole flow, v1.4.1 on)', () => {
  const rows: Record<string, {off?: Row; on?: Row}> = {};
  beforeAll(() => { try { fs.writeFileSync(OUT, 'sample | flag | rank | ranked | IR diff (target - best rival, pool) | total diff | target IR | target total\n'); } catch { /* convenience */ } });
  for (const sample of ['v130/ALK0', 'v130/ALK1', 'B1', 'v121/S2', 'v121/S3']) {
    it(sample, async () => {
      flag142(false); const off = await measure(sample); flag142(true); const on = await measure(sample); rows[sample] = {off, on};
      for (const [k, v] of [['off', off], ['on', on]] as const) log(`${sample} | ${k} | ${v.rank} | ${v.ranked} | ${r1(v.irDiff)} | ${r1(v.totalDiff)} | ${r1(v.targetIr)} | ${r1(v.targetTotal)}`);
      if (sample === 'v130/ALK0') {
        expect([off.rank, on.rank]).toEqual([5, 1]); expect(r1(off.totalDiff)).toBe(-2.5); expect(r1(on.totalDiff)).toBe(0.5); expect(r1(off.targetIr)).toBe(75.9); expect(r1(on.targetIr)).toBe(82.6);
      } else if (sample === 'v130/ALK1') {
        expect([off.rank, on.rank]).toEqual([5, 4]); expect(r1(off.totalDiff)).toBe(-2.6); expect(r1(on.totalDiff)).toBe(-0.8); expect(r1(off.targetIr)).toBe(77.1); expect(r1(on.targetIr)).toBe(81.5);
      } else {
        // not separated, nothing moved: rank 3 / 3 / 4, IR difference -0.3, score differences -2.2 / -2.2 / -3.2
        expect(on.rank).toBe(off.rank); expect(r1(on.irDiff)).toBe(r1(off.irDiff)); expect(r1(on.totalDiff)).toBe(r1(off.totalDiff)); expect(r1(on.irDiff)).toBe(-0.3);
        expect([off.rank, r1(off.totalDiff)]).toEqual(sample === 'B1' ? [3, -2.2] : sample === 'v121/S2' ? [3, -2.2] : [4, -3.2]);
      }
    }, 900000);
  }
  it('no other sample of the five moved by accident (flag off = the v1.4.1 snapshot ranks 5 / 5 / 3 / 3 / 4)', () => {
    expect(Object.entries(rows).map(([k, v]) => [k, v.off?.rank])).toEqual([['v130/ALK0', 5], ['v130/ALK1', 5], ['B1', 3], ['v121/S2', 3], ['v121/S3', 4]]);
  });
});
