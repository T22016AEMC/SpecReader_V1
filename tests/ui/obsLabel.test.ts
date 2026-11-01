import {beforeAll, describe, expect, it} from 'vitest';
import {obsLabel, obsLabels, type ObservationLike} from '../../src/ui/obsLabel';
import {s1Analysis} from './s1Analysis';

// Observation id → short label (v1.2.2 DESIGN_REPORT B1.6). Ids are the engine's own (`MODALITY:file:value`); the data are synthetic.
describe('obsLabel', () => {
  it('IR ids become "IR 3353 cm⁻¹"', () => {
    expect(obsLabel('IR:synthetic-fixture.csv:3353')).toBe('IR 3353 cm⁻¹');
    expect(obsLabel('IR:a.csv:3350.4')).toBe('IR 3350 cm⁻¹');
  });
  it('¹H ids become "¹H 6.99 ppm" with two decimals', () => {
    expect(obsLabel('1H_NMR:f.csv:6.99')).toBe('¹H 6.99 ppm');
    expect(obsLabel('1H_NMR:f.csv:7.1')).toBe('¹H 7.10 ppm');
  });
  it('¹³C ids become "¹³C 65 ppm" (one decimal, whole numbers stay whole)', () => {
    expect(obsLabel('13C_NMR:f.csv:65')).toBe('¹³C 65 ppm');
    expect(obsLabel('13C_NMR:f.csv:128.46')).toBe('¹³C 128.5 ppm');
  });
  it('MS, MS/MS and ToF-SIMS ids become "MS m/z 105"', () => {
    expect(obsLabel('MS:f.csv:105')).toBe('MS m/z 105');
    expect(obsLabel('MS/MS:f.csv:77.0386')).toBe('MS/MS m/z 77.0386');
    expect(obsLabel('ToF-SIMS:f.csv:43')).toBe('ToF-SIMS m/z 43');
  });
  it('aggregate ids have fixed wording', () => {
    expect(obsLabel('1H:environment-count')).toBe('¹H 環境數');
    expect(obsLabel('1H:integral-total')).toBe('¹H 氫總數');
  });
  it('the observation list wins over parsing, and an unknown id comes back unchanged', () => {
    const obs: ObservationLike[] = [{id: 'custom-1', modality: 'IR', value: 1715.2, unit: 'cm⁻¹'}];
    expect(obsLabel('custom-1', obs)).toBe('IR 1715 cm⁻¹');
    expect(obsLabel('something-else', obs)).toBe('something-else');
    expect(obsLabel('IR:f.csv:not-a-number')).toBe('IR:f.csv:not-a-number');
  });
  it('several ids are joined without duplicates', () => {
    expect(obsLabels(['IR:f.csv:1235', 'IR:f.csv:1175', 'IR:f.csv:1235'])).toBe('IR 1235 cm⁻¹、IR 1175 cm⁻¹');
  });
});

describe('obsLabel on the real S1 trace', () => {
  let observations: ObservationLike[] = [];
  beforeAll(async () => { observations = (await s1Analysis()).reasoningTrace!.observations as unknown as ObservationLike[]; }, 60000);
  it('every observation id of the analysis resolves to a short label (no raw id is left)', () => {
    expect(observations.length).toBe(14);
    for (const o of observations) expect(obsLabel(o.id, observations)).not.toBe(o.id);
    expect(obsLabel('1H_NMR:synthetic-fixture.csv:4.75', observations)).toBe('¹H 4.75 ppm');
  });
});
