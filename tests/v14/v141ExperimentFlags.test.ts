import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {
  EXPERIMENT_NAMES, activeExperiments, applyExperiments, experimentLabelText, parseExperimentParam, sanitizeExperimentNames, type ExperimentConfig,
} from '../../src/engines/constraints/experimentFlags';
import {executeAnalysisWorker} from '../../src/engines/analysisSession';
import {buildDiagnosticSummary, type DiagnosticInput} from '../../src/ui/diagnosticSummary';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.4.1 stop 20 (B): the URL parameter ?exp=h1,ir that switches the new rule sets on for one page load (src/engines/constraints/experimentFlags.ts).
// Synthetic fixtures only (the v1.3.2 sample M1); no real spectrum.
const SUB_H1 = ['alkene', 'oxygen', 'matching', 'plausibility', 'coverage', 'solvent', 'calibration2', 'round3', 'parseFix'] as const;
const SUB_IR = ['alkylBend', 'esterCO', 'ringCarbonyl', 'sp2CH'] as const;
/** the shipped defaults of the flags this file touches (written out, so that a test setup that switches flags on does not change what is asserted here) */
const DEFAULTS: ExperimentConfig = {useV140H1: false, useV141IR: false, v140: {alkene: true, oxygen: true, matching: false, plausibility: false, coverage: false, solvent: false, calibration2: false, round3: false, parseFix: false}};
const snapshot = (): ExperimentConfig => structuredClone(DEFAULTS);
const restore = () => { V12_CONFIG.useV140H1 = DEFAULTS.useV140H1; V12_CONFIG.useV141IR = DEFAULTS.useV141IR; V12_CONFIG.useV142IR = false; Object.assign(V12_CONFIG.v140, DEFAULTS.v140); };
beforeAll(restore);
afterAll(restore);

describe('parsing the exp parameter', () => {
  it('no parameter, an empty one or an unrelated one gives nothing', () => {
    for (const s of [undefined, null, '', '?', '?foo=1', '?exp', '?exp=', '?exp=,', '?exper=ir', '?EXP=ir']) expect(parseExperimentParam(s as string), String(s)).toEqual([]);
  });
  it('recognises h1 and ir, with or without the "?", in any order and case, and reports them in a fixed order without duplicates', () => {
    expect(parseExperimentParam('?exp=h1')).toEqual(['h1']);
    expect(parseExperimentParam('exp=ir')).toEqual(['ir']);
    expect(parseExperimentParam('?exp=h1,ir')).toEqual(['h1', 'ir']);
    expect(parseExperimentParam('?exp=ir,h1')).toEqual(['h1', 'ir']);
    expect(parseExperimentParam('?exp=IR,%20H1')).toEqual(['h1', 'ir']);
    expect(parseExperimentParam('?exp=ir,ir,h1,h1')).toEqual(['h1', 'ir']);
    expect(parseExperimentParam('?x=1&exp=ir&y=2')).toEqual(['ir']);
    expect(parseExperimentParam('?exp=h1&exp=ir')).toEqual(['h1', 'ir']);
  });
  it('ignores what it does not know, without an error', () => {
    expect(parseExperimentParam('?exp=foo,ir,,bar,h2,all')).toEqual(['ir']);
    expect(parseExperimentParam('?exp=%E0%A4%A')).toEqual([]);   // a broken percent escape
    expect(parseExperimentParam('?exp=h1;ir')).toEqual([]);
    expect(sanitizeExperimentNames(['h1', 3, null, {}, 'ir'])).toEqual(['h1', 'ir']);
    expect(sanitizeExperimentNames('h1')).toEqual([]);
    expect(sanitizeExperimentNames(undefined)).toEqual([]);
  });
});

