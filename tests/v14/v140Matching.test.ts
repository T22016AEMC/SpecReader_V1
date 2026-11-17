import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine, StructureParserAdapter} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {matchWithIntegrals, multiplicityCompatible, multiplicityFamily, normalizeMultiplicity} from '../../src/engines/scientificEngines/h1Matching';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';
import {loadStop7, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_SPECTRA} = await loadStop7();
import type {SPeak} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the stop-8 pass criteria on the 31 stop-7 spectra skip without them (one-line note).
const NEED_F = needFulmer('v140Matching: the stop-8 pass criteria on the 31 stop-7 spectra');

// v1.4.0 stop 8 (useV140H1 and v140.matching, default off): the matching layer of the 1H score - multiplicity families, integral scale over environments inside one observed signal, pairing by H count, aromatic S
// without a phantom H. Spectra: literature values (Fulmer 2010 SI Table S7, CDCl3) and hand-written synthetic tables. No user spectrum.
const was = {h1: V12_CONFIG.useV140H1, m: V12_CONFIG.v140.matching, a: V12_CONFIG.v140.alkene, o: V12_CONFIG.v140.oxygen};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.matching = was.m; V12_CONFIG.v140.alkene = was.a; V12_CONFIG.v140.oxygen = was.o; });
const set = (h1: boolean, matching: boolean) => { V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.matching = matching; V12_CONFIG.v140.alkene = true; V12_CONFIG.v140.oxygen = true; };

const P = (x: number, integration: number, multiplicity: string): SPeak => ({x, integration, multiplicity});
const fx = (id: string, formula: string, smiles: string, h1: SPeak[]): V121Fixture => ({
  id, description: 'literature / synthetic 1H table (CDCl3)', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
});
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
const ledger = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, bundleOf(f));
const h1 = (l: ReturnType<typeof ledger>) => l.modalityScores['1H_NMR'] as number;
const peakCompat = (l: ReturnType<typeof ledger>, x: number) => l.entries.find(e => e.evidenceId.endsWith(`:${x}`))!.compatibility as number;
const entry = (l: ReturnType<typeof ledger>, id: string) => l.entries.find(e => e.evidenceId === id)!.compatibility as number;

describe('multiplicity families (pure)', () => {
  it('normalises the label: apostrophe styles, a J part, an app. prefix', () => {
    expect(normalizeMultiplicity('AA′BB′')).toBe("AA'BB'");
    expect(normalizeMultiplicity('d, J = 8.4')).toBe('d');
    expect(normalizeMultiplicity(' app t ')).toBe('t');
    expect(multiplicityFamily('AA′BB′')).toBe('aromatic');
    expect(multiplicityFamily('ddt')).toBe('compound');
    expect(multiplicityFamily('dm')).toBe('compound');
    expect(multiplicityFamily('sext')).toBe('simple');
    expect(multiplicityFamily('s')).toBe('S');
    expect(multiplicityFamily('br s')).toBe('S');
    expect(multiplicityFamily('nonsense')).toBeNull();
  });
  it('compatible: a compound or m label with any multiplet label, AA′BB′ with d / dd / m, singlet with singlet, an observed m / br s / unresolved with anything (as before)', () => {
    const ok: [string, string][] = [['dm', 'd'], ['dm', 'dd'], ['ddt', 't'], ['ddd', 'dd'], ['dd', 'd'], ['dt', 'd'], ['d', 'dd'], ['tt', 't'], ['m', 'q'], ['multiplet', 'd'], ['unresolved', 's'], ['br s', 'd'],
      ['d', 'm'], ['t', 'm'], ['dd', 'm'], ['AA′BB′', 'd'], ["AA'BB'", 'dd'], ["AA'BB'", 'm'], ['d', "AA'BB'"], ['d, J = 8.4', 'd'], ['s', 's'], ['s', 'br s'], ['t', 't']];
    for (const [o, p] of ok) expect(multiplicityCompatible(o, p), `${o} vs ${p}`).toBe(true);
  });
  it('NOT compatible (the discriminating power stays): singlet vs any multiplet either way, two different simple n+1 labels, AA′BB′ vs t / q / s', () => {
    const bad: [string, string][] = [['s', 'd'], ['s', 't'], ['s', 'm'], ['s', 'dd'], ['d', 's'], ['dd', 's'], ['dm', 's'], ['t', 'd'], ['d', 't'], ['q', 't'], ['quint', 'q'],
      ["AA'BB'", 't'], ["AA'BB'", 'q'], ["AA'BB'", 's'], ['t', "AA'BB'"], ['s', "AA'BB'"], ['ddt', 's']];
    for (const [o, p] of bad) expect(multiplicityCompatible(o, p), `${o} vs ${p}`).toBe(false);
  });
});

