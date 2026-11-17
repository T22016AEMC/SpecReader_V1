import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {irCandidateBands} from '../../src/engines/scientificEngines/irBandKnowledge';
import {functionalGroupFeatures} from '../../src/engines/composition/functionalGroupBounds';
import {scoreComposition, type ScoringContext} from '../../src/engines/composition/compositionScoring';
import {extractNmrEvidence} from '../../src/engines/composition/nmrComposition';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import type {V121Fixture} from '../helpers/v121Golden';
import type {Feature} from '../../src/engines/composition/functionalGroupBounds';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.2 stop 4 (unit level; the full pipeline is in v132Stop4Acceptance): (1) one IR peak contributes element / DBE bounds through its best finding only; (2) multi-band readings: the aldehyde Fermi pair,
// the terminal-vinyl 910 / 990 pair, the nitro companion window. A missing band lowers the weight and never excludes. SYNTHETIC IR / 1H lists only (generic shapes, no measured spectrum).
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, v132: V12_CONFIG.useV132, best: V12_CONFIG.v132.bestFindingPerPeak, multi: V12_CONFIG.v132.multiBand};
const setFlag = (on: boolean) => { V12_CONFIG.useV132 = on; };
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; V12_CONFIG.v132.bestFindingPerPeak = true; V12_CONFIG.v132.multiBand = true; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.useV132 = was.v132; V12_CONFIG.v132.bestFindingPerPeak = was.best; V12_CONFIG.v132.multiBand = was.multi; });

const fx = (id: string, formula: string, targetSmiles: string, irPeaks: {x: number; y: number}[]): V121Fixture => ({
  id, description: 'synthetic', targetSmiles, formula, h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: [{x: 1.2, integration: 3, multiplicity: 's'}]}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: irPeaks},
});
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
const findingOf = (f: V121Fixture, band: string, x?: number) => bundleOf(f).irFindings.find(g => g.id.startsWith(`ir-range-${band}-`) && (x === undefined || Math.abs(g.observedPeak - x) < 3));
const irScore = (smiles: string, f: V121Fixture) => scoreScientificEvidence(smiles, bundleOf(f)).modalityScores.IR as number;
const without = (f: V121Fixture, ...xs: number[]) => ({...f, ir: {...f.ir, peaks: f.ir.peaks.filter(p => !xs.includes(p.x))}});

// benzaldehyde-shaped list: conjugated C=O 1700, Fermi pair 2820 / 2730, ring bands
const BENZALDEHYDE = fx('ALD', 'C7H6O', 'O=Cc1ccccc1', [{x: 3065, y: 85}, {x: 2820, y: 60}, {x: 2730, y: 62}, {x: 1700, y: 10}, {x: 1600, y: 55}, {x: 1585, y: 70}, {x: 1455, y: 65}, {x: 1310, y: 55}, {x: 1205, y: 45}, {x: 1170, y: 55}, {x: 745, y: 25}, {x: 690, y: 30}]);

describe('aldehyde: both Fermi bands (~2720 and ~2820) give the full reading', () => {
  it('flag on: with both bands the conjugated aldehyde C=O is Strong; with only 2820 or only 2730 it is not, and the confidence is lower (weight lowered, reading kept)', () => {
    setFlag(true);
    const both = findingOf(BENZALDEHYDE, 'aldehyde-conj', 1700)!, only2820 = findingOf(without(BENZALDEHYDE, 2730), 'aldehyde-conj', 1700)!, only2730 = findingOf(without(BENZALDEHYDE, 2820), 'aldehyde-conj', 1700)!;
    expect(both.matchLevel).toBe('Strong');
    // lower weight, never excluded: the reading is either still listed with a lower confidence, or (other C=O readings of the same peak now outrank it) it has left the peak's top five; it is never Strong
    for (const g of [only2820, only2730]) { expect(g?.matchLevel).not.toBe('Strong'); expect(g?.matchLevel).not.toBe('Absent / Excluded'); if (g) expect(g.confidence).toBeLessThan(both.confidence); }
    expect(findingOf(without(BENZALDEHYDE, 2730, 2820), 'ketone-conj', 1700)!.matchLevel).toBe('Strong');   // the carbonyl itself is still read (as a conjugated ketone / carbonyl)
  });
  it('flag off (v1.3.1): one band anywhere in 2690–2840 was enough', () => {
    setFlag(false);
    expect(findingOf(without(BENZALDEHYDE, 2730), 'aldehyde-conj', 1700)!.matchLevel).toBe('Strong');
  });
  it('the PMA-type samples (OCH3 C–H at 2830, no 2720): flag off reads the 1740 as an aldehyde "Strong"; flag on does not (the ester reading stays Strong)', () => {
    for (const id of ['M1', 'M1b', 'v132/M1y575']) {
      const f = loadV123(id);
      setFlag(false);
      expect(findingOf(f, 'aldehyde-co', 1740)!.matchLevel, `${id} off`).toBe('Strong');
      setFlag(true);
      expect(findingOf(f, 'aldehyde-co', 1740)?.matchLevel, `${id} on`).not.toBe('Strong');   // it falls out of the peak's top five readings
      expect(findingOf(f, 'aldehyde-fermi', 2830)?.matchLevel, `${id} fermi on`).not.toBe('Strong');
      expect(findingOf(f, 'ester-sat', 1740)!.matchLevel, `${id} ester on`).toBe('Strong');
    }
  });
});

