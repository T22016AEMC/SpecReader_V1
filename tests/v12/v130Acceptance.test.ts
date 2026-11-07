import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureV130, V130_CASES} from '../helpers/v130Samples';
import type {V130Measure} from '../helpers/v130Samples';

// v1.3.0 stop 1 acceptance (flag useV130 ON): the rank of the target of every synthetic sample against the v1.2.3 baseline (tests/goldens/v130.baseline.json, flag off). Step budget only, dense IR baseline.
// Rules: no sample gets worse; the carboxylic acid without any carbonyl band (C16H16O3 type) no longer ranks before p-cresol (it ranked first); everything else as recorded.
// vitest.flagoff.config.ts sets useV123 = false for the whole suite (= 1.2.2); the v1.3.0 gate needs useV123, so this file turns it on itself (like broadXhResultV123).
const wasV123 = V12_CONFIG.useV123;
const was = V12_CONFIG.useV130, wasV131 = V12_CONFIG.useV131;
// v1.3.1: this file pins the v1.3.0 ranks, so the v1.3.1 total flag is off here (the v1.3.1 changes are measured in v131Acceptance.test.ts; ALK0 moves 27 -> 26 there through the parsimony prior)
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = false; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = wasV123; V12_CONFIG.useV130 = was; V12_CONFIG.useV131 = wasV131; });
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v130.baseline.json'), 'utf8')).samples as V130Measure[];
const ACID_C16 = 'Cc1ccc(C(O)(C(=O)O)c2ccc(C)cc2)cc1';
const EXPECTED_RANK: Record<string, number> = {'v130/CR1': 1, 'v130/CR0': 2, 'v130/NITROX': 1, 'v130/EST1': 1, 'v130/AMD1': 1, 'v130/HCA': 1, 'v130/ALK1': 27, 'v130/ALK0': 27, M1: 1, P1: 1, P2: 1, P3: 1, P4: 1, B1: 1};

describe('v1.3.0 stop 1 acceptance: ranks against the v1.2.3 baseline', () => {
  for (const c of V130_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}: target rank ${EXPECTED_RANK[c.sample]} and not worse than the baseline`, async () => {
      const before = baseline.find(b => b.sample === c.sample && b.typed === c.typed)!;
      const after = await measureV130(c);
      expect(after.targetRank).toBe(EXPECTED_RANK[c.sample]);
      expect(after.targetRank!).toBeLessThanOrEqual(before.targetRank!);
      if (c.sample === 'v130/CR1') {
        const place = (m: V130Measure, smiles: string) => m.top5.findIndex(t => t.smiles === smiles);
        expect(place(before, ACID_C16)).toBe(0);                                  // before: the acid ranked first
        expect(place(after, ACID_C16)).toBeGreaterThan(place(after, 'Cc1ccc(O)cc1')); // after: behind p-cresol
      }
    }, 300000);
  }
});
