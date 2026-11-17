import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine, StructureParserAdapter} from '../../src/engines/chemistryEngine';
import {NMRGraphPredictor} from '../../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {gemDimethylObservedPair, gemDimethylOnAlkene, hasGemDimethylOnAlkene, splitGemDimethylEnvs} from '../../src/engines/scientificEngines/h1AdditiveRules';
import {fixtureSpectra} from '../helpers/v121Golden';
import {measureV132} from '../helpers/v132Samples';
import type {V121Fixture} from '../helpers/v121Golden';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.4.0 stop 6: the =C(CH3)2 reading. The graph predictor makes the two methyls on one sp2 carbon ONE 6H environment (topological equivalence); E / Z methyls are not equivalent and show as two 3H singlets
// (prenol 1.73 / 1.66). Under useV140H1 AND v140.alkene the candidate is also scored with that environment split in two 3H environments and the better 1H score is kept. Nothing is added to any score.
// All spectra here are hand-written synthetic ones (values in the range of the literature for prenol-type =C(CH3)2, no real spectrum).
const was = {h1: V12_CONFIG.useV140H1, a: V12_CONFIG.v140.alkene, o: V12_CONFIG.v140.oxygen, en: V12_CONFIG.gemDimethylReading.enabled};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.alkene = was.a; V12_CONFIG.v140.oxygen = was.o; V12_CONFIG.gemDimethylReading.enabled = was.en; });
const set = (h1: boolean, alkene: boolean, oxygen: boolean, enabled = true) => { V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.alkene = alkene; V12_CONFIG.v140.oxygen = oxygen; V12_CONFIG.gemDimethylReading.enabled = enabled; };

type P = {x: number; integration: number; multiplicity: string};
const fx = (id: string, formula: string, smiles: string, h1: P[]): V121Fixture => ({
  id, description: 'hand-written synthetic 1H table (CDCl3)', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
});
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
const ledger = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, bundleOf(f));
const item = (l: ReturnType<typeof ledger>, id: string) => l.entries.find(e => e.evidenceId === id)!;
const h1 = (l: ReturnType<typeof ledger>) => l.modalityScores['1H_NMR'] as number;

const PRENOL = fx('PRENOL', 'C5H10O', 'CC(C)=CCO', [{x: 5.40, integration: 1, multiplicity: 't'}, {x: 4.15, integration: 2, multiplicity: 'd'}, {x: 1.73, integration: 3, multiplicity: 's'}, {x: 1.66, integration: 3, multiplicity: 's'}]);
const PRENYL_AC = fx('PRENYL_AC', 'C7H12O2', 'CC(C)=CCOC(C)=O', [{x: 5.34, integration: 1, multiplicity: 't'}, {x: 4.58, integration: 2, multiplicity: 'd'}, {x: 2.05, integration: 3, multiplicity: 's'}, {x: 1.74, integration: 3, multiplicity: 's'}, {x: 1.69, integration: 3, multiplicity: 's'}]);
const PRENYL_AC_6H = fx('PRENYL_AC_6H', 'C7H12O2', 'CC(C)=CCOC(C)=O', [{x: 5.34, integration: 1, multiplicity: 't'}, {x: 4.58, integration: 2, multiplicity: 'd'}, {x: 2.05, integration: 3, multiplicity: 's'}, {x: 1.72, integration: 6, multiplicity: 's'}]);
const TWO_SINGLETS = (smi: string, formula: string) => fx('TWO3H', formula, smi, [{x: 1.73, integration: 3, multiplicity: 's'}, {x: 1.66, integration: 3, multiplicity: 's'}, {x: 1.25, integration: 2, multiplicity: 'q'}, {x: 0.86, integration: 3, multiplicity: 't'}]);

