import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {inferIRBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {prepareIR} from '../../src/engines/scientificEngines/irSignalProcessing';
import {hasAnhydridePair, isIrOvertone} from '../../src/engines/scientificEngines/irOvertone';
import {candidateCarbonylClassesV130, carbonylMissingStatus} from '../../src/engines/scientificEngines/carbonylClasses';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123, measureSample} from '../helpers/v123Samples';
import type {V121Fixture} from '../helpers/v121Golden';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';

// v1.3.0 stop 1 (flag useV130 ON): E overtone / anhydride pair, G4 missing-carbonyl deduction for every class, G5 DBE demotion.
// SYNTHETIC samples only (tests/fixtures/v130, CDCl3 400 MHz declared; IR is a %T peak table: a weak band has a high y). Nothing real.
const was = {total: V12_CONFIG.useV130, ...V12_CONFIG.v130};
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV130 = true; Object.assign(V12_CONFIG.v130, {intensityDisplay: true, overtone: true, carbonylMissing: true, dbeDemotion: true}); }, 60000);
afterAll(() => { V12_CONFIG.useV130 = was.total; Object.assign(V12_CONFIG.v130, {intensityDisplay: was.intensityDisplay, overtone: was.overtone, carbonylMissing: was.carbonylMissing, dbeDemotion: was.dbeDemotion}); });

const sample = (id: string, edit?: (f: V121Fixture) => void) => { const f = structuredClone(loadV123(`v130/${id}`)); edit?.(f); return f; };
const spectraOf = (f: V121Fixture) => fixtureSpectra(f, {denseBaseline: true}) as Record<string, ExperimentalSpectrumData>;
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(spectraOf(f) as never, {}).bundle;
const missing = (l: ReturnType<typeof scoreScientificEvidence>) => l.entries.filter(e => e.evidenceId.startsWith('IR:carbonyl-missing:'));
const irWeight = (l: ReturnType<typeof scoreScientificEvidence>) => l.entries.filter(e => e.sourceModality === 'IR' && !e.evidenceId.startsWith('IR:carbonyl-missing:') && !e.evidenceId.startsWith('IR:coverage:')).reduce((t, e) => t + e.weight, 0);
const flagOff = <T,>(fn: () => T): T => { V12_CONFIG.useV130 = false; try { return fn(); } finally { V12_CONFIG.useV130 = true; } };

const ACID_C16 = 'Cc1ccc(C(O)(C(=O)O)c2ccc(C)cc2)cc1';   // the carboxylic acid that used to rank first of the p-cresol type
const P_CRESOL = 'Cc1ccc(O)cc1';

describe('E: overtone / combination bands', () => {
  const peak = (x: number, y: number, extra: Partial<SpectralPeak> = {}): SpectralPeak => ({id: `p${x}`, x, y, ...extra} as SpectralPeak);
  const ring = [peak(1618, 25), peak(1601, 22), peak(1516, 70), peak(1236, 100)];
  it('rule: a weak 1650–2000 band next to two ring bands is an overtone; not when strong, not without ring evidence, not outside the range, not with an unknown intensity', () => {
    expect(isIrOvertone(peak(1873, 5), [...ring, peak(1873, 5)])).toBe(true);
    expect(isIrOvertone(peak(1873, 40), [...ring, peak(1873, 40)])).toBe(false);              // not weak
    expect(isIrOvertone(peak(1873, 5), [peak(1873, 5), peak(1236, 100)])).toBe(false);       // no ring evidence
    expect(isIrOvertone(peak(1873, 5), [peak(1873, 5), peak(1601, 22), peak(1236, 100)])).toBe(false); // one ring band is not enough
    expect(isIrOvertone(peak(1725, 5), [...ring, peak(1725, 5)])).toBe(true);                  // inside 1650–2000: the rule is about weakness plus ring evidence
    expect(isIrOvertone(peak(1640, 5), [...ring, peak(1640, 5)])).toBe(false);                 // below the range
    expect(isIrOvertone(peak(1873, 5, {intensityKnown: false}), [...ring, peak(1873, 5, {intensityKnown: false})])).toBe(false);
  });
  it('rule: the anhydride pair needs a strong band near 1820 AND one near 1750', () => {
    expect(hasAnhydridePair([peak(1820, 90), peak(1750, 80), peak(1050, 100)])).toBe(true);
    expect(hasAnhydridePair([peak(1820, 90), peak(1050, 100)])).toBe(false);
    expect(hasAnhydridePair([peak(1820, 20), peak(1750, 80), peak(1050, 100)])).toBe(false);   // the high band is not strong
  });
  it('CR1 (p-cresol type, weak 1873): the 1873 band is not read as any functional group and carries no weight against any candidate', () => {
    const f = sample('CR1');
    const bundle = bundleOf(f);
    expect(bundle.irFindings.some(g => g.observedPeak === 1873)).toBe(false);
    const l = scoreScientificEvidence(P_CRESOL, bundle);
    const e1873 = l.entries.find(e => e.evidenceId.endsWith(':1873'))!;
    expect(e1873.weight).toBe(0);
    flagOff(() => { expect(scoreScientificEvidence(P_CRESOL, bundleOf(f)).entries.find(e => e.evidenceId.endsWith(':1873'))!.weight).toBeGreaterThan(0.5); });
  });
  it('a weak band at 1860 beside ring bands: flag off reads it as an anhydride (the false trigger), flag on does not; the carbonyl-type findings stay empty', () => {
    const f = sample('CR1', x => { x.ir.peaks = x.ir.peaks.filter(p => p.x !== 1873).concat([{x: 1860, y: 90}]); });
    const families = (on: boolean) => { const run = () => inferIRBands(prepareIR(spectraOf(f).IR)).filter(g => g.observedPeak === 1860).map(g => g.family); return on ? run() : flagOff(run); };
    expect(families(false).some(x => /Anhydride|Acyl/.test(x))).toBe(true);
    expect(families(true)).toEqual([]);
  });
  it('a real anhydride (strong 1820 + 1750 + C–O, no ring) is still read as an anhydride; a lone 1820 band is not', () => {
    const ir = (peaks: {x: number; y: number}[]) => { const f = sample('EST1', x => { x.ir.peaks = peaks; }); return inferIRBands(prepareIR(spectraOf(f).IR)); };
    const pair = ir([{x: 2960, y: 75}, {x: 1820, y: 12}, {x: 1750, y: 15}, {x: 1050, y: 10}, {x: 1180, y: 40}]);
    expect(pair.some(g => g.family === 'Anhydride' && g.observedPeak === 1820)).toBe(true);
    const lone = ir([{x: 2960, y: 75}, {x: 1820, y: 12}, {x: 1050, y: 10}, {x: 1180, y: 40}]);
    expect(lone.some(g => g.family === 'Anhydride')).toBe(false);
  });
});

