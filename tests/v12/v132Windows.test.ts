import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {COMPOSITION_CONFIG} from '../../src/engines/composition/compositionConfig';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {oxygenEvidenceFloor} from '../../src/engines/composition/functionalGroupBounds';
import {assessNitrogenEvidence} from '../../src/engines/composition/nitrogenEvidence';
import {requiredFromEvidence} from '../../src/engines/constraints/requiredSubstructures';
import {scoreScientificEvidence, sourceSpectra} from '../../src/engines/scientificEngines/evidenceLedger';
import {IR_BAND_KNOWLEDGE, irBandMatch} from '../../src/engines/scientificEngines/irBandKnowledge';
import {canonNoStereo, fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {V132_CASES} from '../helpers/v132Samples';
import type {V121Fixture} from '../helpers/v121Golden';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import type {SpectralPeak} from '../../src/types/spectrum';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.2 stop 6 (sub-switch v132.windows): (1) the nitro window correction (Coates Table 11: aliphatic nitro 1560–1540 / 1380–1350), (2) the few widened window edges (C–O up to 1310, C=O up to 1810), and what was tried
// and NOT adopted (broad O–H 3190–3610, nitrile 2280, C–O down to 990), (3) trapezoid companion windows in the score. SYNTHETIC lists only (generic shapes, no measured spectrum).
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, v132: V12_CONFIG.useV132, best: V12_CONFIG.v132.bestFindingPerPeak, multi: V12_CONFIG.v132.multiBand, win: V12_CONFIG.v132.windows};
const setWin = (on: boolean) => { V12_CONFIG.useV132 = true; V12_CONFIG.v132.windows = on; };
beforeAll(async () => { await initializeRDKit(); V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; V12_CONFIG.v132.bestFindingPerPeak = true; V12_CONFIG.v132.multiBand = true; }, 60000);
afterAll(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.useV132 = was.v132; V12_CONFIG.v132.bestFindingPerPeak = was.best; V12_CONFIG.v132.multiBand = was.multi; V12_CONFIG.v132.windows = was.win; });

const ob = (x: number, rel: number, shape: 'BROAD' | 'NARROW' = 'NARROW'): ObservedEvidence => ({id: `IR:t:${x}`, modality: 'IR', signalId: `s${x}`, sourceId: 't', value: x, unit: 'cm-1', relativeIntensity: rel, relativeIntegral: null, multiplicity: null, jHz: [], shape, uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {}, coverage: 'CONFIRMED_COMPLETE', unknown: []});
const CH = ob(2970, 100);
const floor = (o: ObservedEvidence[]) => oxygenEvidenceFloor(o, false)!.floor;
const nmode = (o: ObservedEvidence[]) => assessNitrogenEvidence({observations: o, spectra: {}, userFormula: null}).mode;
const fx = (id: string, formula: string, targetSmiles: string, irPeaks: {x: number; y: number; isBroad?: boolean}[]): V121Fixture => ({
  id, description: 'synthetic control', targetSmiles, formula, h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: [{x: 1.2, integration: 3, multiplicity: 's'}]}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: irPeaks},
});
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
const planOf = (f: V121Fixture) => { const b = bundleOf(f); return {b, plan: createReasoningPlan(b)}; };
const nOf = (f: V121Fixture) => { const {b, plan} = planOf(f); return assessNitrogenEvidence({observations: plan.observations, spectra: sourceSpectra(b) as never, userFormula: null}).mode; };
const findingOf = (f: V121Fixture, band: string, x?: number) => bundleOf(f).irFindings.find(g => g.id.startsWith(`ir-range-${band}-`) && (x === undefined || Math.abs(g.observedPeak - x) < 3));

// 1-nitropropane-shaped list: aliphatic nitro asymmetric 1553 / symmetric 1378 (Coates: 1560–1540 / 1380–1350), alkyl C–H and a methyl bend that is the same 1378 band
const ALIPHATIC_NITRO = fx('NO2ALI', 'C3H7NO2', 'CCC[N+](=O)[O-]', [{x: 2970, y: 35}, {x: 2880, y: 60}, {x: 1553, y: 8}, {x: 1465, y: 55}, {x: 1378, y: 18}, {x: 1085, y: 70}, {x: 870, y: 75}]);
// alkyl ester: methyl bend 1375, strong C=O and C–O, no band near 1550
const ALKYL_ESTER = fx('ESTER', 'C4H8O2', 'CC(=O)OCC', [{x: 2985, y: 40}, {x: 1745, y: 8}, {x: 1470, y: 70}, {x: 1375, y: 35}, {x: 1240, y: 12}, {x: 1050, y: 25}]);
// ring band 1516 with a methyl bend 1375 (p-cresol type, the stop-4 case) and a lone 1375
const RING_CH3 = fx('RING', 'C7H8O', 'Cc1ccc(O)cc1', [{x: 3030, y: 80}, {x: 2925, y: 55}, {x: 1610, y: 55}, {x: 1516, y: 15}, {x: 1375, y: 40}, {x: 1236, y: 20}, {x: 815, y: 25}]);
const LONE_1375 = fx('L1375', 'C8H18', 'CCCCCCCC', [{x: 2960, y: 10}, {x: 2925, y: 8}, {x: 1465, y: 50}, {x: 1378, y: 20}, {x: 725, y: 80}]);
const AROMATIC_NITRO = fx('NO2ARO', 'C6H5NO2', '[O-][N+](=O)c1ccccc1', [{x: 3080, y: 85}, {x: 1610, y: 70}, {x: 1530, y: 8}, {x: 1480, y: 55}, {x: 1350, y: 10}, {x: 855, y: 35}, {x: 710, y: 20}]);

