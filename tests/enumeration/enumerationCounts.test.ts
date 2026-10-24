import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, matchesSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';

// T1/T2 of the P1b stage-1 acceptance. Hydrogen-saturated or small formulas, no fragments, forbid rules off.
beforeAll(() => initializeRDKit(), 60000);
const count = async (formula: string) => {
  const r = await enumerateStructures({formula, budget: {maxStates: 2e9, timeMs: 110000}});
  expect(r.status, formula).toBe('COMPLETE');
  return r;
};

describe('T1 public counts: alkanes CnH2n+2, n = 1…10 (OEIS A000602: a(1..10) = 1,1,1,2,3,5,9,18,35,75; a(0) = 1 is the offset-0 term)', () => {
  const expected = [1, 1, 1, 2, 3, 5, 9, 18, 35, 75];
  it.each(expected.map((e, i) => [i + 1, e] as const))('C%i alkane isomers = %i', async (n, e) => {
    const r = await count(`C${n}H${2 * n + 2}`);
    expect(r.candidates.length).toBe(e);
  }, 120000);
});

describe('T2 hand-derived counts (constitutional isomers, no stereo, forbid rules off)', () => {
  // Derivations (done independently of the program):
  //  C2H6O  : ethanol, dimethyl ether                                                           = 2
  //  C3H8O  : 1-propanol, 2-propanol, methyl ethyl ether                                        = 3
  //  C4H10O : 4 butanols (1-, 2-, iso-, tert-) + diethyl, methyl propyl, methyl isopropyl ether = 7
  //  C3H6   : propene, cyclopropane                                                             = 2
  //  C3H4   : propyne, allene, cyclopropene                                                     = 3
  //  C2H4O  : acetaldehyde, ethylene oxide, vinyl alcohol                                       = 3
  //  C4H8   : 1-butene, 2-butene, isobutene, cyclobutane, methylcyclopropane                    = 5
  const cases: [string, number][] = [['C2H6O', 2], ['C3H8O', 3], ['C4H10O', 7], ['C3H6', 2], ['C3H4', 3], ['C2H4O', 3], ['C4H8', 5]];
  it.each(cases)('%s = %i', async (formula, e) => {
    const r = await count(formula);
    expect(r.candidates.length).toBe(e);
    expect(r.candidates.every(c => !/[\\/@]/.test(c.smiles)), 'no stereo markers').toBe(true);
  });
  it('the actual structures of C3H4 and C4H8 are the expected ones', async () => {
    expect((await count('C3H4')).candidates.map(c => c.smiles).sort()).toEqual(['C=C=C', 'C#CC', 'C1=CC1'].sort());
    expect((await count('C4H8')).candidates.map(c => c.smiles).sort()).toEqual(['C=CCC', 'CC=CC', 'C=C(C)C', 'C1CCC1', 'CC1CC1'].sort());
  });
});

describe('extra public count with a heteroatom: saturated acyclic CnH2n+2O (alcohols + ethers)', () => {
  // OEIS A000598 (alkyl radicals CnH2n+1, offset 0: 1,1,1,2,4,8,17,39,89) equals the number of alkanols with n carbons:
  // a(1..7) = 1,1,2,4,8,17,39. Every enumerated CnH2n+2O molecule is either an alcohol (one O–H) or an ether (no O–H).
  const alkanols = [1, 1, 2, 4, 8, 17, 39];
  it.each(alkanols.map((e, i) => [i + 1, e] as const))('C%i alkanol/ether formula: %i alcohols among the candidates, the rest ethers', async (n, e) => {
    const r = await count(`C${n}H${2 * n + 2}O`);
    const alcohols = r.candidates.filter(c => matchesSMARTS(c.smiles, '[OX2H]') === true).length;
    expect(alcohols).toBe(e);
    expect(r.candidates.length - alcohols).toBe(r.candidates.filter(c => matchesSMARTS(c.smiles, '[OX2H0]([#6])[#6]') === true).length);
  }, 120000);
});
