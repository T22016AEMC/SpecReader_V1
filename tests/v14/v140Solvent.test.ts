import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {clearEnvCache, evalTier1, evalTier2, initTruthTools, loadTier1, predictEnvs, resolveAtoms, SETTINGS, needFulmer} from '../helpers/v140Truth';
import {CLASS_SD_RATIO, deltaItems, MIN_COMPOUNDS, NON_CDCL3, runStudy, SEED, stat, type DeltaItem} from '../helpers/v140SolventStudy';
// v1.4.2 stop 36 (F): the Fulmer 2010 files (tier 1, stop-7 spectra) are local-only; the solvent study (it is built on tier 1) skip without them (one-line note).
const NEED_F = needFulmer('v140Solvent: the solvent study (it is built on tier 1)');

// v1.4.0 stop 12 (flag v140.solvent): solvent shift by environment class. Diagnosis (C1), the pre-registered selection (C2, C3), the held-out check with the engine, CDCl3 unchanged, the exchangeable protons only widened (C4).
// Data: tier 1 (Fulmer 2010 SI Table S1, 51 compounds, 6 solvents against CDCl3). Seed of the compound split: 20261109 (also in v12Config.v140Solvent.seed and tests/helpers/v140SolventStudy.ts).
const was = JSON.parse(JSON.stringify({u: V12_CONFIG.useV140H1, v: V12_CONFIG.v140, t: V12_CONFIG.v140Solvent.table}));
beforeAll(async () => { await initTruthTools(); }, 120000);
afterAll(() => { const c = V12_CONFIG as unknown as Record<string, unknown>; c.useV140H1 = was.u; Object.assign(V12_CONFIG.v140, was.v); (V12_CONFIG.v140Solvent as unknown as Record<string, unknown>).table = was.t; });

let items: DeltaItem[];
let study: ReturnType<typeof runStudy>;
beforeAll(() => { if (NEED_F) return; items = deltaItems(SETTINGS.solventOff); study = runStudy(items); }, 120000);

describe.skipIf(NEED_F)('C1 diagnosis: shift in the solvent minus shift in CDCl3, by environment class', () => {
  it('573 differences from 51 compounds; the table class x solvent (signals, compounds, mean, sd, sd / global sd) is printed', () => {
    expect(items.length).toBe(573);
    expect(new Set(items.map(i => i.compound)).size).toBe(51);
    const classes = [...new Set(items.map(i => i.cls))].sort();
    const out: string[] = ['solvent | class | n signals | n compounds | mean | sd | sd / global sd (global = all non-exchangeable classes of the solvent)'];
    for (const sv of NON_CDCL3) {
      const g = stat(items.filter(i => i.solvent === sv && i.cls !== 'exchangeable').map(i => i.delta));
      out.push(`${sv} | all non-exchangeable | ${g.n} | ${new Set(items.filter(i => i.solvent === sv && i.cls !== 'exchangeable').map(i => i.compound)).size} | ${g.mean.toFixed(3)} | ${g.sd.toFixed(3)} | 1.00`);
      for (const k of classes) {
        const a = items.filter(i => i.solvent === sv && i.cls === k); if (!a.length) continue;
        const s = stat(a.map(i => i.delta));
        out.push(`${sv} | ${k} | ${s.n} | ${new Set(a.map(i => i.compound)).size} | ${s.mean.toFixed(3)} | ${s.sd.toFixed(3)} | ${(s.sd / g.sd).toFixed(2)}`);
      }
    }
    console.log(out.join('\n'));
    expect(out.length).toBeGreaterThan(40);
  });
});