describe('1 nitro: aliphatic symmetric band up to 1380, but only with an asymmetric band at or above 1535', () => {
  it('nitrogen evidence: aliphatic nitro (1553 + 1378) is N evidence with the switch on, not with it off (stop 4: 1290–1360) nor with useV132 off (v1.3.1)', () => {
    const o = [CH, ob(1553, 80), ob(1378, 70)];
    setWin(true); expect(nmode(o)).toBe('EVIDENCE');
    setWin(false); expect(nmode(o)).toBe('NONE');
    V12_CONFIG.useV132 = false; expect(nmode(o)).toBe('NONE');
  });
  it('a lone 1375 (no asymmetric band) is no nitro evidence; a ring band 1516 with a methyl bend 1375 is none either; an alkyl ester with a methyl bend is none', () => {
    setWin(true);
    expect(nmode([CH, ob(1378, 80)])).toBe('NONE');
    expect(nmode([CH, ob(1516, 80), ob(1375, 70)])).toBe('NONE');
    expect(nmode([CH, ob(1745, 90), ob(1375, 60), ob(1240, 80)])).toBe('NONE');
    expect(nOf(RING_CH3)).toBe('NONE'); expect(nOf(LONE_1375)).toBe('NONE'); expect(nOf(ALKYL_ESTER)).toBe('NONE');
  });
  it('the aromatic regime is unchanged: 1530 + 1350 is N evidence on and off, and a symmetric band above 1360 does not pair with an aromatic-range asymmetric band (1516 + 1375)', () => {
    for (const on of [true, false]) { setWin(on); expect(nmode([CH, ob(1530, 80), ob(1350, 80)]), `${on}`).toBe('EVIDENCE'); expect(nmode([CH, ob(1516, 80), ob(1375, 80)]), `${on}`).toBe('NONE'); }
    setWin(true); expect(nOf(AROMATIC_NITRO)).toBe('EVIDENCE');
  });
  it('sweep of the symmetric band 1340–1390 with an aliphatic asymmetric band 1550 and with an aromatic-range one 1530 (1500–1520 would meet the old alkyl-aromatic look-alike rule): aliphatic regime up to 1380, aromatic regime up to 1360', () => {
    setWin(true);
    const ali = [1340, 1350, 1360, 1370, 1380, 1382, 1390].map(x => `${x}:${nmode([CH, ob(1550, 80), ob(x, 80)])}`);
    expect(ali).toEqual(['1340:EVIDENCE', '1350:EVIDENCE', '1360:EVIDENCE', '1370:EVIDENCE', '1380:EVIDENCE', '1382:NONE', '1390:NONE']);
    const aro = [1340, 1350, 1360, 1362, 1370, 1380].map(x => `${x}:${nmode([CH, ob(1530, 80), ob(x, 80)])}`);
    expect(aro).toEqual(['1340:EVIDENCE', '1350:EVIDENCE', '1360:EVIDENCE', '1362:NONE', '1370:NONE', '1380:NONE']);
  });
  it('band table: the aliphatic nitro keeps its companion (Strong, 1/1) when the symmetric band is at 1378; stop 4 (switch off) lost it; the methyl bend of the ring / ester samples never makes a Strong nitro; the lone 1375 gives no nitro-symmetric reading', () => {
    setWin(true);
    expect(findingOf(ALIPHATIC_NITRO, 'nitro', 1553)!.matchLevel).toBe('Strong');
    expect(findingOf(ALIPHATIC_NITRO, 'nitro-symmetric', 1378)).toBeDefined();
    setWin(false);
    expect(findingOf(ALIPHATIC_NITRO, 'nitro', 1553)!.matchLevel).not.toBe('Strong');
    setWin(true);
    for (const f of [RING_CH3, ALKYL_ESTER, LONE_1375]) {
      expect(findingOf(f, 'nitro')?.matchLevel, f.id).not.toBe('Strong');
      expect(findingOf(f, 'nitro-symmetric', 1375) ?? findingOf(f, 'nitro-symmetric', 1378), f.id).toBeUndefined();
    }
  });
  it('the candidate score: a nitro candidate gets credit for the 1378 band with an asymmetric band, none without (no companion credit for a lone methyl bend)', () => {
    const compat = (f: V121Fixture, smi: string, x: number) => scoreScientificEvidence(smi, bundleOf(f)).entries.find(e => e.sourceModality === 'IR' && Math.abs(Number(e.evidenceId.split(':').pop()) - x) < 1)?.compatibility;
    setWin(true);
    expect(compat(ALIPHATIC_NITRO, 'CCC[N+](=O)[O-]', 1378)!).toBeGreaterThan(0.5);
    const without = fx('NO2X', 'C3H7NO2', 'CCC[N+](=O)[O-]', ALIPHATIC_NITRO.ir.peaks.filter(p => p.x !== 1553));
    expect(compat(without, 'CCC[N+](=O)[O-]', 1378)!).toBeLessThan(0.3);
  });
  it('the 43 samples (many with a methyl bend ~1375 and no nitro) keep their nitrogen mode', () => {
    setWin(true); const on = V132_CASES.map(c => nOf(loadV123(c.sample)));
    setWin(false); const off = V132_CASES.map(c => nOf(loadV123(c.sample)));
    expect(on).toEqual(off);                                      // no sample of the sets changes its nitrogen mode
  });
});