describe('A: an observed multiplicity of the same family no longer halves the peak (ledger level)', () => {
  const ETHANOL = (m: string) => fx('E', 'C2H6O', 'CCO', [P(3.72, 2, m), P(1.25, 3, 't')]);
  it('flag off: observed dm on a predicted q is halved, as before; flag on: not halved (dm, ddt)', () => {
    set(true, false);
    const off = {q: peakCompat(ledger('CCO', ETHANOL('q')), 3.72), dm: peakCompat(ledger('CCO', ETHANOL('dm')), 3.72)};
    expect(off.dm / off.q).toBeCloseTo(0.5, 2);
    set(true, true);
    const on = {q: peakCompat(ledger('CCO', ETHANOL('q')), 3.72), dm: peakCompat(ledger('CCO', ETHANOL('dm')), 3.72), ddt: peakCompat(ledger('CCO', ETHANOL('ddt')), 3.72)};
    expect(on.dm / on.q).toBeCloseTo(1, 2);
    expect(on.ddt / on.q).toBeCloseTo(1, 2);
  });
  it('flag on, the discrimination is kept: an observed singlet or doublet on a predicted quartet is still halved; an observed quartet / dm on a predicted singlet is still halved', () => {
    set(true, true);
    const q = peakCompat(ledger('CCO', ETHANOL('q')), 3.72);
    expect(peakCompat(ledger('CCO', ETHANOL('s')), 3.72) / q).toBeCloseTo(0.5, 2);
    expect(peakCompat(ledger('CCO', ETHANOL('d')), 3.72) / q).toBeCloseTo(0.5, 2);
    const MEOH = (m: string) => fx('M', 'CH4O', 'CO', [P(3.49, 3, m)]);
    expect(peakCompat(ledger('CO', MEOH('q')), 3.49) / peakCompat(ledger('CO', MEOH('s')), 3.49)).toBeCloseTo(0.5, 2);
    expect(peakCompat(ledger('CO', MEOH('dm')), 3.49) / peakCompat(ledger('CO', MEOH('s')), 3.49)).toBeCloseTo(0.5, 2);
  });
  it('flag on: the right candidate still beats a wrong one by its multiplicities (isopropyl acetate observed, scored against n-propyl acetate)', () => {
    set(true, true);
    const f = fx('IPA', 'C5H10O2', 'CC(=O)OC(C)C', [P(4.99, 1, 'sept'), P(2.02, 3, 's'), P(1.22, 6, 'd')]);
    expect(h1(ledger('CC(=O)OC(C)C', f))).toBeGreaterThan(h1(ledger('CC(=O)OCCC', f)) + 5);
  });
  it('AA′BB′ on a para-substituted benzene: the hand-written p-cresol gains 18+ points over the flag off, reaching 95; labelled d it is unchanged', () => {
    const cresol = (m: string) => fx('PC', 'C7H8O', 'Cc1ccc(O)cc1', [P(7.05, 2, m), P(6.75, 2, m), P(2.28, 3, 's')]);
    set(true, false);
    const off = {aabb: h1(ledger('Cc1ccc(O)cc1', cresol("AA'BB'"))), d: h1(ledger('Cc1ccc(O)cc1', cresol('d')))};
    set(true, true);
    const on = {aabb: h1(ledger('Cc1ccc(O)cc1', cresol("AA'BB'"))), d: h1(ledger('Cc1ccc(O)cc1', cresol('d')))};
    expect(off.aabb).toBeLessThan(80);
    expect(on.aabb - off.aabb).toBeGreaterThan(18);
    expect(on.aabb).toBeGreaterThanOrEqual(95);
    expect(on.d).toBeCloseTo(off.d, 6);
  });
});

