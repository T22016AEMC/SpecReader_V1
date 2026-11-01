import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import type {StructureGenerator} from '../../src/engines/composition/structureGenerator';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {buildAtomInventory} from '../../src/engines/constraints/atomInventory';
import {allowedHPerAtom, classifySignal, type H1Signal, type IrAldehydeContext} from '../../src/engines/constraints/shiftClasses';
import {irAldehydeContext} from '../../src/engines/constraints/v12Evidence';

// v1.2.1 B3: the =CH2 / =CH shift windows of VINYL_CH (no-formula path only) and the "conjugated C=O" IR context that relaxes them.
// All inputs are synthetic and generic; the tests check program behaviour, not chemistry.
beforeAll(() => initializeRDKit(), 60000);
const planning = V12_CONFIG.planning;
const saved = {...planning};
afterEach(() => { Object.assign(planning, saved); V12_CONFIG.useV121Planning = true; });

const signal = (shiftPpm: number, relativeIntegral = 2, multiplicity: string | null = 's'): H1Signal => ({observationId: `s${shiftPpm}`, shiftPpm, relativeIntegral, multiplicity, broad: false, optional: false});
const ctxIr = (conjugatedCarbonyl: boolean | null): IrAldehydeContext => ({present: true, coversAldehydeRegion: true, strongCarbonyl: null, conjugatedCarbonyl});
const classify = (shift: number, conj: boolean | null, windows = true) => classifySignal(signal(shift), {solvent: 'CDCl3', formulaElements: new Set(['C', 'O']), nitrogenAllowed: false, ir: ctxIr(conj), vinylWindows: windows});
const vinylOf = (shift: number, conj: boolean | null, windows = true) => classify(shift, conj, windows).matches.find(m => m.classId === 'VINYL_CH');

describe('B3 windows of VINYL_CH', () => {
  it('only the VINYL_CH class has hPerAtomWindows; the other seven shift classes are unchanged', () => {
    const withWindows = V12_CONFIG.shiftClasses.filter(c => c.hPerAtomWindows);
    expect(withWindows.map(c => c.id)).toEqual(['VINYL_CH']);
    expect(V12_CONFIG.shiftClasses.map(c => [c.id, c.rangePpm, c.hPerAtom])).toEqual([
      ['ARO_CH', [6.3, 8.5], [1]], ['VINYL_CH', [4.5, 7.5], [1, 2]], ['ALDEHYDE', [9.0, 10.5], [1]], ['O_CH', [3.2, 5.0], [1, 2, 3]],
      ['N_CH', [2.2, 3.8], [1, 2, 3]], ['ALPHA_CH', [1.9, 3.2], [1, 2, 3]], ['ALKYL_CH', [0.5, 2.2], [1, 2, 3]], ['EXCHANGEABLE', [0.5, 13], [1]],
    ]);
    expect(V12_CONFIG.shiftClasses.find(c => c.id === 'VINYL_CH')!.hPerAtomWindows).toEqual([{h: 2, base: [4.5, 6.0], extended: [6.0, 6.5]}, {h: 1, base: [4.5, 7.5], extended: [7.5, 7.8]}]);
  });
  const rows: [string, number, boolean | null, number[] | undefined][] = [
    ['=CH2 and =CH in the base window', 5.0, null, [1, 2]],
    ['6.2 ppm without a conjugated C=O: only =CH', 6.2, null, [1]],
    ['6.2 ppm with the IR "false": only =CH', 6.2, false, [1]],
    ['6.2 ppm with a conjugated C=O: =CH2 allowed too', 6.2, true, [1, 2]],
    ['6.8 ppm: =CH only, with or without the C=O', 6.8, true, [1]],
    ['6.8 ppm: =CH only (null)', 6.8, null, [1]],
    ['7.6 ppm without the C=O: no vinyl reading at all', 7.6, null, undefined],
    ['7.6 ppm with the IR "false": no vinyl reading', 7.6, false, undefined],
    ['7.6 ppm with a conjugated C=O: =CH allowed', 7.6, true, [1]],
    ['7.9 ppm: never', 7.9, true, undefined],
  ];
  for (const [name, shift, conj, expected] of rows) it(name, () => { expect(vinylOf(shift, conj)?.hPerAtom).toEqual(expected); });
  it('only === true relaxes: false and null behave the same', () => {
    for (const shift of [6.2, 7.6]) expect(vinylOf(shift, false)?.hPerAtom).toEqual(vinylOf(shift, null)?.hPerAtom);
    expect(vinylOf(6.2, true)?.relaxed).toBe(true);
    expect(vinylOf(6.2, null)?.relaxed).toBeUndefined();
  });
  it('windows off (a user formula, the sub-switch, the flag): the v1.2.0 class range and H counts, no restriction', () => {
    expect(vinylOf(7.4, null, false)?.hPerAtom).toBeUndefined();
    expect(vinylOf(7.4, null, false)).toBeDefined();
    expect(vinylOf(7.6, true, false)).toBeUndefined();   // outside the v1.2.0 range 4.5–7.5
    expect(allowedHPerAtom(V12_CONFIG.shiftClasses.find(c => c.id === 'ARO_CH')!, 7.0, ctxIr(true)).h).toEqual([]);   // a class without windows has none
  });
});