describe('2 window edges that were widened (C–O up to 1310, C=O up to 1810) and the ones that were not', () => {
  it('C–O upper edge 1310: a strong 1305 band counts with the switch on (floor 2 with a strong C=O), not off; 1311 and above do not', () => {
    const f = (x: number) => floor([CH, ob(1740, 60), ob(x, 80)]);
    setWin(true); expect([1296, 1300, 1304, 1308, 1310, 1311, 1314].map(f)).toEqual([2, 2, 2, 2, 2, 1, 1]);
    setWin(false); expect([1296, 1300, 1304, 1308, 1310, 1311, 1314].map(f)).toEqual([2, 2, 1, 1, 1, 1, 1]);
  });
  it('C–O lower edge stays 1000 (990 would turn the strong terminal-vinyl OOP band 995–985 into a "strong C–O")', () => {
    setWin(true);
    expect([990, 994, 998, 1000, 1004].map(x => floor([CH, ob(1740, 60), ob(x, 80)]))).toEqual([1, 1, 1, 2, 2]);
    const octene = fx('OCT', 'C8H16', 'C=CCCCCCC', [{x: 3077, y: 80}, {x: 2960, y: 30}, {x: 2925, y: 20}, {x: 2855, y: 30}, {x: 1641, y: 65}, {x: 1465, y: 45}, {x: 992, y: 35}, {x: 910, y: 22}, {x: 725, y: 75}]);
    expect(oxygenEvidenceFloor(planOf(octene).plan.observations, false)!.floor).toBe(0);
  });
  it('C=O upper edge 1810: a strong 1805 counts as C=O (floor 2 with a C–O, required STRONG_CARBONYL; relaxed 0.30 too), 1811 does not; switch off = 1800', () => {
    const f = (x: number, rel = 60) => floor([CH, ob(x, rel), ob(1240, 80)]);
    const req = (x: number) => requiredFromEvidence([CH, ob(x, 60)]).some(r => r.id === 'STRONG_CARBONYL');
    setWin(true); expect([1798, 1800, 1805, 1810, 1811].map(x => f(x))).toEqual([2, 2, 2, 2, 1]); expect([1800, 1805, 1810, 1811].map(req)).toEqual([true, true, true, false]);
    expect([1805, 1810, 1811].map(x => f(x, 40))).toEqual([2, 2, 1]);                                       // the 0.30 zone reaches 1810 too
    setWin(false); expect([1798, 1800, 1805, 1810].map(x => f(x))).toEqual([2, 2, 1, 1]); expect([1800, 1805].map(req)).toEqual([true, false]);
  });
  it('1700 and below are not touched: 0.30 does not extend under 1700 (a 0.4 band at 1695 / 1660 / 1641 is not a strong C=O), the lower edge 1650 stays', () => {
    setWin(true);
    expect([1698, 1695, 1660, 1651, 1649].map(x => floor([CH, ob(x, 40), ob(1240, 80)]))).toEqual([1, 1, 1, 1, 1]);
    expect([1698, 1660, 1651, 1649].map(x => floor([CH, ob(x, 60), ob(1240, 80)]))).toEqual([2, 2, 2, 1]);
  });
  it('tried and NOT adopted: broad O–H stays 3200–3600 (an amine hydrochloride band at 3195 / 3606 gives no O), the nitrile edge stays 2260 (a weak 2272 band gives no N)', () => {
    setWin(true);
    expect(COMPOSITION_CONFIG.irBroadXHRange).toEqual([3200, 3600]); expect(COMPOSITION_CONFIG.irNitrileRange).toEqual([2210, 2260]);
    expect([3195, 3198, 3606].map(x => floor([CH, ob(x, 60, 'BROAD')]))).toEqual([0, 0, 0]);
    expect([3200, 3600].map(x => floor([CH, ob(x, 60, 'BROAD')]))).toEqual([1, 1]);
    expect(nmode([CH, ob(2272, 50)])).toBe('NONE'); expect(nmode([CH, ob(2260, 50)])).toBe('EVIDENCE');
    expect(requiredFromEvidence([CH, ob(2272, 50)]).some(r => r.id === 'NITRILE')).toBe(false);
  });
  it('all 43 samples: oxygen floor, nitrogen mode and required fragments are identical with the switch on and off (observation level)', () => {
    const snap = () => V132_CASES.map(c => { const {b, plan} = planOf(loadV123(c.sample)); const o = oxygenEvidenceFloor(plan.observations, false);
      return `${c.sample}${c.typed ? ':typed' : ''} O${o ? o.floor : '-'} N:${assessNitrogenEvidence({observations: plan.observations, spectra: sourceSpectra(b) as never, userFormula: null}).mode} req:${requiredFromEvidence(plan.observations).map(r => r.id).join('+')}`; });
    setWin(true); const on = snap();
    setWin(false); const off = snap();
    expect(on).toEqual(off);
  });
});

