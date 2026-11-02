import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {buildAtomInventory} from '../../src/engines/constraints/atomInventory';
import {classifySignal, NO_IR} from '../../src/engines/constraints/shiftClasses';
import type {H1Signal, IrAldehydeContext} from '../../src/engines/constraints/shiftClasses';
import {h1SignalsFromObservations, irAldehydeContext} from '../../src/engines/constraints/v12Evidence';
import {round2ShareCap} from '../../src/engines/composition/structureGenerator';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from '../helpers/v121Golden';
import {loadV123, measureSample} from '../helpers/v123Samples';
import type {SampleMeasure} from '../helpers/v123Samples';

// v1.2.3 stop 3: the ester / acetal O–CH classes (V12_CONFIG.esterMethine), the user-formula path, the k = 1 round-1 cap, and the narrowed round-2 share cap. SYNTHETIC samples only, step budget only.
// SOURCE of the windows: one checked literature data point (isopropyl formate CH 5.14 ppm) plus engineering judgement; the 1.4.0 shift prediction replaces them.
beforeAll(() => initializeRDKit(), 60000);
const was = {total: V12_CONFIG.useV123, ester: V12_CONFIG.v123.esterMethine, cap: V12_CONFIG.v123.round1CapK1};
afterEach(() => { V12_CONFIG.useV123 = was.total; V12_CONFIG.v123.esterMethine = was.ester; V12_CONFIG.v123.round1CapK1 = was.cap; });
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'goldens', 'v123.baseline.json'), 'utf8')).samples as SampleMeasure[];
const base = (id: string, mode: string) => baseline.find(b => b.id === id && b.mode === mode)!;
const run = async (id: string, mode: 'sparse' | 'dense', flag = true) => { V12_CONFIG.useV123 = flag; return measureSample(id, mode); };

const sig = (shiftPpm: number): H1Signal => ({observationId: `s${shiftPpm}`, shiftPpm, relativeIntegral: 1, multiplicity: 'm', broad: false, optional: false});
const ctx = (esterCarbonyl: IrAldehydeContext['esterCarbonyl'], oxygenCount = 2, esterMethine = true) => ({solvent: 'CDCl3', formulaElements: new Set(['C', 'H', 'O']), nitrogenAllowed: false, ir: {...NO_IR, ...(esterCarbonyl ? {esterCarbonyl} : {})}, esterMethine, oxygenCount});
const classesOf = (shift: number, c: ReturnType<typeof ctx>) => classifySignal(sig(shift), c).matches;
const prepared = (id: string, dense = true) => createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(loadV123(id), {denseBaseline: dense}), {}).bundle);

describe('the two classes at the classifier', () => {
  it('ESTER_O_CH applies 4.7–5.3 ppm (1 H) with a strong C=O, as an ordinary reading', () => {
    const m = classesOf(5.14, ctx('STRONG')).filter(x => x.classId === 'ESTER_O_CH');
    expect(m).toHaveLength(1);
    expect(m[0].hPerAtom).toEqual([1]);
    expect(m[0].deferred).toBeUndefined();
    expect(classesOf(4.69, ctx('STRONG')).some(x => x.classId === 'ESTER_O_CH')).toBe(false);
    expect(classesOf(5.31, ctx('STRONG')).some(x => x.classId === 'ESTER_O_CH')).toBe(false);
  });
  it('ACETAL_O_CH applies 4.5–5.5 (1 H) and 4.5–5.3 (2 H) and is always deferred (never ahead of the alkene readings)', () => {
    const at = (v: number) => classesOf(v, ctx('STRONG')).find(x => x.classId === 'ACETAL_O_CH');
    expect(at(5.4)!.hPerAtom).toEqual([1]);
    expect(at(5.4)!.deferred).toBe(true);
    expect(at(5.1)!.hPerAtom).toEqual([1, 2]);
    expect(at(5.6)).toBeUndefined();
    expect(at(4.4)).toBeUndefined();
  });
  it('IR gate: UNKNOWN (no IR / not covered / no intensities) defers the ester class, ABSENT (covered, no strong C=O) switches it off', () => {
    expect(classesOf(5.14, ctx('UNKNOWN')).find(x => x.classId === 'ESTER_O_CH')!.deferred).toBe(true);
    expect(classesOf(5.14, ctx('ABSENT')).some(x => x.classId === 'ESTER_O_CH' || x.classId === 'ACETAL_O_CH')).toBe(false);
    expect(classesOf(5.14, ctx('ABSENT')).map(x => x.classId)).toEqual(['VINYL_CH']);
  });
  it('needs two O in the formula and the switch; without them the class list is the v1.2.2 one', () => {
    expect(classesOf(5.14, ctx('STRONG', 1)).map(x => x.classId)).toEqual(['VINYL_CH']);
    expect(classesOf(5.14, ctx('STRONG', 2, false)).map(x => x.classId)).toEqual(['VINYL_CH']);
  });
});

