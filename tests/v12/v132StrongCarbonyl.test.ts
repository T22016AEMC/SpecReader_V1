import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {oxygenEvidenceFloor} from '../../src/engines/composition/functionalGroupBounds';
import {requiredFromEvidence, strongCarbonylBands, strongIrBands} from '../../src/engines/constraints/requiredSubstructures';
import {irAldehydeContext} from '../../src/engines/constraints/v12Evidence';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {loadV132Baseline, measureV132, V132_CASES} from '../helpers/v132Samples';
import type {V121Fixture} from '../helpers/v121Golden';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.2 task 1: "strong C=O" in 1700–1800 cm-1 is 30 % of the strongest IR band (was 50 %) in EVERY judgement, behind useV132. Synthetic samples only (PMA type M1 and variants, p-xylene, cyclohexene).
// The sweeps use the same spectra as the stop-1 report: M1 with the carbonyl mark shallower, a Lorentzian trace read at an off-peak mark, weak aromatic overtones, a 1640 water bend, a C=C at 1650.
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, v132: V12_CONFIG.useV132};
const setFlag = (on: boolean) => { V12_CONFIG.useV132 = on; };
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.useV132 = was.v132; });

const observationsOf = (f: V121Fixture): ObservedEvidence[] =>
  createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle).observations;
/** M1 (PMA type) with the carbonyl mark at transmittance y (baseline 99; the 1240 C–O band is y 15, so the carbonyl band is (99 - y) / 84 of the strongest while y >= 15). */
const m1 = (y: number, x = 1740): V121Fixture => { const f = loadV123('M1'); f.ir.peaks = f.ir.peaks.map(p => p.x === 1740 ? {...p, x, y} : p); return f; };
const ratioOf = (obs: ObservedEvidence[], x: number) => {
  const ir = obs.filter(o => o.modality === 'IR'); const top = Math.max(...ir.map(o => o.relativeIntensity ?? 0));
  const c = ir.reduce((b, o) => Math.abs(o.value - x) < Math.abs(b.value - x) ? o : b);
  return (c.relativeIntensity ?? 0) / top;
};
const floorOf = (obs: ObservedEvidence[]) => oxygenEvidenceFloor(obs, false)!;
const ob = (x: number, rel: number): ObservedEvidence => ({id: `IR:t:${x}`, modality: 'IR', signalId: `s${x}`, sourceId: 't', value: x, unit: 'cm-1', relativeIntensity: rel, relativeIntegral: null, multiplicity: null, jHz: [], shape: 'NARROW', uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {}, coverage: 'CONFIRMED_COMPLETE', unknown: []});

describe('the one strong-C=O function', () => {
  const obs = [ob(2980, 100), ob(1741, 35), ob(1690, 35), ob(1240, 35)];
  it('flag on: 1700–1800 is strong from 30 %, 1650–1700 and everything else keep 50 %', () => {
    setFlag(true);
    expect(strongCarbonylBands(obs, [1650, 1800], 0.5).map(o => o.value)).toEqual([1741]);
    expect(strongCarbonylBands([ob(2980, 100), ob(1741, 29.9)], [1650, 1800], 0.5)).toEqual([]);
    expect(strongCarbonylBands([ob(2980, 100), ob(1741, 30)], [1650, 1800], 0.5)).toHaveLength(1);
    expect(strongCarbonylBands([ob(2980, 100), ob(1699, 49)], [1650, 1800], 0.5)).toEqual([]);
    expect(strongIrBands(obs, [1000, 1300], 0.5)).toEqual([]);                 // C–O is not relaxed
  });
  it('flag off: every window keeps the caller share (v1.3.1)', () => {
    setFlag(false);
    expect(strongCarbonylBands(obs, [1650, 1800], 0.5)).toEqual([]);
    expect(strongCarbonylBands([ob(2980, 100), ob(1741, 50)], [1650, 1800], 0.5)).toHaveLength(1);
  });
  it('the new share IS the v1.3.0 "band present" share (one constant, no grey zone between present and strong)', () => {
    expect(V12_CONFIG.v132StrongCarbonyl.relativeIntensity * 100).toBe(V12_CONFIG.irV130.carbonylMissing.presentRelativeIntensity);
    expect(V12_CONFIG.irV130.carbonylMissing.presentRelativeIntensity).toBe(30);
  });
});