describe('terminal vinyl: 910 and 990 together; the bands exist only for a candidate with CH2=CH–R', () => {
  const ALK1 = loadV123('v130/ALK1');
  it('flag on: both OOP bands are Strong findings; without 990 or without 910 the other one is not Strong and has lower confidence; flag off has no such findings', () => {
    setFlag(true);
    const a = findingOf(ALK1, 'vinyl-oop-990', 992)!, b = findingOf(ALK1, 'vinyl-oop-910', 910)!;
    expect(a.matchLevel).toBe('Strong'); expect(b.matchLevel).toBe('Strong');
    const noPartner = findingOf(without(ALK1, 910), 'vinyl-oop-990', 992)!;
    expect(noPartner.matchLevel).not.toBe('Strong'); expect(noPartner.confidence).toBeLessThan(a.confidence);
    setFlag(false);
    expect(findingOf(ALK1, 'vinyl-oop-990')).toBeUndefined();
  });
  it('candidates: a terminal vinyl on carbon (alkyl, aryl, diene) gets the bands; internal, cyclic, symmetric, vinyl ether / enamine, acrylate / vinyl ketone, aromatic do not; Mode B keeps the v1.3.1 bands', () => {
    setFlag(true);
    const has = (smi: string, scoring = true) => irCandidateBands(smi, scoring).some(k => k.id.startsWith('vinyl-oop'));
    for (const smi of ['C=CCCCCCC', 'C=Cc1ccccc1', 'C=CC=C', 'C=CC(C)(C)C']) expect(has(smi), smi).toBe(true);
    for (const smi of ['CCC=CC(C)(C)C', 'C1=CCCCC1', 'CC=CC', 'CCC=CCC', 'C=COCC', 'C=CN(C)C', 'C=CC(=O)OC', 'C=CC(C)=O', 'C=C(C)C', 'c1ccccc1', 'CC=CC(C)=O']) expect(has(smi), smi).toBe(false);
    expect(has('C=CCCCCCC', false)).toBe(false);
    setFlag(false);
    expect(has('C=CCCCCCC')).toBe(false);
  });
  it('1-octene sample: the terminal-vinyl candidate now explains 992 and 910 (compatibility > 0.5 each), an internal alkene still explains neither (flag off: both 0 for everybody)', () => {
    const compat = (smi: string, x: number) => scoreScientificEvidence(smi, bundleOf(ALK1)).entries.find(e => e.sourceModality === 'IR' && Math.abs(Number(e.evidenceId.split(':').pop()) - x) < 1)!.compatibility!;
    setFlag(true);
    expect(compat('C=CCCCCCC', 992)).toBeGreaterThan(0.5); expect(compat('C=CCCCCCC', 910)).toBeGreaterThan(0.5);
    expect(compat('CCC=CC(C)(C)C', 992)).toBeLessThan(0.01); expect(compat('CCC=CC(C)(C)C', 910)).toBeLessThan(0.01);
    setFlag(false);
    expect(compat('C=CCCCCCC', 992)).toBeLessThan(0.01); expect(compat('C=CCCCCCC', 910)).toBeLessThan(0.01);
  });
  it('with only one of the two bands in the spectrum the terminal-vinyl candidate keeps a credit, but lower (the companion weight), and is not excluded', () => {
    setFlag(true);
    const compatOf = (f: V121Fixture, x: number) => scoreScientificEvidence('C=CCCCCCC', bundleOf(f)).entries.find(e => e.sourceModality === 'IR' && Math.abs(Number(e.evidenceId.split(':').pop()) - x) < 1)!.compatibility!;
    const full = compatOf(ALK1, 992), partial = compatOf(without(ALK1, 910), 992);
    expect(partial).toBeGreaterThan(0.3); expect(partial).toBeLessThan(full);
  });
});

