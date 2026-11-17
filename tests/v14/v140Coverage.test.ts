import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {classifySignal, NO_IR} from '../../src/engines/constraints/shiftClasses';
import {StructureParserAdapter} from '../../src/engines/chemistryEngine';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from '../helpers/v121Golden';
import {applySetting, clearEnvCache, evalTier1, evalTier2, hasLocalOnly, initTruthTools, type Item, loadTier1, loadTier1Full, loadTier2, localOnlyNote, mae, resolveAtoms, type Setting, SETTINGS, needFulmer} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the tier-1 file checks, the coverage of the truth sets and the rule calibration skip without them (one-line note).
const NEED_F = needFulmer('v140Coverage: the tier-1 file checks, the coverage of the truth sets and the rule calibration');
// v1.4.2 stop 35: these tests read the grade-A entries of tier 2 (user-looked-up SDBS / ChemicalBook / RSC SI values), which are local-only; without them they are skipped.
const NEED_GRADE_A = !hasLocalOnly('tier2GradeA');
if (NEED_GRADE_A) console.info(localOnlyNote('tier2GradeA', 'v140Coverage.test.ts: 4 test(s) that read the grade-A entries'));

// v1.4.0 stop 10 (flag v140.coverage): the two truth sets, the shift classes for the windows no class read, the three new 1H rules (calibration / held-out), and the stop-7 audit cases (A2) through the whole flow.
// Tier 1 = Fulmer 2010 SI Table S1; tier 2 = planner's list (validation only). No user spectrum is used anywhere.
const here = path.dirname(fileURLToPath(import.meta.url));
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140, a: V12_CONFIG.useV123, b: V12_CONFIG.useV130, c: V12_CONFIG.useV131, d: V12_CONFIG.useV132}));
beforeAll(async () => { await initTruthTools(); }, 120000);
afterAll(() => {
  const c = V12_CONFIG as unknown as Record<string, unknown>;
  c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); c.useV123 = was.a; c.useV130 = was.b; c.useV131 = was.c; c.useV132 = was.d;
});

const elementsOf = (smiles: string): Set<string> => {
  const g = StructureParserAdapter.parseSmilesGraph(resolveAtoms(smiles, '[*]').canonical).graph!;
  return new Set(g.atoms.map(a => a.element).filter(e => e !== 'H'));
};