describe('(a) C=O height sweep of the PMA-type sample: the flip at 0.5 is gone down to 0.30', () => {
  for (const y of [40, 55, 57.5, 62.5, 70, 73.5, 75, 80]) {
    it(`carbonyl y=${y}`, () => {
      const obs = observationsOf(m1(y));
      const r = ratioOf(obs, 1740);
      setFlag(false);
      const off = floorOf(obs);
      setFlag(true);
      const on = floorOf(obs);
      expect(off.floor).toBe(r >= 0.5 ? 2 : 1);                    // v1.3.1: cliff at 0.5
      expect(on.floor).toBe(r >= 0.3 ? 2 : 1);                     // v1.3.2: cliff at 0.30
      expect(on.strongCarbonyl).toBe(r >= 0.3);
      if (r >= 0.345 && r < 0.5) expect([off.floor, on.floor]).toEqual([1, 2]);   // the stop-1 range 0.345–0.494 is rescued
    });
  }
  it('the whole 0.345–0.494 range, finely', () => {
    setFlag(true);
    for (let y = 57.5; y <= 70; y += 0.5) { const obs = observationsOf(m1(y)); expect(ratioOf(obs, 1740)).toBeLessThan(0.5); expect(floorOf(obs).floor, `y=${y}`).toBe(2); }
  });
  it('O floor over (C=O share) × (C–O share): C–O keeps 0.5, C=O is 0.3', () => {
    const shares = [0.2, 0.3, 0.4, 0.45, 0.5, 0.6, 0.8, 1.0];
    for (const rc of shares) for (const ro of shares) {
      const o = [ob(2980, 100), ob(1740, 100 * rc), ob(1240, 100 * ro)];
      setFlag(false); expect(floorOf(o).floor, `off ${rc}/${ro}`).toBe((rc >= 0.5 ? 1 : 0) + (ro >= 0.5 ? 1 : 0));
      setFlag(true); expect(floorOf(o).floor, `on ${rc}/${ro}`).toBe((rc >= 0.3 ? 1 : 0) + (ro >= 0.5 ? 1 : 0));
    }
  });
  it('a carbonyl mark below 0.30 still does not count (the new cliff)', () => {
    setFlag(true);
    expect(floorOf(observationsOf(m1(80))).floor).toBe(1);        // 0.226
  });
});

describe('(a) position: an off-peak mark on a traced band', () => {
  /** Continuous Lorentzian trace; the carbonyl band is centred at 1737 with the given half width and depth (× the C–O depth); the user's mark sits at markX; the mark height is read from the trace. */
  const curveObs = (markX: number, depthRel: number, hw: number): ObservedEvidence[] => {
    const f = loadV123('M1');
    const bands = f.ir.peaks.filter(p => p.x !== 1740).map(p => ({x: p.x, a: 99 - p.y, w: p.x > 2500 ? 25 : 10}));
    bands.push({x: 1737, a: depthRel * (99 - 15), w: hw});
    const T = (x: number) => 99 - bands.reduce((s, b) => s + b.a / (1 + ((x - b.x) / b.w) ** 2), 0);
    f.ir.peaks = [...f.ir.peaks.filter(p => p.x !== 1740).map(p => p.x), markX].map(x => ({x, y: T(x)}));
    const spectra = fixtureSpectra(f, {denseBaseline: false}) as any;
    const pts: {x: number; y: number}[] = [];
    for (let x = 4000; x >= 450; x -= 1) pts.push({x, y: T(x)});
    spectra.IR.points = pts;
    // marks only (the user's case): the trace-detected peaks (origin EXTRACTED) are not part of it
    return createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence(spectra, {}).bundle).observations.filter(o => o.modality !== 'IR' || o.origin === 'MANUAL');
  };
  it('half width 6, band 0.7 of C–O: marked at 1737 strong; marked at 1741 (0.48) not strong with the flag off, strong with it on', () => {
    const at1737 = curveObs(1737, 0.7, 6), at1741 = curveObs(1741, 0.7, 6);
    expect(ratioOf(at1737, 1737)).toBeGreaterThan(0.6);
    expect(ratioOf(at1741, 1741)).toBeGreaterThan(0.3);
    expect(ratioOf(at1741, 1741)).toBeLessThan(0.5);
    setFlag(false); expect([floorOf(at1737).floor, floorOf(at1741).floor]).toEqual([2, 1]);
    setFlag(true); expect([floorOf(at1737).floor, floorOf(at1741).floor]).toEqual([2, 2]);
  });
  it('peak-table marks: the position 1730–1745 never changes the verdict (same height)', () => {
    setFlag(true);
    const floors = new Set<number>();
    for (let x = 1730; x <= 1745; x++) floors.add(floorOf(observationsOf(m1(60, x))).floor);
    expect([...floors]).toEqual([2]);
  });
});

describe('(b) false-positive controls: no new strong C=O', () => {
  const load = (id: string) => loadV123(`v132/${id}`);
  for (const id of ['XYL_weak', 'XYL_mod', 'CYHEX_A', 'CYHEX_B']) {
    it(`${id}: O floor stays 0 and no required C=O with the flag on`, () => {
      const obs = observationsOf(load(id));
      setFlag(true);
      expect(floorOf(obs).floor).toBe(0);
      expect(floorOf(obs).strongCarbonyl).toBe(false);
      expect(requiredFromEvidence(obs).map(r => r.id)).not.toContain('STRONG_CARBONYL');
    });
  }
  it('the overtone marks (1800 / 1720 at 0.10 and 0.18), the 1640 water bend and the 1650 C=C stay below / outside the new rule', () => {
    const weak = observationsOf(load('XYL_weak')), mod = observationsOf(load('XYL_mod'));
    expect(ratioOf(weak, 1720)).toBeLessThan(0.15);
    expect(ratioOf(mod, 1720)).toBeLessThan(0.3);
    expect(ratioOf(mod, 1640)).toBeLessThan(0.3);
    expect(ratioOf(observationsOf(load('CYHEX_A')), 1650)).toBeGreaterThan(0.3);   // above 0.30, but 1650–1700 keeps 0.5
    expect(ratioOf(observationsOf(load('CYHEX_B')), 1650)).toBeLessThan(0.5);
  });
  it('the p-xylene 1020 band (0.32 of the strongest) is not a strong C–O', () => {
    const obs = observationsOf(load('XYL_mod'));
    expect(ratioOf(obs, 1020)).toBeGreaterThan(0.3);
    expect(ratioOf(obs, 1020)).toBeLessThan(0.5);
    setFlag(true);
    expect(strongIrBands(obs, [1000, 1300], 0.5)).toEqual([]);
    expect(floorOf(obs).floor).toBe(0);
  });
});

