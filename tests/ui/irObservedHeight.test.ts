import {describe, expect, it} from 'vitest';
import {irObservedHeight, transmittanceFullScale} from '../../src/components/PeakObservationTable';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';

// v1.4.2 stop 31 (C): the observation table's "基線相對強度" (display only). A "Transmittance" unit with 0–100 values used to show 1 − y (e.g. −38.21).
// Nothing here goes near the analysis: only the number printed in the table is checked.
const peak = (x: number, y: number): SpectralPeak => ({id: `p${x}`, x, y, manualPeak: true} as unknown as SpectralPeak);
const spec = (yUnit: string, ys: [number, number][], extra: Partial<ExperimentalSpectrumData> = {}): ExperimentalSpectrumData => {
  const points = ys.map(([x, y]) => ({x, y}));
  return {yUnit, points, peaks: points.map(p => peak(p.x, p.y)), ...extra} as unknown as ExperimentalSpectrumData;
};

describe('irObservedHeight: Transmittance unit', () => {
  it('0–100 values with a "Transmittance" unit: 100 − y (was 1 − y = −38.21)', () => {
    const s = spec('Transmittance', [[3000, 98], [1715, 39.21], [1000, 97]]);
    expect(irObservedHeight(s, s.peaks[1])).toBeCloseTo(60.79, 6);
  });
  it('0–1 fractions with a "Transmittance" unit: 1 − y (unchanged)', () => {
    const s = spec('Transmittance', [[3000, 0.98], [1715, 0.3921], [1000, 0.97]]);
    expect(irObservedHeight(s, s.peaks[1])).toBeCloseTo(0.6079, 6);
  });
  it('a fraction that overshoots 1 a little (1.02) is still a fraction', () => {
    const s = spec('Transmittance', [[3000, 1.02], [1715, 0.4], [1000, 0.99]]);
    expect(irObservedHeight(s, s.peaks[1])).toBeCloseTo(0.6, 6);
  });
  it('a series with no raw points falls back to the marked peaks (0–100 → 100 − y)', () => {
    const s = spec('Transmittance', [[1715, 39.21], [3000, 90]]);
    const bare = {...s, points: []} as unknown as ExperimentalSpectrumData;
    expect(irObservedHeight(bare, bare.peaks[0])).toBeCloseTo(60.79, 6);
  });
  it('fullScale: 0–1 → 1, 0–100 → 100, empty → 1, NaN ignored', () => {
    expect(transmittanceFullScale([0.2, 0.9])).toBe(1);
    expect(transmittanceFullScale([20, 90])).toBe(100);
    expect(transmittanceFullScale([])).toBe(1);
    expect(transmittanceFullScale([NaN, 0.5])).toBe(1);
  });
});

describe('irObservedHeight: the other units and spellings do not move', () => {
  it('%Transmittance: 100 − y', () => {
    const s = spec('%Transmittance', [[3000, 98], [1715, 39.21], [1000, 97]]);
    expect(irObservedHeight(s, s.peaks[1])).toBeCloseTo(60.79, 6);
  });
  it('Absorbance: y', () => {
    const s = spec('Absorbance', [[3000, 0.02], [1715, 0.9], [1000, 0.03]]);
    expect(irObservedHeight(s, s.peaks[1])).toBeCloseTo(0.9, 6);
  });
  it('an explicit irIntensityScale TRANSMITTANCE on a unit with no wording behaves like the unit "Transmittance"', () => {
    const s = spec('', [[3000, 98], [1715, 39.21], [1000, 97]], {irIntensityScale: 'TRANSMITTANCE'} as Partial<ExperimentalSpectrumData>);
    expect(irObservedHeight(s, s.peaks[1])).toBeCloseTo(60.79, 6);
    const f = spec('', [[3000, 0.98], [1715, 0.3921], [1000, 0.97]], {irIntensityScale: 'TRANSMITTANCE'} as Partial<ExperimentalSpectrumData>);
    expect(irObservedHeight(f, f.peaks[1])).toBeCloseTo(0.6079, 6);
  });
  it('unknown unit: null (shown as 未知)', () => {
    const s = spec('arb', [[3000, 98], [1715, 39.21]]);
    expect(irObservedHeight(s, s.peaks[1])).toBeNull();
  });
});
