import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, matchingSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {FORBIDDEN_FRAGMENTS, forbiddenById} from '../../src/engines/constraints/forbiddenFragments';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {enumerateStructures} from '../../src/engines/enumeration';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import {exclusionLines, exclusionStats} from '../../src/engines/enumeration/exclusionStats';
import {NO_PLAUSIBILITY_EVIDENCE, plausibilityViolations} from '../../src/engines/scientificEngines/structurePlausibility';
import type {StructureGenerator} from '../../src/engines/composition/structureGenerator';
import type {DeNovoSearchResult} from '../../src/engines/scientificEngines/deNovoGraphSearch';
import {parseFormula} from '../../src/engines/enumeration/problem';

// v1.2.1 B1 (short para / meta bridges) and B2 (cyclic C(OH)(OR)(OR)): the forbidden-fragment list, its three places (leaf, downstream gate, legacy
// supplement), the hit statistics and the sub-switch. All structures are generic textbook molecules; nothing comes from benchmark\.
beforeAll(() => initializeRDKit(), 60000);

/** The ids of the forbidden fragments a SMILES contains (RDKit; the list is the production list). */
const hits = (smiles: string): string[] => (matchingSMARTS(smiles, FORBIDDEN_FRAGMENTS.map(f => f.smarts)) ?? []).map(i => FORBIDDEN_FRAGMENTS[i].id);
const ruleOf = (smiles: string) => plausibilityViolations(smiles, NO_PLAUSIBILITY_EVIDENCE).map(v => v.rule);
const counts = (formula: string) => { const p = parseFormula(formula); if (!p.ok) throw new Error(p.error.message); return p.counts; };

describe('the list itself', () => {
  it('every entry parses as SMARTS and carries the unverified-source note, a Chinese label and no internal code in the label', () => {
    expect(matchingSMARTS('C', FORBIDDEN_FRAGMENTS.map(f => f.smarts))).toEqual([]); // null would mean an unparsable query or no RDKit
    const ids = FORBIDDEN_FRAGMENTS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FORBIDDEN_FRAGMENTS) {
      expect(f.source, f.id).toBe('工程判斷，未查證');
      expect(f.label, f.id).toMatch(/[一-鿿]/);
      expect(f.label, f.id).not.toMatch(/[A-Z]{3,}_|FORBIDDEN/);
      expect(forbiddenById(f.id)).toBe(f);
    }
  });
});

describe('B2: cyclic C(OH)(OR)(OR)', () => {
  const B2 = 'CYCLIC_HYDROXY_ORTHOESTER';
  const blocked: [string, string][] = [
    ['2-hydroxy-2-methoxy-THF', 'OC1(OC)CCCO1'],
    ['2-hydroxy-2-methyl-1,3-dioxolane', 'CC1(O)OCCO1'],
    ['2-hydroxy-2-methoxy-tetrahydropyran', 'COC1(O)CCCCO1'],
    ['ring C with OH, OMe and two ring O', 'COC1(O)OCCO1'],
    ['ring C(OH)(OAc)(OR) (acyloxy counts as OR)', 'CC(=O)OC1(O)OCCC1'],
  ];
  const allowed: [string, string][] = [
    ['cyclic hemiacetal (one OR + OH)', 'OC1OCCCC1'],
    ['cyclic acetal (two OR, no OH)', 'COC1(OC)CCCC1'],
    ['cyclic orthoester (three OR)', 'COC1(OC)OCCC1'],
    ['acyclic C(OH)(OMe)2', 'COC(O)(OC)C'],
    ['acyclic hemiacetal', 'COC(C)O'],
    ['ring gem-diol', 'OC1(O)CCCC1'],
    ['ring C(OH)2(OR)', 'OC1(O)OCCC1'],
    ['lactol on a spiro carbon (one ring O and the OH only)', 'CC1(O)OC2(CCCC2)CC1'],
  ];
  for (const [name, smiles] of blocked) it(`blocked: ${name}`, () => { expect(hits(smiles), smiles).toContain(B2); });
  for (const [name, smiles] of allowed) it(`not blocked: ${name}`, () => { expect(hits(smiles), smiles).not.toContain(B2); });

  it('GEM_DIOL stays "always blocked" and has no exception: ring and acyclic gem-diols still violate GEM_DIOL', () => {
    expect(ruleOf('OC1(O)CCCC1')).toContain('GEM_DIOL');
    expect(ruleOf('OC1(O)OCCC1')).toContain('GEM_DIOL');
    expect(ruleOf('CC(C)(O)O')).toContain('GEM_DIOL');
  });
  it('does not overlap HEMIACETAL_ACYCLIC / ORTHOESTER_ACYCLIC (ring vs. outside a ring): each molecule is caught by exactly one family', () => {
    // acyclic C(OH)(OMe)2: the two existing acyclic rules, not B2
    expect(ruleOf('COC(O)(OC)C')).toEqual(expect.arrayContaining(['HEMIACETAL_ACYCLIC', 'ORTHOESTER_ACYCLIC']));
    expect(ruleOf('COC(O)(OC)C')).not.toContain(`FORBIDDEN_${B2}`);
    // ring C(OH)(OR)(OR): B2, not the acyclic ones
    expect(ruleOf('OC1(OC)CCCO1')).toContain(`FORBIDDEN_${B2}`);
    expect(ruleOf('OC1(OC)CCCO1')).not.toContain('HEMIACETAL_ACYCLIC');
    expect(ruleOf('OC1(OC)CCCO1')).not.toContain('ORTHOESTER_ACYCLIC');
    // and never B2 together with GEM_DIOL (the free OH has no second carbon neighbour)
    expect(ruleOf('OC1(O)OCCC1')).not.toContain(`FORBIDDEN_${B2}`);
  });
});