describe('the IR gate from real observations', () => {
  const gate = (id: string, dense = true) => irAldehydeContext(prepared(id, dense).observations, true).esterCarbonyl;
  it('flag on: PMA type STRONG, ester + C=C band UNKNOWN (deferred), no C=O ABSENT; no IR at all deferred', () => {
    V12_CONFIG.useV123 = true;
    expect(gate('M1')).toBe('STRONG');
    expect(gate('M5b')).toBe('UNKNOWN');
    expect(gate('Q3')).toBe('ABSENT');
    // no IR at all: the context object is the old one (no field); the classifier reads a missing field as UNKNOWN (deferred)
    expect('esterCarbonyl' in irAldehydeContext([], false)).toBe(false);
    expect(classesOf(5.14, ctx(undefined)).find(x => x.classId === 'ESTER_O_CH')!.deferred).toBe(true);
  });
  it('flag off: the context has no such field (1.2.2 object)', () => {
    V12_CONFIG.useV123 = false;
    expect('esterCarbonyl' in irAldehydeContext(prepared('M1').observations, true)).toBe(false);
  });
});

describe('an alkene CH at 5 ppm without carbonyl evidence stays an alkene reading', () => {
  const inventory = (id: string, formula: Record<string, number>) => {
    const p = prepared(id);
    const h1 = h1SignalsFromObservations(p.observations);
    return buildAtomInventory({signals: h1.signals, formula, solvent: h1.solvent, coverageComplete: h1.coverageComplete, ir: irAldehydeContext(p.observations, true), nitrogenAllowed: false, esterMethine: true});
  };
  it('IR covers the carbonyl window and has no C=O (Q3): the 5.10 signal is read as VINYL_CH only, constrained to a real alkene CH', () => {
    V12_CONFIG.useV123 = true;
    const inv = inventory('Q3', {C: 8, H: 16, O: 2});
    expect(inv.signals[0].classes).toEqual(['VINYL_CH']);
    const alt = inv.alternatives[0];
    expect(alt.hasVinyl).toBe(true);
    expect(alt.groups.find(g => g.observationId === inv.signals[0].observationId)!.alkene).toBe(true);
  });
  it('the same signal with an ester C=O (Q2-like ester band) would not be constrained: the PMA type 5.09 ppm signal is an ordinary reading', () => {
    V12_CONFIG.useV123 = true;
    const inv = inventory('M1b', {C: 6, H: 12, O: 3});
    expect(inv.signals[0].classes).toEqual(expect.arrayContaining(['VINYL_CH', 'ESTER_O_CH']));
    expect(inv.alternatives.some(a => !a.hasVinyl)).toBe(true);
  });
});

describe('user-typed formula: the 1H constraints no longer retreat on 5.09 ppm', () => {
  const retreat = async (flag: boolean) => {
    V12_CONFIG.useV123 = flag;
    const f = loadV123('M1b');
    const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: {molecularFormula: 'C6H12O3'}}, SHAPE_BUDGET);
    const e = r.reasoningTrace!.compositionSearch!.runs[0].enumeration!;
    return {path: e.v12?.path, rank: r.rankedCandidates.findIndex(c => canonNoStereo(c.smiles) === canonNoStereo(f.targetSmiles)) + 1};
  };
  it('C6H12O3 with 5.09 (1 H): flag off retreats (FALLBACK), flag on keeps the list (INVENTORY) and finds the PMA type first', async () => {
    expect((await retreat(false)).path).toBe('FALLBACK');
    const on = await retreat(true);
    expect(on.path).toBe('INVENTORY');
    expect(on.rank).toBe(1);
  }, 120000);
});

