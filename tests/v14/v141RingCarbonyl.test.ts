import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irCandidateBands, irBandMatch} from '../../src/engines/scientificEngines/irBandKnowledge';
import {candidateCarbonylClassesV130, candidateCarbonylClasses} from '../../src/engines/scientificEngines/carbonylClasses';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {carbonylProbe, setV141} from '../helpers/v141Probe';
import type {SpectralPeak} from '../../src/types/spectrum';

// v1.4.1 stop 18 (1): ir.ringCarbonyl. The carbonyl band and the missing-carbonyl window of gamma-lactones, beta-propiolactone, beta-lactams and five-membered cyclic carbonates.
// Ranges are textbook-style and UNCALIBRATED (uncertainty +-10: engineering judgement); the probes are hand-written textbook positions, not measured spectra and not fixture peak lists.
// The OFF table below is what the unchanged v1.4.0 engine gives for the same probe (flag off); the "on" figures are a v1.4.1 snapshot and do not say that the numbers are correct.
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
afterAll(() => restore?.());
const PROBES: [string, string, number | number[]][] = [
  ['ethyl acetate 1745', 'CCOC(C)=O', 1745], ['GBL 1795', 'O=C1CCCO1', 1795], ['GBL 1775', 'O=C1CCCO1', 1775], ['GBL 1760', 'O=C1CCCO1', 1760], ['GBL 1745', 'O=C1CCCO1', 1745],
  ['butenolide 1760', 'O=C1C=CCO1', 1760], ['a-methylene-GBL 1765', 'C=C1CCOC1=O', 1765],
  ['b-propiolactone 1840', 'O=C1CCO1', 1840], ['b-propiolactone 1820', 'O=C1CCO1', 1820],
  ['ethylene carbonate 1800', 'O=C1OCCO1', 1800], ['ethylene carbonate 1775', 'O=C1OCCO1', 1775],
  ['b-lactam 1765', 'O=C1CCN1', 1765], ['b-lactam 1750', 'O=C1CCN1', 1750], ['b-lactam 1735', 'O=C1CCN1', 1735],
  ['d-valerolactone 1735', 'O=C1CCCCO1', 1735], ['ethyl benzoate 1720', 'CCOC(=O)c1ccccc1', 1720],
  ['cyclopentanone 1745', 'O=C1CCCC1', 1745], ['cyclohexanone 1715', 'O=C1CCCCC1', 1715], ['cyclobutanone 1780', 'O=C1CCC1', 1780],
  ['NMP 1690', 'CN1CCCC1=O', 1690], ['N-methylacetamide 1650', 'CNC(C)=O', 1650], ['caprolactam 1660', 'O=C1CCCCCN1', 1660],
  ['acetic anhydride 1820+1750', 'CC(=O)OC(C)=O', [1820, 1750]], ['acetyl chloride 1800', 'CC(=O)Cl', 1800], ['acetic acid 1710', 'CC(=O)O', 1710],
  ['succinic anhydride 1865+1785', 'O=C1CCC(=O)O1', [1865, 1785]], ['dimethyl carbonate 1750', 'COC(=O)OC', 1750],
  // reverse controls: NOT ring carbonyls, still deducted as in v1.4.0
  ['ethyl acetate @1775', 'CCOC(C)=O', 1775], ['ethyl acetate @1800', 'CCOC(C)=O', 1800], ['cyclohexanone @1775', 'O=C1CCCCC1', 1775],
  ['N-methylacetamide @1750', 'CNC(C)=O', 1750], ['d-valerolactone @1775', 'O=C1CCCCO1', 1775],
];
// the other three groups are switched off in the probes so that only ir.ringCarbonyl acts
const ONLY_RING = {alkylBend: false, esterCO: false, sp2CH: false};
const probes = (on: boolean, sub: Partial<typeof V12_CONFIG.v141IR> = {}) => {
  restore?.(); restore = setV141(on, {...ONLY_RING, ...sub});
  const out: Record<string, {ir: number; missing: string[]}> = {};
  for (const [name, smi, co] of PROBES) { const r = carbonylProbe(smi, co); out[name] = {ir: r.ir, missing: r.missing}; }
  return out;
};

