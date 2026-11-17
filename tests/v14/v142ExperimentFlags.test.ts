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

// v1.4.2 stop 25 (3): ?exp=ir2 (useV142IR on, only ir2.alkeneOOP at its default, does NOT imply ir) and ?exp=ir2neg (useV142IR on AND ir2.negativeEvidence on); both can be combined with h1 and ir by commas.
// The v1.4.1 tests of the same switch (v141ExperimentFlags.test.ts) are NOT changed: EXPERIMENT_NAMES stays the pair h1 / ir of v1.4.1, the two new names are added beside it. Synthetic fixtures only.
const DEFAULTS = {useV140H1: false, useV141IR: false, useV142IR: false, v140: {alkene: true, oxygen: true, matching: false, plausibility: false, coverage: false, solvent: false, calibration2: false, round3: false, parseFix: false}, v142IR: {alkeneOOP: true, negativeEvidence: false, negNitrile: false, negNitro: false, negAlkyne: false}}; // stop 30: the three single-group flags added so that restore() also resets them
const snapshot = (): ExperimentConfig => structuredClone(DEFAULTS) as unknown as ExperimentConfig;
const restore = () => {
  V12_CONFIG.useV140H1 = DEFAULTS.useV140H1; V12_CONFIG.useV141IR = DEFAULTS.useV141IR; V12_CONFIG.useV142IR = DEFAULTS.useV142IR;
  Object.assign(V12_CONFIG.v140, DEFAULTS.v140); Object.assign(V12_CONFIG.v142IR, DEFAULTS.v142IR);
};
beforeAll(restore);
afterAll(restore);

describe('parsing: ir2 and ir2neg', () => {
  it('recognises them, alone and with h1 / ir, in the fixed order h1, ir, ir2, ir2neg, case-insensitively, without duplicates', () => {
    expect(parseExperimentParam('?exp=ir2')).toEqual(['ir2']);
    expect(parseExperimentParam('?exp=ir2neg')).toEqual(['ir2neg']);
    expect(parseExperimentParam('?exp=ir2neg,ir2')).toEqual(['ir2', 'ir2neg']);
    expect(parseExperimentParam('?exp=ir2,ir,h1')).toEqual(['h1', 'ir', 'ir2']);
    expect(parseExperimentParam('?exp=H1,IR,IR2,IR2NEG')).toEqual(['h1', 'ir', 'ir2', 'ir2neg']);
    expect(parseExperimentParam('?exp=ir2&exp=h1&exp=ir2')).toEqual(['h1', 'ir2']);
    expect(sanitizeExperimentNames(['ir2neg', 'x', 'ir', 3])).toEqual(['ir', 'ir2neg']);
  });
  it('near-misses are ignored (ir3, ir2n, ir2 neg, ir2;neg, neg)', () => { for (const s of ['?exp=ir3', '?exp=ir2n', '?exp=ir2 neg', '?exp=ir2;neg', '?exp=neg']) expect(parseExperimentParam(s), s).toEqual([]); });
  it('the v1.4.1 list is unchanged', () => { expect(EXPERIMENT_NAMES).toEqual(['h1', 'ir']); });
});

