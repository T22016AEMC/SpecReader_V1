import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {activeForbiddenFragments, FORBIDDEN_FRAGMENTS, forbiddenById, V123_FORBIDDEN_FRAGMENTS, V131_FORBIDDEN_FRAGMENTS} from '../../src/engines/constraints/forbiddenFragments';
import {v131ForbiddenAlkynolActive} from '../../src/engines/composition/planningGate';
import {initializeRDKit, matchingSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {NO_PLAUSIBILITY_EVIDENCE, plausibilityViolations} from '../../src/engines/scientificEngines/structurePlausibility';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.2.3 (A6): the nine forbidden fragments. SYNTHETIC molecules only. 9 must be hit and 60 must not (the regression set of the design report); N(O)O, N–O–N and N(O)N(O) cannot be unlocked by IR.
beforeAll(() => initializeRDKit(), 60000);
const wasTotal = V12_CONFIG.useV123, wasSub = V12_CONFIG.v123.forbiddenN;
afterEach(() => { V12_CONFIG.useV123 = wasTotal; V12_CONFIG.v123.forbiddenN = wasSub; });

const BAD: [string, string, string][] = [
  ['N(O)O (aryl dihydroxyamine)', 'Cc1ccc(N(O)O)cc1', 'N_TWO_O'],
  ['N-O-N (bis-arylamine ether)', 'Cc1ccc(NONc2ccc(C)cc2)cc1', 'N_O_N'],
  ['N(O)N(O)', 'Cc1ccc(N(O)N(O)c2ccc(C)cc2)cc1', 'N_O_N_O'],
  ['N=C(O)O', 'Cc1ccc(N=C(O)O)cc1', 'IMIDOCARBONATE'],
  ['benzocyclopropene', 'C1c2ccccc12', 'AROMATIC_IN_3RING'],
  ['hydroxycyclopropene', 'CC1(C2(O)C=C2)C=C1', 'RING_DOUBLE_IN_3RING'],
  ['1,3-dioxetane', 'C1OCO1', 'DIOXETANE_1_3'],
  ['fulvene enol ether', 'COC=C1C=CC=C1', 'FULVENE'],
  ['epoxide diol', 'Cc1ccc(C2(O)OC2(O)c2ccc(C)cc2)cc1', 'OH_ON_EPOXIDE_CARBON'],
];
const GOOD: [string, string][] = [
  ['nitrobenzene', 'c1ccccc1[N+](=O)[O-]'], ['nitromethane', 'C[N+](=O)[O-]'], ['p-nitrotoluene', 'Cc1ccc([N+](=O)[O-])cc1'], ['nitro uncharged form', 'CN(=O)=O'],
  ['oxime', 'CC=NO'], ['ketoxime', 'CC(C)=NO'], ['oxime ether', 'CC=NOC'], ['N-methylhydroxylamine (single N-OH)', 'CNO'], ['N,N-diethylhydroxylamine', 'CCN(O)CC'],
  ['hydroxamic acid', 'CC(=O)NO'], ['amidoxime', 'CC(N)=NO'], ['N-hydroxyphthalimide', 'O=C1c2ccccc2C(=O)N1O'], ['pyridine N-oxide', '[O-][n+]1ccccc1'], ['nitroso', 'CN=O'], ['ethyl nitrite', 'CCON=O'], ['ethyl nitrate', 'CCO[N+](=O)[O-]'],
  ['azoxy', 'CN=[N+]([O-])C'], ['hydrazine', 'CNNC'], ['hydrazide', 'CC(=O)NN'], ['benzofurazan (aromatic N-O-N)', 'c1ccc2nonc2c1'], ['furazan', 'Cc1nonc1C'], ['1,2,4-oxadiazole', 'Cc1nc(C)no1'], ['isoxazole', 'Cc1ccno1'],
  ['carbamate', 'CNC(=O)OC'], ['urea', 'CNC(=O)NC'], ['imidate', 'CC(=N)OC'], ['guanidine', 'CN=C(N)N'], ['2-oxazoline', 'CC1=NCCO1'], ['isocyanate', 'CN=C=O'],
  ['epoxide', 'C1CO1'], ['propylene oxide', 'CC1CO1'], ['styrene oxide', 'c1ccccc1C1CO1'], ['glycidol', 'OCC1CO1'], ['epoxide ester', 'CC(=O)OCC1CO1'],
  ['cyclopropane', 'C1CC1'], ['methylcyclopropane', 'CC1CC1'], ['cyclopropanecarboxylic acid', 'OC(=O)C1CC1'], ['cyclopropylbenzene', 'c1ccccc1C1CC1'], ['chrysanthemic acid', 'CC1(C)C(C=C(C)C)C1C(=O)O'], ['spiropentane', 'C1CC12CC2'], ['cyclopropyl methyl ketone', 'CC(=O)C1CC1'], ['cyclopropanol', 'OC1CC1'],
  ['benzocyclobutene', 'C1Cc2ccccc12'], ['indane', 'C1Cc2ccccc2C1'], ['oxetane', 'C1COC1'], ['1,3-dioxolane', 'C1OCCO1'], ['1,3-dioxane', 'C1OCCCO1'], ['trioxane', 'C1OCOCO1'], ['acetal', 'CC(OC)OC'], ['MOM ether', 'COCOC'],
  ['azulene', 'c1ccc2cccc2cc1'], ['cyclopentadiene', 'C1C=CC=C1'], ['methylenecyclopentane', 'C=C1CCCC1'], ['methylcyclopentadiene', 'CC1=CC=CC1'], ['methylenecyclopropane', 'C=C1CC1'],
  ['p-cresol', 'Cc1ccc(O)cc1'], ['BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'], ['PMA', 'CC(=O)OC(C)COC'], ['prenyl acetate', 'CC(C)=CCOC(C)=O'], ['vinyl acetate', 'C=COC(C)=O'], ['paracetamol', 'CC(=O)Nc1ccc(O)cc1'], ['p-aminophenol', 'Nc1ccc(O)cc1'],
  ['acyclic hemiacetal (other rule)', 'CC(O)OC'], ['ketene acetal', 'C=C(OC)OC'], ['peroxide (other rule)', 'COOC'],
];
const hits = (smiles: string): string[] => (matchingSMARTS(smiles, V123_FORBIDDEN_FRAGMENTS.map(f => f.smarts)) ?? ['PARSE_FAIL']).map(i => (typeof i === 'number' ? V123_FORBIDDEN_FRAGMENTS[i].id : i));

describe('v1.2.3 forbidden fragments: the regression set', () => {
  it('there are nine fragments, with unique ids that do not collide with the v1.2.1 list, all parsable', () => {
    expect(V123_FORBIDDEN_FRAGMENTS).toHaveLength(9);
    const ids = [...FORBIDDEN_FRAGMENTS, ...V123_FORBIDDEN_FRAGMENTS].map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(matchingSMARTS('C', V123_FORBIDDEN_FRAGMENTS.map(f => f.smarts))).toEqual([]); // null would mean an unparsable query
    for (const f of V123_FORBIDDEN_FRAGMENTS) expect(forbiddenById(f.id)).toBe(f);
  });
  for (const [name, smiles, id] of BAD) it(`hit: ${name}`, () => { expect(hits(smiles)).toContain(id); });
  it('exactly 9 hit molecules and 60 clean ones (the design-report sets)', () => {
    expect(BAD).toHaveLength(9);
    expect(GOOD.length).toBeGreaterThanOrEqual(60);
    const wrong = GOOD.filter(([, s]) => hits(s).length > 0).map(([n, s]) => `${n} ${s} → ${hits(s).join(',')}`);
    expect(wrong).toEqual([]);
  });
});

describe('v1.2.3 forbidden fragments: gating and the three that IR cannot unlock', () => {
  // everything that used to unlock N–O structures is present: N-specific evidence, an IR N–O band and an N-oxide band
  const unlock = {...NO_PLAUSIBILITY_EVIDENCE, nitrogenEvidence: true, irNO: true, irNOxide: true};
  const rulesOf = (smiles: string) => plausibilityViolations(smiles, unlock).map(v => v.rule);
  const CASES: [string, string, string][] = [['N(O)O', 'Cc1ccc(N(O)O)cc1', 'FORBIDDEN_N_TWO_O'], ['N-O-N', 'Cc1ccc(NONc2ccc(C)cc2)cc1', 'FORBIDDEN_N_O_N'], ['N(O)N(O)', 'Cc1ccc(N(O)N(O)c2ccc(C)cc2)cc1', 'FORBIDDEN_N_O_N_O']];

  it('flag on: the three are rejected although nitrogen evidence and the IR N–O / N-oxide windows are present', () => {
    V12_CONFIG.useV123 = true;
    for (const [, smiles, rule] of CASES) expect(rulesOf(smiles)).toContain(rule);
  });
  it('flag off: the same evidence unlocks them (1.2.2 behaviour: no FORBIDDEN_ rule, no plausibility violation)', () => {
    V12_CONFIG.useV123 = false;
    for (const [, smiles] of CASES) expect(rulesOf(smiles).filter(r => r.startsWith('FORBIDDEN_N_'))).toEqual([]);
    expect(rulesOf('Cc1ccc(N(O)O)cc1')).toEqual([]);
    expect(activeForbiddenFragments().map(f => f.id)).toEqual(FORBIDDEN_FRAGMENTS.map(f => f.id));
  });
  it('the sub-switch forbiddenN switches off just this list; nitro, N-oxide, oxime and a single N–OH stay legal with the flag on', () => {
    V12_CONFIG.useV123 = true;
    // v1.3.1: the ynol list (V131_FORBIDDEN_FRAGMENTS, own flag useV131) is part of the active list when its gate is open; it is a separate list, so the nine above are unchanged
    const ynol = v131ForbiddenAlkynolActive() ? V131_FORBIDDEN_FRAGMENTS.length : 0;   // 0 with useV131 = false (vitest.flagoff131.config.ts): then the list is exactly the v1.3.0 one
    expect(activeForbiddenFragments()).toHaveLength(FORBIDDEN_FRAGMENTS.length + 9 + ynol);
    V12_CONFIG.v123.forbiddenN = false;
    expect(activeForbiddenFragments()).toHaveLength(FORBIDDEN_FRAGMENTS.length + ynol);
    V12_CONFIG.v123.forbiddenN = true;
    for (const smiles of ['Cc1ccc([N+](=O)[O-])cc1', '[O-][n+]1ccccc1', 'CC(C)=NO', 'CNO']) expect(rulesOf(smiles).filter(r => r.startsWith('FORBIDDEN_'))).toEqual([]);
  });
});
