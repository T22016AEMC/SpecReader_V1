import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {scoreScientificEvidence} from '../../src/engines/scientificEngines/evidenceLedger';
import {fixtureSpectra} from '../helpers/v121Golden';
import type {V121Fixture} from '../helpers/v121Golden';

// v1.4.1 stop 20 (A): the THF / methanol parse fix of the candidate ledger (d2e26e7) has its own flag V12_CONFIG.v140.parseFix, so it can be measured WITHOUT the rest of useV140H1. The fix switches on when parseFix is on (stop 21: default true, independent of useV140H1).
// Every state is set explicitly here (the default of parseFix is true since stop 21).
const was = {h1: V12_CONFIG.useV140H1, pf: V12_CONFIG.v140.parseFix, ir: V12_CONFIG.useV141IR};
beforeAll(async () => { await initializeRDKit(); }, 60000);
afterAll(() => { V12_CONFIG.useV140H1 = was.h1; V12_CONFIG.v140.parseFix = was.pf; V12_CONFIG.useV141IR = was.ir; });

const fx = (id: string, formula: string, smiles: string, h1: {x: number; integration: number; multiplicity: string}[]): V121Fixture => ({
  id, description: 'Fulmer 2010 SI Table S7 shifts (CDCl3), see tests/fixtures/v140/h1Truth.json', targetSmiles: smiles, formula,
  h1: {solvent: 'CDCl3', frequencyMHz: 400, peaks: h1}, ir: {yAxis: 'transmittance percent', coverageCm1: [4000, 450], calibrated: true, peaks: [{x: 2970, y: 40}, {x: 1100, y: 20}]},
});
const THF = fx('THF', 'C4H8O', 'C1CCOC1', [{x: 3.76, integration: 4, multiplicity: 'm'}, {x: 1.85, integration: 4, multiplicity: 'm'}]);
const MEOH = fx('MEOH', 'CH4O', 'CO', [{x: 3.49, integration: 3, multiplicity: 's'}]);
const TOL = fx('TOL', 'C7H8', 'Cc1ccccc1', [{x: 7.17, integration: 5, multiplicity: 'm'}, {x: 2.34, integration: 3, multiplicity: 's'}]);
const bundleOf = (f: V121Fixture) => WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f, {denseBaseline: true}), {}).bundle;
const score = (h1: boolean, parseFix: boolean) => {
  V12_CONFIG.useV140H1 = h1; V12_CONFIG.v140.parseFix = parseFix; V12_CONFIG.useV141IR = false;
  const s = (smi: string, f: V121Fixture) => scoreScientificEvidence(smi, bundleOf(f));
  return {thf: s('C1CCOC1', THF).modalityScores['1H_NMR'] as number, me: s('CO', MEOH).modalityScores['1H_NMR'] as number, tol: s('Cc1ccccc1', TOL).totalScore};
};

describe('the parse fix has its own flag', () => {
  it('both off: THF and methanol have no 1H support; parseFix alone gives it, without useV140H1', () => {
    const none = score(false, false), fixOnly = score(false, true);
    expect(none.thf).toBe(0); expect(none.me).toBe(0);
    expect(fixOnly.thf).toBeGreaterThan(none.thf + 10); expect(fixOnly.me).toBeGreaterThan(none.me + 10);
  });
  it('useV140H1 on does NOT give the fix when parseFix is off (the gate no longer depends on useV140H1); parseFix on gives it with useV140H1 on too', () => {
    const h1Only = score(true, false), none = score(false, false), both = score(true, true);
    expect(h1Only.thf).toBe(none.thf); expect(h1Only.me).toBe(none.me);
    expect(both.thf).toBeGreaterThan(10); expect(both.me).toBeGreaterThan(10);
  });
  it('a candidate that was never affected (toluene) scores the same with parseFix on or off, and with useV140H1 off', () => {
    expect(score(false, true).tol).toBeCloseTo(score(false, false).tol, 9);
  });
});
