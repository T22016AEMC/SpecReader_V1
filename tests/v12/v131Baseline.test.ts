import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureV131, V131_CASES} from '../helpers/v131Samples';
import type {V131Measure} from '../helpers/v131Samples';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.1 "before" baseline: every parsimony sample of tests/helpers/v131Samples.ts (dense IR baseline, step budget only) with useV131 = false equals the numbers recorded on the unchanged v1.3.0 engine (5559f2a):
// the flag-off guarantee. Ranks, scores and order of the top six; no candidate carries a parsimony prior. Deterministic (no wall-clock budget).
// vitest.flagoff.config.ts / flagoff130 would turn useV123 / useV130 off for the whole suite; this file sets what the baseline needs itself (like v130Baseline).
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131};
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = false; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; });
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v131.baseline.json'), 'utf8')).samples as V131Measure[];

describe('v1.3.1 baseline of the parsimony samples (flag off = v1.3.0)', () => {
  it('covers every case', () => { expect(baseline).toHaveLength(V131_CASES.length); });
  for (const c of V131_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''} equals the recorded baseline`, async () => {
      const recorded = baseline.find(b => b.sample === c.sample && b.typed === c.typed)!;
      expect(recorded).toBeDefined();
      const now = await measureV131(c);
      expect(now).toEqual(recorded);
      expect(now.top.every(t => t.prior === 0)).toBe(true);
    }, 300000);
  }
});