// v1.4.0 behaviour of the probes (flag off): [IR score, class of the missing-carbonyl item or '']
const OFF: Record<string, [number, string]> = {
  'ethyl acetate 1745': [39.3, ''], 'GBL 1795': [17.5, 'ESTER'], 'GBL 1775': [27.9, 'ESTER'], 'GBL 1760': [39.3, ''], 'GBL 1745': [39.3, ''], 'butenolide 1760': [27, ''], 'a-methylene-GBL 1765': [20.2, 'ESTER'],
  'b-propiolactone 1840': [13.3, 'ESTER'], 'b-propiolactone 1820': [13.5, 'ESTER'], 'ethylene carbonate 1800': [19.1, ''], 'ethylene carbonate 1775': [33.5, ''],
  'b-lactam 1765': [13.3, 'AMIDE'], 'b-lactam 1750': [13.5, 'AMIDE'], 'b-lactam 1735': [14.8, 'AMIDE'],
  'ethyl acetate @1775': [27.9, 'ESTER'], 'cyclohexanone @1775': [14.8, 'KETONE'], 'N-methylacetamide @1750': [13.5, 'AMIDE'], 'd-valerolactone @1775': [27.9, 'ESTER'],
  'd-valerolactone 1735': [39.3, ''], 'cyclopentanone 1745': [39.3, ''], 'cyclohexanone 1715': [39.3, ''], 'succinic anhydride 1865+1785': [37.8, ''],
};
const nm = (r: {ir: number; missing: string[]}) => r.missing.map(m => m.replace('IR:carbonyl-missing:', '')).join(',');

describe('ir.ringCarbonyl: flag off (parent off, or parent on with the sub-flag off) is the v1.4.0 behaviour for every probe', () => {
  for (const [label, on, sub] of [['useV141IR off', false, {}], ['useV141IR on, ringCarbonyl off', true, {ringCarbonyl: false}], ['useV141IR off, ringCarbonyl on', false, {ringCarbonyl: true}]] as const) {
    it(label, () => {
      const got = probes(on, sub);
      for (const [k, [ir, miss]] of Object.entries(OFF)) { expect(got[k].ir, k).toBeCloseTo(ir, 1); expect(nm(got[k]), k).toBe(miss); }
    });
  }
});

describe('ir.ringCarbonyl on: the ring-strained carbonyls lose the wrong deduction and gain a band; every other probe is unchanged', () => {
  it('gamma-lactone, beta-propiolactone, butenolide, cyclic carbonate: same IR as ethyl acetate at 1745, no missing-carbonyl item', () => {
    const on = probes(true);
    const ref = on['ethyl acetate 1745'].ir; expect(ref).toBeCloseTo(39.3, 1);
    for (const k of ['GBL 1795', 'GBL 1775', 'GBL 1760', 'GBL 1745', 'butenolide 1760', 'a-methylene-GBL 1765', 'b-propiolactone 1840', 'b-propiolactone 1820', 'ethylene carbonate 1800', 'ethylene carbonate 1775']) {
      expect(on[k].ir, k).toBeCloseTo(ref, 1); expect(on[k].missing, k).toEqual([]);
    }
  });
  it('beta-lactam: no missing item, IR at the level of the other amides', () => {
    const on = probes(true);
    const amide = on['N-methylacetamide 1650'].ir;
    for (const k of ['b-lactam 1765', 'b-lactam 1750', 'b-lactam 1735']) { expect(on[k].ir, k).toBeCloseTo(amide, 1); expect(on[k].missing, k).toEqual([]); }
  });
  it('everything that is not a ring-strained carbonyl keeps its v1.4.0 IR score and deduction (incl. succinic anhydride: the lactone band must not hit the five-membered anhydride)', () => {
    const off = probes(false), on = probes(true);
    for (const k of ['ethyl acetate 1745', 'd-valerolactone 1735', 'ethyl benzoate 1720', 'cyclopentanone 1745', 'cyclohexanone 1715', 'cyclobutanone 1780', 'NMP 1690', 'N-methylacetamide 1650', 'caprolactam 1660',
      'acetic anhydride 1820+1750', 'acetyl chloride 1800', 'acetic acid 1710', 'succinic anhydride 1865+1785', 'dimethyl carbonate 1750']) {
      expect(on[k].ir, k).toBe(off[k].ir); expect(on[k].missing, k).toEqual(off[k].missing);
    }
    expect(on['succinic anhydride 1865+1785'].ir).toBeCloseTo(37.8, 1);
  });
  it('reverse controls: an acyclic ester or a cyclohexanone or a delta-lactone at 1775/1800, an amide at 1750 are still deducted exactly as in v1.4.0', () => {
    const off = probes(false), on = probes(true);
    for (const k of ['ethyl acetate @1775', 'ethyl acetate @1800', 'cyclohexanone @1775', 'N-methylacetamide @1750', 'd-valerolactone @1775']) {
      expect(on[k].missing.length, k).toBe(1); expect(on[k].ir, k).toBe(off[k].ir); expect(on[k].missing, k).toEqual(off[k].missing);
    }
  });
});