describe('truth files', () => {
  // v1.4.2 stop 35: the original transcription is local-only; this check runs on it when present (unchanged), and the derived file has its own check below.
  if (!hasLocalOnly('tier1Full')) console.info(localOnlyNote('tier1Full', 'v140Coverage "tier 1 ... 105 signals (3 flagged unusable)"'));
  it.skipIf(!hasLocalOnly('tier1Full'))('tier 1 (Fulmer 2010 SI Table S1, 7 solvents): 51 compounds, 105 signals (3 flagged unusable); every SMILES parses, every SMARTS finds its atoms with the stated H count', () => {
    const t1 = loadTier1Full();
    expect(t1.compounds.length).toBe(51);
    expect(t1.compounds.reduce((s, c) => s + c.signals.length, 0)).toBe(105);
    let unusable = 0, values = 0;
    for (const c of t1.compounds) for (const s of c.signals) {
      const r = resolveAtoms(c.smiles, s.smarts);
      expect(r.error, `${c.name} ${s.label}`).toBeUndefined();
      if (s.usable === false) { unusable++; continue; }
      const group = c.signals.filter(x => x.smarts === s.smarts && x.usable !== false).length;
      expect(r.hCount, `${c.name} ${s.label}: H of the matched atoms`).toBe((s.nH ?? 0) * group);
      values += Object.keys(s.values ?? {}).length;
      expect(Object.keys(s.values ?? {}).every(k => ['CDCl3', 'C6D6', 'acetone-d6', 'DMSO-d6', 'CD3CN', 'CD3OD', 'D2O'].includes(k))).toBe(true);
    }
    expect(unusable).toBe(3);
    expect(values).toBe(677);
  });
  it.skipIf(NEED_F)('tier 1 derived file (v1.4.2 stop 35): 51 compounds, 102 signals (the 3 unusable ones are not kept), 677 values in the 7 solvents; every SMILES parses, every SMARTS finds its atoms with the stated H count', () => {
    const t1 = loadTier1();
    expect(t1.compounds.length).toBe(51);
    expect(t1.compounds.reduce((s, c) => s + c.signals.length, 0)).toBe(102);
    let values = 0;
    for (const c of t1.compounds) for (const s of c.signals) {
      const r = resolveAtoms(c.smiles, s.smarts);
      expect(r.error, `${c.name} ${s.label}`).toBeUndefined();
      expect(s.usable, `${c.name} ${s.label}`).toBeUndefined();
      const group = c.signals.filter(x => x.smarts === s.smarts).length;
      expect(r.hCount, `${c.name} ${s.label}: H of the matched atoms`).toBe((s.nH ?? 0) * group);
      values += Object.keys(s.values ?? {}).length;
      expect(Object.values(s.values ?? {}).every(v => typeof v === 'number')).toBe(true);
      expect(Object.keys(s.values ?? {}).every(k => ['CDCl3', 'C6D6', 'acetone-d6', 'DMSO-d6', 'CD3CN', 'CD3OD', 'D2O'].includes(k))).toBe(true);
    }
    expect(values).toBe(677);
  });
  it.skipIf(NEED_GRADE_A)('tier 2 (planner list, validation only): 105 compounds, 208 signals; every SMILES parses, every SMARTS finds its atoms', () => {
    const t2 = loadTier2();
    expect(t2.compounds.length).toBe(105);
    expect(t2.compounds.reduce((s, c) => s + c.signals.length, 0)).toBe(208);
    for (const c of t2.compounds) {
      expect([1, 2].includes(c.tier ?? 0) && ['A', 'B', 'T1g'].includes(c.grade ?? '')).toBe(true);
      for (const s of c.signals) {
        const r = resolveAtoms(c.smiles, s.smarts);
        expect(r.error, `${c.compound} ${s.label}`).toBeUndefined();
        const group = c.signals.filter(x => x.smarts === s.smarts).length;
        if (group === 1) expect(r.hCount, `${c.compound} ${s.label}: H of the matched atoms`).toBe(s.nH);
        expect(s.ppm !== undefined, `${c.compound} ${s.label}`).toBe(true);
      }
    }
  });
  it.skipIf(NEED_F)('the 35 entries of the earlier CDCl3 truth file (h1Truth.json) are all in tier 1 with the same value', () => {
    const old = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'fixtures', 'v140', 'h1Truth.json'), 'utf8')) as {classes: Record<string, {smiles: string; shiftPpm: number; compound: string; environment: string}[]>};
    const t1 = loadTier1();
    for (const list of Object.values(old.classes)) for (const e of list) {
      const can = resolveAtoms(e.smiles, '[*]').canonical;
      const comp = t1.compounds.find(c => resolveAtoms(c.smiles, '[*]').canonical === can);
      expect(comp, `${e.compound} is in tier 1`).toBeTruthy();
      const hit = comp!.signals.some(s => { const v = s.values?.CDCl3; const m = typeof v === 'number' ? v : v?.mid; return m !== undefined && Math.abs(m - e.shiftPpm) < 0.0051; });
      expect(hit, `${e.compound} ${e.environment} ${e.shiftPpm}`).toBe(true);
    }
  });
});