describe('no-formula acceptance, flag on', () => {
  for (const mode of ['sparse', 'dense'] as const) {
    it(`PMA type (5.00 and 5.09, ${mode}): CH3C(=O)OCH(CH3)CH2OCH3 is in the top 3`, async () => {
      for (const id of ['M1', 'M1b']) {
        const m = await run(id, mode);
        expect(m.targetRank, id).not.toBeNull();
        expect(m.targetRank!, id).toBeLessThanOrEqual(3);
      }
    }, 120000);
    it(`other ester methine samples (${mode}): isopropyl acetate type and ethyl lactate type are in the top 5`, async () => {
      for (const id of ['Q1', 'Q2']) {
        const m = await run(id, mode);
        expect(m.targetRank, id).not.toBeNull();
        expect(m.targetRank!, id).toBeLessThanOrEqual(5);
      }
    }, 120000);
    it(`"5 ppm is really an alkene CH" controls (${mode}) are not worse than before, and the no-C=O sample (Q3) keeps its alkene reading`, async () => {
      for (const id of ['M4', 'M5', 'M5b', 'M6', 'M7', 'v121/G3', 'Q3']) {
        const b = base(id.replace('v121/', ''), mode), m = await run(id, mode);
        if (b.targetRank !== null) { expect(m.targetRank, id).not.toBeNull(); expect(m.targetRank!, id).toBeLessThanOrEqual(b.targetRank); }
        if (b.targetSearched) expect(m.targetSearched, id).toBe(true);
      }
    }, 120000);
    it(`p-cresol, BPA (${mode}) do not regress against the stop 2 result (rank 1)`, async () => {
      for (const id of ['P1', 'P2', 'P3', 'P4', 'B1', 'v121/S2']) expect((await run(id, mode)).targetRank, id).toBe(1);
    }, 300000);
  }
  it('bypass: with the flag off the PMA type is not found (the recorded 1.2.2 baseline)', async () => {
    for (const id of ['M1', 'M1b']) expect((await run(id, 'dense', false)).targetRank, id).toBeNull();
  }, 120000);
  it('3.2: without the k = 1 round-1 cap (150 000 steps) the PMA type is still not found; with 500 000 it is first', async () => {
    V12_CONFIG.v123.round1CapK1 = false;
    expect((await run('M1', 'dense')).targetRank).toBeNull();
    V12_CONFIG.v123.round1CapK1 = true;
    expect((await run('M1', 'dense')).targetRank).toBe(1);
    expect(V12_CONFIG.v123.round1MaxStatesK1).toBe(500_000);
  }, 120000);
  it('the ester switch alone matters: esterMethine off (cap on) leaves 5.09 without a plain reading and the PMA type is not found', async () => {
    V12_CONFIG.v123.esterMethine = false;
    expect((await run('M1b', 'dense')).targetRank).toBeNull();
  }, 120000);
});

describe('3.0: the round-2 share cap only limits a formula with N and no N-specific evidence', () => {
  it('N without evidence: pool / maxRound2Formulas; N with evidence, or no N at all: no cap', () => {
    expect(round2ShareCap({N: 2}, 'NONE', 8_000_000, 3)).toBe(2_666_666);
    expect(round2ShareCap({N: 1}, 'EVEN_ION_ONLY', 6_000_000, 3)).toBe(2_000_000);
    expect(round2ShareCap({N: 2}, 'EVIDENCE', 8_000_000, 3)).toBeUndefined();
    expect(round2ShareCap({}, 'NONE', 8_000_000, 3)).toBeUndefined();
    expect(round2ShareCap({N: 0}, undefined, 8_000_000, 3)).toBeUndefined();
  });
  it('p-cresol / BPA samples: no formula is cut by a share (no ROUND2_STEP_CAP), and the P4 largest formula is far below the 95 % of the unfixed run', async () => {
    for (const id of ['P4', 'B1']) {
      const m = await run(id, 'sparse');
      expect(m.runs.some(r => r.reasons.includes('ROUND2_STEP_CAP')), id).toBe(false);
      expect(Math.max(...m.runs.map(r => r.visited)) / m.steps, id).toBeLessThan(0.9);
    }
    const p4 = await run('P4', 'sparse');
    expect(Math.max(...p4.runs.map(r => r.visited)) / p4.steps).toBeLessThan(0.6);
  }, 120000);
});