describe('ir.ringCarbonyl: never a deduction that v1.4.0 did not make (the new windows run down to the old window)', () => {
  // an ordinary ester band (1740) next to a four-membered-ring lactone candidate, an ordinary amide band (1660) next to a beta-lactam candidate: v1.4.0 did not deduct, so neither may the new classes
  const NEVER: [string, string, number][] = [['b-propiolactone 1740', 'O=C1CCO1', 1740], ['b-propiolactone 1715', 'O=C1CCO1', 1715], ['GBL 1715', 'O=C1CCCO1', 1715], ['b-lactam 1660', 'O=C1CCN1', 1660], ['b-lactam 1635', 'O=C1CCN1', 1635],
    ['2-methyl-oxetanone ester band 1735', 'COC1C(=O)OC1(C)C', 1735]];
  it('IR score and missing-carbonyl item: the same or better than v1.4.0', () => {
    for (const [name, smi, co] of NEVER) {
      restore?.(); restore = setV141(false); const off = carbonylProbe(smi, co);
      restore?.(); restore = setV141(true, ONLY_RING); const on = carbonylProbe(smi, co);
      expect(on.missing.length, name).toBeLessThanOrEqual(off.missing.length); expect(on.ir, name).toBeGreaterThanOrEqual(off.ir - 1e-9);
    }
  });
});

describe('ir.ringCarbonyl: the gates (SMARTS) and the carbonyl classes', () => {
  const ids = (smi: string) => irCandidateBands(smi, true).map(k => k.id).filter(i => ['lactone-r5', 'lactone-r4', 'lactam-r4', 'carbonate-r5'].includes(i));
  it('flag off: none of the four bands is ever offered', () => {
    restore?.(); restore = setV141(false);
    for (const smi of ['O=C1CCCO1', 'O=C1CCO1', 'O=C1CCN1', 'O=C1OCCO1']) expect(ids(smi), smi).toEqual([]);
  });
  it('flag on: each band belongs to its ring carbonyl only', () => {
    restore?.(); restore = setV141(true);
    expect(ids('O=C1CCCO1')).toEqual(['lactone-r5']); expect(ids('O=C1C=CCO1')).toEqual(['lactone-r5']); expect(ids('C=C1CCOC1=O')).toEqual(['lactone-r5']);
    expect(ids('O=C1CCO1')).toEqual(['lactone-r4']); expect(ids('O=C1CCN1')).toEqual(['lactam-r4']); expect(ids('O=C1OCCO1')).toEqual(['carbonate-r5']);
    for (const smi of ['CCOC(C)=O', 'O=C1CCCCO1', 'O=C1CCCC1', 'O=C1CCCCC1', 'O=C1CCC1', 'CN1CCCC1=O', 'O=C1CCCCCN1', 'COC(=O)OC', 'CC(=O)OC(C)=O', 'O=C1CCC(=O)O1', 'CCOC(N)=O']) expect(ids(smi), smi).toEqual([]);
  });
  it('flag on, sub-flag off: no band', () => { restore?.(); restore = setV141(true, {ringCarbonyl: false}); expect(ids('O=C1CCCO1')).toEqual([]); });
  it('the real-compound panel (55): 4 five-membered lactones, 1 four-membered lactone, 0 beta-lactams, 1 five-membered cyclic carbonate; no anhydride among them', () => {
    restore?.(); restore = setV141(true);
    const hit = (id: string) => REAL_STRUCTURE_PANEL.filter(([, smi]) => ids(smi).includes(id)).map(r => r[0]);
    expect(REAL_STRUCTURE_PANEL.length).toBe(55);
    expect(hit('lactone-r5').length).toBe(4); expect(hit('lactone-r4')).toEqual(['beta-propiolactone']); expect(hit('lactam-r4')).toEqual([]); expect(hit('carbonate-r5')).toEqual(['ethylene carbonate']);
  });
  it('carbonyl classes: ESTER / AMIDE no longer claim the ring carbonyls; LACTONE5 / LACTONE4 / LACTAM4 do; flag off is the v1.4.0 list', () => {
    const cls = (smi: string) => candidateCarbonylClassesV130(smi).map(c => c.id).join('+');
    restore?.(); restore = setV141(false);
    expect(cls('O=C1CCCO1')).toBe('ESTER'); expect(cls('O=C1CCN1')).toBe('AMIDE'); expect(cls('O=C1CCO1')).toBe('ESTER');
    restore?.(); restore = setV141(true);
    expect(cls('O=C1CCCO1')).toBe('LACTONE5'); expect(cls('O=C1CCO1')).toBe('LACTONE4'); expect(cls('O=C1CCN1')).toBe('LACTAM4'); expect(cls('O=C1C=CCO1')).toBe('LACTONE5');
    expect(cls('CCOC(C)=O')).toBe('ESTER'); expect(cls('O=C1CCCCO1')).toBe('ESTER'); expect(cls('CNC(C)=O')).toBe('AMIDE'); expect(cls('CN1CCCC1=O')).toBe('AMIDE'); expect(cls('O=C1CCC(=O)O1')).toBe('ANHYDRIDE');
    expect(cls('O=C1CCCO1.CCOC(C)=O')).toBe('ESTER+LACTONE5'); // both present: the ordinary ester keeps its own class
    expect(cls('O=C1OCCO1')).toBe(''); // carbonates have no missing-carbonyl class (v1.3.0: not modelled)
    expect(candidateCarbonylClasses('O=C1CCCO1').map(c => c.id)).toEqual(['LACTONE5']); // the v1.2.1 six-class path follows the same flag
  });
  it('windows of the new classes (textbook-style, uncalibrated; wide, down to the lower edge of the class they replace = never a new deduction)', () => {
    restore?.(); restore = setV141(true);
    const w = (smi: string) => candidateCarbonylClassesV130(smi)[0].windowCm1;
    expect(w('O=C1CCCO1')).toEqual([1710, 1810]); expect(w('O=C1CCO1')).toEqual([1710, 1860]); expect(w('O=C1CCN1')).toEqual([1630, 1800]);
  });
});