describe.skipIf(NEED_F)('C2 / C3 selection with the seeded split', () => {
  it(`the split is fixed by the seed ${SEED}: 26 compounds estimate (half A), 25 validate (half B)`, () => {
    expect(V12_CONFIG.v140Solvent.seed).toBe(SEED);
    expect(V12_CONFIG.v140Solvent.classSdRatio).toBe(CLASS_SD_RATIO);
    expect(V12_CONFIG.v140Solvent.minCompounds).toBe(MIN_COMPOUNDS);
    expect(study.halves.A.size).toBe(26); expect(study.halves.B.size).toBe(25);
    expect([...study.halves.B].sort()).toEqual(['1,2-dimethoxyethane', '1,4-dioxane', '18-crown-6', 'BHT', 'HMPA', 'acetic acid', 'acetone', 'allyl acetate', 'benzene', 'chloroform', 'cyclohexane', 'diallyl carbonate', 'dichloromethane', 'diglyme', 'dimethylformamide', 'ethyl methyl ketone', 'ethylene', 'ethylene glycol', 'furan', 'hexamethylbenzene', 'hexamethyldisiloxane', 'imidazole', 'n-hexane', 'propane', 'pyridine'].sort());
  });
  it('per (solvent, class): compounds, sd ratio, C2, validation MAE of the class correction (estimated on A) against the predictor so far (half B), adoption', () => {
    const out = ['solvent | class | compounds | sd / global | C2 | B: class MAE | B: before MAE | C3 | adopted'];
    for (const r of study.rows) out.push(`${r.solvent} | ${r.cls} | ${r.compounds} | ${(r.sd / r.globalSd).toFixed(2)} | ${r.c2 ? 'yes' : 'no'} | ${r.maeClassB === null ? '—' : r.maeClassB.toFixed(3)} | ${r.maeEngineB === null ? '—' : r.maeEngineB.toFixed(3)} | ${r.c3 ? 'yes' : 'no'} | ${r.adopted ? 'YES' : 'no'}`);
    console.log(out.join('\n'));
    // every adopted pair has >= 3 compounds and satisfies C2 and C3
    for (const r of study.rows.filter(x => x.adopted)) { expect(r.compounds).toBeGreaterThanOrEqual(3); expect(r.sd).toBeLessThanOrEqual(CLASS_SD_RATIO * r.globalSd); expect(r.maeClassB!).toBeLessThanOrEqual(r.maeEngineB!); }
    expect(study.rows.filter(x => x.adopted).length).toBe(14);   // 14 pairs pass C2 and C3; the 4 of acetone-d6 and DMSO-d6 are dropped again by the solvent-level check below (C3b): 10 are deployed
    expect(Object.values(V12_CONFIG.v140Solvent.table).reduce((s, t) => s + Object.keys(t).length, 0)).toBe(10);
  });
  it('C4: the exchangeable protons: only solvents with >= 3 compounds get a width, no centre value exists anywhere in the configuration', () => {
    expect(study.exchangeableSd).toEqual(V12_CONFIG.v140Solvent.exchangeableSdPpm);
    expect(Object.keys(V12_CONFIG.v140Solvent.exchangeableSdPpm).sort()).toEqual(['Acetone-d6', 'C6D6', 'CD3CN', 'DMSO-d6']);
    expect(Object.values(V12_CONFIG.v140Solvent.table).every(t => !Object.keys(t).some(k => /exch/i.test(k)))).toBe(true);
  });
});

describe.skipIf(NEED_F)('engine check with the classes estimated on half A only, scored on half B (predicted shift against the measured shift in the solvent)', () => {
  const rows: string[] = ['solvent | half-B signals | MAE without the classes | MAE with the classes (estimated on A) | kept'];
  const keep: string[] = [];
  it('solvents where the classes are not worse keep them (C6D6, CD3CN, CD3OD, D2O); acetone-d6 and DMSO-d6 are worse by 0.001 / 0.002 ppm and keep the previous behaviour', () => {
    const B = study.halves.B;
    (V12_CONFIG.v140Solvent as unknown as Record<string, unknown>).table = study.tableA;
    for (const sv of NON_CDCL3) {
      clearEnvCache();
      const pick = (s: Parameters<typeof evalTier1>[0]) => evalTier1(s, sv).filter(i => B.has(i.compound) && !i.exchangeable && i.error !== null);
      const old = pick(SETTINGS.solventOff), nw = pick(SETTINGS.solventOn);
      const m = (a: typeof old) => a.reduce((s, i) => s + Math.abs(i.error!), 0) / a.length;
      const ok = m(nw) <= m(old) + 1e-9;
      rows.push(`${sv} | ${old.length} | ${m(old).toFixed(3)} | ${m(nw).toFixed(3)} | ${ok ? 'yes' : 'no'}`);
      if (ok) keep.push(sv === 'acetone-d6' ? 'Acetone-d6' : sv);
    }
    (V12_CONFIG.v140Solvent as unknown as Record<string, unknown>).table = was.t;
    console.log(rows.join('\n'));
    // the deployed table has exactly the solvents that pass this check
    expect(Object.keys(V12_CONFIG.v140Solvent.table).sort()).toEqual(keep.filter(k => Object.keys(study.table).includes(k)).sort());
    expect(Object.keys(V12_CONFIG.v140Solvent.table).sort()).toEqual(['C6D6', 'CD3CN', 'CD3OD', 'D2O']);
    // the deployed values are the means over all compounds
    for (const [sv, t] of Object.entries(V12_CONFIG.v140Solvent.table)) for (const [k, v] of Object.entries(t)) expect(v, `${sv} ${k}`).toBe(study.table[sv][k]);
  });
});

