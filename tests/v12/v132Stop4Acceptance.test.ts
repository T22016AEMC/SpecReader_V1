import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {loadV132Baseline, measureV132, V132_CASES} from '../helpers/v132Samples';
import {measureScenario, V132_SCENARIOS} from '../helpers/v132Scenarios';
import type {V132ScenarioMeasure} from '../helpers/v132Scenarios';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.2 stop 4 acceptance on the full pipeline (synthetic samples, step budget only): (1) one IR peak, one set of bounds; (2) the multi-band readings. Flag off = the recorded v1.3.1 numbers.
// The 43 samples are the 41 of the strong-C=O step plus the two 1-octene samples with the formula typed in; the 8 scenarios are the "with a mass" ones of the stop-3 report (EI M / M+1 / M+2 added to a fixture's IR and 1H).
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, v132: V12_CONFIG.useV132, best: V12_CONFIG.v132.bestFindingPerPeak, multi: V12_CONFIG.v132.multiBand};
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.useV132 = was.v132; V12_CONFIG.v132.bestFindingPerPeak = was.best; V12_CONFIG.v132.multiBand = was.multi; });
const setup = (on: boolean, best = true, multi = true) => { V12_CONFIG.useV132 = on; V12_CONFIG.v132.bestFindingPerPeak = best; V12_CONFIG.v132.multiBand = multi; };

const cases = loadV132Baseline();
const scenarios = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v132.scenarios.baseline.json'), 'utf8')).samples as V132ScenarioMeasure[];
const scen = (sample: string) => scenarios.find(s => s.sample === sample)!;
const FORMULA_RANK_1 = new Set(['v130/ALK0', 'v132/CYHEX_A', 'v130/AMD1']);   // the three scenarios of the stop-3 report whose formula was second behind an O / N formula

describe('with a mass: the eight scenarios', () => {
  for (const s of V132_SCENARIOS) {
    it(`${s.sample}: flag off equals the v1.3.1 record`, async () => {
      setup(false);
      expect(await measureScenario(s)).toEqual(scen(s.sample));
    }, 900000);
    it(`${s.sample}: best finding per peak alone (task 1): ${FORMULA_RANK_1.has(s.sample) ? 'the formula is first' : 'formula order unchanged'}, the final rank of the target structure is unchanged`, async () => {
      setup(true, true, false);
      const m = await measureScenario(s), b = scen(s.sample);
      expect(m.targetRank).toBe(b.targetRank);
      expect(m.formulaRank).toBe(FORMULA_RANK_1.has(s.sample) ? 1 : b.formulaRank);
    }, 900000);
    it(`${s.sample}: everything on: formula order as above, the target structure is never worse than v1.3.1`, async () => {
      setup(true);
      const m = await measureScenario(s), b = scen(s.sample);
      expect(m.formulaRank).toBeLessThanOrEqual(FORMULA_RANK_1.has(s.sample) ? 1 : b.formulaRank!);
      if (b.targetRank === null) expect(m.targetRank).toBeNull(); else { expect(m.targetRank).not.toBeNull(); expect(m.targetRank!).toBeLessThanOrEqual(b.targetRank); }
    }, 900000);
  }
});

describe('the 43 samples, everything on', () => {
  // v1.4.0 stop 15: the record (tests/goldens/v132.baseline.json) was taken before the stop-6 window corrections (v132.windows, default on, which move scores of M7, Q2 and v121/G3 by 1 point), so that sub-switch is off in this block
  // v1.4.2 stop 34: the record was taken before the deferred second pass (V12_CONFIG.v123.deferredSecondPass, default on since stop 34; it changes M4, M5, M5b, whose IR has a C=C band so their ester-carbonyl state is UNKNOWN even with the IR confirmed complete), so it is off here; the default path is pinned by the v1.4.x snapshots and tests/v12/v142DeferredSecondPass.test.ts.
  const winWas = V12_CONFIG.v132.windows, deferredWas = V12_CONFIG.v123.deferredSecondPass;
  beforeAll(() => { V12_CONFIG.v132.windows = false; V12_CONFIG.v123.deferredSecondPass = false; });
  afterAll(() => { V12_CONFIG.v132.windows = winWas; V12_CONFIG.v123.deferredSecondPass = deferredWas; });
  // expected differences from the v1.3.1 record: the three shallow-carbonyl PMA variants are found (strong-C=O step), the typed 1-octene (terminal vinyl 910 / 990 pair) moves up; for the untyped 1-octene
  // (target not found either way) and the two cyclohexenes the ranks, floors and candidate counts are the same and only scores of other candidates move slightly.
  const rescued = new Set(['v132/M1y575', 'v132/M1y625', 'v132/M1y70']);
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}`, async () => {
      setup(true);
      const now = await measureV132(c), before = cases.find(b => b.sample === c.sample && b.typed === c.typed)!;
      if (rescued.has(c.sample)) { expect(before.targetRank).toBeNull(); expect(now.targetRank).toBe(1); expect(now.floor).toBe(2); }
      else if (c.sample === 'v130/ALK1' && c.typed) { expect(before.targetRank).toBe(27); expect(now.targetRank!).toBeLessThan(27); expect(now.ranked).toBe(before.ranked); }
      else if (['v130/ALK1', 'v132/CYHEX_A', 'v132/CYHEX_B'].includes(c.sample)) { expect(now.targetRank).toBe(before.targetRank); expect(now.floor).toBe(before.floor); expect(now.ranked).toBe(before.ranked); expect(now.top[0].smiles).toBe(before.top[0].smiles); }
      else expect(now).toEqual(before);                           // rank, floor, candidate count, top six with scores: unchanged (PMA and ester samples included)
    }, 900000);
  }
});
