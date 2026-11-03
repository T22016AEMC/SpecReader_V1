import type {SpectralPeak} from '../../types/spectrum';
import {V12_CONFIG} from '../constraints/v12Config';

/**
 * v1.3.0 (E): overtone / combination bands and the anhydride pair rule. ENGINEERING JUDGEMENT, NOT CALIBRATED (numbers in V12_CONFIG.irV130, 工程判斷，未查證 — decision of the planner, stop 1).
 * Background: a monosubstituted or para-substituted benzene shows weak combination / overtone bands between about 2000 and 1650 cm-1 (the "benzene fingers"); a single weak band there (1873 of a p-cresol type)
 * is not a carbonyl, an anhydride or an acyl halide. The rule marks such a band; it is never deleted from the data.
 */
const peakIntensity = (p: SpectralPeak): number | null => (p.intensityKnown === false || !Number.isFinite(p.y) ? null : p.y);

/** Intensity of a peak as a percentage of the strongest peak of the list (null when unknown). */
export function relativeIrIntensity(p: SpectralPeak, peaks: SpectralPeak[]): number | null {
  const y = peakIntensity(p);
  const max = Math.max(0, ...peaks.map(peakIntensity).filter((v): v is number => v !== null));
  return y === null || max <= 0 ? null : 100 * y / max;
}

/** True when `p` is a weak band in 1650–2000 cm-1 (below maxRelativeIntensity % of the strongest band, intensity known) and at least minRingBands other bands lie in the ring-skeleton window (aromatic evidence). */
export function isIrOvertone(p: SpectralPeak, peaks: SpectralPeak[]): boolean {
  const C = V12_CONFIG.irV130.overtone;
  if (p.x < C.rangeCm1[0] || p.x > C.rangeCm1[1]) return false;
  const rel = relativeIrIntensity(p, peaks);
  if (rel === null || rel >= C.maxRelativeIntensity) return false;
  return peaks.filter(q => q !== p && q.id !== p.id && q.x >= C.ringRangeCm1[0] && q.x <= C.ringRangeCm1[1]).length >= C.minRingBands;
}

/** An anhydride reading needs the coupled pair: a strong C=O band near 1820 and another near 1750 (both at least minRelativeIntensity % of the strongest band). */
export function hasAnhydridePair(peaks: SpectralPeak[]): boolean {
  const C = V12_CONFIG.irV130.anhydridePair;
  const strong = (lo: number, hi: number) => peaks.some(q => q.x >= lo && q.x <= hi && (relativeIrIntensity(q, peaks) ?? 0) >= C.minRelativeIntensity);
  return strong(C.highRangeCm1[0], C.highRangeCm1[1]) && strong(C.lowRangeCm1[0], C.lowRangeCm1[1]);
}
