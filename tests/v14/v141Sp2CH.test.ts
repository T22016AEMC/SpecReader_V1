import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irBandMatch, irCandidateBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {irProbe, setV141} from '../helpers/v141Probe';
import type {SpectralPeak} from '../../src/types/spectrum';

// v1.4.1 stop 18 (2): ir.sp2CH. A 3000-3100 band for sp2 C-H (aromatic, alkene, epoxide and cyclopropane C-H, and - since stop 19 - C-H on a carbon with two or more Cl / Br: CHCl3, CH2Cl2, CHBr3, CH2Br2, CH3-CHCl2) and a one-sided narrowing of the upper edge of the aliphatic C-H band
// (uncertainty 20 -> 8 above 3000 cm-1). Ranges textbook-style, UNCALIBRATED; the +-10 and the 8 are engineering judgement. Probes are hand-written textbook positions, not measured spectra.
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
const use = (parent: boolean, sub: Parameters<typeof setV141>[1] = {}) => { restore?.(); restore = setV141(parent, sub); };
afterAll(() => restore?.());
const pk = (x: number): SpectralPeak => ({id: `p${x}`, x, y: 100, intensityKnown: true} as unknown as SpectralPeak);
const band = (smi: string, id: string) => irCandidateBands(smi, true).find(k => k.id === id);
// the other three groups are switched off in the probes so that only ir.sp2CH acts
const ONLY_SP2 = {alkylBend: false, esterCO: false, ringCarbonyl: false};
const ONLY_SP2_ALONE = {alkylBend: false, esterCO: false, ringCarbonyl: false};
const has = (smi: string) => irCandidateBands(smi, true).some(k => k.id === 'sp2-ch');

describe('ir.sp2CH: the gate (which candidates get the 3005-3100 band)', () => {
  it('flag off, or sub-flag off: nobody gets it', () => {
    for (const [p, s] of [[false, {}], [true, {sp2CH: false}]] as const) { use(p, s); for (const smi of ['c1ccccc1', 'C=CCCCCCC', 'C1CO1']) expect(has(smi), `${p} ${JSON.stringify(s)} ${smi}`).toBe(false); }
  });
  it('flag on: aromatic C-H, =CH / =CH2, epoxide and cyclopropane C-H', () => {
    use(true);
    for (const smi of ['c1ccccc1', 'Cc1ccccc1', 'c1ccoc1', 'c1ccncc1', 'C=CCCCCCC', 'CCCCC=CCC', 'C=CC(=O)OC', 'C=CC#N', 'C1CO1', 'CC1CO1', 'C1CC1', 'C1CCC=CC1']) expect(has(smi), smi).toBe(true);
  });
  it('flag on: no sp2-type C-H -> no band (alkane, alcohol, ketone, ester, ether, nitrile, alkyne, CCl4 (no H), a single halogen on the carbon, F / I only, quaternary aromatic carbons only)', () => {
    use(true);
    for (const smi of ['CCCCCCC', 'CCO', 'CC(C)=O', 'CCOC(C)=O', 'CCOCC', 'CC#N', 'C#CCCC', 'ClC(Cl)(Cl)Cl', 'BrC(Br)(Br)Br', 'ClCC', 'ClCCCl', 'BrCCBr', 'ClC(F)F', 'IC(I)I', 'FC(F)F', 'CC(C)=C(C)C', 'Clc1c(Cl)c(Cl)c(Cl)c(Cl)c1Cl', 'C1CCCCC1', 'C1CCOC1']) expect(has(smi), smi).toBe(false);
  });
  it('the real-compound panel (55): 25 structures have the band (aromatic cH 6, =CH / =CH2 11, three-membered ring C-H 10, with overlaps); none of the others', () => {
    use(true);
    const hit = REAL_STRUCTURE_PANEL.filter(r => has(r[1])).map(r => r[0]);
    expect(REAL_STRUCTURE_PANEL.length).toBe(55); expect(hit.length).toBe(25);
    for (const n of ['ethylene oxide', 'cyclohexene oxide', 'furan', '2-methylfuran', 'benzofuran', 'methyl vinyl ether', 'cyclobutene', 'benzocyclobutene']) expect(hit, n).toContain(n);
    for (const n of ['oxetane', 'ethylene carbonate', 'beta-propiolactone', 'gamma-butyrolactone', 'delta-valerolactone']) expect(hit, n).not.toContain(n);
  });
});