describe('G4: missing-carbonyl-band deduction for every carbonyl class (peak-table IR with bands on both sides of the carbonyl region)', () => {
  it('classes: acid, aldehyde and non-conjugated ketone are new; the six old classes are kept', () => {
    const ids = (s: string) => candidateCarbonylClassesV130(s).map(c => c.id);
    expect(ids(ACID_C16)).toEqual(['ACID']);
    expect(ids('CCC(=O)CC')).toEqual(['KETONE']);
    expect(ids('Cc1ccc(C=O)cc1')).toEqual(['ALDEHYDE']);
    expect(ids('CC(=O)OCC')).toEqual(['ESTER']);
    expect(ids('CC(=O)Nc1ccccc1')).toEqual(['AMIDE']);
    expect(ids('CC(=O)c1ccccc1')).toEqual(['CONJUGATED_KETONE']);
    expect(ids('O=C1CCC1')).toEqual([]);                   // strained ring ketone: not modelled
    expect(ids('CC(=O)[O-]')).toEqual([]);                 // carboxylate salt: not modelled
    expect(ids(P_CRESOL)).toEqual([]);
  });
  it('CR1 (no band in 1650–1800): every carbonyl candidate gets exactly one item, weight = 0.2 × the sum of its other IR weights; p-cresol (no carbonyl) gets none', () => {
    const bundle = bundleOf(sample('CR1'));
    for (const [smiles, id] of [[ACID_C16, 'ACID'], ['CC(=O)OCC', 'ESTER'], ['CCC(=O)CC', 'KETONE'], ['Cc1ccc(C=O)cc1', 'ALDEHYDE'], ['CC(=O)Nc1ccccc1', 'AMIDE'], ['CC(=O)c1ccccc1', 'CONJUGATED_KETONE']] as const) {
      const l = scoreScientificEvidence(smiles, bundle), m = missing(l);
      expect(m.map(e => e.evidenceId), smiles).toEqual([`IR:carbonyl-missing:${id}`]);
      expect(m[0].compatibility).toBe(0);
      expect(m[0].weight).toBeCloseTo(0.2 * irWeight(l), 10);
      expect(l.entries.some(e => e.evidenceId.startsWith('IR:coverage:1630')), 'the old coverage item is not counted twice').toBe(false);
    }
    expect(missing(scoreScientificEvidence(P_CRESOL, bundle))).toEqual([]);
  });
  it('CR1: the acid falls behind its flag-off score (IR and total), p-cresol is untouched', () => {
    const f = sample('CR1');
    const on = scoreScientificEvidence(ACID_C16, bundleOf(f)), off = flagOff(() => scoreScientificEvidence(ACID_C16, bundleOf(f)));
    expect(on.modalityScores.IR!).toBeLessThan(off.modalityScores.IR! - 3);
    expect(on.totalScore).toBeLessThan(off.totalScore - 3);
    const cOn = scoreScientificEvidence(P_CRESOL, bundleOf(f)), cOff = flagOff(() => scoreScientificEvidence(P_CRESOL, bundleOf(f)));
    expect(cOn.modalityScores.IR!).toBeGreaterThan(cOff.modalityScores.IR!);   // only the unexplained 1873 weight is gone
  });
  it('true carbonyl compounds are not deducted: ethyl benzoate (ester 1720), phenylpropanoic acid (1700), acetanilide (amide I 1665), PMA type (ester 1740)', () => {
    for (const [id, smiles] of [['EST1', 'CCOC(=O)c1ccccc1'], ['HCA', 'OC(=O)CCc1ccccc1'], ['AMD1', 'CC(=O)Nc1ccccc1']] as const) expect(missing(scoreScientificEvidence(smiles, bundleOf(sample(id)))), id).toEqual([]);
    const m1 = loadV123('M1');
    expect(missing(scoreScientificEvidence('CC(=O)OC(C)COC', bundleOf(m1)))).toEqual([]);
  });
  it('soft edge: an ester band at 1758 is inside the widened window (1710–1750 + 10), 1765 is not', () => {
    const at = (x: number) => missing(scoreScientificEvidence('CCOC(=O)c1ccccc1', bundleOf(sample('EST1', f => { f.ir.peaks = f.ir.peaks.map(p => (p.x === 1720 ? {...p, x} : p)); }))));
    expect(at(1758)).toEqual([]);
    expect(at(1765).map(e => e.evidenceId)).toEqual(['IR:carbonyl-missing:ESTER']);
  });
  it('a weak band in the window does not count as the carbonyl band (below 30 % of the strongest band)', () => {
    const weak = sample('CR1', f => { f.ir.peaks.push({x: 1720, y: 95}); });          // depth 4 of 77 = 5 %
    expect(missing(scoreScientificEvidence(ACID_C16, bundleOf(weak))).length).toBe(1);
  });
  it('status: a table with bands on one side of the carbonyl region only (nothing above 1800) is not trusted; no deduction', () => {
    const lowOnly = sample('CR1', f => { f.ir.peaks = f.ir.peaks.filter(p => p.x < 1800); });
    const st = carbonylMissingStatus(spectraOf(lowOnly).IR, prepareIR(spectraOf(lowOnly).IR), [[1675, 1745]]);
    expect(st).toEqual({state: 'DISABLED', reason: 'ONE_SIDED_PEAKS'});
    expect(missing(scoreScientificEvidence(ACID_C16, bundleOf(lowOnly)))).toEqual([]);
    const both = sample('CR1');
    expect(carbonylMissingStatus(spectraOf(both).IR, prepareIR(spectraOf(both).IR), [[1675, 1745]])).toEqual({state: 'ENABLED'});
  });
  it('flag off: no item for any candidate of the same spectrum', () => {
    flagOff(() => { for (const s of [ACID_C16, 'CC(=O)OCC', 'CCC(=O)CC']) expect(missing(scoreScientificEvidence(s, bundleOf(sample('CR1')))), s).toEqual([]); });
  });
  it('the sub-switch carbonylMissing = false removes the item', () => {
    V12_CONFIG.v130.carbonylMissing = false;
    try { expect(missing(scoreScientificEvidence(ACID_C16, bundleOf(sample('CR1'))))).toEqual([]); } finally { V12_CONFIG.v130.carbonylMissing = true; }
  });
});