describe('no false penalty: bands that lack 910 / 990 on purpose, and the controls of the stop-3 list', () => {
  // The IR score of a candidate must be identical with the switch on and off when the candidate has no terminal vinyl / aldehyde / nitro: nothing is asked of 910 / 990 / 2720 there.
  const cases: [string, V121Fixture, string][] = [
    ['symmetric trans-disubstituted alkene (965 only)', fx('T3H', 'C6H12', 'CCC=CCC', [{x: 3020, y: 80}, {x: 2960, y: 15}, {x: 2930, y: 20}, {x: 2870, y: 35}, {x: 1670, y: 85}, {x: 1460, y: 40}, {x: 1380, y: 60}, {x: 965, y: 30}]), 'CCC=CCC'],
    ['cyclohexene (cis ring, ~720 / 1650)', loadV123('v132/CYHEX_A'), 'C1=CCCCC1'],
    ['vinyl ether (1620, 960, 810; no 910 / 990)', fx('VE', 'C4H8O', 'C=COCC', [{x: 3115, y: 75}, {x: 2980, y: 40}, {x: 1620, y: 45}, {x: 1320, y: 50}, {x: 1200, y: 10}, {x: 1085, y: 25}, {x: 960, y: 45}, {x: 815, y: 55}]), 'C=COCC'],
    ['conjugated enone (internal C=C 1625, C=O 1685)', fx('EN', 'C5H8O', 'CC=CC(C)=O', [{x: 3030, y: 80}, {x: 2960, y: 60}, {x: 1685, y: 12}, {x: 1625, y: 45}, {x: 1360, y: 40}, {x: 1255, y: 30}, {x: 975, y: 35}]), 'CC=CC(C)=O'],
    ['1,1-disubstituted alkene (890 only)', fx('IB', 'C4H8', 'C=C(C)C', [{x: 3080, y: 80}, {x: 2970, y: 20}, {x: 1655, y: 60}, {x: 1450, y: 45}, {x: 1375, y: 55}, {x: 890, y: 15}]), 'C=C(C)C'],
    ['p-xylene with weak overtone marks and a 1640 water bend', loadV123('v132/XYL_mod'), 'Cc1ccc(C)cc1'],
    ['aromatic C=C ring bands (1600 / 1495)', loadV123('v132/XYL_weak'), 'Cc1ccc(C)cc1'],
  ];
  for (const [name, f, smi] of cases) {
    it(`${name}: IR score of its own structure is the same with the switch on and off`, () => {
      setFlag(false); const off = irScore(smi, f);
      setFlag(true); const on = irScore(smi, f);
      expect(on).toBeCloseTo(off, 9);
    });
  }
  it('none of them gets a terminal-vinyl, aldehyde or Strong nitro reading from the new rules (flag on)', () => {
    setFlag(true);
    for (const [name, f] of cases) {
      const g = bundleOf(f).irFindings;
      expect(g.filter(x => x.id.startsWith('ir-range-vinyl-oop') && x.matchLevel === 'Strong'), name).toHaveLength(0);
      expect(g.filter(x => /^ir-range-aldehyde/.test(x.id) && x.matchLevel === 'Strong'), name).toHaveLength(0);
    }
  });
});