describe('ir.sp2CH: single-peak compatibility', () => {
  it('sp2-ch 3005-3100, +-10: full inside, exp(-1/2) at 10 cm-1 outside, ~0 far away', () => {
    use(true);
    const k = band('c1ccccc1', 'sp2-ch')!; expect(k.range).toEqual([3005, 3100]); expect(k.uncertainty).toBe(10);
    for (const x of [3005, 3030, 3100]) expect(irBandMatch(k, pk(x), [pk(x)]), String(x)).toBeCloseTo(1, 6);
    expect(irBandMatch(k, pk(2995), [pk(2995)])).toBeCloseTo(Math.exp(-.5), 6); expect(irBandMatch(k, pk(3110), [pk(3110)])).toBeCloseTo(Math.exp(-.5), 6); expect(irBandMatch(k, pk(2960), [pk(2960)])).toBeLessThan(.02);
  });
  it('aliphatic C-H: the upper edge uncertainty is 8 (sp2CH on) instead of 20; inside the band and below it nothing changes', () => {
    const comp = pk(1400), at = (x: number) => { const k = band('CCCCCCC', 'aliphatic-ch')!; return irBandMatch(k, pk(x), [pk(x), comp]); };
    use(false);
    for (const x of [3010, 3030, 3050]) expect(at(x), `off ${x}`).toBeCloseTo(Math.exp(-.5 * ((x - 3000) / 20) ** 2), 6);
    use(true);
    for (const x of [3010, 3030, 3050]) expect(at(x), `on ${x}`).toBeCloseTo(Math.exp(-.5 * ((x - 3000) / 8) ** 2), 6);
    for (const x of [2850, 2930, 3000, 2830, 2800]) { const on = at(x); use(false); expect(at(x), `x ${x}`).toBe(on); use(true); }
    use(true, {sp2CH: false}); expect(at(3030)).toBeCloseTo(Math.exp(-.5 * (30 / 20) ** 2), 6);
  });
  it('the narrowing is a field of the band only for the candidate score: the IR reading list (inferIRBands) and Mode B keep the v1.4.0 band', () => {
    use(true);
    const reading = irCandidateBands('CCCCCCC', false).find(k => k.id === 'aliphatic-ch')!;
    expect((reading as unknown as {uncertaintyAbove?: number}).uncertaintyAbove).toBeUndefined();
    expect((band('CCCCCCC', 'aliphatic-ch') as unknown as {uncertaintyAbove?: number}).uncertaintyAbove).toBe(8);
    expect(irCandidateBands('c1ccccc1', false).some(k => k.id === 'sp2-ch')).toBe(false);
  });
});

describe('ir.sp2CH: textbook probes (IR score; relations, the exact snapshot is in v141FlagOnSnapshot)', () => {
  const D2 = [[3030, 50], [2920, 60], [1605, 65], [1495, 40], [1460, 60], [730, 15], [695, 10]].map(([x, y]) => ({x, y}));
  const D5 = [[3020, 60], [2960, 10], [2930, 15], [1655, 85], [1460, 55], [965, 45]].map(([x, y]) => ({x, y}));
  const ir = (smi: string, peaks: {x: number; y: number}[]) => irProbe(smi, peaks).ir;
  it('with a 3030 peak, aromatic and alkene candidates gain, alkanes lose a little (they no longer take the 3030 peak from the tail of the 2850-3000 band)', () => {
    use(false); const off = {benzene: ir('c1ccccc1', D2), heptane: ir('CCCCCCC', D2), octene: ir('C=CCCCCCC', D5), octane: ir('CCCCCCCC', D5)};
    use(true, ONLY_SP2); const on = {benzene: ir('c1ccccc1', D2), heptane: ir('CCCCCCC', D2), octene: ir('C=CCCCCCC', D5), octane: ir('CCCCCCCC', D5)};
    expect(on.benzene).toBeGreaterThan(off.benzene); expect(on.octene).toBeGreaterThan(off.octene);
    expect(on.heptane).toBeLessThan(off.heptane); expect(on.octane).toBeLessThan(off.octane);
    expect(on.octene - on.octane).toBeGreaterThan(off.octene - off.octane);
  });
  it('sub-flag off, or parent off: the probes are the v1.4.0 numbers', () => {
    use(false); const off = [ir('c1ccccc1', D2), ir('CCCCCCC', D2), ir('C=CCCCCCC', D5), ir('CCCCCCCC', D5)];
    use(true, {...ONLY_SP2, sp2CH: false}); expect([ir('c1ccccc1', D2), ir('CCCCCCC', D2), ir('C=CCCCCCC', D5), ir('CCCCCCCC', D5)]).toEqual(off);
  });
});

