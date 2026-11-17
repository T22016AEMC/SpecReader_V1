import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {BASE6, CH_BASE, negProbe, setV142} from '../helpers/v142Probe';
import type {NegTable} from '../helpers/v142Probe';

// v1.4.2 stop 25 (2): ir.negativeEvidence = a candidate that HAS a nitrile or a C-nitro group (A tier, share 0.15 of its other IR weight) or a terminal alkyne C-H (B tier, share 0.075) but whose peak table has no such band is deducted;
// never rejected. Sub-flag DEFAULT OFF (planner decision: no real nitrile / nitro / alkyne data has verified the false-deduction rate; the design report's 0 / 0 false deductions on its corpus is NOT evidence of safety).
// Data gate (all must hold): the v1.3.0 missing-carbonyl status (peaks on both sides of the carbonyl region / image calibration), the table confirmed complete (CONFIRMED_COMPLETE), no unconfirmed automatic peak, at least 6 marked peaks.
// Windows are textbook-style ranges, UNCALIBRATED; shares, cap 0.20, present thresholds (nitrile 3 % since stop 29 [was 10 %], nitro 30 %), the +-10 edge and the 6-peak minimum are ENGINEERING JUDGEMENT (工程判斷，未查證).
// Probe tables are hand-written (circular: positions in the middle of the window), not measured spectra: they test wiring and gates only.
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
const use = (parent: boolean, sub: Parameters<typeof setV142>[1] = {}) => { restore?.(); restore = setV142(parent, sub); };
afterAll(() => restore?.());
const ON = () => use(true, {negativeEvidence: true});
const t = (...extra: {x: number; y: number}[]): NegTable => ({peaks: [...BASE6, ...extra]});
const NITRILE = 'CCCCC#N', NITRO = 'CC[N+](=O)[O-]', ALKYNE = 'C#CCCCC';

describe('ir2.negativeEvidence: defaults and flag-off equality', () => {
  it('default OFF: parent on and alkeneOOP on, negativeEvidence at its default (false): no item', () => { use(true); expect(V12_CONFIG.v142IR.negativeEvidence).toBe(false); expect(negProbe(NITRILE).ids).toEqual([]); });
  it('flag off / parent off / sub-flag off: the ledger is the v1.4.1 ledger, entry by entry', () => {
    for (const smi of [NITRILE, NITRO, ALKYNE, 'CCCCCC']) {
      use(false); const a = negProbe(smi).ledger;
      use(true, {alkeneOOP: false, negativeEvidence: false}); const b = negProbe(smi).ledger;
      use(false, {negativeEvidence: true}); const c = negProbe(smi).ledger; // parent off wins over the sub-flag
      expect(JSON.stringify(b), smi).toBe(JSON.stringify(a)); expect(JSON.stringify(c), smi).toBe(JSON.stringify(a));
    }
  });
});