describe('what ir2 and ir2neg switch on', () => {
  it('the shipped defaults: no experiment on, useV142IR false, alkeneOOP true, negativeEvidence false', () => {
    expect(activeExperiments(snapshot())).toEqual([]);
    expect(V12_CONFIG.useV142IR).toBe(false); expect(V12_CONFIG.v142IR.alkeneOOP).toBe(true); expect(V12_CONFIG.v142IR.negativeEvidence).toBe(false);
  });
  it('ir2: useV142IR on, negativeEvidence stays off, ir (v1.4.1) and h1 stay off', () => {
    const c = snapshot(); expect(applyExperiments(['ir2'], c)).toEqual(['ir2']);
    expect(c.useV142IR).toBe(true); expect(c.v142IR!.negativeEvidence).toBe(false); expect(c.useV141IR).toBe(false); expect(c.useV140H1).toBe(false);
    expect(activeExperiments(c)).toEqual(['ir2']);
  });
  it('ir2neg: useV142IR on AND negativeEvidence on; the effective state is then BOTH parts (alkeneOOP is at its default, on), so both are reported', () => {
    const c = snapshot(); expect(applyExperiments(['ir2neg'], c)).toEqual(['ir2neg']);
    expect(c.useV142IR).toBe(true); expect(c.v142IR!.negativeEvidence).toBe(true); expect(c.useV141IR).toBe(false); expect(c.useV140H1).toBe(false);
    expect(activeExperiments(c)).toEqual(['ir2', 'ir2neg']);
  });
  it('with every name: all four on; applying never switches anything off', () => {
    const c = snapshot(); applyExperiments(['h1', 'ir', 'ir2', 'ir2neg'], c); expect(activeExperiments(c)).toEqual(['h1', 'ir', 'ir2', 'ir2neg']);
    const d = snapshot(); d.v142IR!.alkeneOOP = false; applyExperiments(['ir2'], d); expect(d.v142IR!.alkeneOOP).toBe(false); // a sub-flag set elsewhere is not touched
    expect(activeExperiments(d)).toEqual([]);                                                                            // parent on, alkeneOOP off, negativeEvidence off: nothing effective
  });
  it('junk or nothing changes nothing', () => { const c = snapshot(); applyExperiments(['ir3', 7, null], c); expect(c).toEqual(snapshot()); });
  it('the labels of the diagnostic-summary line', () => {
    expect(experimentLabelText(['ir2'])).toBe('IR 第二輪（烯烴面外彎曲）');
    expect(experimentLabelText(['ir2neg'])).toBe('IR 第二輪（負向證據）');
    expect(experimentLabelText(['h1', 'ir', 'ir2', 'ir2neg'])).toBe('¹H 新規則／IR 新規則／IR 第二輪（烯烴面外彎曲）／IR 第二輪（負向證據）');
    expect(experimentLabelText(['ir'])).toBe('IR 新規則');
  });
});

describe('the diagnostic summary line', () => {
  const base = (experiments?: DiagnosticInput['experiments']): DiagnosticInput => ({
    generatedAt: 't', appVersion: 'v', resultIsCurrent: true, dataCheck: {items: [], unprovidedText: '', staleText: ''} as never, h1Peaks: [], irPeaks: [], hiddenIrGroups: 0, shownIrGroups: 0,
    panel: null, composition: null, observations: [], topCandidates: [], ...(experiments ? {experiments} : {}),
  });
  it('shows the new labels under the header, one line', () => {
    expect(buildDiagnosticSummary(base(['ir2'])).split('\n')[2]).toBe('已啟用實驗功能：IR 第二輪（烯烴面外彎曲）');
    expect(buildDiagnosticSummary(base(['ir2', 'ir2neg'])).split('\n')[2]).toBe('已啟用實驗功能：IR 第二輪（烯烴面外彎曲）／IR 第二輪（負向證據）');
    expect(buildDiagnosticSummary(base(['ir2'])).split('\n').filter(l => l.includes('已啟用實驗功能'))).toHaveLength(1);
  });
});

describe('the main thread tells the worker', () => {
  class FakeWorker { static made: FakeWorker[] = []; sent: unknown[] = []; onmessage: ((e: {data: unknown}) => void) | null = null; onerror: (() => void) | null = null;
    constructor() { FakeWorker.made.push(this); } postMessage(m: unknown) { this.sent.push(m); if ((m as {spectra?: unknown}).spectra) queueMicrotask(() => this.onmessage?.({data: {type: 'result', result: {}}})); } terminate() {} }
  const run = async () => { FakeWorker.made = []; vi.stubGlobal('Worker', FakeWorker); try { await executeAnalysisWorker({spectra: {}, extraInput: {}} as never); } finally { vi.unstubAllGlobals(); } return FakeWorker.made[0].sent; };
  it('with ir2 / ir2neg on, the "experiments" message names them (effective state), then the input', async () => {
    restore(); applyExperiments(['ir2']); let sent = await run();
    expect(sent).toHaveLength(2); expect(sent[0]).toEqual({type: 'experiments', names: ['ir2']});
    restore(); applyExperiments(['h1', 'ir2neg']); sent = await run(); expect(sent[0]).toEqual({type: 'experiments', names: ['h1', 'ir2', 'ir2neg']});
    restore(); sent = await run(); expect(sent).toHaveLength(1);
    restore();
  });
});