describe('ir.sp2CH stop 19: C-H on a carbon with two or more Cl / Br (CHCl3, CH2Cl2, CHBr3, CH2Br2) is in the gate', () => {
  it('gate: >= 2 Cl or Br on the same carbon and at least one H on it; nothing wider', () => {
    use(true);
    for (const smi of ['ClC(Cl)Cl', 'ClCCl', 'BrC(Br)Br', 'BrCBr', 'ClCBr', 'CC(Cl)Cl', 'ClC(Cl)c1ccccc1']) expect(has(smi), smi).toBe(true);
    for (const smi of ['ClC(Cl)(Cl)Cl', 'BrC(Br)(Br)Br', 'ClCC', 'ClCCCl', 'BrCCBr', 'CCBr', 'FC(F)Cl', 'IC(I)I', 'ClC(Cl)(Cl)C', 'ClCCC']) expect(has(smi), smi).toBe(false);
    use(true, {sp2CH: false}); expect(has('ClC(Cl)Cl')).toBe(false);
  });
  // textbook positions (CHCl3 3020 / 1215 / 760 / 670; CH2Cl2 3050 / 2990 / 1265 / 740 / 700; CH2Br2 3050 / 2990 / 1190 / 810 / 650; CHBr3 3030 / 1140 / 660 hand-written), not measured spectra
  const T: [string, string, number[][]][] = [
    ['chloroform', 'ClC(Cl)Cl', [[3020, 40], [1215, 15], [760, 10], [670, 12]]],
    ['dichloromethane', 'ClCCl', [[3050, 40], [2990, 50], [1265, 20], [740, 10], [700, 15]]],
    ['dibromomethane', 'BrCBr', [[3050, 40], [2990, 50], [1190, 20], [810, 10], [650, 15]]],
    ['bromoform', 'BrC(Br)Br', [[3030, 40], [1140, 15], [660, 10]]],
    ['1,1-dichloroethane', 'CC(Cl)Cl', [[3010, 50], [2980, 40], [1450, 55], [1380, 50], [1070, 30], [730, 10]]],
  ];
  it('the IR score with a 3000-3040 (or 3050) peak is not lower than v1.4.0 for any of them: all four groups on, and sp2CH alone', () => {
    use(false); const off = T.map(([, s, p]) => irProbe(s, p.map(([x, y]) => ({x, y}))).ir);
    for (const sub of [{}, ONLY_SP2_ALONE]) {
      use(true, sub); const on = T.map(([, s, p]) => irProbe(s, p.map(([x, y]) => ({x, y}))).ir);
      T.forEach(([n], i) => expect(on[i], `${n} ${JSON.stringify(sub)}: ${off[i]} -> ${on[i]}`).toBeGreaterThanOrEqual(off[i] - 1e-9));
    }
  });
  it('carbon tetrachloride (no H): no band, and its IR score does not change with the flag', () => {
    const p = [[1540, 10], [790, 5], [760, 5]].map(([x, y]) => ({x, y}));
    use(false); const off = irProbe('ClC(Cl)(Cl)Cl', p).ir;
    use(true); expect(has('ClC(Cl)(Cl)Cl')).toBe(false); expect(irProbe('ClC(Cl)(Cl)Cl', p).ir).toBe(off);
  });
});