describe('ir.ringCarbonyl: single-peak compatibility of the new bands (range, edge, outside; +-10 cm-1)', () => {
  const peak = (x: number): SpectralPeak => ({id: `p${x}`, x, y: 100, intensityKnown: true} as unknown as SpectralPeak);
  const compat = (id: string, smi: string, x: number, companion: number) => { const k = irCandidateBands(smi, true).find(b => b.id === id)!; return irBandMatch(k, peak(x), [peak(x), peak(companion)]); };
  it('lactone-r5 1760-1800 (companion 1000-1300)', () => {
    restore?.(); restore = setV141(true);
    for (const x of [1760, 1780, 1800]) expect(compat('lactone-r5', 'O=C1CCCO1', x, 1170), String(x)).toBeCloseTo(1, 2);
    expect(compat('lactone-r5', 'O=C1CCCO1', 1750, 1170)).toBeCloseTo(Math.exp(-.5), 2); expect(compat('lactone-r5', 'O=C1CCCO1', 1810, 1170)).toBeCloseTo(Math.exp(-.5), 2); expect(compat('lactone-r5', 'O=C1CCCO1', 1840, 1170)).toBeLessThan(.02);
  });
  it('lactone-r4 1810-1850, lactam-r4 1730-1790 (companion 1500-1650), carbonate-r5 1775-1850', () => {
    restore?.(); restore = setV141(true);
    expect(compat('lactone-r4', 'O=C1CCO1', 1830, 1170)).toBeCloseTo(1, 2); expect(compat('lactone-r4', 'O=C1CCO1', 1800, 1170)).toBeCloseTo(Math.exp(-.5), 2);
    expect(compat('lactam-r4', 'O=C1CCN1', 1760, 1550)).toBeCloseTo(1, 2); expect(compat('lactam-r4', 'O=C1CCN1', 1760, 1170)).toBeCloseTo(.65, 2); expect(compat('lactam-r4', 'O=C1CCN1', 1720, 1550)).toBeCloseTo(Math.exp(-.5), 2);
    expect(compat('carbonate-r5', 'O=C1OCCO1', 1800, 1170)).toBeCloseTo(1, 2); expect(compat('carbonate-r5', 'O=C1OCCO1', 1765, 1170)).toBeCloseTo(Math.exp(-.5), 2);
  });
});
