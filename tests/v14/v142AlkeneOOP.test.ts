import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {irBandMatch, irCandidateBands, inferIRBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {v142AlkeneOOPActive, v142IRActive, v142NegativeEvidenceActive} from '../../src/engines/composition/planningGate';
import {REAL_STRUCTURE_PANEL} from '../fixtures/v140/realStructurePanel';
import {setV142, withPeaks, ir2Probe} from '../helpers/v142Probe';
import type {SpectralPeak} from '../../src/types/spectrum';

// v1.4.2 stop 25 (1): ir.alkeneOOP = four alkene C-H out-of-plane bands (vinylidene, trans 1,2, cis 1,2, trisubstituted) and the (CH2)n rocking band (n >= 4), in ONE sub-flag (cis 665-730 and the rocking band 720-725 overlap:
// with the OOP bands alone, an unspecified-stereo 2-octene explains a 722 rocking peak and ALK0 gets worse: design report notes/v1.4.2/IR_ROUND2_DESIGN.md, 4).
// Candidate score only (not the IR reading list, not Mode B, not the composition inference). RANGES ARE TEXTBOOK-STYLE, UNCALIBRATED (未經校準); the +-10 cm-1 is engineering judgement. Probes are hand-written, not measured spectra.
beforeAll(async () => { await initializeRDKit(); }, 60000);
let restore: (() => void) | null = null;
const use = (parent: boolean, sub: Parameters<typeof setV142>[1] = {}) => { restore?.(); restore = setV142(parent, sub); };
afterAll(() => restore?.());
const NEW = ['vinylidene-oop', 'alkene-trans-oop', 'alkene-cis-oop', 'alkene-tri-oop', 'ch2-rock-720'];
const ids = (smi: string) => irCandidateBands(smi, true).map(k => k.id).filter(i => NEW.includes(i));
const pk = (x: number): SpectralPeak => ({id: `p${x}`, x, y: 100, intensityKnown: true} as unknown as SpectralPeak);
const band = (smi: string, id: string) => irCandidateBands(smi, true).find(k => k.id === id)!;

describe('v1.4.2 flags: skeleton', () => {
  it('defaults in the source: useV142IR true (v1.4.2 stop 36: on by default; was false); alkeneOOP true, negativeEvidence false; +-10 cm-1', () => {
    // read from the source text, because the full-on test setup may switch the parent flag on before any test runs
    const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'engines', 'constraints', 'v12Config.ts'), 'utf8');
    expect(src).toMatch(/useV142IR: true as boolean/);   // v1.4.2 stop 36 (E): the planner switched the default on (this test reads the default itself, so the expected value changed)
    expect(src).toMatch(/v142IR: {alkeneOOP: true as boolean, negativeEvidence: false as boolean,/);
    expect(V12_CONFIG.v142IR.bandUncertaintyCm1).toBe(10);
  });
  it('effective state = parent AND sub-flag', () => {
    for (const [p, a, n, ea, en] of [[false, true, true, false, false], [true, true, false, true, false], [true, false, true, false, true], [true, false, false, false, false], [true, true, true, true, true]] as const) {
      use(p, {alkeneOOP: a, negativeEvidence: n});
      expect([v142IRActive(), v142AlkeneOOPActive(), v142NegativeEvidenceActive()], `${p}/${a}/${n}`).toEqual([p, ea, en]);
    }
  });
});