describe('ir2.negativeEvidence: nitrile (A tier, 0.15)', () => {
  it('missing band: one item, share 0.15 of the other IR weight, IR score and total fall; band present: nothing', () => {
    use(false); const off = negProbe(NITRILE); ON(); const miss = negProbe(NITRILE), has = negProbe(NITRILE, t({x: 2245, y: 50}));
    expect(miss.ids).toEqual(['IR:neg:nitrile']); expect(miss.share[0]).toBeCloseTo(0.15, 6); expect(miss.ir).toBeLessThan(off.ir); expect(miss.total).toBeLessThan(off.total);
    expect(has.ids).toEqual([]);
    use(false); expect(negProbe(NITRILE, t({x: 2245, y: 50})).ir).toBe(has.ir); // with the band there is nothing to deduct: same as flag off
  });
  it('window 2200-2270 widened by 10: 2190 / 2200 / 2280 count as present; 2150 / 2290 do not', () => {
    ON();
    for (const x of [2190, 2200, 2235, 2270, 2280]) expect(negProbe(NITRILE, t({x, y: 50})).ids, String(x)).toEqual([]);
    for (const x of [2150, 2290]) expect(negProbe(NITRILE, t({x, y: 50})).ids, String(x)).toEqual(['IR:neg:nitrile']);
  });
  it('a weak mark counts: >= 3 % of the strongest band is present (stop 29: was 10 %), a fainter mark is not', () => {
    ON(); // measured on the processed table (smoothed, relative to the strongest band): a mark at T 85 % is 10.5 % of the strongest band, T 90 % is 6.7 %, T 94 % is just above 3 %, T 95 % just below
    expect(negProbe(NITRILE, t({x: 2245, y: 85})).ids).toEqual([]);
    expect(negProbe(NITRILE, t({x: 2245, y: 90})).ids).toEqual([]); // 6.7 %: was deducted at the 10 % threshold (a gas-phase nitrile band is only 4.5-6.9 % of the strongest band: propanenitrile, isobutyronitrile of stop 27)
    expect(negProbe(NITRILE, t({x: 2245, y: 94})).ids).toEqual([]);
    expect(negProbe(NITRILE, t({x: 2245, y: 95})).ids).toEqual(['IR:neg:nitrile']);
  });
  it('alpha-hetero nitriles (cyanohydrin, alpha-amino nitrile, alpha-halo nitrile) and non-nitriles (isonitrile, cyanamide, thiocyanate) are not asked for the band', () => {
    ON(); for (const smi of ['CC(O)C#N', 'CN(C)CC#N', 'ClCC#N', 'C[N+]#[C-]', 'CN(C)C#N', 'CSC#N']) expect(negProbe(smi).ids, smi).toEqual([]);
  });
  it('conjugated / aromatic nitrile (benzonitrile) is covered', () => { ON(); expect(negProbe('N#Cc1ccccc1').ids).toEqual(['IR:neg:nitrile']); expect(negProbe('N#Cc1ccccc1', t({x: 2228, y: 50})).ids).toEqual([]); });
  it('control candidates (no nitrile / nitro / terminal alkyne): never touched', () => {
    use(true, {alkeneOOP: false}); const off = ['CCCCCC', 'ClCCCCCC', 'CC(C)=O', 'Cc1ccccc1'].map(s => JSON.stringify(negProbe(s).ledger));
    use(true, {alkeneOOP: false, negativeEvidence: true}); expect(['CCCCCC', 'ClCCCCCC', 'CC(C)=O', 'Cc1ccccc1'].map(s => JSON.stringify(negProbe(s).ledger))).toEqual(off);
  });
});

describe('ir2.negativeEvidence: nitro (A tier, 0.15, asymmetric band 1500-1570 only)', () => {
  it('the asymmetric band is what counts: both bands -> nothing; asymmetric only -> nothing; symmetric only or neither -> deducted', () => {
    ON();
    expect(negProbe(NITRO, t({x: 1555, y: 30}, {x: 1380, y: 30})).ids).toEqual([]);       // both bands
    expect(negProbe(NITRO, t({x: 1555, y: 30})).ids).toEqual([]);                         // asymmetric only
    expect(negProbe(NITRO, t({x: 1350, y: 30})).ids).toEqual(['IR:neg:nitro']);           // symmetric only: it is NOT looked at (a CH3 bend ~1375 would fake it)
    expect(negProbe(NITRO).ids).toEqual(['IR:neg:nitro']);                                // neither
    expect(negProbe(NITRO).share[0]).toBeCloseTo(0.15, 6);
  });
  it('30 % of the strongest band is the threshold; window 1500-1570 widened by 10', () => {
    ON();
    // a mark at T 50 % is 36.7 % of the strongest band, T 70 % is 21.7 % (measured on the processed table)
    expect(negProbe(NITRO, t({x: 1490, y: 50})).ids).toEqual([]); expect(negProbe(NITRO, t({x: 1580, y: 50})).ids).toEqual([]);
    expect(negProbe(NITRO, t({x: 1480, y: 50})).ids).toEqual(['IR:neg:nitro']); expect(negProbe(NITRO, t({x: 1590, y: 50})).ids).toEqual(['IR:neg:nitro']);
    expect(negProbe(NITRO, t({x: 1540, y: 70})).ids).toEqual(['IR:neg:nitro']);           // a 22 % mark is not enough
  });
  it('aromatic nitro: a ring band inside the window is a band (not deducted); only a lone 1590 is not', () => {
    ON(); const NB = 'O=[N+]([O-])c1ccccc1';
    expect(negProbe(NB, t({x: 1520, y: 40})).ids).toEqual([]); expect(negProbe(NB, t({x: 1590, y: 40})).ids).toEqual(['IR:neg:nitro']);
    expect(negProbe(NB, t({x: 1540, y: 85})).ids).toEqual([]);                            // a weak ring mark inside the window: any mark counts for an aromatic candidate
    expect(negProbe(NITRO, t({x: 1540, y: 85})).ids).toEqual(['IR:neg:nitro']);           // the same weak mark does not save an aliphatic nitro candidate
  });
  it('nitrate ester, N-nitro and nitroso are not C-nitro groups: no item', () => { ON(); for (const smi of ['CCO[N+](=O)[O-]', 'CN(C)[N+](=O)[O-]', 'CN=O']) expect(negProbe(smi).ids, smi).toEqual([]); });
});

