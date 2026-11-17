import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {s26RulesOff} from '../helpers/v142S26Off';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor, NMR_LITERATURE_REGISTRY} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {knowledgeBase} from '../../src/engines/scientificEngines/h1AdditiveRules';
import {buildAtomInventory} from '../../src/engines/constraints/atomInventory';
import type {H1Signal} from '../../src/engines/constraints/atomInventory';

// v1.4.0 stop 2, task 3: the 1H additive rules (flag useV140H1). Every expected value below is the SUM OF ROWS OF THE AMBIT-HNMR KNOWLEDGE BASE (third_party/ambit-hnmr), written out by hand in the test,
// not a number taken from a sample or a rank.
const was = {h1: V12_CONFIG.useV140H1};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; });
// v1.4.2 stop 26: this file pins a state BEFORE the stop-26 nmrshiftdb2 class shifts (no flag of their own; they sit under v140.oxygen / v140.calibration2), so they are switched off here.
// The combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots. No expected value of this file was changed.
const restoreS26 = s26RulesOff(); afterAll(() => restoreS26());

const predict = (smi: string, on: boolean) => {
  V12_CONFIG.useV140H1 = on;
  return NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'});
};
const shifts = (smi: string, on: boolean) => predict(smi, on).environments.filter(e => !e.isExchangeable).map(e => ({d: Number(e.shiftPpm.toFixed(2)), n: e.integration as number}));
const has = (list: {d: number; n: number}[], d: number, n?: number) => list.some(x => Math.abs(x.d - d) <= 0.011 && (n === undefined || x.n === n));

describe('the knowledge base as data', () => {
  it('8 blocks: ALKANES/CH3, CH2, CH, ALKENES, BENZ-MONO and three pyridines; the numbers the rules read', () => {
    const kb = knowledgeBase();
    expect([...kb.keys()]).toEqual(['ALKANES/CH3', 'ALKANES/CH2', 'ALKANES/CH', 'ALKENES', 'BENZ-MONO', 'PYRIDINE-MONO-SUBST2', 'PYRIDINE-MONO-SUBST3', 'PYRIDINE-MONO-SUBST4']);
    expect(kb.get('ALKANES/CH3')!.base).toBe(0.86); expect(kb.get('ALKANES/CH2')!.base).toBe(1.37); expect(kb.get('ALKANES/CH')!.base).toBe(1.5); expect(kb.get('ALKENES')!.base).toBe(5.25);
    expect(kb.get('ALKENES')!.rows.get('-C_alkyl')).toEqual([0.45, -0.22, -0.28]);        // Pretsch alkene: gem, cis, trans
    expect(kb.get('ALKANES/CH2')!.rows.get('-C=C')![0]).toBe(0.63);
    expect(kb.get('ALKANES/CH2')!.rows.get('-O(C=O)')![0]).toBe(2.83);
    expect(kb.get('ALKANES/CH')!.rows.get('-O-C')![0]).toBe(1.35);
  });
  it('the citation is registered', () => { expect(NMR_LITERATURE_REGISTRY.AMBIT_HNMR_2021.doi).toBe('10.5281/zenodo.4629851'); });
});