describe('B3 guard: no "2 H per atom, only VINYL_CH" reading for a signal at 6.5–8.5 ppm', () => {
  // Signals of 4 H at the tested shift and a 6 H alkyl signal; formula C10H10, so k = 1. The aromatic 4H reading is the one that must remain.
  const shifts = Array.from({length: 41}, (_, i) => Math.round((6.5 + i * 0.05) * 100) / 100).filter(s => s > 6.5);
  const inventoryAt = (shift: number, conj: boolean | null, windows: boolean) => buildAtomInventory({
    signals: [signal(shift, 4), signal(1.3, 6)], formula: {C: 10, H: 10}, solvent: 'CDCl3', coverageComplete: true, ir: ctxIr(conj), vinylWindows: windows,
  });
  const bad = (inv: ReturnType<typeof buildAtomInventory>) => inv.alternatives.flatMap(a => a.groups.filter(g => g.hPerAtom === 2 && g.shiftClasses.every(c => c === 'VINYL_CH')));
  for (const conj of [null, false, true] as const) {
    it(`conjugated C=O = ${conj}: none for ${shifts[0]}–${shifts[shifts.length - 1]} ppm`, () => {
      for (const shift of shifts) {
        const inv = inventoryAt(shift, conj, true);
        expect(inv.alternatives.length, `${shift} ppm keeps its aromatic reading`).toBeGreaterThan(0);
        expect(bad(inv), `${shift} ppm`).toEqual([]);
      }
    });
  }
  it('the guard has teeth: with the windows off (v1.2.0) the same signal does get such a reading', () => {
    expect(bad(inventoryAt(7.0, null, false)).length).toBeGreaterThan(0);
  });
  it('exactly 6.5 ppm is the closed end of the extended =CH2 window: allowed only with a conjugated C=O', () => {
    expect(bad(inventoryAt(6.5, true, true)).length).toBeGreaterThan(0);
    expect(bad(inventoryAt(6.5, null, true))).toEqual([]);
  });
});

// ---- the conjugated C=O context -------------------------------------------------------------------------------------------------------------------
let n = 0;
const irObs = (value: number, relativeIntensity: number | null): ObservedEvidence => ({
  id: `IR:t:${value}`, signalId: `i${n++}`, sourceId: 't', modality: 'IR', value, unit: 'cm-1', relativeIntensity, relativeIntegral: null, multiplicity: null, jHz: [], shape: 'UNKNOWN',
  uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {}, coverage: 'PARTIAL', unknown: [],
});
describe('B3 conjugated C=O context (irAldehydeContext)', () => {
  const strong = [irObs(1717, 100), irObs(1270, 80), irObs(2980, 30)];
  const weak = [irObs(1717, 30), irObs(1270, 100), irObs(2980, 40)];
  it('image IR, trusted calibration, strong band at 1630–1735 → true', () => {
    expect(irAldehydeContext(strong, false, {isImage: true, calibrationTrusted: true}).conjugatedCarbonyl).toBe(true);
    expect(irAldehydeContext([irObs(1632, 100)], false, {isImage: true, calibrationTrusted: true}).conjugatedCarbonyl).toBe(true);
  });
  it('image IR, trusted, intensities known, no band ≥ 50 % of the strongest in the window → false', () => {
    expect(irAldehydeContext(weak, false, {isImage: true, calibrationTrusted: true}).conjugatedCarbonyl).toBe(false);
    expect(irAldehydeContext([irObs(1750, 100), irObs(1270, 90)], false, {isImage: true, calibrationTrusted: true}).conjugatedCarbonyl).toBe(false);   // 1750 is outside 1630–1735
  });
  it('image IR whose calibration is not trusted → null', () => {
    expect(irAldehydeContext(strong, false, {isImage: true, calibrationTrusted: false}).conjugatedCarbonyl).toBeNull();
  });
  it('image IR whose intensities are unknown → null', () => {
    expect(irAldehydeContext([irObs(1717, null), irObs(1270, null)], false, {isImage: true, calibrationTrusted: true}).conjugatedCarbonyl).toBeNull();
  });
  it('peak-table (non-image) IR → null, even with a strong band; so is an unspecified IR kind', () => {
    expect(irAldehydeContext(strong, false, {isImage: false, calibrationTrusted: true}).conjugatedCarbonyl).toBeNull();
    expect(irAldehydeContext(strong, false).conjugatedCarbonyl).toBeNull();
  });
  it('no IR at all → null; the aldehyde context fields are unchanged', () => {
    expect(irAldehydeContext([], false, {isImage: true, calibrationTrusted: true})).toEqual({present: false, coversAldehydeRegion: false, strongCarbonyl: null, conjugatedCarbonyl: null});
    const c = irAldehydeContext(strong, true, {isImage: true, calibrationTrusted: true});
    expect(c.present).toBe(true);
    expect(c.coversAldehydeRegion).toBe(true);
    expect(c.strongCarbonyl).toBe(true);   // 1717 lies in the aldehyde window 1680–1740
  });
});