describe('which groups are =C(CH3)2 with non-equivalent E / Z methyls (graph level)', () => {
  const graph = (smi: string) => StructureParserAdapter.parseSmilesGraph(smi).graph!;
  const split = (smi: string) => {
    const envs = NMRGraphPredictor.predict1HFromStructureGraph(ChemistryEngine.parseStructureInput({smiles: smi}), {solvent: 'CDCl3'}).environments;
    return {before: envs, after: splitGemDimethylEnvs(envs, graph(smi))};
  };
  it('prenol, prenyl acetate, 2-methyl-2-butene, homoprenyl compounds: the 6H methyl environment is split into two 3H environments on two different atoms', () => {
    for (const smi of ['CC(C)=CCO', 'CC(C)=CCOC(C)=O', 'CC=C(C)C', 'CC(C)=CCCOCCO', 'CC(C)=CCCOC(C)=O']) {
      expect(hasGemDimethylOnAlkene(graph(smi)), smi).toBe(true);
      const {before, after} = split(smi);
      expect(after.split, smi).toBe(1);
      expect(after.envs.length, smi).toBe(before.length + 1);
      const sixH = before.filter(e => e.integration === 6 && e.atomIndices?.length === 2 && !e.isExchangeable);
      expect(sixH, smi).toHaveLength(1);
      const parts = after.envs.filter(e => e.id.startsWith(`${sixH[0].id}-m`));
      expect(parts.map(e => e.integration)).toEqual([3, 3]);
      expect(new Set(parts.map(e => e.atomIndices![0])).size).toBe(2);
      expect(parts.every(e => e.shiftPpm === sixH[0].shiftPpm)).toBe(true);
      expect(after.envs.reduce((s, e) => s + (e.integration ?? 0), 0), `${smi}: total H unchanged`).toBe(before.reduce((s, e) => s + (e.integration ?? 0), 0));
    }
  });
  it('NOT split: sp3 gem-dimethyl (2,2-dimethylbutane, tert-butyl, isopropyl, tert-butanol), acetone, isobutene (partner =CH2), tetramethylethylene, a single methyl on an alkene', () => {
    for (const smi of ['CC(C)(C)CC', 'CC(C)(C)c1ccccc1', 'CC(C)CO', 'CC(C)(C)O', 'CC(C)=O', 'C=C(C)C', 'CC(C)=C(C)C', 'CC=CC', 'C=CC']) {
      expect(hasGemDimethylOnAlkene(graph(smi)), smi).toBe(false);
      expect(split(smi).after.split, smi).toBe(0);
      expect(split(smi).after.envs, smi).toEqual(split(smi).before);
    }
  });
  it('gemDimethylOnAlkene answers only for the sp2 carbon itself', () => {
    const g = graph('CC(C)=CCO');
    expect(g.atoms.filter(a => gemDimethylOnAlkene(g, a.index)).length).toBe(1);
  });
  it('observed side: two equal-integral singlet-type signals inside 1.5-2.0; not one 6H signal, not unequal integrals, not outside the window, not a doublet', () => {
    const o = (position: number, relativeIntegral: number, multiplicity: string | null) => ({position, relativeIntegral, multiplicity});
    expect(gemDimethylObservedPair([o(1.73, 3, 's'), o(1.66, 3, 's')])).toBe(true);
    expect(gemDimethylObservedPair([o(1.73, 3, null), o(1.66, 3.2, 'br s')])).toBe(true);
    expect(gemDimethylObservedPair([o(1.72, 6, 's')])).toBe(false);
    expect(gemDimethylObservedPair([o(1.73, 3, 's'), o(1.66, 2, 's')])).toBe(false);
    expect(gemDimethylObservedPair([o(2.05, 3, 's'), o(1.66, 3, 's')])).toBe(false);
    expect(gemDimethylObservedPair([o(1.73, 3, 'd'), o(1.66, 3, 'd')])).toBe(false);
  });
});