describe('the three places apply the same list', () => {
  const FORMULA = 'C4H8O3';
  const TARGET = 'COC1(O)CCO1'; // 2-hydroxy-2-methoxyoxetane
  const run = async (fragments?: Parameters<typeof enumerateStructures>[0]['forbid']) => enumerateStructures({formula: FORMULA, forbid: fragments, budget: {maxStates: 2e7, timeMs: 120000}});

  it('leaf: the enumerator drops the molecule and counts it in rejected.v12.forbiddenById; an explicit empty list keeps it', async () => {
    const withRule = await run();
    const without = await run({fragments: []});
    expect(without.candidates.map(c => c.smiles)).toContain(TARGET);
    expect(withRule.candidates.map(c => c.smiles)).not.toContain(TARGET);
    expect(withRule.status).toBe('COMPLETE');
    const byId = withRule.stats.rejected.v12?.forbiddenById ?? {};
    // every molecule that contains a listed fragment is dropped exactly once, nothing else is dropped
    const removed = without.candidates.map(c => c.smiles).filter(s => !withRule.candidates.some(c => c.smiles === s));
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every(s => hits(s).length > 0)).toBe(true);
    expect(Object.values(byId).reduce((a, b) => a + b, 0)).toBe(removed.length);
    expect(byId.CYCLIC_HYDROXY_ORTHOESTER).toBeGreaterThanOrEqual(1);
    expect(without.stats.rejected.v12?.forbiddenById).toBeUndefined();
  }, 120000);

  it('downstream gate: plausibilityViolations names FORBIDDEN_<id>; the sub-switch and the master flag turn it off', () => {
    expect(ruleOf(TARGET)).toContain('FORBIDDEN_CYCLIC_HYDROXY_ORTHOESTER');
    V12_CONFIG.planning.forbiddenFragments = false;
    try { expect(ruleOf(TARGET).some(r => r.startsWith('FORBIDDEN_'))).toBe(false); } finally { V12_CONFIG.planning.forbiddenFragments = true; }
    V12_CONFIG.useV121Planning = false;
    try { expect(ruleOf(TARGET).some(r => r.startsWith('FORBIDDEN_'))).toBe(false); } finally { V12_CONFIG.useV121Planning = true; }
  });

  it('legacy beam supplement: candidates with a forbidden fragment are dropped, counted per rule, and noted', async () => {
    const supplement: DeNovoSearchResult = {smiles: [TARGET, 'CCC(=O)OC', 'OCC(=O)CO'], status: 'BOUNDED', visited: 3, note: '', termination: 'GRAMMAR_EXHAUSTED', complete: true, partialHypotheses: [], rejectedByComposition: 0} as DeNovoSearchResult;
    const legacy: StructureGenerator = {generateStructures: async () => supplement};
    const generator = createExhaustiveGenerator(legacy);
    const was = ENUMERATION_CONFIG.legacySupplementWhenIncomplete;
    ENUMERATION_CONFIG.legacySupplementWhenIncomplete = true;
    try {
      const request = {formula: FORMULA, hints: {}, enumerationBudget: {timeMs: 5000, maxStates: 15}, budget: {timeMs: 5000, maxStates: 1e6, maxResults: 48, maxFrontier: 1, beamWidth: 1}};
      const on = await generator.generateStructures(request as never);
      const run = on.enumeration!.runs[0];
      expect(run.incompleteReasons).toContain('STATE_BUDGET');
      expect(on.smiles).not.toContain(TARGET);
      expect(on.smiles).toEqual(expect.arrayContaining(['CCC(=O)OC', 'OCC(=O)CO']));
      expect(run.legacySupplement?.droppedByForbidden).toBe(1);
      expect(run.legacySupplement?.droppedByForbiddenById).toEqual({CYCLIC_HYDROXY_ORTHOESTER: 1});
      expect(run.notes.join('|')).toContain('含禁含片段');
      V12_CONFIG.planning.forbiddenFragments = false;
      const off = await generator.generateStructures(request as never);
      expect(off.smiles).toContain(TARGET);
      expect(off.enumeration!.runs[0].legacySupplement?.droppedByForbidden).toBeUndefined();
    } finally { ENUMERATION_CONFIG.legacySupplementWhenIncomplete = was; V12_CONFIG.planning.forbiddenFragments = true; }
  }, 60000);

  it('hit statistics: the three sources add up in exclusionStats and read as Chinese lines without internal codes', () => {
    const runs = [
      {v12: {required: []}, rejected: {v12: {aromaticFailed: 0, requiredFailed: 0, equivalenceFailed: 0, alkeneFailed: 0, forbiddenById: {CYCLIC_HYDROXY_ORTHOESTER: 2}}}, legacySupplement: {candidates: 3, added: 1, visited: 1, droppedByForbidden: 1, droppedByForbiddenById: {CYCLIC_HYDROXY_ORTHOESTER: 1}}},
    ] as never;
    const stats = exclusionStats(runs, [{violatedConstraints: ['PLAUSIBILITY(FORBIDDEN_CYCLIC_HYDROXY_ORTHOESTER): x']}, {violatedConstraints: ['PLAUSIBILITY(GEM_DIOL): y']}]);
    expect(stats.forbidden).toEqual([{id: 'CYCLIC_HYDROXY_ORTHOESTER', label: forbiddenById('CYCLIC_HYDROXY_ORTHOESTER')!.label, count: 4}]);
    expect(stats.plausibility).toEqual([{label: '偶二醇', count: 1}]);
    expect(stats.total).toBe(5);
    const lines = exclusionLines(stats);
    expect(lines).toContain(`禁含片段『${forbiddenById('CYCLIC_HYDROXY_ORTHOESTER')!.label}』排除了 4 個`);
    expect(lines.join('\n')).not.toMatch(/FORBIDDEN|CYCLIC_HYDROXY/);
  });
});

describe('sub-switch forbiddenFragments', () => {
  it('false: the leaf does not apply the list (the molecule is a candidate) while the other switches stay as they were', async () => {
    V12_CONFIG.planning.forbiddenFragments = false;
    try {
      const r = await enumerateStructures({formula: 'C4H8O3', budget: {maxStates: 2e7, timeMs: 120000}});
      expect(r.candidates.map(c => c.smiles)).toContain('COC1(O)CCO1');
      expect(r.stats.rejected.v12).toBeUndefined();
      expect(V12_CONFIG.planning.vinylWindows).toBe(true);
      expect(V12_CONFIG.planning.carbonylBand).toBe(true);
    } finally { V12_CONFIG.planning.forbiddenFragments = true; }
    void counts;
  }, 120000);
});