// ---- the no-formula path only ----------------------------------------------------------------------------------------------------------------------
let counter = 0;
const h1 = (value: number, integral: number): ObservedEvidence => ({
  id: `1H_NMR:t:${value}`, signalId: `s${counter++}`, sourceId: 't', modality: '1H_NMR', value, unit: 'ppm', relativeIntensity: null, relativeIntegral: integral, multiplicity: 's', jHz: [],
  shape: 'NARROW', uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {solvent: 'CDCl3'}, coverage: 'CONFIRMED_COMPLETE', unknown: [],
});
const legacyStub: StructureGenerator = {generateStructures: async () => ({smiles: [], status: 'BOUNDED', visited: 0, note: 'stub', termination: 'GRAMMAR_EXHAUSTED', complete: false, partialHypotheses: [], rejectedByComposition: 0})};
const generator = createExhaustiveGenerator(legacyStub);

/** The inventory the generator builds for a request: `noFormula` = the planned (v1.2.1, no user formula) search, otherwise the user-formula / MS path. */
async function alternativesOf(noFormula: boolean, observations: ObservedEvidence[], irImage?: {isImage: boolean; calibrationTrusted: boolean}) {
  const out = await generator.generateStructures({
    formula: 'C7H10O', hints: {}, budget: {timeMs: 20000, maxStates: 1e6, maxResults: 48, maxFrontier: 1, beamWidth: 1},
    enumerationBudget: {timeMs: 5000, maxStates: 2000, maxCandidates: 100},
    constraintEvidence: {observations, irCoversAldehydeRegion: true, nitrogenAllowed: false, ...(irImage ? {irImage} : {})},
    ...(noFormula ? {planning: {round: 1 as const}} : {}),
  });
  const inv = out.enumeration!.runs[0].v12!.inventory!;
  return {count: inv.alternatives, vinylSignalClasses: inv.signals.map(s => s.classes)};
}
describe('B3 only on the no-formula path', () => {
  const obs = () => [h1(6.2, 4), h1(2.3, 6)];   // 4 H at 6.2 ppm and 6 H at 2.3 ppm (C7H10O: k = 1)
  it('no-formula path: the =CH2 readings of the 6.2 ppm signal are gone; the user-formula path keeps the v1.2.0 readings', async () => {
    const planned = await alternativesOf(true, obs());
    const userFormula = await alternativesOf(false, obs());
    expect(userFormula.count).toBeGreaterThan(planned.count);
  }, 60000);
  it('with the conjugated C=O (image IR, trusted, strong 1717) the no-formula path gets the =CH2 readings back', async () => {
    const ir = [irObs(1717, 100), irObs(1270, 80)];
    const relaxed = await alternativesOf(true, [...obs(), ...ir], {isImage: true, calibrationTrusted: true});
    const notRelaxed = await alternativesOf(true, [...obs(), ...ir], {isImage: true, calibrationTrusted: false});
    const peakTable = await alternativesOf(true, [...obs(), ...ir], {isImage: false, calibrationTrusted: true});
    expect(relaxed.count).toBeGreaterThan(notRelaxed.count);
    expect(peakTable.count).toBe(notRelaxed.count);
  }, 60000);
  it('sub-switch vinylWindows = false and the flag useV121Planning = false: the no-formula path reads like the user-formula path (v1.2.0)', async () => {
    const userFormula = (await alternativesOf(false, obs())).count;
    planning.vinylWindows = false;
    expect((await alternativesOf(true, obs())).count).toBe(userFormula);
    planning.vinylWindows = true;
    V12_CONFIG.useV121Planning = false;
    expect((await alternativesOf(true, obs())).count).toBe(userFormula);
  }, 60000);
  it('the other sub-switches do not touch B3: forbiddenFragments = false and carbonylBand = false leave the windows on', async () => {
    const on = (await alternativesOf(true, obs())).count;
    planning.forbiddenFragments = false; planning.carbonylBand = false;
    expect((await alternativesOf(true, obs())).count).toBe(on);
  }, 60000);
});