describe.skipIf(NEED_F)('shift-class coverage of the truth sets (A1)', () => {
  const all: {tier: number; name: string; label: string; shift: number; solvent: string; exch: boolean; el: Set<string>}[] = [];
  beforeAll(() => { if (NEED_F) return;
    for (const c of loadTier1().compounds) for (const s of c.signals) { if (s.usable === false) continue; for (const [k, v] of Object.entries(s.values ?? {})) all.push({tier: 1, name: c.name, label: s.label, shift: typeof v === 'number' ? v : v.mid, solvent: k === 'acetone-d6' ? 'Acetone-d6' : k, exch: Boolean(s.exchangeable), el: elementsOf(c.smiles)}); }
    for (const c of loadTier2().compounds) for (const s of c.signals) all.push({tier: 2, name: c.compound, label: s.label, shift: Array.isArray(s.ppm) ? s.ppm[0] : s.ppm!, solvent: 'CDCl3', exch: Boolean(s.exchangeable), el: elementsOf(c.smiles)});
  });
  const covered = (r: (typeof all)[number], broad: boolean, mult = broad ? 'br s' : 't') => classifySignal({observationId: 'x', shiftPpm: r.shift, relativeIntegral: 1, multiplicity: mult, broad, optional: false, exchangeable: false}, {solvent: r.solvent, formulaElements: r.el, nitrogenAllowed: r.el.has('N'), ir: NO_IR}).matches.map(m => m.classId);
  it.skipIf(NEED_GRADE_A)('flag off: 42 of the 843 non-exchangeable signals have no class (the stop-7 gaps); flag on: none', () => {
    applySetting(SETTINGS.base);
    const non = all.filter(r => !r.exch);
    expect(non.length).toBe(843);
    expect(non.filter(r => !covered(r, false).some(c => c !== 'EXCHANGEABLE')).length).toBe(42);
    applySetting(SETTINGS.coverage);
    expect(non.filter(r => !covered(r, false).some(c => c !== 'EXCHANGEABLE')).map(r => `${r.name} ${r.label} ${r.shift}`)).toEqual([]);
  });
  it.skipIf(NEED_GRADE_A)('exchangeable signals: read as broad signals with the flag on (thiol S-H included); the sharp-singlet readings that stay open are listed', () => {
    const ex = all.filter(r => r.exch);
    applySetting(SETTINGS.coverage);
    expect(ex.filter(r => !covered(r, true).includes('EXCHANGEABLE')).map(r => `${r.name} ${r.shift}`)).toEqual([]);
    // sharp singlets still outside: water in C6D6 (0.40, below the singlet window), water in DMSO-d6 (3.33, the solvent's own residual water, an automatic solvent candidate) and the NH of pyrrole (broad in the table)
    expect(ex.filter(r => !covered(r, false, 's').includes('EXCHANGEABLE')).map(r => `${r.name} ${r.solvent} ${r.shift}`).sort()).toEqual(['pyrrole CDCl3 8.4', 'water C6D6 0.4', 'water DMSO-d6 3.333'].sort());
    applySetting(SETTINGS.base);
    expect(ex.filter(r => !covered(r, true).includes('EXCHANGEABLE')).map(r => r.name)).toContain('ethanethiol');
  });
  it('the gap scan of the stop-7 audit (0-14 ppm, a triplet of 2 H): which windows stay empty, per element set', () => {
    const gaps = (els: string[]): string => {
      const el = new Set(['C', 'H', ...els]); const out: number[] = [];
      for (let v = 0; v <= 14.0001; v += 0.05) if (!classifySignal({observationId: 'x', shiftPpm: Number(v.toFixed(2)), relativeIntegral: 1, multiplicity: 't', broad: false, optional: false, exchangeable: false}, {solvent: 'CDCl3', formulaElements: el, nitrogenAllowed: el.has('N'), ir: NO_IR}).matches.some(m => m.classId !== 'EXCHANGEABLE')) out.push(Number(v.toFixed(2)));
      const spans: string[] = []; let a = -1, b = -1;
      for (const g of out) { if (a < 0) { a = b = g; } else if (g - b < 0.06) b = g; else { spans.push(`${a}-${b}`); a = b = g; } }
      if (a >= 0) spans.push(`${a}-${b}`);
      return spans.join(', ');
    };
    applySetting(SETTINGS.base);
    expect(gaps([])).toBe('0-0.45, 3.25-4.45, 8.55-8.95, 10.55-14');
    expect(gaps(['O'])).toBe('0-0.45, 8.55-8.95, 10.55-14');
    expect(gaps(['N'])).toBe('0-0.45, 3.85-4.45, 8.55-8.95, 10.55-14');
    applySetting(SETTINGS.coverage);
    expect(gaps([])).toBe('3.25-4.45, 8.55-8.95, 10.55-14');             // C,H only: nothing can be read there (a halogen, N, O or S is needed)
    expect(gaps(['O'])).toBe('8.55-8.95, 10.55-14');                       // 8.55-8.95 needs N (pyridine alpha H); > 10.6 is an OH/NH/COOH, read as exchangeable
    expect(gaps(['N'])).toBe('3.85-4.45, 10.55-14');                      // N without O: 3.85-4.45 stays (nitro needs O; no tier 1/2 value there)
    expect(gaps(['Cl'])).toBe('8.55-8.95, 10.55-14');
    expect(gaps(['S'])).toBe('4.05-4.45, 8.55-8.95, 10.55-14');
  });
});