describe('the worker applies the flags to ITS configuration and reports what is on', () => {
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
  it('no message: default, nothing reported', async () => { restore(); expect(await analyse()).toEqual([]); expect(V12_CONFIG.useV142IR).toBe(false); }, 300000);
  it('an "ir2" message changes the worker configuration (before: off), the analysis reports it; ir stays off', async () => {
    restore(); expect(V12_CONFIG.useV142IR).toBe(false);
    await onmessage({data: {type: 'experiments', names: ['ir2', 'bogus']}});
    expect(V12_CONFIG.useV142IR).toBe(true); expect(V12_CONFIG.v142IR.negativeEvidence).toBe(false); expect(V12_CONFIG.useV141IR).toBe(false);
    expect(await analyse()).toEqual(['ir2']);
    restore();
  }, 300000);
  it('an "ir2neg" message also switches the negative-evidence sub-flag on and the report names both', async () => {
    restore(); await onmessage({data: {type: 'experiments', names: ['ir2neg']}});
    expect(V12_CONFIG.useV142IR).toBe(true); expect(V12_CONFIG.v142IR.negativeEvidence).toBe(true);
    expect(await analyse()).toEqual(['ir2', 'ir2neg']);
    restore();
  }, 300000);
  it('a message with nothing recognised changes nothing', async () => { restore(); await onmessage({data: {type: 'experiments', names: ['x', 5]}}); expect(V12_CONFIG.useV142IR).toBe(false); expect(V12_CONFIG.v142IR.negativeEvidence).toBe(false); });
  it('stop 30: an "ir2neg-nitro" message switches only the nitro rule on in the worker and the report names it', async () => {
    restore(); await onmessage({data: {type: 'experiments', names: ['ir2neg-nitro']}});
    expect(V12_CONFIG.useV142IR).toBe(true); expect(V12_CONFIG.v142IR.negNitro).toBe(true); expect(V12_CONFIG.v142IR.negNitrile).toBe(false); expect(V12_CONFIG.v142IR.negAlkyne).toBe(false); expect(V12_CONFIG.v142IR.negativeEvidence).toBe(false);
    expect(await analyse()).toEqual(['ir2', 'ir2neg-nitro']);
    restore();
  }, 300000);
});

