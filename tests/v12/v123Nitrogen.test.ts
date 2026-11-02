import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {spectrum} from '../fixtures';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {planFormulaSearch} from '../../src/engines/composition/searchPlanning';
import {scoreComposition} from '../../src/engines/composition/compositionScoring';
import type {ScoringContext} from '../../src/engines/composition/compositionScoring';
import {inferIRBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import type {CompositionHypothesis, ElementCounts} from '../../src/engines/composition/types';
import type {V12Evidence} from '../../src/engines/constraints/v12Evidence';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';

// v1.2.3 A2–A5 and the amide I display reading: nitrogen evidence that a broad O–H band, a ring band pair or a ring-explained nitro pair cannot give. SYNTHETIC IR peak tables only.
beforeAll(() => initializeRDKit(), 60000);
const wasTotal = V12_CONFIG.useV123;
afterEach(() => { V12_CONFIG.useV123 = wasTotal; });

type Mod = ExperimentalSpectrumData['modality'];
const mk = (mod: Mod, peaks: Partial<SpectralPeak>[]): ExperimentalSpectrumData => spectrum(mod, peaks.map((p, i) => ({id: `${mod}-${i}`, manualPeak: true, y: 50, ...p})) as SpectralPeak[]);
/** 1H table of a para-disubstituted arene: aromatic doublets (7.2 / 6.8 by default; `nitroLike` moves one to 8.15) and a methyl singlet. */
const h1 = (nitroLike = false) => mk('1H_NMR', [{x: nitroLike ? 8.15 : 7.2, integration: 2, multiplicity: 'd', jValues: [8.5]}, {x: nitroLike ? 7.4 : 6.8, integration: 2, multiplicity: 'd', jValues: [8.5]}, {x: 2.3, integration: 3, multiplicity: 's'}]);
const nitrogen = (ir: Partial<SpectralPeak>[], nitroLike = false) => createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR': h1(nitroLike), IR: mk('IR', ir)}, {}).bundle).nitrogenEvidence!;
const on = () => { V12_CONFIG.useV123 = true; };
const off = () => { V12_CONFIG.useV123 = false; };

describe('A2: a broad O–H band is not also the N–H band', () => {
  // a real amide I / II pair (strong) with a 3340 "sharp" N–H that sits on the broad 3338 O–H
  const amideOnBroad = [{x: 3338, y: 60, isBroad: true, shape: 'broad'}, {x: 3340, y: 58}, {x: 1660, y: 100}, {x: 1550, y: 70}] as Partial<SpectralPeak>[];
  it('flag off: the duplicate narrow 3340 counts (1.2.2)', () => { off(); expect(nitrogen(amideOnBroad).mode).toBe('EVIDENCE'); });
  it('flag on: 3340 is within 100 cm-1 of the broad band, so it is part of the O–H envelope → no N evidence', () => { on(); expect(nitrogen(amideOnBroad).mode).toBe('NONE'); });
  it('flag on: a narrow N–H well away from any broad band still counts (amide, amine doublet)', () => {
    on();
    expect(nitrogen([{x: 3300, y: 60}, {x: 1660, y: 100}, {x: 1550, y: 70}]).mode).toBe('EVIDENCE');
    expect(nitrogen([{x: 3420, y: 60}, {x: 3330, y: 55}, {x: 1620, y: 40}]).mode).toBe('EVIDENCE');
    expect(nitrogen([{x: 3330, y: 60, isBroad: true, shape: 'broad'}, {x: 3500, y: 40}, {x: 3400, y: 45}, {x: 1200, y: 20}]).mode).toBe('NONE'); // both of the doublet lie within 100 of the broad band
  });
});

describe('A3: amide I must be strong and is not a ring band', () => {
  it('a weak amide I band is insufficient (flag on), counts without the rule (flag off)', () => {
    const weak = [{x: 3300, y: 60}, {x: 1660, y: 20}, {x: 1550, y: 70}] as Partial<SpectralPeak>[];
    off(); expect(nitrogen(weak).mode).toBe('EVIDENCE');
    on(); expect(nitrogen(weak).mode).toBe('NONE');
  });
  it('with aromatic evidence an amide I at 1633 (ring pair 1633 / 1518) does not count; a strong 1655 does (acetanilide type)', () => {
    const ring = [{x: 3340, y: 60}, {x: 1633, y: 90}, {x: 1518, y: 95}] as Partial<SpectralPeak>[];
    off(); expect(nitrogen(ring).mode).toBe('EVIDENCE');
    on(); expect(nitrogen(ring).mode).toBe('NONE');
    expect(nitrogen([{x: 3300, y: 60}, {x: 1655, y: 95}, {x: 1545, y: 90}]).mode).toBe('EVIDENCE');
  });
  it('the display layer: an "amide I" reading of a 1618 / 1601 ring pair is scored down below the listing threshold (flag on), listed with the flag off', () => {
    const peaks = [1618, 1601, 1518].map((x, i) => ({id: `p${i}`, x, y: 85, manualPeak: true})) as unknown as SpectralPeak[];
    const ir = {...spectrum('IR', peaks, '%Transmittance'), irYAxisSemantics: 'TRANSMITTANCE_PERCENT'} as unknown as ExperimentalSpectrumData;
    const amide = () => inferIRBands(ir).filter(f => f.functionalGroup === '醯胺 I C=O').map(f => f.observedPeak);
    off(); expect(amide()).toContain(1618);
    on(); expect(amide()).toEqual([]);
    // a genuine amide I (1660) with an amide II partner is untouched
    const real = [1660, 1550].map((x, i) => ({id: `q${i}`, x, y: 85, manualPeak: true})) as unknown as SpectralPeak[];
    const irReal = {...spectrum('IR', real, '%Transmittance'), irYAxisSemantics: 'TRANSMITTANCE_PERCENT'} as unknown as ExperimentalSpectrumData;
    expect(inferIRBands(irReal).some(f => f.functionalGroup === '醯胺 I C=O' && f.observedPeak === 1660)).toBe(true);
  });
});

describe('A4: a nitro pair that a ring band explains needs 1H support', () => {
  // 1518 + 1357 at the same intensity (as in a flat image trace), 1601 ring band, no 1375 methyl bend
  const flat = [{x: 1601, y: 85}, {x: 1518, y: 85}, {x: 1357, y: 85}, {x: 815, y: 85}] as Partial<SpectralPeak>[];
  it('flag off: 1518 / 1357 are nitro evidence (1.2.2)', () => { off(); expect(nitrogen(flat).mode).toBe('EVIDENCE'); });
  it('flag on: no aromatic H at or above 7.9 ppm → not nitro evidence', () => { on(); expect(nitrogen(flat).mode).toBe('NONE'); });
  it('flag on: an aromatic doublet at 8.15 ppm (H ortho to NO2) supports it; 1525 / 1345 (outside the ring window) and 1550 / 1340 are untouched', () => {
    on();
    expect(nitrogen(flat, true).mode).toBe('EVIDENCE');
    expect(nitrogen([{x: 3100, y: 20}, {x: 1525, y: 95}, {x: 1345, y: 90}, {x: 850, y: 40}]).mode).toBe('EVIDENCE');
    expect(nitrogen([{x: 3100, y: 20}, {x: 1550, y: 95}, {x: 1340, y: 90}, {x: 850, y: 40}]).mode).toBe('EVIDENCE'); // aliphatic-type nitro pair, no ring band involved
  });
});

describe('A5: N beyond what the evidence needs is scored down', () => {
  const counts = (N: number): ElementCounts => ({C: 8, H: 8 + N, N, O: 1} as ElementCounts);
  const ctx = (extra: Partial<ScoringContext>): ScoringContext => ({nmr: {h1: null, c13: null, elementEvidence: [], limitations: []} as never, features: [], elementEvidence: [], isotopes: {}, hardBoundsRelaxed: false, nitrogenMode: 'EVIDENCE', ...extra});
  it('with required N = 1, N2 loses nitrogenExcess once more than N1; without the field there is no deduction (1.2.2)', () => {
    const base = scoreComposition(counts(1), 0, null, ctx({}), false).score;
    expect(scoreComposition(counts(1), 0, null, ctx({nitrogenRequired: 1}), false).score).toBeCloseTo(base, 9);
    const two = scoreComposition(counts(2), 0, null, ctx({}), false).score;
    expect(scoreComposition(counts(2), 0, null, ctx({nitrogenRequired: 1}), false).score).toBeCloseTo(two - 0.5, 9);
    expect(scoreComposition(counts(3), 0, null, ctx({nitrogenRequired: 1}), false).score).toBeCloseTo(scoreComposition(counts(3), 0, null, ctx({}), false).score - 1.0, 9);
  });
  it('the evidence object carries requiredN (one per kind of evidence) only with the flag on, and not for a user formula', () => {
    on();
    expect(nitrogen([{x: 3300, y: 60}, {x: 1660, y: 100}, {x: 1550, y: 70}]).requiredN).toBe(1);
    expect(nitrogen([{x: 2240, y: 60}, {x: 3300, y: 60}, {x: 1660, y: 100}, {x: 1550, y: 70}]).requiredN).toBe(2);
    off();
    expect(nitrogen([{x: 3300, y: 60}, {x: 1660, y: 100}, {x: 1550, y: 70}]).requiredN).toBeUndefined();
  });
});

describe('A1: a kept O count also keeps its best N-free formula', () => {
  const hyp = (formula: string, C: number, H: number, N: number, O: number, score: number): CompositionHypothesis => ({
    id: formula, formula, counts: {C, H, N, O} as ElementCounts, dbe: C - H / 2 + N / 2 + 1, monoisotopicMass: 0, massBasis: 'NONE', ionHypothesisId: null, massErrorDa: null, massErrorPpm: null, relativeConfidence: 0, calibrated: false,
    score, support: [], contradiction: [], unknown: [], generatorSupported: true, unsupportedElements: [], searched: false, sizeConfirmed: false, symmetryMultiple: 1, extraExchangeable: 0,
  }) as unknown as CompositionHypothesis;
  const evidence = {observations: [], irCoversAldehydeRegion: true, nitrogenAllowed: true} as V12Evidence;
  const feasible = () => ({feasible: true, reason: null, ms: 0, dbeNeeded: 0, vinylException: false, plain: true}) as never;
  const hyps = [hyp('C7H9NO', 7, 9, 1, 1, -0.05), hyp('C7H8O', 7, 8, 0, 1, -0.15)];
  const plan = () => planFormulaSearch(hyps, {floor: 1, strongCarbonyl: false, sources: []} as never, evidence, feasible);
  it('flag off: C7H9NO takes the (k, C, O) slot; C7H8O is "not searched" (1.2.2)', () => {
    off();
    const p = plan();
    expect(p.chosen.map(c => c.hypothesis.formula)).toEqual(['C7H9NO']);
    expect(p.notSearched.get('C7H8O')?.reason).toBe('OXYGEN_VARIANT_LIMIT');
  });
  it('flag on: both are searched, the N-free one second (the N formula is not removed and the total of 12 names is unchanged)', () => {
    on();
    const p = plan();
    expect(p.chosen.map(c => c.hypothesis.formula)).toEqual(['C7H9NO', 'C7H8O']);
    expect(p.notSearched.has('C7H8O')).toBe(false);
    V12_CONFIG.v123.nameSlots = false;
    try { expect(plan().chosen.map(c => c.hypothesis.formula)).toEqual(['C7H9NO']); } finally { V12_CONFIG.v123.nameSlots = true; }
  });
});
