import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {activeForbiddenFragments, FORBIDDEN_FRAGMENTS, forbiddenById, V123_FORBIDDEN_FRAGMENTS, V131_FORBIDDEN_FRAGMENTS} from '../../src/engines/constraints/forbiddenFragments';
import {initializeRDKit, matchingSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {NO_PLAUSIBILITY_EVIDENCE, plausibilityViolations} from '../../src/engines/scientificEngines/structurePlausibility';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.3.1 (B): the ynol C#C–OH is a forbidden fragment. SYNTHETIC molecules only. It must hit the ynols and none of the 30+ legal molecules; no IR/N evidence unlocks it.
beforeAll(() => initializeRDKit(), 60000);
const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, sub: V12_CONFIG.v131.forbiddenAlkynol};
afterEach(() => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.v131.forbiddenAlkynol = was.sub; });

const BAD: [string, string][] = [['aryl ynol', 'Cc1ccc(C#CO)cc1'], ['ethynol', 'C#CO'], ['propynol', 'CC#CO'], ['alkyl ynol with a second alcohol', 'OCCC#CO']];
const GOOD: [string, string][] = [
  ['propargyl alcohol', 'C#CCO'], ['2-butyn-1-ol', 'CC#CCO'], ['3-butyn-2-ol', 'CC(O)C#C'], ['2-methyl-3-butyn-2-ol', 'CC(C)(O)C#C'], ['phenylacetylene', 'C#Cc1ccccc1'], ['4-ethynyltoluene', 'C#Cc1ccc(C)cc1'],
  ['ethoxyacetylene (alkynyl ether)', 'C#COCC'], ['methoxypropyne', 'CC#COC'], ['phenyl ethynyl ether', 'C#COc1ccccc1'], ['propiolic acid', 'C#CC(=O)O'], ['phenylpropiolic acid', 'OC(=O)C#Cc1ccccc1'], ['methyl propiolate', 'C#CC(=O)OC'],
  ['3-butyn-1-ol', 'C#CCCO'], ['4-pentyn-1-ol', 'C#CCCCO'], ['1-ethynylcyclohexanol', 'OC1(C#C)CCCCC1'], ['2-butyne-1,4-diol', 'OCC#CCO'], ['4-ethynylphenol (OH on the ring)', 'C#Cc1ccc(O)cc1'], ['4-hydroxyphenylacetylene methyl ether', 'C#Cc1ccc(OC)cc1'],
  ['vinyl alcohol type enol ether', 'C=COC'], ['ethyl vinyl ether', 'C=COCC'], ['1-ethoxypropene (enol ether)', 'CC=COCC'], ['dihydropyran (cyclic enol ether)', 'C1=COCCC1'], ['enol acetate', 'CC(=O)OC=C'],
  ['1-hexyne with hexanol (not joined)', 'C#CCCCC.OCCCCCC'], ['1-hexyne', 'C#CCCCC'], ['2-butyne', 'CC#CC'], ['diphenylacetylene', 'c1ccccc1C#Cc1ccccc1'], ['hex-5-yn-1-ol', 'C#CCCCCO'], ['non-conjugated yne-ol far apart', 'C#CCCCCCCO'],
  ['ethynyl ketone', 'C#CC(C)=O'], ['alkynyl amide', 'C#CC(N)=O'], ['alkynyl ester of phenol', 'C#CC(=O)Oc1ccccc1'], ['ethynylbenzene with benzylic alcohol', 'C#Cc1ccc(CO)cc1'], ['cyanoacetylene', 'C#CC#N'], ['allenol-free allene', 'C=C=C'],
  ['p-cresol', 'Cc1ccc(O)cc1'], ['BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'], ['ethyl benzoate', 'CCOC(=O)c1ccccc1'],
];
const hits = (smiles: string): string[] => (matchingSMARTS(smiles, V131_FORBIDDEN_FRAGMENTS.map(f => f.smarts)) ?? ['PARSE_FAIL']).map(i => (typeof i === 'number' ? V131_FORBIDDEN_FRAGMENTS[i].id : i));

describe('v1.3.1 forbidden fragment: ynol', () => {
  it('one fragment, a unique id that collides with neither earlier list, parsable, found by forbiddenById, sourced as an engineering judgement', () => {
    expect(V131_FORBIDDEN_FRAGMENTS).toHaveLength(1);
    const ids = [...FORBIDDEN_FRAGMENTS, ...V123_FORBIDDEN_FRAGMENTS, ...V131_FORBIDDEN_FRAGMENTS].map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(matchingSMARTS('C', V131_FORBIDDEN_FRAGMENTS.map(f => f.smarts))).toEqual([]);
    expect(forbiddenById('ALKYNOL')).toBe(V131_FORBIDDEN_FRAGMENTS[0]);
    expect(V131_FORBIDDEN_FRAGMENTS[0].source).toContain('工程判斷');
  });
  for (const [name, smiles] of BAD) it(`hit: ${name}`, () => { expect(hits(smiles)).toEqual(['ALKYNOL']); });
  it('at least 30 legal molecules, 0 false hits', () => {
    expect(GOOD.length).toBeGreaterThanOrEqual(30);
    const wrong = GOOD.filter(([, s]) => hits(s).length > 0).map(([n, s]) => `${n} ${s} → ${hits(s).join(',')}`);
    expect(wrong).toEqual([]);
  });
  it('gating: on with the flag chain, off with useV131 = false (= v1.3.0 list), off with the sub-switch; the v1.2.3 list is untouched', () => {
    V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true;
    expect(activeForbiddenFragments().map(f => f.id)).toContain('ALKYNOL');
    V12_CONFIG.v131.forbiddenAlkynol = false;
    expect(activeForbiddenFragments().map(f => f.id)).not.toContain('ALKYNOL');
    V12_CONFIG.v131.forbiddenAlkynol = true; V12_CONFIG.useV131 = false;
    expect(activeForbiddenFragments().map(f => f.id)).not.toContain('ALKYNOL');
    expect(activeForbiddenFragments()).toHaveLength(FORBIDDEN_FRAGMENTS.length + V123_FORBIDDEN_FRAGMENTS.length);
  });
  it('no IR or nitrogen evidence unlocks it: the plausibility gate rejects it with every unlock present, and accepts it with the flag off', () => {
    const unlock = {...NO_PLAUSIBILITY_EVIDENCE, userFormula: true, nitrogenEvidence: true, irNO: true, irNOxide: true, irCumulatedN: true, irKetene: true};
    const rules = (smiles: string) => plausibilityViolations(smiles, unlock).map(v => v.rule);
    V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true;
    expect(rules('Cc1ccc(C#CO)cc1')).toContain('FORBIDDEN_ALKYNOL');
    for (const [, s] of GOOD.slice(0, 12)) expect(rules(s)).not.toContain('FORBIDDEN_ALKYNOL');
    V12_CONFIG.useV131 = false;
    expect(rules('Cc1ccc(C#CO)cc1')).not.toContain('FORBIDDEN_ALKYNOL');
  });
});