describe('every consumer of "strong C=O" agrees on the same data', () => {
  const obs = () => observationsOf(m1(62.5));                      // carbonyl band 0.435 of the strongest
  const image = {isImage: true, calibrationTrusted: true} as unknown as Parameters<typeof irAldehydeContext>[2];
  it('flag on: oxygen floor 2, STRONG_CARBONYL required, aldehyde and conjugated-carbonyl contexts strong', () => {
    setFlag(true);
    const o = obs(), o30 = observationsOf(m1(62.5, 1730));      // the conjugated-carbonyl window ends at 1735
    expect(floorOf(o).floor).toBe(2);
    expect(requiredFromEvidence(o).map(r => r.id)).toContain('STRONG_CARBONYL');
    expect(irAldehydeContext(o, true).strongCarbonyl).toBe(true);
    expect(irAldehydeContext(o30, true, image).conjugatedCarbonyl).toBe(true);
  });
  it('flag off: all of them say not strong (v1.3.1)', () => {
    setFlag(false);
    const o = obs(), o30 = observationsOf(m1(62.5, 1730));      // the conjugated-carbonyl window ends at 1735
    expect(floorOf(o).floor).toBe(1);
    expect(requiredFromEvidence(o).map(r => r.id)).not.toContain('STRONG_CARBONYL');
    expect(irAldehydeContext(o, true).strongCarbonyl).toBe(false);
    expect(irAldehydeContext(o30, true, image).conjugatedCarbonyl).toBe(false);
  });
});

describe('(c) the full pipeline on all synthetic samples (the strong-C=O threshold alone: the stop-4 sub-switches are off here), flag on', () => {
  const baseline = loadV132Baseline();
  // the stop-4 rules (best finding per peak, multi-band) have their own acceptance (v132Stop4Acceptance); this block pins the threshold alone
  // v1.4.0 stop 15: the record (tests/goldens/v132.baseline.json) was taken before the stop-6 window corrections (v132.windows, default on, which move scores of M7, Q2 and v121/G3 by 1 point), so the stop-6 sub-switch is off here too
  // v1.4.2 stop 34: the record was taken before the deferred second pass (V12_CONFIG.v123.deferredSecondPass, default on since stop 34; it changes M4, M5, M5b, whose IR has a C=C band so their ester-carbonyl state is UNKNOWN even with the IR confirmed complete), so it is off here; the default path is pinned by the v1.4.x snapshots and tests/v12/v142DeferredSecondPass.test.ts.
  const sub = {best: V12_CONFIG.v132.bestFindingPerPeak, multi: V12_CONFIG.v132.multiBand, windows: V12_CONFIG.v132.windows, deferred: V12_CONFIG.v123.deferredSecondPass};
  beforeAll(() => { V12_CONFIG.v132.bestFindingPerPeak = false; V12_CONFIG.v132.multiBand = false; V12_CONFIG.v132.windows = false; V12_CONFIG.v123.deferredSecondPass = false; });
  afterAll(() => { V12_CONFIG.v132.bestFindingPerPeak = sub.best; V12_CONFIG.v132.multiBand = sub.multi; V12_CONFIG.v132.windows = sub.windows; V12_CONFIG.v123.deferredSecondPass = sub.deferred; });
  const rescued = new Set(['v132/M1y575', 'v132/M1y625', 'v132/M1y70']);       // flag off: target not found, floor 1
  for (const c of V132_CASES) {
    it(`${c.sample}${c.typed ? ' (formula typed)' : ''}`, async () => {
      setFlag(true);
      const now = await measureV132(c);
      const before = baseline.find(b => b.sample === c.sample && b.typed === c.typed)!;
      if (rescued.has(c.sample)) {
        expect(before.targetRank).toBeNull();
        expect(before.floor).toBe(1);
        expect(now.floor).toBe(2);
        expect(now.targetRank).toBe(1);
      } else {
        expect(now).toEqual(before);                                // floor, rank, candidate count, top six with scores: unchanged
      }
    }, 300000);
  }
  it('the sample below the new cliff (0.22) is not rescued', async () => {
    setFlag(true);
    const now = await measureV132({sample: 'v132/M1y80', typed: false});
    expect(now.floor).toBe(1);
    expect(now.targetRank).toBeNull();
  }, 300000);
});