describe('nitro: the CH3 bend (~1375) is not the second nitro band', () => {
  const nitroOf = (f: V121Fixture, x: number) => findingOf(f, 'nitro', x);
  it('ring band 1516 + CH3 1365 (p-cresol type): Strong with the flag off, not Strong with it on; a real nitro pair (1518 + 1357) stays Strong', () => {
    const cr1 = loadV123('v130/CR1'), nitrox = loadV123('v130/NITROX');
    setFlag(false); expect(nitroOf(cr1, 1516)!.matchLevel).toBe('Strong');
    setFlag(true); expect(nitroOf(cr1, 1516)!.matchLevel).not.toBe('Strong');
    setFlag(true); expect(nitroOf(nitrox, 1518)!.matchLevel).toBe('Strong');
    setFlag(false); expect(nitroOf(nitrox, 1518)!.matchLevel).toBe('Strong');
  });
  it('a nitro-shaped list (1530 + 1350, strong) keeps its Strong nitro reading and the O / N bounds', () => {
    setFlag(true);
    const f = fx('NO2', 'C6H5NO2', '[O-][N+](=O)c1ccccc1', [{x: 3080, y: 85}, {x: 1610, y: 70}, {x: 1530, y: 8}, {x: 1480, y: 55}, {x: 1350, y: 10}, {x: 855, y: 35}, {x: 790, y: 45}, {x: 710, y: 20}]);
    expect(nitroOf(f, 1530)!.matchLevel).toBe('Strong');
  });
});

describe('one IR peak, one set of bounds (functionalGroupFeatures)', () => {
  const featuresOf = (f: V121Fixture) => {
    const b = bundleOf(f), plan = createReasoningPlan(b);
    return functionalGroupFeatures(plan.observations, b.irFindings, extractNmrEvidence(plan.observations, {} as never), plan.nitrogenEvidence?.allowed ?? false);
  };
  it('1-octene without a C=C band: the C–H band no longer supports "carbonyl / acid O–H"; the functional-group LIST (irFindings) is unchanged', () => {
    const f = loadV123('v130/ALK0');
    setFlag(false); const off = featuresOf(f); const listOff = bundleOf(f).irFindings.map(g => g.id).sort();
    setFlag(true); const on = featuresOf(f); const listOn = bundleOf(f).irFindings.map(g => g.id).filter(id => !id.startsWith('ir-range-vinyl-oop')).sort();
    expect(off.map(x => x.key)).toEqual(expect.arrayContaining(['CARBONYL', 'OXYGEN_SINGLE']));
    expect(on.map(x => x.key)).not.toContain('CARBONYL'); expect(on.map(x => x.key)).not.toContain('OXYGEN_SINGLE'); expect(on.map(x => x.key)).not.toContain('ESTER_ACID');
    expect(listOn).toEqual(listOff.filter(id => listOn.includes(id)));
  });
  it('an ester band keeps the ester bound (O ≥ 2): equal-confidence findings of the same peak all count', () => {
    const f = loadV123('M1');
    setFlag(true);
    const on = featuresOf(f);
    expect(on.map(x => x.key)).toEqual(expect.arrayContaining(['CARBONYL', 'ESTER_ACID']));
    expect(on.find(x => x.key === 'ESTER_ACID')!.mins.O).toBe(2);
  });
  it('flag off: identical to v1.3.1 (every finding adds its bound)', () => {
    const f = loadV123('v130/AMD1');
    setFlag(false);
    expect(featuresOf(f).map(x => x.key)).toEqual(expect.arrayContaining(['AMIDE', 'AMINE', 'ALKYNE', 'NITRO']));
  });
});

describe('a soft AMIDE bound from a carbonyl band is not N evidence', () => {
  const soft = (key: Feature['key'], mins: Feature['mins'], hard: boolean): Feature => ({key, label: key, mins, dbeMin: 1, modalities: ['IR'], observationIds: ['IR:t:1665'], hard});
  const ctx = (features: Feature[]): ScoringContext => ({nmr: extractNmrEvidence([], {} as never), features, elementEvidence: [], isotopes: {}, hardBoundsRelaxed: false, nitrogenMode: 'NONE'});
  const noEvidenceLine = (features: Feature[]) => scoreComposition({C: 8, H: 9, N: 1, O: 1}, 135.068, null, ctx(features), true).unknown.some(r => r.text.includes('沒有官能基證據指向 N'));
  it('flag on: a single-modality AMIDE does not lift the deduction; a hard AMIDE or a NITRILE does; flag off lifts it for any N-feature (v1.3.1)', () => {
    setFlag(true);
    expect(noEvidenceLine([soft('AMIDE', {O: 1, N: 1}, false)])).toBe(true);
    expect(noEvidenceLine([soft('AMIDE', {O: 1, N: 1}, true)])).toBe(false);
    expect(noEvidenceLine([soft('NITRILE', {N: 1}, false)])).toBe(false);
    setFlag(false);
    expect(noEvidenceLine([soft('AMIDE', {O: 1, N: 1}, false)])).toBe(false);
  });
});