describe('the rules (flag on); the same structures with the flag off keep the v1.3.2 values', () => {
  it('terminal =CH2 becomes two 1H environments: 5.25 + cis(alkyl) −0.22 and 5.25 + trans(alkyl) −0.28; =CH 5.25 + gem(alkyl) 0.45; allylic CH2 1.37 + 0.63 − 0.04', () => {
    const on = shifts('C=CCCCCCC', true), off = shifts('C=CCCCCCC', false);
    expect(has(on, 5.03, 1)).toBe(true); expect(has(on, 4.97, 1)).toBe(true); expect(has(on, 5.7, 1)).toBe(true); expect(has(on, 1.96, 2)).toBe(true);
    expect(off).toContainEqual({d: 5.25, n: 2}); expect(has(off, 1.25, 2)).toBe(true); expect(has(off, 1.96)).toBe(false);
  });
  it('the split =CH2 keeps environments and peaks aligned: unique ids, 1H each, J cis 10 / trans 17 Hz, 16 H in total', () => {
    const r = predict('C=CCCCCCC', true);
    expect(r.peaks.length).toBe(r.environments.length);
    expect(new Set(r.environments.map(e => e.id)).size).toBe(r.environments.length);
    const two = r.environments.filter(e => Math.abs(e.shiftPpm - 5.0) < 0.1);
    expect(two).toHaveLength(2); expect(two.every(e => e.integration === 1)).toBe(true);
    expect(two.map(e => e.jCouplingHz?.[0]).sort()).toEqual([10, 17].sort());
    expect(r.environments.reduce((s, e) => s + (e.integration as number), 0)).toBe(16);
  });
  it('allylic CH3 (propene) 0.86 + 0.85 = 1.71; ring alkene CH (cyclohexene) 5.25 + alkyl_ring 0.69 + trans −0.28 = 5.66; isobutene =CH2 5.25 − 0.22 − 0.28 = 4.75', () => {
    expect(has(shifts('C=CC', true), 1.71, 3)).toBe(true);
    expect(has(shifts('C1=CCCCC1', true), 5.66, 2)).toBe(true);
    expect(shifts('C=C(C)C', true)).toContainEqual({d: 4.75, n: 2});
  });
  it('O–C–H: ethyl acetate OCH2 1.37 + 2.83 = 4.20; diethyl ether OCH2 1.37 + 2.04 = 3.41; the PMA-type CH2OCH3 is no longer read as an ester alkoxy', () => {
    expect(has(shifts('CC(=O)OCC', true), 4.2, 2)).toBe(true); expect(has(shifts('CC(=O)OCC', false), 4.3, 2)).toBe(true);
    expect(has(shifts('CCOCC', true), 3.41, 4)).toBe(true);
    const pma = shifts('CC(=O)OC(C)COC', true);
    expect(pma.some(x => x.n === 2 && x.d > 3.4 && x.d < 3.7)).toBe(true);
  });
  it('methine O–CH and acetal CH are the knowledge-base sums, which are LOWER than the usual expectation (see the report): acyloxy CH 1.5 + 2.47 + 2 × 0.17 = 4.31; acetal CH 1.5 + 2 × 1.35 + 0.17 = 4.37 (v1.3.2: 4.60 and 6.25)', () => {
    // stop 11 adds a calibrated correction (+0.67) for the acyloxy methine: the knowledge-base SUM (4.31) is reproduced with that correction switched off (V12_CONFIG.v140Oxygen.enabled), the corrected value is 4.98
    const oxy = V12_CONFIG.v140Oxygen.enabled;
    V12_CONFIG.v140Oxygen.enabled = false;
    try { expect(has(shifts('CC(=O)OC(C)C', true), 4.31, 1)).toBe(true); } finally { V12_CONFIG.v140Oxygen.enabled = oxy; }
    expect(has(shifts('CC(=O)OC(C)C', true), 4.98, 1)).toBe(true); expect(has(shifts('CC(=O)OC(C)C', false), 4.6, 1)).toBe(true);
    expect(has(shifts('CC(OCC)OCC', true), 4.37, 1)).toBe(true); expect(has(shifts('CC(OCC)OCC', false), 6.25, 1)).toBe(true);
  });
  it('anything unrecognised is left alone: a silyl or heteroaromatic neighbour keeps the v1.3.2 value; saturated alkanes and aromatics are untouched (an alcohol OCH2 IS changed by the O rule, 3.60 to 3.57, pinned in the next test)', () => {
    for (const smi of ['C=C[Si](C)(C)C', 'CCCC', 'Cc1ccccc1', 'c1ccncc1']) expect(shifts(smi, true), smi).toEqual(shifts(smi, false));
  });
  it('alcohol OCH2 (ethanol) 1.37 + 2.2 = 3.57 with the flag on (v1.3.2: 3.60): a small, documented change', () => {
    expect(has(shifts('CCO', true), 3.57, 2)).toBe(true); expect(has(shifts('CCO', false), 3.6, 2)).toBe(true);
  });
  it('flag off: the v1.3.2 prediction (pinned values)', () => {
    expect(shifts('C=CCCCCCC', false)).toEqual([{d: 5.7, n: 1}, {d: 5.25, n: 2}, {d: 1.25, n: 2}, {d: 1.25, n: 2}, {d: 1.25, n: 2}, {d: 1.25, n: 2}, {d: 1.25, n: 2}, {d: 0.88, n: 3}]);
    expect(shifts('CC(OCC)OCC', false)).toContainEqual({d: 6.25, n: 1});
  });
});

describe('constraint layer: two 1H signals as one terminal =CH2 carbon', () => {
  const sig = (id: string, d: number, n: number, m: string): H1Signal => ({observationId: id, shiftPpm: d, relativeIntegral: n, multiplicity: m, broad: false, optional: false});
  const OCTENE = [sig('a', 5.81, 1, 'm'), sig('b', 4.99, 1, 'd'), sig('c', 4.93, 1, 'd'), sig('d', 2.04, 2, 'q'), sig('e', 1.3, 8, 'm'), sig('f', 0.89, 3, 't')];
  const build = (on: boolean, signals = OCTENE) => { V12_CONFIG.useV140H1 = on; return buildAtomInventory({signals, formula: {C: 8, H: 16}, solvent: 'CDCl3', coverageComplete: true, vinylWindows: true}); };
  it('flag off: each 1H signal is its own carbon, no alternative reads b and c as one carbon', () => {
    const r = build(false);
    expect(r.status).toBe('BUILT');
    expect(r.alternatives.some(x => x.groups.some(g => g.observationId === 'b' && g.hTotal === 2))).toBe(false);
    expect(r.alternatives.some(x => x.id.startsWith('gp:'))).toBe(false);
  });
  it('flag on: an extra alternative reads 4.99 + 4.93 as ONE =CH2 carbon (1 atom, 2 H, vinyl class); the original readings are all still there', () => {
    const off = build(false), on = build(true);
    const gp = on.alternatives.filter(x => x.id.startsWith('gp:'));
    expect(gp.length).toBeGreaterThan(0);
    for (const a of gp) {
      const g = a.groups.find(x => x.observationId === 'b')!;
      expect(g.hTotal).toBe(2); expect(g.atomCount).toBe(1); expect(g.hPerAtom).toBe(2); expect(g.shiftClasses).toContain('VINYL_CH');
      expect(a.groups.some(x => x.observationId === 'c')).toBe(false);
      expect(a.notes.join(' ')).toContain('GEMINAL_VINYL_PAIR');
    }
    expect(on.alternatives.filter(x => !x.id.startsWith('gp:'))).toEqual(off.alternatives);
  });
  it('signals that cannot be the two H of one carbon are not paired: different integrals, singlets, far apart', () => {
    for (const bad of [[sig('b', 4.99, 1, 'd'), sig('c', 4.93, 2, 'd')], [sig('b', 4.99, 1, 's'), sig('c', 4.93, 1, 's')], [sig('b', 5.95, 1, 'd'), sig('c', 4.6, 1, 'd')]]) {
      const r = build(true, [sig('a', 3.5, 1, 'm'), ...bad, sig('d', 2.04, 2, 'q'), sig('e', 1.3, 8, 'm'), sig('f', 0.89, 3, 't')]);
      expect(r.alternatives.some(x => x.id.startsWith('gp:'))).toBe(false);
    }
  });
});