describe('G5: a strong C=O demotes DBE = 0 formulas in the search plan', () => {
  const dbeOf = (formula: string) => { const n = (e: string) => Number(formula.match(new RegExp(`${e}(\\d*)`))?.[1] === '' ? 1 : formula.match(new RegExp(`${e}(\\d*)`))?.[1] ?? 0); return n('C') + 1 - n('H') / 2; };
  const searched = async () => (await measureSample('M1', 'dense')).runs.map(r => r.formula!).filter(Boolean);
  it('PMA type (strong 1740): flag off searches DBE 0 formulas among the first names, flag on searches none of them', async () => {
    const off = await (async () => { V12_CONFIG.useV130 = false; try { return await searched(); } finally { V12_CONFIG.useV130 = true; } })();
    expect(off.filter(f => dbeOf(f) < 1).length).toBeGreaterThan(0);
    const on = await searched();
    expect(on.filter(f => dbeOf(f) < 1)).toEqual([]);
    expect(on.length).toBe(off.length);              // the places go to other formulas; nothing else changes the number of names
  }, 120000);
  it('PMA type: the target is still rank 1', async () => { expect((await measureSample('M1', 'dense')).targetRank).toBe(1); }, 120000);
  it('the sub-switch dbeDemotion = false restores the order', async () => {
    V12_CONFIG.v130.dbeDemotion = false;
    try { expect((await searched()).filter(f => dbeOf(f) < 1).length).toBeGreaterThan(0); } finally { V12_CONFIG.v130.dbeDemotion = true; }
  }, 120000);
});