describe('B: integral scale over the environments inside one observed signal', () => {
  it('unit: two 4H CH2 predictions at the same shift under one observed 8H multiplet - the scale is 1 H per unit, not 2', () => {
    const preds = [{shiftPpm: 1.25, integration: 4}, {shiftPpm: 1.25, integration: 4}, {shiftPpm: 0.88, integration: 6}];
    const base = [[0.99, 0.99, 0.1], [0.1, 0.1, 0.99]]; // obs 1.26 (8) and obs 0.88 (6)
    const r = matchWithIntegrals(base, [8, 6], preds);
    expect(r.scale).toBeCloseTo(1, 6);
    expect(r.mode).toBe('grouped');
    expect(r.assignment.get(1)).toBe(2);
  });
  it('unit: an unmarked extra environment next to a matched one is NOT merged when the plain ratios are already consistent', () => {
    const preds = [{shiftPpm: 2.05, integration: 3}, {shiftPpm: 2.1, integration: 2}, {shiftPpm: 1.0, integration: 3}];
    const base = [[0.99, 0.9, 0.1], [0.1, 0.1, 0.99]];
    const r = matchWithIntegrals(base, [3, 3], preds);
    expect(r.scale).toBeCloseTo(1, 6);
    expect(r.mode).toBe('legacy');
  });
  it('n-hexane (Fulmer): integral-total 0 -> 1 and the 1H score 42.9 -> 90+ (flag on); the flag-off value is unchanged', () => {
    const hex = fx('HEX', 'C6H14', 'CCCCCC', [P(0.88, 6, 't'), P(1.26, 8, 'm')]);
    set(true, false);
    const off = ledger('CCCCCC', hex);
    expect(h1(off)).toBeCloseTo(42.9, 1);
    expect(entry(off, '1H:integral-total')).toBeLessThan(0.01);
    set(true, true);
    const on = ledger('CCCCCC', hex);
    expect(h1(on)).toBeGreaterThanOrEqual(90);
    expect(entry(on, '1H:integral-total')).toBeGreaterThan(0.99);
  });
});

describe('C: near-identical predicted shifts are paired by H count', () => {
  const g = (d: number) => Math.exp(-0.5 * (d / 0.5) ** 2);
  it('unit: 3H and 2H predictions 0.02 ppm apart, observations 3.75 (3 units) and 3.40 (2 units): the 3H observation goes to the 3H environment although the shift alone prefers the swap', () => {
    const preds = [{shiftPpm: 3.67, integration: 3}, {shiftPpm: 3.69, integration: 2}];
    const base = [[g(3.75 - 3.67), g(3.75 - 3.69)], [g(3.40 - 3.67), g(3.40 - 3.69)]];
    const r = matchWithIntegrals(base, [3, 2], preds);
    expect(r.assignment.get(0)).toBe(0);
    expect(r.assignment.get(1)).toBe(1);
    expect(r.mode).toBe('searched');
  });
  it('unit: 6H against 1H, same situation', () => {
    const preds = [{shiftPpm: 3.10, integration: 6}, {shiftPpm: 3.12, integration: 1}];
    const base = [[g(3.17 - 3.10), g(3.17 - 3.12)], [g(2.80 - 3.10), g(2.80 - 3.12)]];
    const r = matchWithIntegrals(base, [6, 1], preds);
    expect(r.assignment.get(0)).toBe(0);
    expect(r.assignment.get(1)).toBe(1);
  });
  it('dimethyl malonate (Fulmer: 3.75 6H s, 3.40 2H s): v1.3.2 90.3, flag off (v1.4.0) 49.6 with OCH3 / CH2 swapped, flag on 90.3 or better', () => {
    const f = fx('DMM', 'C5H8O4', 'COC(=O)CC(=O)OC', [P(3.75, 6, 's'), P(3.40, 2, 's')]);
    set(false, false);
    expect(h1(ledger('COC(=O)CC(=O)OC', f))).toBeCloseTo(90.3, 1);
    set(true, false);
    expect(h1(ledger('COC(=O)CC(=O)OC', f))).toBeCloseTo(49.6, 1);
    set(true, true);
    const on = ledger('COC(=O)CC(=O)OC', f);
    expect(h1(on)).toBeGreaterThanOrEqual(90.3);
    expect(entry(on, '1H:integral-total')).toBeGreaterThan(0.99);
  });
  it('the fix does not make a wrong-H pairing free: integrals 4H / 4H (fit neither assignment) score clearly below the right 6H / 2H; swapped 2H / 6H is a legitimate other reading (CH2 3.75, OCH3 3.40) and may score as well', () => {
    set(true, true);
    const score = (a: number, b: number) => h1(ledger('COC(=O)CC(=O)OC', fx('W', 'C5H8O4', 'COC(=O)CC(=O)OC', [P(3.75, a, 's'), P(3.40, b, 's')])));
    expect(score(6, 2) - score(4, 4)).toBeGreaterThan(5);
    expect(score(2, 6)).toBeGreaterThan(80);
  });
  it('2-propanol: the v1.4.0 drop (94.4 -> 86.7) is NOT a pairing problem - the predicted CH moved 3.90 -> 3.57 (observed 4.04), pairing and integrals are right - the matching layer leaves it at 86.7', () => {
    const f = fx('IPR', 'C3H8O', 'CC(C)O', [P(4.04, 1, 'sept'), P(1.22, 6, 'd')]);
    set(false, false);
    expect(h1(ledger('CC(C)O', f))).toBeCloseTo(94.4, 1);
    set(true, true);
    const on = ledger('CC(C)O', f);
    expect(h1(on)).toBeCloseTo(86.7, 1);
    expect(entry(on, '1H:integral-total')).toBeGreaterThan(0.99);
    const env = NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: 'CC(C)O'}), {solvent: 'CDCl3'}).environments.find(e => !e.isExchangeable && e.integration === 1)!;
    expect(env.shiftPpm).toBeCloseTo(3.57, 2);
  });
});