describe.skipIf(NEED_F)('the engine with the flag', () => {
  it('flag off: identical to the stack of the stops 2-11; CDCl3 with the flag on: identical, for all 51 tier-1 and all tier-2 compounds', () => {
    clearEnvCache();
    const a = evalTier1(SETTINGS.solventOff, 'CDCl3').map(i => i.predicted), b = evalTier1(SETTINGS.solventOn, 'CDCl3').map(i => i.predicted);
    expect(b).toEqual(a);
    const c = evalTier2(SETTINGS.solventOff).map(i => i.predicted), d = evalTier2(SETTINGS.solventOn).map(i => i.predicted);
    expect(d).toEqual(c);
  });
  it('a corrected environment = its CDCl3 shift + the class value: THF OCH2 in C6D6 (O-CH, -0.314); a class without a correction (aromatic CH of toluene in C6D6) keeps the old value; DMSO-d6 and acetone-d6 are unchanged', () => {
    const thf = resolveAtoms('C1CCOC1', '[CH2]O').canonical;
    const cd = predictEnvs(thf, 'CDCl3', SETTINGS.solventOn).find(e => e.integration === 4 && e.shiftPpm > 3)!;
    const c6 = predictEnvs(thf, 'C6D6', SETTINGS.solventOn).find(e => e.integration === 4 && e.shiftPpm > 3)!;
    expect(c6.shiftPpm - cd.shiftPpm).toBeCloseTo(-0.314, 3);
    const tol = resolveAtoms('Cc1ccccc1', '[cH]').canonical;
    expect(predictEnvs(tol, 'C6D6', SETTINGS.solventOn).map(e => e.shiftPpm)).toEqual(predictEnvs(tol, 'C6D6', SETTINGS.solventOff).map(e => e.shiftPpm));
    for (const sv of ['DMSO-d6', 'Acetone-d6']) expect(predictEnvs(thf, sv, SETTINGS.solventOn).map(e => e.shiftPpm)).toEqual(predictEnvs(thf, sv, SETTINGS.solventOff).map(e => e.shiftPpm));
  });
  it('C4: an exchangeable proton keeps its centre and gets a wider tolerance (ethanol OH in DMSO-d6: 0.45 -> sqrt(0.45^2 + 0.69^2))', () => {
    const eth = resolveAtoms('CCO', '[OH]').canonical;
    const off = predictEnvs(eth, 'DMSO-d6', SETTINGS.solventOff).find(e => e.isExchangeable)! as unknown as {shiftPpm: number; uncertaintyPpm: number};
    const on = predictEnvs(eth, 'DMSO-d6', SETTINGS.solventOn).find(e => e.isExchangeable)! as unknown as {shiftPpm: number; uncertaintyPpm: number};
    expect(on.shiftPpm).toBe(off.shiftPpm);
    expect(off.uncertaintyPpm).toBeCloseTo(0.45, 2);
    expect(on.uncertaintyPpm).toBeCloseTo(Math.sqrt(0.45 ** 2 + 0.69 ** 2), 2);
    // CD3OD (2 compounds only) and D2O (none): no widening
    expect((predictEnvs(eth, 'CD3OD', SETTINGS.solventOn).find(e => e.isExchangeable)! as unknown as {uncertaintyPpm: number}).uncertaintyPpm).toBeCloseTo(off.uncertaintyPpm, 3);
  });
  it('the tier-1 compounds the table was built from are all there (51)', () => {
    expect(loadTier1().compounds.length).toBe(51);
  });
});
