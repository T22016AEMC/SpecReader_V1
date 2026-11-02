import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {measureSample, V123_ALL_SAMPLES} from '../helpers/v123Samples';
import type {SampleMeasure} from '../helpers/v123Samples';

// v1.2.3 "before" baseline: every synthetic sample (p-cresol x4, BPA x2, PMA x2, alkene controls x5, crotonate) measured with the step budget only,
// sparse and dense IR baseline, equals the numbers recorded on the unchanged engine. Deterministic (no wall-clock budget involved).
beforeAll(() => initializeRDKit(), 60000);
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