describe('3 trapezoid companion windows in the score (slope 10 cm-1); exclusion windows and the Strong reading stay hard', () => {
  const band = (id: string) => IR_BAND_KNOWLEDGE.find(k => k.id === id)!;
  const pk = (id: string, x: number): SpectralPeak => ({id, x, y: 80, intensityKnown: true} as unknown as SpectralPeak);
  const esterWith = (companionX: number | null) => irBandMatch(band('ester-sat'), pk('p', 1745), [pk('p', 1745), ...(companionX === null ? [] : [pk('c', companionX)])]);
  it('ester C=O with its C–O companion (window 1000–1300): full inside, partial in the 10 cm-1 slope outside, as without a companion beyond it; the switch off is a step', () => {
    setWin(true);
    const inside = esterWith(1240), edge = esterWith(1300), at5 = esterWith(1305), at9 = esterWith(1309), beyond = esterWith(1312), none = esterWith(null);
    expect(inside).toBeCloseTo(edge, 12);
    expect(at5).toBeLessThan(edge); expect(at5).toBeGreaterThan(beyond);
    expect(at9).toBeLessThan(at5); expect(at9).toBeGreaterThan(beyond);
    expect(beyond).toBeCloseTo(none, 12);
    // half membership at 5 cm-1 -> factor 0.65 + 0.35 * 0.5 against 1.0 inside and 0.65 without
    expect(at5 / edge).toBeCloseTo((0.65 + 0.35 * 0.5), 6);
    setWin(false);
    expect(esterWith(1305)).toBeCloseTo(esterWith(null), 12); expect(esterWith(1300)).toBeCloseTo(esterWith(1240), 12);
  });
  it('the Strong reading keeps the hard windows (a companion in the slope does not make a finding Strong)', () => {
    const f = fx('ALDX', 'C7H6O', 'O=Cc1ccccc1', [{x: 3065, y: 85}, {x: 2822, y: 60}, {x: 2765, y: 62}, {x: 1700, y: 10}, {x: 1600, y: 55}, {x: 1455, y: 65}, {x: 745, y: 25}]);   // 2765 is in the slope of the 2695–2760 window
    setWin(true); expect(findingOf(f, 'aldehyde-conj', 1700)?.matchLevel).not.toBe('Strong');
  });
  it('the 43 samples: the IR score of the target structure changes for M7 only (raised), all the other targets are unchanged', () => {
    const irScores = () => V132_CASES.filter(c => !c.typed).map(c => { const f = loadV123(c.sample); return [c.sample, scoreScientificEvidence(canonNoStereo(f.targetSmiles), bundleOf(f)).modalityScores.IR as number] as const; });
    setWin(true); const on = irScores();
    setWin(false); const off = irScores();
    const changed = on.filter(([k, v], i) => Math.abs(v - off[i][1]) > 1e-9).map(([k, v], i) => k);
    expect(changed).toEqual(['M7']);
    const m7on = on.find(x => x[0] === 'M7')![1], m7off = off.find(x => x[0] === 'M7')![1];
    expect(m7on).toBeGreaterThan(m7off); expect(m7on - m7off).toBeLessThan(2);
  });
});