describe('D: aromatic S has no phantom SH', () => {
  const sH = (smi: string) => StructureParserAdapter.parseSmilesGraph(smi).graph!.atoms.filter(a => a.element === 'S').map(a => a.totalHydrogens);
  it('flag off: thiophene S carries one H (the stop-7 finding: an SH at 1.55 ppm, formula C4H5S); flag on: none, formula C4H4S, no exchangeable environment', () => {
    set(true, false);
    expect(sH('c1ccsc1')).toEqual([1]);
    expect(ChemistryEngine.parseStructureInput({smiles: 'c1ccsc1'}).molecularFormula).toBe('C4H5S');
    set(true, true);
    expect(sH('c1ccsc1')).toEqual([0]);
    expect(ChemistryEngine.parseStructureInput({smiles: 'c1ccsc1'}).molecularFormula).toBe('C4H4S');
    const envs = NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: 'Cc1cccs1'}), {solvent: 'CDCl3'}).environments;
    expect(envs.filter(e => e.isExchangeable)).toHaveLength(0);
    expect(envs.reduce((s, e) => s + (e.integration ?? 0), 0)).toBe(6);
  });
  it('not touched: a real thiol (SH), thioethers, other heteroaromatics keep their hydrogens', () => {
    for (const on of [false, true]) {
      set(true, on);
      expect(sH('CCS')).toEqual([1]);
      expect(sH('CSC')).toEqual([0]);
      expect(sH('CSc1ccccc1')).toEqual([0]);
      expect(ChemistryEngine.parseStructureInput({smiles: 'c1cc[nH]c1'}).molecularFormula).toBe('C4H5N');
      expect(ChemistryEngine.parseStructureInput({smiles: 'c1ccoc1'}).molecularFormula).toBe('C4H4O');
    }
  });
});

describe.skipIf(NEED_F)('stop-8 pass criteria on the 31 single-compound spectra of the stop-7 audit', () => {
  const score = (matching: boolean, h: boolean) => STOP7_SPECTRA.map(([name, smi, formula, peaks]) => { set(h, matching); return {name, v: h1(ledger(smi, fx(name, formula, smi, peaks)))}; });
  it('propene, allyl acetate, diallyl carbonate, furan >= 95; n-hexane >= 90; dimethyl malonate >= 90.3', () => {
    const on = Object.fromEntries(score(true, true).map(r => [r.name, r.v]));
    for (const n of ['propylene', 'allyl acetate', 'diallyl carbonate', 'furan']) expect(on[n], n).toBeGreaterThanOrEqual(95);
    expect(on['n-hexane']).toBeGreaterThanOrEqual(90);
    expect(on['dimethyl malonate']).toBeGreaterThanOrEqual(90.3);
  });
  it('no spectrum scores more than 2 points below the flag-off (v1.4.0) value', () => {
    const off = score(false, true), on = score(true, true);
    const worse = on.map((r, i) => ({name: r.name, d: r.v - off[i].v})).filter(r => r.d < -2);
    expect(worse).toEqual([]);
  });
  it('flag off (useV140H1 on, matching off) keeps the pinned stop-7 values', () => {
    const off = Object.fromEntries(score(false, true).map(r => [r.name, r.v]));
    expect(off['propylene']).toBeCloseTo(72.1, 1);
    expect(off['n-hexane']).toBeCloseTo(42.9, 1);
    expect(off['dimethyl malonate']).toBeCloseTo(49.6, 1);
    expect(off['2-propanol']).toBeCloseTo(86.7, 1);
  });
});
