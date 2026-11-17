import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {loadV132Baseline, measureV132, V132_CASES} from '../helpers/v132Samples';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.2 "before" baseline: every sample of tests/helpers/v132Samples.ts (dense IR baseline, step budget only) with useV132 = false equals the numbers recorded on the unchanged v1.3.1 engine (4267039):
// the flag-off guarantee of the strong-C=O threshold. Oxygen floor, strong-C=O flag, target rank, candidate count and the top six (SMILES and score). Deterministic (no wall-clock budget).
// v1.4.2 stop 34: the record was taken before the deferred second pass (V12_CONFIG.v123.deferredSecondPass, default on since stop 34; it changes M4, M5, M5b, whose IR has a C=C band so their ester-carbonyl state is UNKNOWN even with the IR confirmed complete), so it is off here; the default path is pinned by the v1.4.x snapshots and tests/v12/v142DeferredSecondPass.test.ts.
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, v132: V12_CONFIG.useV132, deferred: V12_CONFIG.v123.deferredSecondPass};
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; V12_CONFIG.useV132 = false; V12_CONFIG.v123.deferredSecondPass = false; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.useV132 = was.v132; V12_CONFIG.v123.deferredSecondPass = was.deferred; });
const baseline = loadV132Baseline();

describe('v1.3.2 baseline of the strong-C=O samples (flag off = v1.3.1)', () => {
  it('covers every case', () => { expect(baseline).toHaveLength(V132_CASES.length); });
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''} equals the recorded baseline`, async () => {
      const recorded = baseline.find(b => b.sample === c.sample && b.typed === c.typed)!;
      expect(recorded).toBeDefined();
      expect(await measureV132(c)).toEqual(recorded);
    }, 300000);
  }
});