describe('the ledger: the second reading appears only under useV140H1 AND v140.alkene, and only when it helps', () => {
  it('(a) prenol 1.73 / 1.66 (two 3H) + =CH 5.40 + CH2OH 4.15: before the integral-total term sits at ~0.01 (9 H predicted, 6 H seen); with the reading it is ~1.00 and the 1H score rises; environment count unchanged', () => {
    set(true, true, false, false); const before = ledger('CC(C)=CCO', PRENOL);
    set(true, true, false, true); const after = ledger('CC(C)=CCO', PRENOL);
    expect(item(before, '1H:integral-total').compatibility!).toBeLessThan(0.05);
    expect(item(after, '1H:integral-total').compatibility!).toBeGreaterThan(0.95);
    expect(item(after, '1H:environment-count').compatibility).toBe(item(before, '1H:environment-count').compatibility);
    expect(h1(after)).toBeGreaterThan(h1(before) + 20);
    expect(after.limitations[0]).toContain('=C(CH3)2');
    expect(before.limitations[0]).not.toContain('=C(CH3)2');
    // both groups on: same effect on the integral term
    set(true, true, true, true); expect(item(ledger('CC(C)=CCO', PRENOL), '1H:integral-total').compatibility!).toBeGreaterThan(0.95);
  });
  it('(a) every other term is untouched: a candidate WITHOUT a =C(CH3)2 group scores exactly the same with the reading on or off (2-methyl-2-buten-1-ol, a ring isomer)', () => {
    for (const smi of ['CC=C(C)CO', 'CC1=CCOC1(C)O']) {
      set(true, true, false, false); const a = JSON.stringify(ledger(smi, PRENOL));
      set(true, true, false, true); expect(JSON.stringify(ledger(smi, PRENOL)), smi).toBe(a);
    }
  });
  it('the reading is off when the flags are off: useV140H1 off (whatever the groups say), v140.alkene off (only oxygen on) = the stop-5 ledger, byte for byte', () => {
    set(true, true, true, false); const stop5 = JSON.stringify(ledger('CC(C)=CCO', PRENOL));
    set(true, false, true, true); expect(JSON.stringify(ledger('CC(C)=CCO', PRENOL)), 'alkene off, oxygen on').toBe(JSON.stringify((() => { set(true, false, true, false); return ledger('CC(C)=CCO', PRENOL); })()));
    set(false, true, true, true); const h1Off = JSON.stringify(ledger('CC(C)=CCO', PRENOL));
    set(false, true, true, false); expect(h1Off, 'useV140H1 off').toBe(JSON.stringify(ledger('CC(C)=CCO', PRENOL)));
    set(true, true, true, true); expect(JSON.stringify(ledger('CC(C)=CCO', PRENOL))).not.toBe(stop5);
  });
  it('(d) prenyl acetate with two 3H methyl singlets 1.74 / 1.69: with the 6H reading one of the two peaks stays unmatched (peak terms ~0.0 and ~0.2), with the reading both match (~1.0); (c) the same compound with ONE 6H singlet: the reading is not offered and the original reading stands (identical ledger)', () => {
    set(true, true, false, false); const b = ledger('CC(C)=CCOC(C)=O', PRENYL_AC);
    set(true, true, false, true); const a = ledger('CC(C)=CCOC(C)=O', PRENYL_AC);
    // (unmatched observed peaks still count in the observed H total, so the integral-total term is ~1 in both readings here; the gain is in the two methyl peaks)
    expect(item(b, '1H:integral-total').compatibility!).toBeGreaterThan(0.95);
    expect(item(b, '1H_NMR:synthetic-fixture.csv:1.74').compatibility!).toBeLessThan(0.1);
    expect(item(b, '1H_NMR:synthetic-fixture.csv:1.69').compatibility!).toBeLessThan(0.3);
    expect(item(a, '1H_NMR:synthetic-fixture.csv:1.74').compatibility!).toBeGreaterThan(0.95);
    expect(item(a, '1H_NMR:synthetic-fixture.csv:1.69').compatibility!).toBeGreaterThan(0.95);
    expect(h1(a)).toBeGreaterThan(h1(b) + 20);
    set(true, true, false, false); const six0 = ledger('CC(C)=CCOC(C)=O', PRENYL_AC_6H);
    set(true, true, false, true); const six1 = ledger('CC(C)=CCOC(C)=O', PRENYL_AC_6H);
    expect(JSON.stringify(six1)).toBe(JSON.stringify(six0));
    expect(item(six1, '1H:integral-total').compatibility!).toBeGreaterThan(0.95);
    expect(six1.limitations[0]).not.toContain('=C(CH3)2');
  });
  it('(b) alkyl gem-dimethyl and other groups that look similar are never affected, even when the spectrum has two equal 3H singlets in the window', () => {
    const cases: [string, string][] = [['CC(C)(C)CC', 'C6H14'], ['CC(C)(C)O', 'C4H10O'], ['CC(C)CO', 'C4H10O'], ['C=C(C)C', 'C4H8'], ['CC(C)=O', 'C3H6O'], ['CC(C)=C(C)C', 'C6H12']];
    for (const [smi, formula] of cases) {
      const f = TWO_SINGLETS(smi, formula);
      set(true, true, true, false); const a = JSON.stringify(ledger(smi, f));
      set(true, true, true, true); expect(JSON.stringify(ledger(smi, f)), smi).toBe(a);
    }
  });
  it('the better reading is kept, never forced: when the split reading would score lower, the original ledger is returned (here a spectrum with two 3H singlets for a candidate whose other signals fit poorly in both readings is never lower than the original)', () => {
    for (const [smi, f] of [['CC(C)=CCO', PRENOL], ['CC(C)=CCOC(C)=O', PRENYL_AC], ['CC(C)=CCO', PRENYL_AC_6H], ['CC(C)=CCOC(C)=O', PRENOL]] as [string, V121Fixture][]) {
      set(true, true, true, false); const before = h1(ledger(smi, f));
      set(true, true, true, true); expect(h1(ledger(smi, f)), `${smi} / ${f.id}`).toBeGreaterThanOrEqual(before);
    }
  });
});