describe('what the names switch on', () => {
  it('the shipped defaults have no experiment on', () => {
    expect(DEFAULTS.useV140H1).toBe(false); expect(DEFAULTS.useV141IR).toBe(false);
    expect(activeExperiments(DEFAULTS)).toEqual([]);
  });
  it('h1: the parent flag and all eight v140 sub-flags (round3 included, and the parse fix); ir stays off', () => {
    const c = snapshot(); expect(applyExperiments(['h1'], c)).toEqual(['h1']);
    expect(c.useV140H1).toBe(true); for (const k of SUB_H1) expect(c.v140[k], k).toBe(true);
    expect(c.useV141IR).toBe(false); expect(activeExperiments(c)).toEqual(['h1']);
  });
  it('ir: only useV141IR; the four group flags keep their defaults; h1 stays off', () => {
    const c = snapshot(); expect(applyExperiments(['ir'], c)).toEqual(['ir']);
    expect(c.useV141IR).toBe(true); expect(c.useV140H1).toBe(false);
    expect(c.v140).toEqual(DEFAULTS.v140);
    for (const k of SUB_IR) expect(V12_CONFIG.v141IR[k], k).toBe(true);   // not touched by apply (it takes no part of v141IR)
    expect(activeExperiments(c)).toEqual(['ir']);
  });
  it('both, none, unknown names', () => {
    const both = snapshot(); applyExperiments(['h1', 'ir'], both); expect(activeExperiments(both)).toEqual(['h1', 'ir']);
    const none = snapshot(); expect(applyExperiments([], none)).toEqual([]); expect(none).toEqual(DEFAULTS);
    const junk = snapshot(); expect(applyExperiments(['foo', 7, null], junk)).toEqual([]); expect(junk).toEqual(DEFAULTS);
    expect(applyExperiments('h1', snapshot())).toEqual([]);
  });
  it('applying never switches anything off', () => {
    const c = snapshot(); c.v140.matching = true; applyExperiments(['ir'], c); expect(c.v140.matching).toBe(true);
  });
  it('the label text of the diagnostic-summary line', () => {
    expect(experimentLabelText(['h1', 'ir'])).toBe('¹H 新規則／IR 新規則');
    expect(experimentLabelText(['ir'])).toBe('IR 新規則'); expect(experimentLabelText(['h1'])).toBe('¹H 新規則');
    expect(experimentLabelText([])).toBe(''); expect(experimentLabelText(undefined)).toBe('');
    expect(EXPERIMENT_NAMES).toEqual(['h1', 'ir']);
  });
});

describe('the diagnostic summary line', () => {
  const base = (experiments?: DiagnosticInput['experiments']): DiagnosticInput => ({
    generatedAt: 't', appVersion: 'v', resultIsCurrent: true, dataCheck: {items: [], unprovidedText: '', staleText: ''} as never, h1Peaks: [], irPeaks: [], hiddenIrGroups: 0, shownIrGroups: 0,
    panel: null, composition: null, observations: [], topCandidates: [], ...(experiments ? {experiments} : {}),
  });
  it('is printed (one line, under the header) only when an experiment is on', () => {
    const without = buildDiagnosticSummary(base()).split('\n'), none = buildDiagnosticSummary(base([])).split('\n');
    expect(without.some(l => l.includes('已啟用實驗功能'))).toBe(false);
    expect(none).toEqual(without);
    const on = buildDiagnosticSummary(base(['h1', 'ir'])).split('\n');
    expect(on.filter(l => l.includes('已啟用實驗功能'))).toEqual(['已啟用實驗功能：¹H 新規則／IR 新規則']);
    expect(on.indexOf('已啟用實驗功能：¹H 新規則／IR 新規則')).toBe(2);
    expect(on.filter(l => l !== '已啟用實驗功能：¹H 新規則／IR 新規則')).toEqual(without);   // nothing else changes
    expect(buildDiagnosticSummary(base(['ir'])).split('\n')[2]).toBe('已啟用實驗功能：IR 新規則');
  });
});

