import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irBandMatch, irCandidateBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {irProbe, setV141} from '../helpers/v141Probe';
import type {SpectralPeak} from '../../src/types/spectrum';

// v1.4.1 stop 18 (4): ir.esterCO. The ester's own C-O bands: 1150-1310 (C(=O)-O asymmetric) and 1000-1150 (O-C-C), both strong, with the C=O band (1700-1810) as companion. They give the ester the same kind of coverage that the
// ether band (1000-1270) already gives an ether; the ether band is NOT narrowed (next round). Carbonates and carbamates get no C-O band (this round). Ranges textbook-style, UNCALIBRATED; +-10 is engineering judgement.
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
const use = (parent: boolean, sub: Parameters<typeof setV141>[1] = {}) => { restore?.(); restore = setV141(parent, sub); };
afterAll(() => restore?.());
const pk = (x: number): SpectralPeak => ({id: `p${x}`, x, y: 100, intensityKnown: true} as unknown as SpectralPeak);
// the other three groups are switched off in the probes so that only ir.esterCO acts
const ONLY_ESTER = {alkylBend: false, sp2CH: false, ringCarbonyl: false};
const ids = (smi: string) => irCandidateBands(smi, true).map(k => k.id).filter(i => i.startsWith('ester-co-'));

describe('ir.esterCO: the gate', () => {
  it('flag off, or sub-flag off: no band', () => { for (const [p, s] of [[false, {}], [true, {esterCO: false}]] as const) { use(p, s); expect(ids('CCOC(C)=O')).toEqual([]); } });
  it('acyclic esters, formates, lactones (incl. strained ones) get both bands', () => {
    use(true);
    for (const smi of ['CCOC(C)=O', 'COC(=O)c1ccccc1', 'C=CC(=O)OC', 'CCOC=O', 'CC(=O)OC=C', 'O=C1CCCO1', 'O=C1CCCCO1', 'O=C1CCO1', 'O=C1C=CCO1']) expect(ids(smi), smi).toEqual(['ester-co-hi', 'ester-co-lo']);
  });
  it('not esters of this kind: carbonates, carbamates, acids, anhydrides, amides, ketones, ethers, lactams, acyl halides', () => {
    use(true);
    for (const smi of ['COC(=O)OC', 'O=C1OCCO1', 'CCOC(N)=O', 'CC(=O)O', 'CC(=O)OC(C)=O', 'O=C1CCC(=O)O1', 'CC(N)=O', 'CC(C)=O', 'CCOCC', 'CN1CCCC1=O', 'CC(=O)Cl', 'NC(N)=O']) expect(ids(smi), smi).toEqual([]);
  });
  it('the real-compound panel (55): 8 esters / lactones, no more', () => {
    use(true);
    const hit = REAL_STRUCTURE_PANEL.filter(r => ids(r[1]).length === 2).map(r => r[0]);
    expect(REAL_STRUCTURE_PANEL.filter(r => ids(r[1]).length).length).toBe(8);
    expect(hit.sort()).toEqual(['2(5H)-furanone (butenolide)', '5-hydroxy-2(5H)-furanone', 'alpha-methylene-gamma-butyrolactone', 'beta-propiolactone', 'delta-valerolactone', 'gamma-butyrolactone', 'glycidyl acetate', 'methyl glycidate']);
  });
});

describe('ir.esterCO: single-peak compatibility', () => {
  it('ester-co-hi 1150-1310 and ester-co-lo 1000-1150, +-10, strong, companion C=O 1700-1810 (a lone peak gets x 0.65)', () => {
    use(true);
    const b = irCandidateBands('CCOC(C)=O', true), hi = b.find(k => k.id === 'ester-co-hi')!, lo = b.find(k => k.id === 'ester-co-lo')!;
    expect(hi.range).toEqual([1150, 1310]); expect(lo.range).toEqual([1000, 1150]); expect(hi.uncertainty).toBe(10); expect(hi.intensity).toBe('strong'); expect(hi.companions).toEqual([[1700, 1810]]);
    const co = pk(1745);
    for (const x of [1150, 1240, 1310]) expect(irBandMatch(hi, pk(x), [pk(x), co]), String(x)).toBeCloseTo(.75, 6);
    for (const x of [1000, 1050, 1150]) expect(irBandMatch(lo, pk(x), [pk(x), co]), String(x)).toBeCloseTo(.75, 6);
    expect(irBandMatch(hi, pk(1240), [pk(1240)])).toBeCloseTo(.75 * .65, 6); // no C=O
    expect(irBandMatch(hi, pk(1320), [pk(1320), co])).toBeCloseTo(.75 * Math.exp(-.5), 6); expect(irBandMatch(lo, pk(990), [pk(990), co])).toBeCloseTo(.75 * Math.exp(-.5), 6);
  });
  it('the ether band (1000-1270, strong) is NOT narrowed by this round', () => {
    use(true);
    const e = irCandidateBands('CCOCC', true).find(k => k.id === 'ether-co')!;
    expect(e.range).toEqual([1000, 1270]); expect(e.uncertainty).toBe(20);
  });
});

describe('ir.esterCO: textbook probes', () => {
  const ir = (smi: string, peaks: [number, number][]) => irProbe(smi, peaks.map(([x, y]) => ({x, y}))).ir;
  // ethyl acetate-like list: C-H, C=O, CH2/CH3 bends, C(=O)-O 1240, O-C-C 1050
  const ESTER: [number, number][] = [[2985, 40], [1745, 8], [1470, 70], [1375, 35], [1240, 12], [1050, 25]];
  it('an ester explains its own 1240 / 1050; flag off it did not (the ester loses to an ether-containing rival on the same peaks)', () => {
    use(false); const off = {ester: ir('CCOC(C)=O', ESTER)};
    use(true, ONLY_ESTER); const on = {ester: ir('CCOC(C)=O', ESTER)};
    expect(on.ester).toBeGreaterThan(off.ester);
  });
  it('a non-ester candidate on the same peaks does not change (gate)', () => {
    use(false); const off = ['CCOCC', 'CC(C)=O', 'CCCCCC'].map(s => ir(s, ESTER));
    use(true, ONLY_ESTER); expect(['CCOCC', 'CC(C)=O', 'CCCCCC'].map(s => ir(s, ESTER))).toEqual(off);
  });
  it('sub-flag off: v1.4.0 numbers', () => {
    use(false); const off = ir('CCOC(C)=O', ESTER); use(true, {...ONLY_ESTER, esterCO: false}); expect(ir('CCOC(C)=O', ESTER)).toBe(off);
  });
  it('balance with the ether: with all four rule groups on, the ester explains its C-O peaks as fully as the ether explains its own (it does not win from nothing)', () => {
    // same C-O peaks; the ether has no C=O: a rival ether on an ester-shaped list has a missing C=O band? No - ether bands do not ask for one. The ester must not score above the ether on a list WITHOUT a C=O peak.
    const NOCO: [number, number][] = [[2985, 40], [1470, 70], [1375, 35], [1240, 12], [1050, 25]];
    use(true);
    const ester = ir('CCOC(C)=O', NOCO), ether = ir('CCOCC', NOCO);
    expect(ester).toBeLessThanOrEqual(ether + 1e-9);
  });
});