/** The calibration / held-out split of every rule of h1CoverageRules.ts (stated in the file's comment); this test pins the numbers. */
describe.skipIf(NEED_F)('new 1H rules: calibration and held-out values (A3)', () => {
  const at = (items: Item[], compound: string, label?: string) => items.filter(i => i.compound.startsWith(compound) && (label === undefined || i.label === label));
  let base1: Item[] = [], cov1: Item[] = [], base2: Item[] = [], cov2: Item[] = [];
  beforeAll(() => { if (NEED_F) return; clearEnvCache(); base1 = evalTier1(SETTINGS.base); cov1 = evalTier1(SETTINGS.coverage); base2 = evalTier2(SETTINGS.base); cov2 = evalTier2(SETTINGS.coverage); }, 120000);
  const err = (items: Item[]) => items.map(i => Math.abs(i.error!));
  it.skipIf(NEED_GRADE_A)('FORMYL_HETERO: calibration DMF CH 8.02 (tier 1); held out methyl, ethyl, isopropyl formate CHO (tier 2): before +1.7, after <= 0.06', () => {
    expect(err(at(base1, 'dimethylformamide', 'CH'))[0]).toBeGreaterThan(1.7);
    expect(err(at(cov1, 'dimethylformamide', 'CH'))[0]).toBeLessThan(0.005);
    for (const n of ['methyl formate', 'ethyl formate', 'isopropyl formate']) { expect(err(at(base2, n, 'CHO'))[0]).toBeGreaterThan(1.6); expect(err(at(cov2, n, 'CHO'))[0]).toBeLessThanOrEqual(0.061); }
    // a C-bound aldehyde keeps the aldehyde rule (benzaldehyde HCO, acetaldehyde CHO)
    expect(at(cov1, 'benzaldehyde', 'HCO')[0].predicted).toBe(at(base1, 'benzaldehyde', 'HCO')[0].predicted);
    expect(at(cov2, 'acetaldehyde', 'CHO')[0].predicted).toBe(at(base2, 'acetaldehyde', 'CHO')[0].predicted);
  });
  it('ARYL_S_CH: calibration aryl S-CH3 2.46 and aryl decyl sulfide S-CH2 2.81 (Chem. Sci. 2020 SI, tier-1 quality); held out thioanisole 2.44 / 2.47 and ethyl phenyl sulfide SCH2 2.86 (tier 2): before -1.6, after <= 0.05', () => {
    for (const [n, l] of [['aryl methyl sulfide', 'S-CH3'], ['aryl decyl sulfide', 'S-CH2']] as const) expect(err(at(cov2, n, l))[0]).toBeLessThan(0.005);
    expect(err(at(base2, 'thioanisole', 'CH3'))[0]).toBeGreaterThan(1.5);
    expect(err(at(cov2, 'thioanisole', 'CH3'))[0]).toBeLessThanOrEqual(0.051);
    expect(err(at(cov2, 'ethyl phenyl sulfide', 'SCH2'))[0]).toBeLessThanOrEqual(0.051);
    // no rule where there is no held-out partner: S-CH of the aryl cyclohexyl sulfide, dialkyl thioethers, thiols, disulfide, sulfone
    for (const [n, l] of [['aryl cyclohexyl sulfide', 'S-CH'], ['dimethyl sulfide', 'CH3'], ['methanethiol', 'CH3'], ['dimethyl disulfide', 'CH3'], ['dimethyl sulfone', 'CH3'], ['benzyl methyl sulfide', 'SCH3']] as const) expect(at(cov2, n, l)[0].predicted).toBe(at(base2, n, l)[0].predicted);
    expect(at(cov1, 'dimethyl sulfoxide', 'CH3')[0].predicted).toBe(at(base1, 'dimethyl sulfoxide', 'CH3')[0].predicted);
  });
  it('POLYHALOMETHANE: calibration CHCl3 7.26 (tier 1); held out CH2Cl2 5.30 (tier 1, other compound of the class): 8.00 -> 7.26 and 5.55 -> 5.23; CH3Cl, CH2Cl-CH2Cl and CHCl2-COOH are not this class', () => {
    expect(at(cov1, 'chloroform')[0].predicted).toBeCloseTo(7.26, 2);
    expect(at(base1, 'chloroform')[0].predicted).toBeCloseTo(8.0, 2);
    expect(Math.abs(at(cov1, 'dichloromethane')[0].error!)).toBeLessThanOrEqual(0.071);
    expect(Math.abs(at(base1, 'dichloromethane')[0].error!)).toBeGreaterThan(0.24);
    for (const [items, n] of [[cov2, 'methyl chloride'], [cov1, '1,2-dichloroethane'], [cov2, 'dichloroacetic acid']] as const) expect(at(items, n)[0].predicted).toBe(at(items === cov2 ? base2 : base1, n)[0].predicted);
  });
  it('CYCLOALKANE_CH2: calibration cyclohexane 1.43 (tier 1); held out cyclopentane 1.51 and cycloheptane 1.53 (tier 2): before -0.18 / -0.26 / -0.28, after 0 / -0.08 / -0.10; a substituted ring and cyclopropane / cyclobutane are not this class', () => {
    expect(at(cov1, 'cyclohexane')[0].predicted).toBeCloseTo(1.43, 2);
    expect(at(base1, 'cyclohexane')[0].predicted).toBeCloseTo(1.25, 2);
    for (const [n, e] of [['cyclopentane', 0.08], ['cycloheptane', 0.10]] as const) { expect(Math.abs(at(cov2, n)[0].error!)).toBeLessThanOrEqual(e + 0.005); expect(Math.abs(at(base2, n)[0].error!)).toBeGreaterThan(0.25); }
    for (const n of ['cyclopropane', 'cyclobutane']) expect(at(cov2, n)[0].predicted).toBe(at(base2, n)[0].predicted);
    expect(at(cov1, 'cyclohexanone', 'CH2(3,5)')[0].predicted).toBe(at(base1, 'cyclohexanone', 'CH2(3,5)')[0].predicted);
  });
  it('error by environment class (tier 1 and tier 2 apart): the rule classes fall, no other class changes (limit +0.02)', () => {
    const rows: string[] = ['tier | class | n | flag off MAE | flag on MAE'];
    const cats = new Set<string>();
    for (const i of [...base1, ...base2]) cats.add(`${base1.includes(i) ? 1 : 2}|${i.category}`);
    for (const key of [...cats].sort()) {
      const [t, cat] = key.split('|'), a = (t === '1' ? base1 : base2).filter(i => i.category === cat && !i.exchangeable), b = (t === '1' ? cov1 : cov2).filter(i => i.category === cat && !i.exchangeable);
      if (!a.length) continue;
      const ma = mae(a), mb = mae(b);
      if (Math.abs(ma - mb) > 1e-9) rows.push(`${t} | ${cat} | ${a.length} | ${ma.toFixed(2)} | ${mb.toFixed(2)}`);
      expect(mb - ma, `${key} must not get worse`).toBeLessThanOrEqual(0.02);
    }
    console.log(rows.join('\n'));
    const changed = rows.length - 1;
    expect(changed).toBe(8);   // CHO_formamide, polyhalo_CH, polyhalo_CH2, alkyl_CH2 (cyclohexane) (tier 1); CHO_formate, S_CH2_arylthioether, S_CH3_arylthioether, alkyl_CH2 (cyclopentane, cycloheptane) (tier 2)
  });
});

