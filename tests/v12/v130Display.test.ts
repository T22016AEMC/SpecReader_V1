import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {SpectralEvidenceExtractor} from '../../src/engines/scientificEngines/spectralEvidenceExtractor';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';

// v1.3.0 (G1, stop 0): the IR finding's intensity. Before, every IR finding carried the default 85 (chemicalFeatureEngine.ts), so every band looked strong and the evidence text said "85 (透射率)".
// SYNTHETIC sample CR1 (p-cresol type, %T peak table: the 1516 and 1236 bands are strong, 1873 / 3024 are weak). Only the display of the intensity changes; nothing else reads it.
// vitest.flagoff.config.ts sets useV123 = false for the whole suite (= 1.2.2); the v1.3.0 gate needs useV123, so this file turns it on itself (like broadXhResultV123).
const wasV123 = V12_CONFIG.useV123;
const was = {total: V12_CONFIG.useV130, sub: V12_CONFIG.v130.intensityDisplay};
beforeAll(async () => { V12_CONFIG.useV123 = true; await initializeRDKit(); });
afterAll(() => { V12_CONFIG.useV123 = wasV123; V12_CONFIG.useV130 = was.total; V12_CONFIG.v130.intensityDisplay = was.sub; });
const run = () => SpectralEvidenceExtractor.extractAllEvidence(fixtureSpectra(loadV123('v130/CR1'), {denseBaseline: true}) as never);
const findingAt = (r: ReturnType<typeof run>, x: number) => r.bundle.irFindings.filter(f => f.observedPeak === x);

describe('v1.3.0 G1: IR finding intensity', () => {
  it('flag off: every finding carries the v1.2.3 default 85', () => {
    V12_CONFIG.useV130 = false;
    const r = run();
    expect(r.bundle.irFindings.length).toBeGreaterThan(10);
    expect(r.bundle.irFindings.every(f => f.observedIntensities?.length === 1 && f.observedIntensities[0] === 85)).toBe(true);
    expect(r.spectrumEvidenceList.filter(e => e.spectrumType === 'IR').every(e => String(e.intensity).startsWith('85 ('))).toBe(true);
  });
  it('flag on: the intensity is the real relative intensity of the peak (a strong band is not a weak one), never the default for all', () => {
    V12_CONFIG.useV130 = true;
    const r = run();
    const strong = findingAt(r, 1516)[0]?.observedIntensities?.[0], weak = findingAt(r, 3024)[0]?.observedIntensities?.[0];
    expect(strong).toBeDefined();
    expect(weak).toBeDefined();
    expect(strong!).toBeGreaterThan(weak!);
    expect(new Set(r.bundle.irFindings.map(f => f.observedIntensities?.[0])).size).toBeGreaterThan(3);
    const text = r.spectrumEvidenceList.filter(e => e.spectrumType === 'IR').map(e => String(e.intensity));
    expect(text.some(t => t.startsWith('85 ('))).toBe(false);
    expect(text.every(t => t.startsWith('相對強度') || t === '強度未知')).toBe(true);
  });
  it('flag on: a peak whose intensity is unknown says so instead of showing a number', () => {
    V12_CONFIG.useV130 = true;
    const spectra = fixtureSpectra(loadV123('v130/CR1'), {denseBaseline: true}) as Record<string, any>;
    spectra.IR.points = []; for (const p of spectra.IR.peaks) p.intensityKnown = false;
    const r = SpectralEvidenceExtractor.extractAllEvidence(spectra as never);
    expect(r.bundle.irFindings.length).toBeGreaterThan(0);
    expect(r.bundle.irFindings.every(f => (f.observedIntensities ?? []).length === 0)).toBe(true);
    expect(r.spectrumEvidenceList.filter(e => e.spectrumType === 'IR').every(e => e.intensity === '強度未知')).toBe(true);
  });
});
