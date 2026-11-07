import {afterEach, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {buildAtomInventory} from '../../src/engines/constraints/atomInventory';
import {NO_IR} from '../../src/engines/constraints/shiftClasses';
import type {H1Signal} from '../../src/engines/constraints/shiftClasses';
import {READING_CLASS_LABEL} from '../../src/engines/enumeration/compositionPanelModel';
import {buildDiagnosticSummary} from '../../src/ui/diagnosticSummary';
import type {DiagnosticInput} from '../../src/ui/diagnosticSummary';
import {buildDataCheck} from '../../src/ui/dataCheck';

// v1.3.1 (C): the ¹H reading line of the diagnostic summary lists every readable class of a signal, including the classes that wait for round 2 (ester / acetal O–CH, alkene readings). Display only.
// SYNTHETIC signals (PMA-type: CH3C(=O)OCH(CH3)CH2OCH3 as C6H12O3, no IR given so the ester classes are deferred).
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, sub: V12_CONFIG.v131.readingLine};
afterEach(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.v131.readingLine = was.sub; });
const sig = (shiftPpm: number, relativeIntegral: number, multiplicity = 'm'): H1Signal => ({observationId: `1H_NMR:t:${shiftPpm}`, shiftPpm, relativeIntegral, multiplicity, broad: false, optional: false});
const SIGNALS = [sig(5.08, 1), sig(3.4, 2), sig(3.34, 3, 's'), sig(2.05, 3, 's'), sig(1.22, 3, 'd')];
const inventory = () => buildAtomInventory({signals: SIGNALS, formula: {C: 6, H: 12, O: 3}, solvent: 'CDCl3', coverageComplete: true, ir: NO_IR, nitrogenAllowed: false, esterMethine: true});
const on = () => { V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; V12_CONFIG.v131.readingLine = true; };

describe('v1.3.1 reading line: the inventory keeps every readable class beside the searched classes', () => {
  it('flag on: the 5.08 ppm signal lists the deferred ester and acetal classes too; `classes` (what the search reads) is unchanged', () => {
    on();
    const s = inventory().signals[0];
    expect(s.classes).toEqual(['VINYL_CH']);                                       // before and after: only the non-deferred class
    expect(s.readableClasses).toEqual(expect.arrayContaining(['VINYL_CH', 'ESTER_O_CH', 'ACETAL_O_CH']));
  });
  it('flag off (useV131, or the sub-switch): no readableClasses at all (= v1.3.0)', () => {
    on(); V12_CONFIG.useV131 = false;
    expect(inventory().signals.every(s => s.readableClasses === undefined)).toBe(true);
    on(); V12_CONFIG.v131.readingLine = false;
    expect(inventory().signals.every(s => s.readableClasses === undefined)).toBe(true);
  });
  it('a signal that has only one class lists that class (no invented classes)', () => {
    on();
    const s = inventory().signals[4];                                              // 1.22 ppm doublet
    expect(s.readableClasses).toEqual(s.classes);
  });
});

const baseInput = (signal: Record<string, string>): DiagnosticInput => ({
  generatedAt: '2026-11-07 12:00', appVersion: '1.3.1-test', resultIsCurrent: true, dataCheck: buildDataCheck({}), h1Peaks: [{position: 5.08, integration: 1, multiplicity: 'm'}], irPeaks: [], hiddenIrGroups: 0, shownIrGroups: 0,
  panel: {inventory: {formulas: [{signals: [{shift: '5.08', integral: '1', ratio: '1', hText: '1', multiplicity: 'm', classes: '烯基 CH', hPerAtom: '', atoms: '', equivalence: '不要求', singlet: '—', ...signal}], combinations: []}]}, rows: []} as never,
  composition: null, observations: [], topCandidates: [],
});
describe('v1.3.1 reading line: the diagnostic summary prints readingClasses when present, classes otherwise', () => {
  it('the labels of the two v1.2.3 classes exist and the old labels are kept', () => {
    expect(READING_CLASS_LABEL.ESTER_O_CH).toContain('酯氧次甲基');
    expect(READING_CLASS_LABEL.ACETAL_O_CH).toContain('O–CH–O');
    expect(READING_CLASS_LABEL.VINYL_CH).toBe('烯基 CH');
  });
  it('with readingClasses: all classes on the line', () => {
    const line = buildDiagnosticSummary(baseInput({readingClasses: '烯基 CH、酯氧次甲基（RC(=O)O–CH）、縮醛／原酸酯 O–CH–O'})).split('\n').find(l => l.startsWith('- 5.08 ppm'))!;
    expect(line).toContain('烯基 CH、酯氧次甲基（RC(=O)O–CH）、縮醛／原酸酯 O–CH–O');
  });
  it('without readingClasses (flag off): the line is the 1.3.0 line', () => {
    const line = buildDiagnosticSummary(baseInput({})).split('\n').find(l => l.startsWith('- 5.08 ppm'))!;
    expect(line).toBe('- 5.08 ppm｜1H｜m｜烯基 CH｜不要求等價');
  });
});