describe('ir.alkeneOOP: the gate (candidate score only)', () => {
  it('flag off, or sub-flag off: no new band; scoring=false (IR reading list, Mode B): never', () => {
    for (const [p, s] of [[false, {}], [true, {alkeneOOP: false}]] as const) { use(p, s); for (const smi of ['C=C(C)CCCC', 'CC=CCCCC', 'CCCCCC']) expect(ids(smi), `${p} ${smi}`).toEqual([]); }
    use(true); for (const smi of ['C=C(C)CCCC', 'CC=CCCCC', 'CCCCCC']) expect(irCandidateBands(smi, false).map(k => k.id).filter(i => NEW.includes(i)), smi).toEqual([]);
  });
  it('flag off = the band list is the same, object by object, as with the parent flag off (v1.4.1)', () => {
    use(false); const off = ['C=CCCCCCC', 'CC=CCCCC', 'CCCCCC', 'CC(=O)OCC', 'c1ccccc1'].map(s => JSON.stringify(irCandidateBands(s, true)));
    use(true, {alkeneOOP: false}); expect(['C=CCCCCCC', 'CC=CCCCC', 'CCCCCC', 'CC(=O)OCC', 'c1ccccc1'].map(s => JSON.stringify(irCandidateBands(s, true)))).toEqual(off);
  });
  it('vinylidene R2C=CH2 (alkyl, aryl or vinyl substituents)', () => {
    use(true);
    expect(ids('C=C(C)CCCC')).toEqual(['vinylidene-oop']); expect(ids('C=C(C)c1ccccc1')).toEqual(['vinylidene-oop']); expect(ids('C=C(CC)CC')).toEqual(['vinylidene-oop']);
    expect(ids('C=C1CCCCC1')).toEqual(['vinylidene-oop']); // methylenecyclohexane
  });
  it('1,2-disubstituted, stereo unspecified: BOTH the trans and the cis band (acyclic); a ring alkene gets the cis band only', () => {
    use(true);
    expect(ids('CC=CCCCC')).toEqual(['alkene-trans-oop', 'alkene-cis-oop']); expect(ids('c1ccccc1C=Cc1ccccc1')).toEqual(['alkene-trans-oop', 'alkene-cis-oop']);
    expect(ids('C1=CCCCC1')).toEqual(['alkene-cis-oop']); expect(ids('C1=CCCC1')).toEqual(['alkene-cis-oop']);
  });
  it('trisubstituted R2C=CHR', () => {
    use(true);
    expect(ids('CC(C)=CCCC')).toEqual(['alkene-tri-oop']); expect(ids('CC1=CCCCC1')).toEqual(['alkene-tri-oop']);
  });
  it('(CH2)n rocking: four CH2 in a row, none of them in a ring', () => {
    use(true);
    expect(ids('CCCCCC')).toEqual(['ch2-rock-720']); expect(ids('C=CCCCCCC')).toEqual(['ch2-rock-720']); expect(ids('CC=CCCCCC')).toEqual(['alkene-trans-oop', 'alkene-cis-oop', 'ch2-rock-720']); expect(ids('CC=CCCCC')).toEqual(['alkene-trans-oop', 'alkene-cis-oop']); // 2-heptene: only three CH2 in a row
    for (const smi of ['CCCCC', 'CCCC', 'C1CCCCC1', 'CCC1CCCCC1', 'CCCOCCC']) expect(ids(smi), smi).toEqual([]); // n = 3 gets none (n = 3 is about 729-726); a ring does not rock like a chain
  });
  it('a hetero atom or a carbonyl on the C=C: no OOP band (vinyl ether, enamine, acrylate, crotonate, vinyl ketone, vinyl chloride)', () => {
    use(true);
    for (const smi of ['C=COCC', 'CC=CN(C)C', 'C=CC(=O)OC', 'COC(=O)C=CC', 'C=CC(C)=O', 'C=C(C)C(=O)OC', 'C=CCl', 'CC=CC(=O)C']) expect(ids(smi), smi).toEqual([]);
  });
  it('a terminal vinyl R-CH=CH2 gets no new OOP band (its 990 / 910 pair is the v1.3.2 rule); no alkene, no band', () => {
    use(true);
    for (const smi of ['C=CCCC', 'C=Cc1ccccc1', 'c1ccccc1', 'CCO', 'CC(C)=O', 'C#CCC']) expect(ids(smi), smi).toEqual([]);
  });
  it('the real-compound panel (55): how many structures each band applies to', () => {
    use(true);
    const n = (id: string) => REAL_STRUCTURE_PANEL.filter(r => ids(r[1]).includes(id)).length;
    // Recount with the FINAL SMARTS (the design report's stop-16 approximations were 4 / 3 / 1 / 7): vinylidene 2 (methylenecyclobutane, 3-methyleneoxetane: the alpha-methylene-lactone and 2-methylene-THF have a carbonyl / O on the C=C),
    // 1,2-disubstituted trans 0 / cis 1 (cyclobutene only), trisubstituted 1 (limonene oxide), (CH2)n 0: the panel has NO acyclic chain of four CH2 (the 7 of the approximation counted ring CH2 of THP / THF / cyclohexane derivatives; the final gate is !R).
    expect([n('vinylidene-oop'), n('alkene-trans-oop'), n('alkene-cis-oop'), n('alkene-tri-oop'), n('ch2-rock-720')]).toEqual([2, 0, 1, 1, 0]);
  });
  it('the new bands carry +-10, are fingerprint bands (specificity LOW) and sit where the textbook puts them', () => {
    use(true);
    const t: [string, string, [number, number]][] = [['C=C(C)CCCC', 'vinylidene-oop', [885, 895]], ['CC=CCCCC', 'alkene-trans-oop', [960, 980]], ['CC=CCCCC', 'alkene-cis-oop', [665, 730]], ['CC(C)=CCCC', 'alkene-tri-oop', [790, 840]], ['CCCCCC', 'ch2-rock-720', [720, 725]]];
    for (const [smi, id, range] of t) { const b = band(smi, id); expect(b.range, id).toEqual(range); expect(b.uncertainty, id).toBe(10); expect(b.specificity, id).toBe('LOW'); expect(b.companions, id).toEqual([]); }
  });
});