describe('ir2.negativeEvidence: terminal alkyne C-H (B tier, 0.075, stricter)', () => {
  it('missing: one item at half share; 3260-3340 present: nothing; ANY mark in 3200-3400 (an O-H / N-H may cover it): nothing', () => {
    ON(); const miss = negProbe(ALKYNE);
    expect(miss.ids).toEqual(['IR:neg:alkyneCH']); expect(miss.share[0]).toBeCloseTo(0.075, 6);
    expect(negProbe(ALKYNE, t({x: 3300, y: 40})).ids).toEqual([]);
    expect(negProbe(ALKYNE, t({x: 3380, y: 60})).ids).toEqual([]); expect(negProbe(ALKYNE, t({x: 3220, y: 90})).ids).toEqual([]);   // inside the blocking window, however weak
    expect(negProbe(ALKYNE, t({x: 3450, y: 40})).ids).toEqual(['IR:neg:alkyneCH']); // outside it
  });
  it('stop 29: a candidate with an O-H or N-H (alcohol, phenol, amine, amide) is never deducted for the alkyne rule, with or without a mark; a candidate without one still is, and the blocking window is NOT widened (3183 is outside it)', () => {
    ON();
    for (const smi of ['C#CCCCO', 'C#CCO', 'C#Cc1ccc(O)cc1', 'C#CCCCN', 'C#CC(=O)NC']) { expect(negProbe(smi).ids, smi + ' none').toEqual([]); expect(negProbe(smi, t({x: 3183, y: 40})).ids, smi + ' 3183').toEqual([]); }
    for (const smi of [ALKYNE, 'C#CC(=O)OC', 'C#CCOC(C)=O']) { expect(negProbe(smi).ids, smi).toEqual(['IR:neg:alkyneCH']); expect(negProbe(smi, t({x: 3183, y: 40})).ids, smi + ' 3183').toEqual(['IR:neg:alkyneCH']); } // 3183: outside 3200-3400
    expect(negProbe('C#CCCCO', t({x: 3300, y: 40})).ids).toEqual([]);
    // a nitrile / nitro candidate with an O-H is still asked for its own band (the exemption is the alkyne rule's only)
    expect(negProbe('N#CCCCCO').ids).toEqual(['IR:neg:nitrile']);
  });
  it('internal alkyne (no C-H) and a terminal alkyne in a 3200-3400 broad O-H table: no item', () => { ON(); expect(negProbe('CC#CCCC').ids).toEqual([]); expect(negProbe('C#CCCCO', t({x: 3350, y: 60})).ids).toEqual([]); });
});

