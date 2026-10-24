import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {inferLocalStructures} from '../../src/engines/reasoning/localStructureInference';
import type {ChemicalHypothesis, LocalStructureHypothesis} from '../../src/engines/reasoning/types';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import {capScored} from '../../src/engines/enumeration/prefilter';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import type {StructureGenerator} from '../../src/engines/composition/structureGenerator';
import type {DeNovoSearchResult} from '../../src/engines/scientificEngines/deNovoGraphSearch';

beforeAll(() => initializeRDKit(), 60000);
const legacyStub: StructureGenerator = {generateStructures: async () => ({smiles: [], status: 'BOUNDED', visited: 0, note: '', termination: 'GRAMMAR_EXHAUSTED', complete: true, partialHypotheses: [], rejectedByComposition: 0} as DeNovoSearchResult)};
const hyp = (n: number): ChemicalHypothesis => ({id: `h${n}`, kind: 'ALKYL', description: 'ALKYL', observationIds: [`a${n}`, `b${n}`], support: [], uncertainties: [], level: 'SUPPORTED', alternativeIds: [], compatibleIds: [], conflictIds: [], constraints: {elementPossibilities: [], bondOrders: []}});

describe('readings truncated → INCOMPLETE with the reason', () => {
  it('more readings than the limit: only the first are enumerated, the run is incomplete and says READINGS_TRUNCATED', async () => {
    // 8 observation pairs, each explained by two single-C structures: 256 readings, limit 64. Single C atoms are vacuous, so each reading is the tiny formula C2H6.
    const base = inferLocalStructures([hyp(0)])[0];
    const locals: LocalStructureHypothesis[] = Array.from({length: 8}, (_, i) => ({...base, id: `x${i}`, observationIds: [`a${i}`, `b${i}`]}));
    const crossed = locals.flatMap(l => [l, {...l, id: `${l.id}b`}]);
    const generator = createExhaustiveGenerator(legacyStub);
    const r = await generator.generateStructures({formula: 'C2H6', hints: {localStructures: crossed}, budget: {timeMs: 5000, maxStates: 1e6, maxResults: 48, maxFrontier: 1, beamWidth: 1}});
    const run = r.enumeration!.runs[0];
    expect(run.used).toBe(true);
    expect(run.incompleteReasons).toContain('READINGS_TRUNCATED');
    expect(run.complete).toBe(false);
    expect(r.complete).toBe(false);
    expect(run.readings).toHaveLength(ENUMERATION_CONFIG.adapter.maxAlternativeSets);
    expect(r.smiles).toEqual(['CC']);
  });
});

describe('pre-ranking: rules and weights come from the config (a screening heuristic, not a score)', () => {
  // 'CCO' has H classes 3 (CH3, CH2, OH) , 'CC(C)(C)C' has 2, 'CCCCCC' has 3.
  const list = ['CC(C)(C)C', 'CCO', 'CCCCCC'];
  const P = ENUMERATION_CONFIG.prefilter as {requireH1Classes: boolean; closenessWeightH1: number; plausibleFirst: boolean};
  const withConfig = <T,>(patch: Partial<typeof P>, fn: () => T): T => { const old = {...P}; Object.assign(P, patch); try { return fn(); } finally { Object.assign(P, old); } };
  it('classes below the observed signal count go last (rule on), closest environment count first', () => {
    const r = capScored(list, {h1: 3, c13: null}, 1);
    expect(r.scored).toEqual(['CCO']);               // 3 classes = 3 signals: gap 0; CCCCCC has 3 classes too and comes later in the incoming order
    expect(r.deferred).toEqual(['CCCCCC', 'CC(C)(C)C']);
    expect(r.prefilter).toEqual({h1Required: 3, c13Required: null, passing: 2, failing: 1});
  });
  it('switching the rule off or the closeness weight to 0 changes the order accordingly', () => {
    expect(withConfig({requireH1Classes: false}, () => capScored(list, {h1: 3, c13: null}, 3).scored)).toEqual(['CC(C)(C)C', 'CCO', 'CCCCCC']);
    expect(withConfig({closenessWeightH1: 0}, () => capScored(['CCCCCC', 'CCO'], {h1: 2, c13: null}, 1).scored)).toEqual(['CCCCCC']);
    expect(withConfig({closenessWeightH1: 1}, () => capScored(['CCCCCC', 'CCO'], {h1: 2, c13: null}, 1).scored)).toEqual(['CCCCCC']);
  });
  it('nothing is dropped below the cap', () => {
    expect(capScored(list, {h1: 9, c13: null}, 10)).toEqual({scored: list, deferred: [], prefilter: null});
  });
});
