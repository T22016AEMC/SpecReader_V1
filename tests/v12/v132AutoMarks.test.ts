import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {analysisPeakCounts, buildDiagnosticSummary} from '../../src/ui/diagnosticSummary';
import type {DiagnosticInput} from '../../src/ui/diagnosticSummary';
import {fixtureSpectra, SHAPE_BUDGET} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {refPoint, syntheticSegmentedIRImage} from '../irAxisFixture';
import type {ExperimentalSpectrumData} from '../../src/types/spectrum';

// v1.3.2 task 2 (bug fixes, no flag): (F1) the analysis input of an image IR IS the peak list on the page, (F2) a re-calibration does not bring deleted peaks back, and nothing is marked automatically on load /
// calibration; the "自動尋峰" button asks for it. SYNTHETIC image only (tests/irAxisFixture.ts: segmented axis, traced curve, bands generated there).
beforeAll(() => initializeRDKit());
const pt = (cm: number) => { const r = refPoint(cm); return {pixelX: r.pixelX, realX: r.physicalX}; };
const calibrate = (s: ExperimentalSpectrumData) => WorkbenchOrchestrator.applyPiecewiseCalibration(s, {points: [pt(3000), pt(1500), pt(500)], presetId: 'IR_SCALE_BREAK_2000'});
const analysisIr = (s: ExperimentalSpectrumData) => createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({IR: s} as never, {}).bundle).observations.filter(o => o.modality === 'IR');
const isUserMark = (p: ExperimentalSpectrumData['peaks'][number]) => Boolean(p.manualPeak || p.detectionSource === 'USER_MARKED');
const round = (x: number) => Math.round(x);

describe('nothing is marked automatically on load / calibration', () => {
  it('a calibrated image IR with a traced curve and no user mark has no peaks and nothing is analysed', () => {
    const s = calibrate(syntheticSegmentedIRImage([]));
    expect(s.irPixelCurve!.length).toBeGreaterThan(1000);
    expect(s.imageCalibration?.source).toBe('USER_CORRECTED');
    expect(s.peaks).toHaveLength(0);
    expect(analysisIr(s)).toHaveLength(0);
  });
  it('re-calibrating again still marks nothing; user marks are the only peaks', () => {
    const s = calibrate(calibrate(syntheticSegmentedIRImage([1600, 830])));
    expect(s.peaks.map(p => round(p.x)).sort((a, b) => a - b)).toEqual([830, 1600]);
    expect(s.peaks.every(isUserMark)).toBe(true);
  });
});

describe('the auto-peak button asks for detection', () => {
  it('after the button the curve peaks are in the LIST (ir-auto-px…), and the analysis uses exactly the list', () => {
    const s = SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([])));
    expect(s.irAutoPeaksRequested).toBe(true);
    expect(s.peaks.length).toBeGreaterThan(8);
    expect(s.peaks.every(p => p.id.startsWith('ir-auto-px'))).toBe(true);
    const obs = analysisIr(s);
    expect(obs.map(o => round(o.value)).sort((a, b) => a - b)).toEqual(s.peaks.map(p => round(p.x)).sort((a, b) => a - b));
    expect(obs.every(o => o.origin === 'EXTRACTED')).toBe(true);
  });
  it('the button on an uncalibrated image finds nothing (it needs the calibration)', () => {
    const s = SpectrumParser.reRunAutoPeakDetection(syntheticSegmentedIRImage([]));
    expect(s.peaks).toHaveLength(0);
  });
});