// v1.4.2 stop 29 (D): inside ir.sp2CH. A CH3 / CH2 on a sulfur that carries S=O (sulfone, sulfoxide, sulfonamide, sulfonate: the S side) has its C-H stretch above 3000 (textbook ~3010-3030); stop 27 found dimethyl sulfone 23.04 -> 20.35
// with ir141 on (3017 / 3026 were taken by the narrowed 8 cm-1 tail). For such a candidate the upper edge of the aliphatic C-H band is the textbook 3030. Flag off: bit for bit the same.
describe('ir.sp2CH stop 29 (D): CH3 / CH2 on an S=O sulfur', () => {
  const SULFONYL = ['CS(C)(=O)=O', 'CS(C)=O', 'CS(N)(=O)=O', 'CS(=O)(=O)N(C)C', 'CCS(=O)(=O)C', 'CCS(=O)(=O)CC', 'O=S1(=O)CCCC1', 'CS(=O)(=O)c1ccccc1', 'CS(=O)(=O)OC'];
  const NOT = ['CCCCCCC', 'CSC', 'CCSCC', 'COC', 'CN(C)C=O', 'O=S(=O)(c1ccccc1)c1ccccc1', 'O=S(c1ccccc1)c1ccccc1', 'Nc1ccc(cc1)S(N)(=O)=O', 'CC(C)=O'];
  const aliph = (smi: string) => band(smi, 'aliphatic-ch');
  const at = (smi: string, x: number) => irBandMatch(aliph(smi)!, pk(x), [pk(x), pk(1400)]);
  it('the upper edge of the aliphatic C-H band is 3030 for a sulfonyl-C-H candidate (sp2CH on), 3000 for every other candidate and when the flag or the sub-flag is off', () => {
    use(true);
    for (const smi of SULFONYL) expect(aliph(smi)!.range, smi).toEqual([2850, 3030]);
    for (const smi of NOT) { const k = aliph(smi); if (k) expect(k.range, smi).toEqual([2850, 3000]); }
    for (const [p, s] of [[false, {}], [true, {sp2CH: false}]] as const) { use(p, s); for (const smi of SULFONYL) expect(aliph(smi)!.range, `${p} ${JSON.stringify(s)} ${smi}`).toEqual([2850, 3000]); }
  });
  it('a 3017 / 3026 / 3030 peak is a full match for dimethyl sulfone (was exp(-.5 (17/8)^2) = 0.10, 0.004 and 0.00 under the narrowed band); above 3030 the 8 cm-1 tail; heptane is unchanged', () => {
    use(true);
    const m = (x: number) => { const k = aliph('CS(C)(=O)=O')!; return irBandMatch(k, pk(x), [pk(x), pk(1400)]); };
    const full = m(2930); for (const x of [3017, 3026, 3030]) expect(m(x), String(x)).toBeCloseTo(full, 9);
    expect(m(3040)).toBeCloseTo(full * Math.exp(-.5 * (10 / 8) ** 2), 9);
    for (const x of [3010, 3030, 3050]) expect(at('CCCCCCC', x), `heptane ${x}`).toBeCloseTo(Math.exp(-.5 * ((x - 3000) / 8) ** 2), 6); // the stop-18 narrowing, untouched
  });
  it('flag off (parent off, or sub-flag off): the candidate bands of the sulfonyl candidates are exactly the v1.4.0 bands, entry by entry; sp2CH on changes ONLY the aliphatic-ch band of these candidates and for the non-sulfonyl ones nothing relative to stop 18', () => {
    for (const smi of [...SULFONYL, ...NOT]) {
      use(false); const off = JSON.stringify(irCandidateBands(smi, true));
      use(true, {...ONLY_SP2, sp2CH: false}); expect(JSON.stringify(irCandidateBands(smi, true)), smi).toBe(off); // ir141 on with every group off: the v1.4.0 list
    }
    for (const smi of SULFONYL) {
      use(true, {...ONLY_SP2, sp2CH: false}); const a = irCandidateBands(smi, true); use(true, ONLY_SP2); const b = irCandidateBands(smi, true).filter(k => !['sp2-ch'].includes(k.id));
      expect(b.map(k => k.id), smi).toEqual(a.map(k => k.id));
      for (const k of b) if (k.id !== 'aliphatic-ch') expect(JSON.stringify(k), `${smi} ${k.id}`).toBe(JSON.stringify(a.find(o => o.id === k.id)));
    }
  });
  it('textbook probes: dimethyl sulfone / DMSO / methanesulfonamide with C-H at 3020 and 2930 are not lower with ir141 (sp2CH alone and all groups) than with ir141 off', () => {
    const T: [string, string, number[][]][] = [
      ['dimethyl sulfone', 'CS(C)(=O)=O', [[3020, 40], [2930, 60], [1420, 50], [1320, 10], [1140, 10], [960, 40]]],
      ['DMSO', 'CS(C)=O', [[3000, 40], [2910, 50], [1430, 40], [1050, 10], [950, 40]]],
      ['methanesulfonamide', 'CS(N)(=O)=O', [[3350, 30], [3250, 30], [3020, 45], [2930, 60], [1320, 10], [1140, 10]]],
    ];
    use(false); const off = T.map(([, s, p]) => irProbe(s, p.map(([x, y]) => ({x, y}))).ir);
    for (const sub of [{}, ONLY_SP2_ALONE]) { use(true, sub); T.forEach(([n, s, p], i) => expect(irProbe(s, p.map(([x, y]) => ({x, y}))).ir, `${n} ${JSON.stringify(sub)}`).toBeGreaterThanOrEqual(off[i] - 1e-9)); }
  });
});