// v1.4.2 stop 30 (A): one experiment name per negative-evidence group; ir2neg keeps meaning all three. The diagnostic summary gets a second line with the state of each group whenever one of them is on.
describe('stop 30: ir2neg-nitrile / ir2neg-nitro / ir2neg-alkyne', () => {
  it('parsing: recognised alone and with the others, fixed order; near-misses ignored', () => {
    expect(parseExperimentParam('?exp=ir2neg-alkyne,ir2neg-nitrile')).toEqual(['ir2neg-nitrile', 'ir2neg-alkyne']);
    expect(parseExperimentParam('?exp=IR2NEG-NITRO,ir')).toEqual(['ir', 'ir2neg-nitro']);
    for (const s of ['?exp=ir2neg-', '?exp=ir2negnitro', '?exp=ir2neg-cn', '?exp=nitro']) expect(parseExperimentParam(s), s).toEqual([]);
  });
  it('each name: parent on, its own flag on, the other two and the total sub-flag stay off; reported by its own name', () => {
    for (const [name, flag] of [['ir2neg-nitrile', 'negNitrile'], ['ir2neg-nitro', 'negNitro'], ['ir2neg-alkyne', 'negAlkyne']] as const) {
      const c = snapshot(); expect(applyExperiments([name], c)).toEqual([name]);
      expect(c.useV142IR).toBe(true); expect(c.v142IR![flag]).toBe(true); expect(c.v142IR!.negativeEvidence).toBe(false); expect(c.useV141IR).toBe(false);
      for (const other of (['negNitrile', 'negNitro', 'negAlkyne'] as const).filter(f => f !== flag)) expect(c.v142IR![other], name + ' ' + other).toBe(false);
      expect(activeExperiments(c)).toEqual(['ir2', name]);
    }
  });
  it('ir2neg is unchanged (total sub-flag only, reported as ir2neg); the three single names together are reported as ir2neg as well', () => {
    const c = snapshot(); applyExperiments(['ir2neg'], c); expect(c.v142IR!.negativeEvidence).toBe(true); expect([c.v142IR!.negNitrile, c.v142IR!.negNitro, c.v142IR!.negAlkyne]).toEqual([false, false, false]);
    expect(activeExperiments(c)).toEqual(['ir2', 'ir2neg']);
    const d = snapshot(); applyExperiments(['ir2neg-nitrile', 'ir2neg-nitro', 'ir2neg-alkyne'], d); expect(activeExperiments(d)).toEqual(['ir2', 'ir2neg']);
    const e = snapshot(); applyExperiments(['ir2neg-nitrile', 'ir2neg-alkyne'], e); expect(activeExperiments(e)).toEqual(['ir2', 'ir2neg-nitrile', 'ir2neg-alkyne']);
  });
  it('labels and the second diagnostic line (state of all three); no second line without a negative-evidence experiment', () => {
    expect(experimentLabelText(['ir2neg-nitrile', 'ir2neg-alkyne'])).toBe('IR 第二輪（負向證據：腈）／IR 第二輪（負向證據：末端炔）');
    const base = (experiments: DiagnosticInput['experiments']): DiagnosticInput => ({generatedAt: 't', appVersion: 'v', resultIsCurrent: true, dataCheck: {items: [], unprovidedText: '', staleText: ''} as never, h1Peaks: [], irPeaks: [], hiddenIrGroups: 0, shownIrGroups: 0, panel: null, composition: null, observations: [], topCandidates: [], experiments});
    let lines = buildDiagnosticSummary(base(['ir2', 'ir2neg-nitro'])).split('\n');
    expect(lines[2]).toBe('已啟用實驗功能：IR 第二輪（烯烴面外彎曲）／IR 第二輪（負向證據：硝基）'); expect(lines[3]).toBe('負向證據（IR 第二輪）：腈 關／硝基 開／末端炔 關');
    lines = buildDiagnosticSummary(base(['ir2', 'ir2neg'])).split('\n');
    expect(lines[2]).toBe('已啟用實驗功能：IR 第二輪（烯烴面外彎曲）／IR 第二輪（負向證據）'); expect(lines[3]).toBe('負向證據（IR 第二輪）：腈 開／硝基 開／末端炔 開');
    lines = buildDiagnosticSummary(base(['ir2'])).split('\n'); expect(lines.some(l => l.startsWith('負向證據'))).toBe(false);
  });
  it('the main thread passes a single-group name to the worker', async () => {
    class FakeWorker { static made: FakeWorker[] = []; sent: unknown[] = []; onmessage: ((e: {data: unknown}) => void) | null = null; onerror: (() => void) | null = null;
      constructor() { FakeWorker.made.push(this); } postMessage(m: unknown) { this.sent.push(m); if ((m as {spectra?: unknown}).spectra) queueMicrotask(() => this.onmessage?.({data: {type: 'result', result: {}}})); } terminate() {} }
    restore(); applyExperiments(['ir2neg-alkyne']);
    FakeWorker.made = []; vi.stubGlobal('Worker', FakeWorker); try { await executeAnalysisWorker({spectra: {}, extraInput: {}} as never); } finally { vi.unstubAllGlobals(); }
    expect(FakeWorker.made[0].sent[0]).toEqual({type: 'experiments', names: ['ir2', 'ir2neg-alkyne']});
    restore();
  });
});
