import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irBandMatch, irCandidateBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {irProbe, setV141} from '../helpers/v141Probe';
import type {SpectralPeak} from '../../src/types/spectrum';

// v1.4.1 stop 18 (3): ir.alkylBend. CH2 scissoring / CH3 asymmetric bend (1430-1485) and the CH3 symmetric ("umbrella") bend (1355-1395, only for a CH3 on a carbon). No isopropyl / gem-dimethyl / tBu splitting (postponed).
// Ranges textbook-style, UNCALIBRATED; +-10 is engineering judgement. Probes are hand-written textbook positions, not measured spectra.
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
const use = (parent: boolean, sub: Parameters<typeof setV141>[1] = {}) => { restore?.(); restore = setV141(parent, sub); };
afterAll(() => restore?.());
const pk = (x: number): SpectralPeak => ({id: `p${x}`, x, y: 100, intensityKnown: true} as unknown as SpectralPeak);
const ids = (smi: string) => irCandidateBands(smi, true).map(k => k.id).filter(i => i === 'alkyl-bend-asym' || i === 'ch3-bend-sym');

describe('ir.alkylBend: the gate', () => {
  it('flag off, or sub-flag off: no band', () => { for (const [p, s] of [[false, {}], [true, {alkylBend: false}]] as const) { use(p, s); expect(ids('CCCCCCC')).toEqual([]); } });
  it('CH2 / CH3 -> asymmetric bend; a CH3 on a carbon -> also the symmetric bend; O-CH3 and N-CH3 do not get the 1375 band', () => {
    use(true);
    expect(ids('CCCCCCC')).toEqual(['alkyl-bend-asym', 'ch3-bend-sym']); expect(ids('Cc1ccccc1')).toEqual(['alkyl-bend-asym', 'ch3-bend-sym']); expect(ids('CC(C)=O')).toEqual(['alkyl-bend-asym', 'ch3-bend-sym']);
    expect(ids('COC')).toEqual(['alkyl-bend-asym']); expect(ids('CN(C)C')).toEqual(['alkyl-bend-asym']); expect(ids('COCCOC')).toEqual(['alkyl-bend-asym']); expect(ids('CCO')).toEqual(['alkyl-bend-asym', 'ch3-bend-sym']);
    expect(ids('C1CCCCC1')).toEqual(['alkyl-bend-asym']); // CH2 only
  });
  it('no CH2 / CH3 -> no band (benzene, CHCl3, tBu-free quaternary systems)', () => {
    use(true);
    for (const smi of ['c1ccccc1', 'ClC(Cl)Cl', 'C(Cl)(Cl)(Cl)Cl', 'Clc1ccccc1', 'OC(=O)c1ccccc1', 'O=Cc1ccccc1', 'N#Cc1ccccc1', 'C#C']) expect(ids(smi), smi).toEqual([]);
  });
  it('the real-compound panel (55): 51 have a CH2 / CH3, 11 have a CH3 on a carbon', () => {
    use(true);
    expect(REAL_STRUCTURE_PANEL.filter(r => ids(r[1]).includes('alkyl-bend-asym')).length).toBe(51);
    const c = REAL_STRUCTURE_PANEL.filter(r => ids(r[1]).includes('ch3-bend-sym')).map(r => r[0]);
    expect(c.length).toBe(11);
    for (const n of ['propylene oxide', 'glycidyl acetate', 'solketal', '2,2-dimethoxypropane', '2-methylfuran']) expect(c, n).toContain(n);
  });
});

describe('ir.alkylBend: single-peak compatibility', () => {
  it('alkyl-bend-asym 1430-1485 and ch3-bend-sym 1355-1395, +-10 (the band is a fingerprint band: specificity LOW, x 0.75)', () => {
    use(true);
    const a = irCandidateBands('CCCCCCC', true).find(k => k.id === 'alkyl-bend-asym')!, s = irCandidateBands('CCCCCCC', true).find(k => k.id === 'ch3-bend-sym')!;
    expect(a.range).toEqual([1430, 1485]); expect(s.range).toEqual([1355, 1395]); expect(a.uncertainty).toBe(10); expect(s.uncertainty).toBe(10);
    for (const x of [1430, 1465, 1485]) expect(irBandMatch(a, pk(x), [pk(x)]), String(x)).toBeCloseTo(.75, 6);
    for (const x of [1355, 1375, 1395]) expect(irBandMatch(s, pk(x), [pk(x)]), String(x)).toBeCloseTo(.75, 6);
    expect(irBandMatch(a, pk(1420), [pk(1420)])).toBeCloseTo(.75 * Math.exp(-.5), 6); expect(irBandMatch(s, pk(1405), [pk(1405)])).toBeCloseTo(.75 * Math.exp(-.5), 6);
    expect(irBandMatch(a, pk(1395), [pk(1395)])).toBeLessThan(.02);
  });
});

describe('ir.alkylBend: textbook probes', () => {
  const ir = (smi: string, peaks: [number, number][]) => irProbe(smi, peaks.map(([x, y]) => ({x, y}))).ir;
  // D1: C-H stretch plus the two bends only
  const D1: [number, number][] = [[2960, 10], [2930, 15], [2870, 40], [1465, 55], [1375, 60]];
  it('D1: with the bends explained, heptane, 2-methylhexane, toluene and butyl ethyl ether score the same (toluene no longer wins 6 points by the 1465 peak alone)', () => {
    use(false); const off = ['CCCCCCC', 'CC(C)CCCC', 'Cc1ccccc1', 'CCCCOCC'].map(s => ir(s, D1));
    expect(off[2]).toBeGreaterThan(off[0]);
    use(true); const on = ['CCCCCCC', 'CC(C)CCCC', 'Cc1ccccc1', 'CCCCOCC'].map(s => ir(s, D1));
    for (const v of on) expect(v).toBeCloseTo(on[0], 6); expect(on[0]).toBeGreaterThan(off[0]);
    // the toluene advantage is gone
    expect(on[2] - on[0]).toBeLessThan(off[2] - off[0]);
  });
  it('sub-flag off: v1.4.0 numbers', () => {
    use(false); const off = ['CCCCCCC', 'Cc1ccccc1'].map(s => ir(s, D1));
    use(true, {alkylBend: false}); expect(['CCCCCCC', 'Cc1ccccc1'].map(s => ir(s, D1))).toEqual(off);
  });
  it('benzene (no CH2 / CH3) does not get the bend bands: the same peaks do not raise its score', () => {
    use(false); const off = ir('c1ccccc1', D1); use(true); expect(ir('c1ccccc1', D1)).toBe(off);
  });
});