describe('the main thread tells the worker', () => {
  class FakeWorker { static made: FakeWorker[] = []; sent: unknown[] = []; onmessage: ((e: {data: unknown}) => void) | null = null; onerror: (() => void) | null = null;
    constructor() { FakeWorker.made.push(this); } postMessage(m: unknown) { this.sent.push(m); if ((m as {spectra?: unknown}).spectra) queueMicrotask(() => this.onmessage?.({data: {type: 'result', result: {}}})); } terminate() {} }
  const run = async () => { FakeWorker.made = []; vi.stubGlobal('Worker', FakeWorker); try { await executeAnalysisWorker({spectra: {}, extraInput: {}} as never); } finally { vi.unstubAllGlobals(); } return FakeWorker.made[0].sent; };
  it('with no experiment on, only the analysis input is sent (the message flow is the one before)', async () => {
    restore(); const sent = await run();
    expect(sent).toHaveLength(1); expect((sent[0] as {spectra: unknown}).spectra).toBeDefined();
  });
  it('with experiments on, an "experiments" message goes first, then the input', async () => {
    restore(); applyExperiments(['ir']); let sent = await run();
    expect(sent).toHaveLength(2); expect(sent[0]).toEqual({type: 'experiments', names: ['ir']}); expect((sent[1] as {spectra: unknown}).spectra).toBeDefined();
    restore(); applyExperiments(['h1', 'ir']); sent = await run(); expect(sent[0]).toEqual({type: 'experiments', names: ['h1', 'ir']});
    restore();
  });
});

describe('the worker applies the flags to ITS configuration and reports what is on', () => {
  // The worker module runs here under a stub `self` (a Web Worker is not available in node): its own onmessage handler, its own applyExperiments call, its own report in result.runtime.
  const posted: {type?: string; result?: {runtime?: {experiments?: string[]}}; error?: string}[] = [];
  let onmessage: (e: {data: unknown}) => Promise<void>;
  beforeAll(async () => {
    await initializeRDKit();
    (globalThis as unknown as {self: unknown}).self = {postMessage: (m: never) => { posted.push(m); }};
    await import('../../src/workers/modeA.worker');
    onmessage = (globalThis as unknown as {self: {onmessage: typeof onmessage}}).self.onmessage;
  }, 120000);
  const input = () => { const f = loadV123('M1'); return {spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: {molecularFormula: f.formula}}; };
  const analyse = async () => { posted.length = 0; await onmessage({data: input()}); const r = posted.find(m => m.type === 'result'); expect(r, JSON.stringify(posted.map(p => p.error))).toBeDefined(); return r!.result!.runtime!.experiments; };

  it('no message: the configuration is the default and the worker reports no experiment', async () => {
    restore();
    expect(await analyse()).toEqual([]);
    expect(V12_CONFIG.useV140H1).toBe(false); expect(V12_CONFIG.useV141IR).toBe(false);
  }, 300000);
  it('an "ir" message changes the worker configuration (before it: off), the analysis then reports it; ¹H stays off', async () => {
    restore(); expect(V12_CONFIG.useV141IR).toBe(false);
    await onmessage({data: {type: 'experiments', names: ['ir', 'bogus']}});
    expect(V12_CONFIG.useV141IR).toBe(true); expect(V12_CONFIG.useV140H1).toBe(false);
    expect(await analyse()).toEqual(['ir']);
    restore();
  }, 300000);
  it('an "h1,ir" message switches on every ¹H flag too', async () => {
    restore();
    await onmessage({data: {type: 'experiments', names: ['h1', 'ir']}});
    expect(V12_CONFIG.useV140H1).toBe(true); for (const k of SUB_H1) expect(V12_CONFIG.v140[k], k).toBe(true);
    expect(await analyse()).toEqual(['h1', 'ir']);
    restore();
  }, 300000);
  it('a message with nothing recognised changes nothing', async () => {
    restore();
    await onmessage({data: {type: 'experiments', names: ['x', 5]}});
    expect(snapshot()).toEqual(DEFAULTS);
  });
});