describe('ir.alkeneOOP: single-peak compatibility', () => {
  // v1.4.2 stop 29 (A, approved): since stop 27 (0.2a) the five ir2 bands score ONLY inside their cited range (IRBandKnowledge.strictRange): a peak outside gets 0, no Gaussian tail. Before: 10 outside = 0.75*exp(-0.5), 20 outside = 0.75*exp(-2) (the Gaussian
  // +-10 pinned here). Reason: a tail beyond a textbook range (not calibrated) is not evidence (stop 27: the 0.29 of v132MultiBand 992 was the tail of the new trans band, 12 cm-1 outside 960-980). Inside the range nothing changed (0.75 at 885 / 890 / 895, 722).
  it('centre, edge inside the window (specificity LOW x 0.75); 10 and 20 cm-1 outside = 0 (strictRange)', () => {
    use(true);
    const b = band('C=C(C)CCCC', 'vinylidene-oop'), m = (x: number) => irBandMatch(b, pk(x), [pk(x)]);
    expect(m(890)).toBeCloseTo(0.75, 3); expect(m(885)).toBeCloseTo(0.75, 3); expect(m(895)).toBeCloseTo(0.75, 3);
    expect(m(905)).toBe(0); expect(m(875)).toBe(0); // was 0.75 * Math.exp(-0.5) (stop 29: strictRange)
    expect(m(915)).toBe(0); expect(m(1000)).toBe(0); // was 0.75 * Math.exp(-2) and < 0.01
    const r = band('CCCCCC', 'ch2-rock-720'), mr = (x: number) => irBandMatch(r, pk(x), [pk(x)]);
    expect(mr(722)).toBeCloseTo(0.75, 3); expect(mr(735)).toBe(0); expect(mr(745)).toBe(0); // was 0.75 * Math.exp(-0.5) and 0.75 * Math.exp(-2) (stop 29: strictRange)
  });
  it('the IR reading list (inferIRBands) never shows a new band', () => {
    use(true);
    const peak = (x: number) => ({id: `p${x}`, x, y: 80, intensityKnown: true, shape: 'sharp'}) as unknown as SpectralPeak;
    const spectrum = {peaks: [peak(722), peak(890), peak(965)]} as never;
    for (const f of inferIRBands(spectrum)) for (const id of NEW) expect(f.id, id).not.toContain(`ir-range-${id}-`);
  });
});

describe('ir.alkeneOOP: the ledger (probe tables, positions in the middle of the window: circular, wiring only)', () => {
  it('a (CH2)n chain candidate explains a 722 peak, a ring or short-chain candidate does not (flag on vs off)', () => {
    const tbl = withPeaks({x: 722, y: 50});
    use(false); const off = {hex: ir2Probe('CCCCCC', tbl), cyc: ir2Probe('C1CCCCC1', tbl), pent: ir2Probe('CCCCC', tbl)};
    use(true); const on = {hex: ir2Probe('CCCCCC', tbl), cyc: ir2Probe('C1CCCCC1', tbl), pent: ir2Probe('CCCCC', tbl)};
    expect(on.hex.ir).toBeGreaterThan(off.hex.ir); expect(on.cyc.ir).toBe(off.cyc.ir); expect(on.pent.ir).toBe(off.pent.ir);
  });
  it('flag off: a table with OOP / rocking peaks scores exactly as before for every probe candidate', () => {
    const tbl = withPeaks({x: 722, y: 50}, {x: 890, y: 40}, {x: 965, y: 40});
    use(false); const a = ['C=C(C)CCCC', 'CC=CCCCC', 'CC(C)=CCCC', 'CCCCCC'].map(s => ir2Probe(s, tbl));
    use(true, {alkeneOOP: false}); expect(['C=C(C)CCCC', 'CC=CCCCC', 'CC(C)=CCCC', 'CCCCCC'].map(s => ir2Probe(s, tbl))).toEqual(a);
  });
  it('octene isomer set: the 1-octene table picks the vinylidene / trans / trisubstituted candidate that has the band, and nothing explained is lost', () => {
    const t = (...x: number[]) => withPeaks(...x.map(v => ({x: v, y: 40})));
    // textbook-middle positions: vinylidene 890, trans 970, trisubstituted 815
    use(false); const off = ['C=C(C)CCCCC', 'CC=CCCCCC', 'CC(C)=CCCCC'].map(s => [ir2Probe(s, t(890)).ir, ir2Probe(s, t(970)).ir, ir2Probe(s, t(815)).ir]);
    use(true); const on = ['C=C(C)CCCCC', 'CC=CCCCCC', 'CC(C)=CCCCC'].map(s => [ir2Probe(s, t(890)).ir, ir2Probe(s, t(970)).ir, ir2Probe(s, t(815)).ir]);
    expect(on[0][0]).toBeGreaterThan(off[0][0]); expect(on[1][1]).toBeGreaterThan(off[1][1]); expect(on[2][2]).toBeGreaterThan(off[2][2]);
    // the diagonal gains; a candidate never LOSES score from the new bands (they only explain)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(on[i][j], `${i}${j}`).toBeGreaterThanOrEqual(off[i][j]);
  });
});