describe('prenol (sample M7, 3-methyl-2-buten-1-ol) through the whole pipeline: rank of the target', () => {
  const chain = {a: V12_CONFIG.useV123, b: V12_CONFIG.useV130, c: V12_CONFIG.useV131, d: V12_CONFIG.useV132};
  afterAll(() => { V12_CONFIG.useV123 = chain.a; V12_CONFIG.useV130 = chain.b; V12_CONFIG.useV131 = chain.c; V12_CONFIG.useV132 = chain.d; });
  it('flags as in the v1.3.2 baseline test (useV132 off). Rank of the target: v1.3.2 = 5; stop 5 (both groups on) = 7, (only alkene) = 11; with the =C(CH3)2 reading: both groups on = 1, only alkene = 1', async () => {
    V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; V12_CONFIG.useV132 = false;
    const rank = async (h1: boolean, a: boolean, o: boolean, en: boolean) => { set(h1, a, o, en); return measureV132({sample: 'M7', typed: false}, 10); };
    expect((await rank(false, true, true, true)).targetRank, 'v1.3.2 (useV140H1 off)').toBe(5);
    expect((await rank(true, true, true, false)).targetRank, 'stop 5, both groups').toBe(7);
    expect((await rank(true, true, false, false)).targetRank, 'stop 5, only alkene').toBe(11);
    const onlyAlkene = await rank(true, true, false, true), both = await rank(true, true, true, true);
    expect(onlyAlkene.targetRank, 'new reading, only alkene').toBe(1);
    expect(both.targetRank, 'new reading, both groups').toBe(1);
    expect(onlyAlkene.top[0].smiles).toBe('CC(C)=CCO');
  }, 240000);
});
