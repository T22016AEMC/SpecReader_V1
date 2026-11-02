import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureSample, V123_ALL_SAMPLES} from '../helpers/v123Samples';
import type {SampleMeasure} from '../helpers/v123Samples';

// v1.2.3 "before" baseline: every synthetic sample (p-cresol x4, BPA x2, PMA x2, alkene controls x5, crotonate) measured with the step budget only,
// sparse and dense IR baseline, equals the numbers recorded on the unchanged engine. Deterministic (no wall-clock budget involved).
// With the v1.2.3 total flag OFF (set here, whatever the default) this is the flag-off guarantee: same results as 1.2.2 (a60ddc0).
const wasTotal = V12_CONFIG.useV123;
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = false; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = wasTotal; });
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v123.baseline.json'), 'utf8')).samples as SampleMeasure[];

describe('v1.2.3 baseline of the synthetic samples', () => {
  it('covers every sample in both IR modes', () => {
    expect(baseline).toHaveLength(V123_ALL_SAMPLES.length * 2);
  });
  for (const sample of V123_ALL_SAMPLES) for (const mode of ['sparse', 'dense'] as const) {
    it(`${sample} ${mode} equals the recorded baseline`, async () => {
      const id = sample.replace('v121/', '');
      const recorded = baseline.find(b => b.id === id && b.mode === mode)!;
      expect(recorded).toBeDefined();
      expect(JSON.parse(JSON.stringify(await measureSample(sample, mode)))).toEqual(recorded);
    }, 300000);
  }
});