describe('ir2.negativeEvidence: the data gate (every condition alone)', () => {
  it('all conditions met: deducted (control for the rows below)', () => { ON(); expect(negProbe(NITRILE, {peaks: BASE6}).ids).toEqual(['IR:neg:nitrile']); });
  it('an unconfirmed automatic peak in the analysis table: nothing', () => {
    ON(); expect(negProbe(NITRILE, {peaks: BASE6, autoPeakIndices: [3]}).ids).toEqual([]);
    expect(negProbe(NITRILE, {peaks: BASE6, autoPeakIndices: [0, 1, 2]}).ids).toEqual([]);
  });
  it('fewer than 6 marked peaks: nothing (5 -> none, 6 -> deducted)', () => { ON(); expect(negProbe(NITRILE, {peaks: CH_BASE}).ids).toEqual([]); expect(negProbe(NITRILE, {peaks: BASE6}).ids).toEqual(['IR:neg:nitrile']); });
  it('the table is not confirmed complete: nothing', () => {
    ON(); for (const coverage of ['PARTIAL_MARKERS', 'CONTINUOUS_TRACE']) expect(negProbe(NITRILE, {peaks: BASE6, coverage}).ids, coverage).toEqual([]);
    expect(negProbe(NITRILE, {peaks: BASE6, coverage: 'CONFIRMED_COMPLETE'}).ids).toEqual(['IR:neg:nitrile']);
  });
  it('peaks on one side of the carbonyl region only (the v1.3.0 missing-carbonyl status): nothing', () => {
    ON(); const oneSided = [{x: 2960, y: 10}, {x: 2925, y: 10}, {x: 2855, y: 15}, {x: 2870, y: 20}, {x: 2900, y: 20}, {x: 3010, y: 30}];
    expect(negProbe(NITRILE, {peaks: oneSided}).ids).toEqual([]);
  });
});

describe('ir2.negativeEvidence: share cap and de-duplication', () => {
  it('the summed share of one candidate is at most 0.20 (nitrile + nitro = 0.15 + 0.05; nitrile + terminal alkyne = 0.15 + 0.05)', () => {
    ON();
    const a = negProbe('N#CCCC[N+](=O)[O-]'); expect(a.ids).toEqual(['IR:neg:nitrile', 'IR:neg:nitro']); expect(a.share.reduce((s, x) => s + x, 0)).toBeCloseTo(0.2, 6);
    const b = negProbe('C#CCCC#N'); expect(b.ids).toEqual(['IR:neg:nitrile', 'IR:neg:alkyneCH']); expect(b.share.reduce((s, x) => s + x, 0)).toBeCloseTo(0.2, 6);
    const lone = negProbe('N#CCCC[N+](=O)[O-]', t({x: 2245, y: 50})); expect(lone.ids).toEqual(['IR:neg:nitro']); expect(lone.share[0]).toBeCloseTo(0.15, 6);
  });
  it('a deduction never excludes: compatibility 0, finite score, the item is a "IR:" ledger entry', () => {
    ON(); const p = negProbe(NITRILE); const e = p.ledger.entries.find(x => x.evidenceId === 'IR:neg:nitrile')!;
    expect(e.compatibility).toBe(0); expect(e.contribution).toBe(0); expect(e.weight).toBeGreaterThan(0); expect(e.sourceModality).toBe('IR'); expect(Number.isFinite(p.total)).toBe(true); expect(e.display).toMatch(/腈/);
  });
  it('with a missing-carbonyl item on the same candidate, the new item still applies (a different fact) and the carbonyl item is unchanged', () => {
    ON(); use(false); const off = negProbe('CC(=O)CCC#N').ledger.entries.filter(e => e.evidenceId.startsWith('IR:carbonyl-missing'));
    ON(); const on = negProbe('CC(=O)CCC#N'); expect(on.ids).toEqual(['IR:neg:nitrile']); expect(on.ledger.entries.filter(e => e.evidenceId.startsWith('IR:carbonyl-missing'))).toEqual(off);
  });
  it('IR:coverage 2100-2300 is skipped while the sub-flag is on (it never fires today: the predicted nitrile / alkyne bands are below y = 70; a documentation pin)', () => {
    use(false); expect(negProbe(NITRILE).ledger.entries.some(e => e.evidenceId === 'IR:coverage:2100-2300')).toBe(false);
    ON(); expect(negProbe(NITRILE).ledger.entries.some(e => e.evidenceId === 'IR:coverage:2100-2300')).toBe(false);
  });
});
