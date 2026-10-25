import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {bidirectional1H, scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {plausibilityViolations, NO_PLAUSIBILITY_EVIDENCE} from '../../src/engines/scientificEngines/structurePlausibility';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import {SignalCharacterizationEngine} from '../../src/engines/signalCharacterizationEngine';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {buildPlausibilityEvidence} from '../../src/engines/scientificEngines/structurePlausibility';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import type {ImageSpectrumCalibration} from '../../src/types/spectrum';
import {BANDS, refPoint, syntheticSegmentedIRImage} from '../irAxisFixture';
import {mk} from '../helpers/p1bScenarios';

// Stage 3 (W4 two-way scoring, W5 plausibility, W6 IR intensity, W7 candidate merging). SYNTHETIC peak lists / images only; the tests check
// program behaviour (score direction, flags, equalities). No ranking of any real compound is asserted and nothing here says what is "accurate".
beforeAll(() => initializeRDKit(), 60000);
afterEach(() => { V12_CONFIG.useV12Constraints = false; });
const flag = (on: boolean) => { V12_CONFIG.useV12Constraints = on; };

// ---------------------------------------------------------------------------------------------------------------- W4
describe('W4 two-way 1H scoring', () => {
  const bundleOf = (peaks: object[], complete = true) => WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR': mk('1H_NMR', peaks as never, {nmrSolvent: 'CDCl3', ...(complete ? {observationCoverage: 'CONFIRMED_COMPLETE' as const} : {})})} as never, {}).bundle;
  const diethylEther = [{x: 1.21, integration: 3, multiplicity: 't', jValues: [7]}, {x: 3.48, integration: 2, multiplicity: 'q', jValues: [7]}];
  const ids = (l: ReturnType<typeof scoreScientificEvidence>) => l.entries.filter(e => e.evidenceId.startsWith('1H:')).map(e => e.evidenceId);

  it('with the flag off no two-way entries exist (v1.1.8 ledger)', () => {
    flag(false);
    const l = scoreScientificEvidence('CCCOC', bundleOf(diethylEther));
    expect(ids(l)).toEqual([]);
  });
  it('with the flag on a candidate with extra predicted environments scores lower than one whose environment count matches', () => {
    const bundle = bundleOf(diethylEther);
    flag(true);
    const exact = scoreScientificEvidence('CCOCC', bundle), extra = scoreScientificEvidence('CCCOC', bundle);
    expect(ids(exact)).toContain('1H:environment-count');
    expect(ids(extra).some(i => i.startsWith('1H:unmatched-predicted'))).toBe(true);
    const unmatched = extra.entries.filter(e => e.evidenceId.startsWith('1H:unmatched-predicted'));
    for (const e of unmatched) { expect(e.compatibility).toBe(0); expect(e.weight).toBeGreaterThan(0); }
    const countOf = (l: typeof exact) => l.entries.find(e => e.evidenceId === '1H:environment-count')!.compatibility!;
    expect(countOf(exact)).toBeGreaterThan(countOf(extra));
    expect(exact.modalityScores['1H_NMR']!).toBeGreaterThan(extra.modalityScores['1H_NMR']!);
    expect(exact.totalScore).toBeGreaterThan(extra.totalScore);
    expect(exact.scoreMeaning).toBe('UNCALIBRATED_COMPATIBILITY');
  });
  it('an unobserved OH is discounted (exchangeable factor); an unconfirmed coverage halves the penalty again', () => {
    const sc = V12_CONFIG.scoring;
    flag(true);
    const complete = scoreScientificEvidence('CCO', bundleOf([{x: 1.22, integration: 3, multiplicity: 't', jValues: [7]}, {x: 3.69, integration: 2, multiplicity: 'q', jValues: [7]}], true));
    const partial = scoreScientificEvidence('CCO', bundleOf([{x: 1.22, integration: 3, multiplicity: 't', jValues: [7]}, {x: 3.69, integration: 2, multiplicity: 'q', jValues: [7]}], false));
    const w = (l: typeof complete) => l.entries.filter(e => e.evidenceId.startsWith('1H:unmatched-predicted')).map(e => e.weight);
    expect(w(complete)).toEqual([sc.unmatchedPredictedWeight * sc.exchangeableUnmatchedFactor]);
    expect(w(partial)).toEqual([sc.unmatchedPredictedWeight * sc.exchangeableUnmatchedFactor * sc.incompleteCoverageUnmatchedFactor]);
  });
  it('the image-source factor applies to every spectrum (1.0: no ×0.5 for NMR); with the flag off the v1.1.8 ×0.5 stays', () => {
    const peaks = diethylEther;
    const spec = (digitized: boolean) => WorkbenchOrchestrator.prepareModeAEvidence({'1H_NMR': mk('1H_NMR', peaks as never, {nmrSolvent: 'CDCl3', digitizedFromImage: digitized})} as never, {}).bundle;
    const w = (b: ReturnType<typeof spec>) => scoreScientificEvidence('CCOCC', b).entries.filter(e => e.sourceModality === '1H_NMR' && e.evidenceId.startsWith('1H_NMR:'))[0].weight;
    flag(false);
    expect(w(spec(true))).toBeCloseTo(w(spec(false)) * 0.5, 9);
    flag(true);
    expect(w(spec(true))).toBeCloseTo(w(spec(false)) * V12_CONFIG.scoring.imageSourceWeightFactor, 9);
    expect(V12_CONFIG.scoring.imageSourceWeightFactor).toBe(1);
  });

  describe('unit: bidirectional1H', () => {
    const obs = (value: number, integral: number) => ({id: `o${value}`, sourceModality: '1H_NMR' as const, observationIds: [`o${value}`], originalObservedData: {position: value, relativeIntegral: integral}} as never);
    const env = (shiftPpm: number, integration: number, isExchangeable = false) => ({shiftPpm, integration, isExchangeable});
    it('a predicted environment that overlaps a matched one (≤ 0.10 ppm) and whose combined H equals the observed integral is not penalised', () => {
      const hObs = [obs(1.2, 6)], hPred = [env(1.20, 3), env(1.25, 3)];
      const out = bidirectional1H(hObs, hPred, new Map([[0, 0]]), 1, true);
      expect(out.filter(e => e.evidenceId.startsWith('1H:unmatched-predicted'))).toEqual([]);
      expect(out.find(e => e.evidenceId === '1H:environment-count')!.compatibility).toBe(1);   // 2 predicted − 1 observed − 1 overlapped
    });
    it('the same environments 0.5 ppm apart are penalised', () => {
      const out = bidirectional1H([obs(1.2, 6)], [env(1.20, 3), env(1.70, 3)], new Map([[0, 0]]), 1, true);
      expect(out.filter(e => e.evidenceId.startsWith('1H:unmatched-predicted'))).toHaveLength(1);
      expect(out.find(e => e.evidenceId === '1H:environment-count')!.compatibility!).toBeLessThan(0.5);
    });
    it('overlapping but the integral does not equal the combined H: penalised', () => {
      const out = bidirectional1H([obs(1.2, 3)], [env(1.20, 3), env(1.25, 3)], new Map([[0, 0]]), 1, true);
      expect(out.filter(e => e.evidenceId.startsWith('1H:unmatched-predicted'))).toHaveLength(1);
    });
    it('the H total compares predicted and observed non-exchangeable H; an exchangeable prediction is left out of the count', () => {
      const out = bidirectional1H([obs(1.2, 3), obs(3.5, 2)], [env(1.2, 3), env(3.5, 2), env(2.0, 1, true)], new Map([[0, 0], [1, 1]]), 1, true);
      expect(out.find(e => e.evidenceId === '1H:integral-total')!.compatibility).toBeCloseTo(1, 9);
      expect(out.find(e => e.evidenceId === '1H:environment-count')!.compatibility).toBe(1);
      const lower = bidirectional1H([obs(1.2, 3), obs(3.5, 2)], [env(1.2, 3), env(3.5, 2), env(0.9, 6)], new Map([[0, 0], [1, 1]]), 1, true);
      expect(lower.find(e => e.evidenceId === '1H:integral-total')!.compatibility!).toBeLessThan(0.1);
    });
    it('no integral scale (fewer than two matched integrals): no H-total entry', () => {
      const out = bidirectional1H([obs(1.2, 3)], [env(1.2, 3)], new Map([[0, 0]]), null, true);
      expect(out.find(e => e.evidenceId === '1H:integral-total')).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------- W5
describe('W5 plausibility: acyclic hemiacetal / orthoester', () => {
  const rules = (smiles: string) => plausibilityViolations(smiles, NO_PLAUSIBILITY_EVIDENCE).map(v => v.rule);
  it('flag off: neither rule exists (v1.1.8)', () => {
    flag(false);
    expect(rules('CC(O)OC')).toEqual([]);
    expect(rules('CC(OC)(OC)OC')).toEqual([]);
  });
  it('flag on: acyclic hemiacetal / hemiketal are rejected', () => {
    flag(true);
    expect(rules('CC(O)OC')).toEqual(['HEMIACETAL_ACYCLIC']);
    expect(rules('CC(C)(O)OC')).toEqual(['HEMIACETAL_ACYCLIC']);
    expect(rules('CC(O)OC(C)=O')).toEqual(['HEMIACETAL_ACYCLIC']);   // free OH next to an ester oxygen
  });
  it('flag on: acyclic orthoester type (≥ 3 O) is rejected', () => {
    flag(true);
    expect(rules('CC(OC)(OC)OC')).toContain('ORTHOESTER_ACYCLIC');
  });
  it('flag on: cyclic hemiacetals are kept; acetals and ketals (two OR, no OH) are not affected; plain alcohols and ethers are not affected', () => {
    flag(true);
    expect(rules('OC1CCCCO1')).toEqual([]);
    expect(rules('OC1OC(CO)C(O)C(O)C1O')).toEqual([]);
    expect(rules('CC(OC)OC')).toEqual([]);
    expect(rules('CC(C)(OC)OC')).toEqual([]);
    expect(rules('CCO')).toEqual([]);
    expect(rules('COC')).toEqual([]);
  });
  it('the existing rules are unchanged (gem-diol still its own rule)', () => {
    flag(true);
    expect(rules('CC(O)O')).toEqual(['GEM_DIOL']);
  });
  it('evidence exceptions of the existing mechanism are unchanged (a user formula still allows O–O)', () => {
    flag(true);
    expect(plausibilityViolations('COOC', NO_PLAUSIBILITY_EVIDENCE).map(v => v.rule)).toEqual(['PEROXIDE']);
    expect(plausibilityViolations('COOC', {...NO_PLAUSIBILITY_EVIDENCE, userFormula: true}).map(v => v.rule)).toEqual([]);
    expect(buildPlausibilityEvidence({observations: [], userFormula: 'C2H6O2', nitrogenEvidence: false}).userFormula).toBe(true);
  });
  it('the pipeline applies the SURGE_INSPIRED strain profile while the flag is on (flag off: none)', async () => {
    const stub = {generateStructures: async () => ({smiles: [], status: 'BOUNDED' as const, visited: 0, note: '', termination: 'GRAMMAR_EXHAUSTED' as const, complete: false, partialHypotheses: [], rejectedByComposition: 0})};
    const gen = createExhaustiveGenerator(stub);
    const req = (on: boolean) => ({formula: 'C4H6', hints: {}, budget: {timeMs: 20000, maxStates: 1e7, maxResults: 48, maxFrontier: 1, beamWidth: 1}, enumerationBudget: {timeMs: 20000, maxStates: 1e7, maxCandidates: 5000},
      ...(on ? {constraintEvidence: {observations: [], irCoversAldehydeRegion: false, nitrogenAllowed: false}} : {})});
    flag(false);
    const off = await gen.generateStructures(req(false));
    flag(true);
    const on = await gen.generateStructures(req(true));
    expect(off.smiles.some(s => s.includes('C=C=C') || /#.*1|1.*#/.test(s))).toBe(true);
    expect(on.smiles.some(s => s.includes('C=C=C'))).toBe(false);
    expect(on.smiles.length).toBeLessThan(off.smiles.length);
    expect(on.enumeration!.runs[0].v12?.path).toBe('FLEX_NO_INTEGRALS');
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------- W6
describe('W6 IR intensity', () => {
  const cal = {plotTopPx: 40, plotBottomPx: 340} as ImageSpectrumCalibration;
  const pt = (cm: number) => { const r = refPoint(cm); return {pixelX: r.pixelX, pixelY: 0, realX: r.physicalX, realY: 0}; };
  const piece = (s: ReturnType<typeof syntheticSegmentedIRImage>) => WorkbenchOrchestrator.applyPiecewiseCalibration(s, {points: [pt(3000), pt(1500), pt(500)].map(p => ({pixelX: p.pixelX, realX: p.realX})), presetId: 'IR_SCALE_BREAK_2000'});

  it('flag off: the v1.1.8 marker intensity (100 − height × 0.85) is unchanged; NMR unchanged either way', () => {
    flag(false);
    expect([40, 190, 340].map(py => SpectrumParser.pixelToPhysicalIntensity(py, cal, 'IR'))).toEqual([100 - 100 * 0.85, 100 - 50 * 0.85, 100]);
  });
  it('flag on, no traced curve: y = 100·(bottom − py)/(bottom − top), not reversed and not ×0.85', () => {
    flag(true);
    expect([40, 90, 190, 290, 340].map(py => SpectrumParser.pixelToPhysicalIntensity(py, cal, 'IR'))).toEqual([100, 83.3, 50, 16.7, 0]);
    expect([40, 190, 340].map(py => SpectrumParser.pixelToPhysicalIntensity(py, cal, '1H_NMR'))).toEqual([100, 50, 0]);
  });
  it('flag on, with a traced curve: the mark takes the curve value at its x, whatever the click height', () => {
    flag(true);
    const s = piece(syntheticSegmentedIRImage([]));
    const c = s.imageCalibration!;
    const curveY = (px: number) => { const q = s.irPixelCurve!.reduce((b, p) => (Math.abs(p.x - px) < Math.abs(b.x - px) ? p : b)); return Number((100 * (c.plotBottomPx - q.y) / (c.plotBottomPx - c.plotTopPx)).toFixed(1)); };
    for (const cm of [1240, 2960, 830]) {
      const px = refPoint(cm).pixelX;
      expect(SpectrumParser.markerIntensity(s, px, 100, c)).toBe(curveY(px));
      expect(SpectrumParser.markerIntensity(s, px, 500, c)).toBe(curveY(px));
    }
    flag(false);
    const px = refPoint(1240).pixelX;
    expect(SpectrumParser.markerIntensity(s, px, 100, c)).toBe(SpectrumParser.pixelToPhysicalIntensity(100, c, 'IR'));
  });
  it('a manual mark added on a traced image gets the curve value with the flag on, the given value with it off', () => {
    const base = piece(syntheticSegmentedIRImage([]));
    const c = base.imageCalibration!;
    const px = refPoint(1240).pixelX, py = c.plotTopPx + 10;
    const add = () => WorkbenchOrchestrator.addManualPeak(base, {x: 1240, y: 77.7, pixelX: px, pixelY: py, isCalibrated: true, signalDirection: 'ABSORPTION_VALLEY'}).peaks.find(p => p.pixelX === px && p.pixelY === py)!;
    flag(false);
    expect(add().y).toBe(77.7);
    flag(true);
    expect(add().y).toBe(SpectrumParser.markerIntensity(base, px, py, c));
    expect(add().y).not.toBe(77.7);
  });
  it('the viewer draws a marker at its own pixel position; the intensity is only a fallback and, with the flag on, the fallback is the exact inverse', () => {
    expect(SpectrumParser.markerPixelY({pixelY: 123, y: 5}, {pixelY: 99}, cal)).toBe(123);
    expect(SpectrumParser.markerPixelY({y: 5} as never, {pixelY: 99}, cal)).toBe(99);
    for (const py of [60, 140, 250, 330]) {
      flag(true);
      const y = SpectrumParser.pixelToPhysicalIntensity(py, cal, 'IR');
      expect(Math.abs(SpectrumParser.markerPixelY({y}, undefined, cal) - py)).toBeLessThan(0.5);
    }
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/SpectrumViewer.tsx'), 'utf8');
    expect(source).toContain('SpectrumParser.markerPixelY(pk, ann, effectiveCalibration)');
    expect(source).not.toMatch(/pk\.pixelY\s*\?\?\s*ann\?\.pixelY/);
  });
  it('characterizeSpectrumSignals (the function that computes normalizedIntensity; measureSpectrumSignals is a pass-through): flag off keeps the v1.1.8 order (same as y); flag on is "stronger = larger" (absorption depth)', () => {
    const s = piece(syntheticSegmentedIRImage([]));
    flag(false);
    const off = SignalCharacterizationEngine.characterizeSpectrumSignals(s).peaks.filter(p => p.id.startsWith('ir-auto-px'));
    flag(true);
    const on = SignalCharacterizationEngine.characterizeSpectrumSignals(s).peaks.filter(p => p.id.startsWith('ir-auto-px'));
    expect(on.length).toBeGreaterThan(4);
    expect(off.every(p => typeof p.normalizedIntensity === 'number')).toBe(true);   // the v1.1.8 T1 clause never checked this (undefined was read as 0)
    const byY = [...off].sort((a, b) => a.y - b.y);
    for (let i = 1; i < byY.length; i++) expect(byY[i].normalizedIntensity ?? 0).toBeGreaterThanOrEqual((byY[i - 1].normalizedIntensity ?? 0) - 1e-9);   // v1.1.8 T1 expectation
    const onByY = [...on].sort((a, b) => a.y - b.y);
    for (let i = 1; i < onByY.length; i++) expect(onByY[i].normalizedIntensity ?? 0).toBeLessThanOrEqual((onByY[i - 1].normalizedIntensity ?? 0) + 1e-9);   // reversed: lowest transmittance = strongest
    const strongest = onByY[0];
    expect(strongest.normalizedIntensity).toBe(100);
    const depth = (cm: number) => BANDS.find(b => b[0] === cm)![2];
    const norm = (cm: number) => on.find(p => Math.abs(p.x - cm) < 4)!.normalizedIntensity!;
    expect(norm(1240)).toBeGreaterThan(norm(1385));
    expect(depth(1240)).toBeGreaterThan(depth(1385));
  });
  it('numeric-file IR peaks are untouched by the flag (golden of the numeric path)', async () => {
    const { BANDS: bands, transmittance } = await import('../irAxisFixture');
    const csv = ['wavenumber,transmittance', ...Array.from({length: 1700}, (_, i) => { const x = 4000 - 2 * i; return `${x},${transmittance(x, bands).toFixed(3)}`; })].join('\n');
    const run = async () => (await SpectrumParser.parseUploadedFile(new File([csv], 'synthetic-ir.csv'), 'IR', undefined, {disableAutoPeakDetection: false})).peaks.map(p => [p.x, p.y, p.normalizedIntensity, p.relativeIntensity]);
    flag(false);
    const off = await run();
    flag(true);
    expect(await run()).toEqual(off);
  });
  it('evidence, N evidence and plausibility evidence come from prepareIR and do not change with the flag', () => {
    const make = (on: boolean) => {
      flag(on);
      const base = piece(syntheticSegmentedIRImage([]));
      const c = base.imageCalibration!;
      let s = base;
      for (const cm of [3050, 1600, 1240]) {
        // The mark id is `Date.now()` plus a random number below 1000, so marks created within the same millisecond can (rarely) collide; a person cannot click that fast.
        for (const t = Date.now(); Date.now() - t < 2;) { /* wait 2 ms */ }
        const px = refPoint(cm).pixelX;
        const py = c.plotTopPx + 20;
        s = WorkbenchOrchestrator.addManualPeak(s, {x: cm, y: SpectrumParser.markerIntensity(s, px, py, c), pixelX: px, pixelY: py, isCalibrated: true, signalDirection: 'ABSORPTION_VALLEY'});
      }
      return s;
    };
    const evidence = (on: boolean) => {
      const spec = make(on);
      flag(on);
      const plan = createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({IR: spec} as never, {}).bundle);
      return {
        ir: plan.observations.filter(o => o.modality === 'IR').map(o => [o.value, o.relativeIntensity === null ? null : Number(o.relativeIntensity.toFixed(6))]),
        nitrogen: plan.nitrogenEvidence ? {mode: plan.nitrogenEvidence.mode, allowed: plan.nitrogenEvidence.allowed} : null,
        plausibility: buildPlausibilityEvidence({observations: plan.observations, userFormula: null, nitrogenEvidence: plan.nitrogenEvidence?.mode === 'EVIDENCE'}),
      };
    };
    const off = evidence(false), on = evidence(true);
    expect(off.ir.length).toBeGreaterThan(5);
    expect(on).toEqual(off);
  });
});

// ---------------------------------------------------------------------------------------------------------------- W7
describe('W7 candidates from several (k, extra OH) readings', () => {
  it('each reading is its own run, candidates are merged and keep the readings they came from, ranking does not depend on k', async () => {
    flag(true);
    const spectra = {'1H_NMR': mk('1H_NMR', [{x: 9.2, integration: 1, multiplicity: 's'}, {x: 1.3, integration: 9, multiplicity: 's'}] as never, {nmrSolvent: 'DMSO-d6'})};
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C10H10O'}}, {timeMs: 15000, maxStates: 3_000_000});
    const run = r.reasoningTrace!.compositionSearch!.runs[0];
    const v12 = run.enumeration!.v12!;
    expect(v12.path).toBe('INVENTORY');
    expect(v12.runs.map(x => [x.k, x.extraExchangeable]).sort()).toEqual([[1, 0], [1, 1]]);
    const origins = r.solvedConstraintSpace.searchResult!.enumeration!.origins!;
    const smiles = r.solvedConstraintSpace.searchResult!.smiles;
    expect(smiles.length).toBeGreaterThan(0);
    for (const s of smiles) expect(origins[s].v12!.length).toBeGreaterThan(0);
    const scores = r.rankedCandidates.map(c => c.scientificScoreLedger!.totalScore);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1] + 1e-9);
  }, 120000);
});