/** Whole flow with Fulmer values (A2): flag off falls back to the old beam search or finds nothing; flag on reads the signals and the target is in the candidates. */
describe('stop-7 audit cases through the whole flow (A2)', () => {
  const P = (x: number, integration: number, multiplicity: string) => ({x, integration, multiplicity});
  const fx = (id: string, formula: string, smiles: string, h1: ReturnType<typeof P>[], irPeaks = [{x: 2970, y: 40}, {x: 1100, y: 20}]) => ({id, description: 'Fulmer 2010 SI', targetSmiles: smiles, formula, h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent' as const, coverageCm1: [4000, 450] as [number, number], calibrated: true, peaks: irPeaks}});
  const cases = [fx('1,2-dichloroethane', 'C2H4Cl2', 'ClCCCl', [P(3.73, 4, 's')]), fx('pyridine', 'C5H5N', 'c1ccncc1', [P(8.62, 2, 'm'), P(7.68, 1, 'm'), P(7.29, 2, 'm')]), fx('dichloromethane', 'CH2Cl2', 'ClCCl', [P(5.30, 2, 's')]),
    fx('chloroform', 'CHCl3', 'ClC(Cl)Cl', [P(7.26, 1, 's')]), fx('methane', 'CH4', 'C', [P(0.22, 4, 's')])];
  const run = async (f: ReturnType<typeof fx>, s: Setting) => {
    applySetting(s);
    const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV123 = true; c.useV130 = true; c.useV131 = true; c.useV132 = false;
    const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f as never, {denseBaseline: true}), extraInput: {molecularFormula: f.formula}} as never, SHAPE_BUDGET) as any;
    const en = r.reasoningTrace?.compositionSearch?.runs?.[0]?.enumeration;
    const tc = canonNoStereo(f.targetSmiles);
    return {path: en?.v12?.path as string, candidates: (r.rankedCandidates as {smiles: string}[]).length, inList: (r.rankedCandidates as {smiles: string}[]).some(c2 => canonNoStereo(c2.smiles) === tc)};
  };
  for (const f of cases) it(`${f.id}: flag off retreats (FALLBACK) or reads nothing; flag on keeps the list (INVENTORY) with the target in it`, async () => {
    const off = await run(f, SETTINGS.full);
    const on = await run(f, SETTINGS.fullCov);
    expect(off.path).toBe('FALLBACK');
    expect(on.path).toBe('INVENTORY');
    expect(on.inList).toBe(true);
  }, 240000);
  it('nitromethane (CH3NO2, 4.33 s): with the generic IR it has no candidate (no N-O evidence); with the two nitro bands the flag finds it; the flag off finds nothing in both', async () => {
    const generic = fx('nitromethane', 'CH3NO2', 'C[N+](=O)[O-]', [P(4.33, 3, 's')]);
    const nitro = fx('nitromethane', 'CH3NO2', 'C[N+](=O)[O-]', [P(4.33, 3, 's')], [{x: 2970, y: 40}, {x: 1555, y: 15}, {x: 1375, y: 20}]);
    expect((await run(nitro, SETTINGS.full)).inList).toBe(false);
    expect((await run(generic, SETTINGS.fullCov)).inList).toBe(false);
    const found = await run(nitro, SETTINGS.fullCov);
    expect(found.path).toBe('INVENTORY');
    expect(found.inList).toBe(true);
  }, 240000);
});