describe('F1: after deleting the auto peaks the page list and the analysis input are the same', () => {
  const userIds = (s: ExperimentalSpectrumData) => new Set(s.peaks.filter(isUserMark).map(p => p.id));
  const setup = () => {
    // 2 user marks (1600, 830), then the button, then delete every auto peak
    let s = SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([1600, 830])));
    const keep = userIds(s);
    expect(keep.size).toBe(2);
    expect(s.peaks.length).toBeGreaterThan(8);
    for (const p of [...s.peaks]) if (!keep.has(p.id)) s = WorkbenchOrchestrator.deletePeak(s, p.id);
    return s;
  };
  it('list = 2 user marks and the analysis sees those 2 (before 1.3.2 it saw 10)', () => {
    const s = setup();
    expect(s.peaks).toHaveLength(2);
    const obs = analysisIr(s);
    expect(obs.map(o => round(o.value)).sort((a, b) => a - b)).toEqual([830, 1600]);
    expect(obs.every(o => o.origin === 'MANUAL')).toBe(true);
  });
  it('deleting only some auto peaks: exactly the remaining ones are analysed', () => {
    let s = SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([])));
    const gone = s.peaks.slice(0, 4).map(p => p.id);
    for (const id of gone) s = WorkbenchOrchestrator.deletePeak(s, id);
    const obs = analysisIr(s);
    expect(obs).toHaveLength(s.peaks.length);
    expect(obs.map(o => round(o.value)).sort((a, b) => a - b)).toEqual(s.peaks.map(p => round(p.x)).sort((a, b) => a - b));
  });
  it('F2: re-calibrating does not bring the deleted peaks back (list and analysis stay at 2)', () => {
    const s = calibrate(setup());
    expect(s.peaks).toHaveLength(2);
    expect(analysisIr(s)).toHaveLength(2);
    const again = SpectrumParser.reRunAutoPeakDetection(s);          // the button honours the deletions too
    expect(again.peaks).toHaveLength(2);
    expect(again.peaks.every(p => !(s.deletedPeakIds ?? []).includes(p.id))).toBe(true);
  });
  it('adding a mark after the button keeps the requested auto peaks in the list, and list = analysis input', () => {
    let s = SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([])));
    const n = s.peaks.length, c = s.imageCalibration!;
    const px = refPoint(1600).pixelX, py = c.plotTopPx + 20;
    s = WorkbenchOrchestrator.addManualPeak(s, {x: 1600, y: 50, pixelX: px, pixelY: py, isCalibrated: true, signalDirection: 'ABSORPTION_VALLEY'});
    expect(s.peaks.length).toBeGreaterThanOrEqual(n - 1);            // a mark within 3 cm-1 of an auto peak replaces it
    expect(s.peaks.filter(isUserMark)).toHaveLength(1);
    expect(analysisIr(s).map(o => round(o.value)).sort((a, b) => a - b)).toEqual(s.peaks.map(p => round(p.x)).sort((a, b) => a - b));
  });
  it('clear-all switches the request off: a later calibration marks nothing', () => {
    let s = SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([])));
    s = calibrate(SpectrumParser.clearAllPeakMarkers(s));
    expect(s.peaks).toHaveLength(0);
  });
});

describe('diagnostic summary line (IR section)', () => {
  const base = (): DiagnosticInput => ({
    generatedAt: 't', appVersion: 'x', resultIsCurrent: true, dataCheck: {items: []} as never, h1Peaks: [], irPeaks: [{position: 1740}], hiddenIrGroups: 0, shownIrGroups: 0, panel: null, composition: null, observations: [], topCandidates: [],
  });
  it('counts the observations the analysis used and the auto-detected unconfirmed ones', () => {
    const auto = analysisIr(SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([1600]))));
    expect(auto.length).toBeGreaterThan(8);
    expect(analysisPeakCounts(auto, 'IR')).toEqual({total: auto.length, autoUnconfirmed: auto.length - 1});
    const marksOnly = analysisIr(calibrate(syntheticSegmentedIRImage([1600, 830])));
    expect(analysisPeakCounts(marksOnly, 'IR')).toEqual({total: 2, autoUnconfirmed: 0});
    expect(analysisPeakCounts([], 'IR')).toBeUndefined();
    expect(analysisPeakCounts(undefined, 'IR')).toBeUndefined();
  });
  it('a user override is confirmed', () => {
    const obs = analysisIr(SpectrumParser.reRunAutoPeakDetection(calibrate(syntheticSegmentedIRImage([])))).map((o, i) => (i === 0 ? {...o, userOverride: true} : o));
    expect(analysisPeakCounts(obs, 'IR')).toEqual({total: obs.length, autoUnconfirmed: obs.length - 1});
  });
  it('the line is printed when the field is given and absent otherwise (existing snapshots unchanged)', () => {
    const without = buildDiagnosticSummary(base());
    const withLine = buildDiagnosticSummary({...base(), analysisIrPeaks: {total: 10, autoUnconfirmed: 8}});
    expect(without).not.toContain('分析使用');
    expect(withLine).toContain('- 分析使用 10 個峰，其中 8 個為自動偵測未確認');
    expect(withLine.split('\n').filter(l => l.includes('分析使用'))).toHaveLength(1);
    expect(withLine.replace(/- 分析使用 .*\n/, '')).toBe(without);
    const lines = withLine.split('\n');
    expect(lines.indexOf('■ IR 帶與校正方式')).toBeGreaterThan(-1);
    expect(lines.findIndex(l => l.startsWith('- 分析使用'))).toBeGreaterThan(lines.indexOf('■ IR 帶與校正方式'));
  });
  it('the reasoning trace of a real run carries origin on its observations (what App passes to the line)', async () => {
    const f = loadV123('M1');
    const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: {}}, SHAPE_BUDGET);
    const obs = (r.reasoningTrace as unknown as {observations: {modality: string; origin?: string}[]}).observations;
    expect(obs.some(o => o.modality === 'IR' && o.origin === 'MANUAL')).toBe(true);
    expect(analysisPeakCounts(obs as never, 'IR')!.total).toBe(obs.filter(o => o.modality === 'IR').length);
  }, 120000);
});
