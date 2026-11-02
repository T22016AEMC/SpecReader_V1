import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureV130, V130_CASES} from '../helpers/v130Samples';
import type {V130Measure} from '../helpers/v130Samples';

// v1.3.0 "before" baseline: every synthetic sample of tests/helpers/v130Samples.ts measured with the step budget only (dense IR baseline) equals the numbers recorded on the unchanged v1.2.3 engine.
// The flag useV130 is set to false here (whatever the default): this is the flag-off guarantee "same results as v1.2.3 (aeef61b)". Deterministic (no wall-clock budget involved).
const was = V12_CONFIG.useV130;
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV130 = false; }, 60000);
afterAll(() => { V12_CONFIG.useV130 = was; });
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v130.baseline.json'), 'utf8')).samples as V130Measure[];

describe('v1.3.0 baseline of the synthetic samples (flag off = v1.2.3)', () => {
  it('covers every case', () => { expect(baseline).toHaveLength(V130_CASES.length); });
  for (const c of V130_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''} equals the recorded baseline`, async () => {
      const recorded = baseline.find(b => b.sample === c.sample && b.typed === c.typed)!;
      expect(recorded).toBeDefined();
      expect(JSON.parse(JSON.stringify(await measureV130(c)))).toEqual(recorded);
    }, 300000);
  }
});
