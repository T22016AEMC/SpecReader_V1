import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures, type EnumerationRequest, type FragmentSpec} from '../../src/engines/enumeration';
import {NO_PLAUSIBILITY_EVIDENCE, plausibilityViolations, type PlausibilityEvidence} from '../../src/engines/scientificEngines/structurePlausibility';
import {methyl, phenyl} from './fragments';

beforeAll(() => initializeRDKit(), 60000);
const big = {maxStates: 2e9, timeMs: 100000};
const run = (req: EnumerationRequest) => enumerateStructures({...req, budget: {...big, ...req.budget}});
const smiles = async (formula: string, extra: Partial<EnumerationRequest> = {}) => (await run({formula, ...extra})).candidates.map(c => c.smiles).sort();
const canon = (s: string) => canonicalizeMolecule(s).canonical;
const set = (id: string, ...fragments: FragmentSpec[]) => ({id, fragments});
const hydroxyl: FragmentSpec = {id: 'OH', atoms: [{element: 'O', fixedH: 1, open: true}], bonds: []};

describe('T5 errors and boundaries: explicit reasons, never an unhandled exception', () => {
  const codeOf = async (req: EnumerationRequest) => {
    const r = await run(req);
    return {status: r.status, codes: r.errors.map(e => e.code), messages: r.errors.map(e => e.message), r};
  };
  it('formula and fragments disagree', async () => {
    expect((await codeOf({formula: 'C15H16', alternatives: [set('S', phenyl(3))]})).codes).toEqual(['FORMULA_ELEMENT_SHORTAGE']);
    expect((await codeOf({formula: 'C12H8', alternatives: [set('S', phenyl(2))]})).codes).toEqual(['FORMULA_HYDROGEN_SHORTAGE']);
    expect((await codeOf({formula: 'C6H5', alternatives: [set('S', phenyl())]})).codes).toEqual(['VALENCE_PARITY']);
    for (const bad of ['c2h6', '', '3C', 'C2H6x', 'C2H6(']) expect((await codeOf({formula: bad})).codes, `formula "${bad}"`).toEqual(['INVALID_FORMULA']);
    const excess = await codeOf({formula: 'C2H20'});   // 20 hydrogens on 2 carbons cannot be placed
    expect(excess.codes).toEqual(['FORMULA_HYDROGEN_EXCESS']);
    expect(excess.status).toBe('INVALID_REQUEST');
  });
  it('fragment definition errors', async () => {
    const unsat: FragmentSpec = {id: 'bad', atoms: [{element: 'C'}, {element: 'C', open: true}], bonds: [{a: 0, b: 1, order: 1}]};
    expect((await codeOf({formula: 'C2H6', alternatives: [set('S', unsat)]})).codes).toEqual(['CLOSED_ATOM_UNSATURATED']);
    const over: FragmentSpec = {id: 'o', atoms: [{element: 'O', fixedH: 3, open: true}], bonds: []};
    expect((await codeOf({formula: 'H3O', alternatives: [set('S', over)]})).codes).toEqual(['FRAGMENT_OVERVALENT']);
    expect((await codeOf({formula: 'C2H6', alternatives: [set('S', methyl(1, 'm'), methyl(1, 'm'))]})).codes).toEqual(['DUPLICATE_FRAGMENT_ID']);
    const badBond: FragmentSpec = {id: 'b', atoms: [{element: 'C', open: true}], bonds: [{a: 0, b: 5, order: 1}]};
    expect((await codeOf({formula: 'CH4', alternatives: [set('S', badBond)]})).codes).toEqual(['INVALID_BOND']);
    expect((await codeOf({formula: 'C2H6P'})).codes).toEqual(['UNSUPPORTED_ELEMENT']);
    expect((await codeOf({formula: 'H2'})).codes).toEqual(['EMPTY_MOLECULE']);
    const r = await codeOf({formula: 'C2H6', alternatives: [set('S', unsat)]});
    expect(r.messages[0]).toMatch(/closed/);
  });
  it('alternative sets: invalid sets are reported, valid ones still run, results are united with their sources', async () => {
    const r = await run({formula: 'C3H8O', alternatives: [set('methyl', methyl()), set('hydroxyl', hydroxyl), set('broken', phenyl(9))]});
    expect(r.status).toBe('INCOMPLETE');
    expect(r.incompleteReasons).toContain('INVALID_ALTERNATIVE_SET');
    expect(r.sets.map(s => [s.id, s.complete, s.error?.code ?? null])).toEqual([['methyl', true, null], ['hydroxyl', true, null], ['broken', null, 'FORMULA_ELEMENT_SHORTAGE']]);
    const bySmiles = Object.fromEntries(r.candidates.map(c => [c.smiles, c.alternativeSetIds]));
    expect(Object.keys(bySmiles).sort()).toEqual(['CCCO', 'CCOC', 'CC(C)O'].map(canon).sort());
    expect(bySmiles[canon('CCOC')]).toEqual(['methyl']);
    expect(bySmiles[canon('CCCO')]).toEqual(['methyl', 'hydroxyl']);
    expect(bySmiles[canon('CC(C)O')]).toEqual(['methyl', 'hydroxyl']);
  });
  it('every alternative set invalid = INVALID_REQUEST, no candidates', async () => {
    const r = await run({formula: 'C3H8O', alternatives: [set('a', phenyl(9)), set('b', phenyl(8))]});
    expect(r.status).toBe('INVALID_REQUEST');
    expect(r.candidates).toEqual([]);
  });
  it('budgets: state limit, candidate limit (exactly-full is still COMPLETE), time limit', async () => {
    const states = await run({formula: 'C8H18', budget: {maxStates: 1000}});
    expect(states.status).toBe('INCOMPLETE');
    expect(states.incompleteReasons).toEqual(['STATE_BUDGET']);
    expect(states.sets[0].complete).toBe(false);
    const cut = await run({formula: 'C6H14', budget: {maxCandidates: 3}});
    expect(cut.status).toBe('INCOMPLETE');
    expect(cut.incompleteReasons).toEqual(['CANDIDATE_LIMIT']);
    expect(cut.candidates.length).toBe(3);
    const exact = await run({formula: 'C6H14', budget: {maxCandidates: 5}});
    expect(exact.status).toBe('COMPLETE');
    expect(exact.candidates.length).toBe(5);
    const timed = await run({formula: 'C9H20', budget: {timeMs: 0}});
    expect(timed.status).toBe('INCOMPLETE');
    expect(timed.incompleteReasons).toEqual(['TIME_BUDGET']);
  });
  it('cancel returns CANCELLED and keeps what was found', async () => {
    let calls = 0;
    const r = await run({formula: 'C9H20', budget: {shouldCancel: () => ++calls > 5}});
    expect(r.status).toBe('INCOMPLETE');
    expect(r.incompleteReasons).toEqual(['CANCELLED']);
    expect(r.sets[0].complete).toBe(false);
    const before = await run({formula: 'C9H20', budget: {shouldCancel: () => true}});
    expect(before.incompleteReasons).toEqual(['CANCELLED']);
    expect(before.candidates).toEqual([]);
  });
  it('the same input gives byte-identical output (also when a state budget cuts the search)', async () => {
    for (const req of [{formula: 'C7H16'}, {formula: 'C14H12O2', alternatives: [set('S', phenyl(2))]}, {formula: 'C8H18', budget: {maxStates: 5000}}] as EnumerationRequest[]) {
      const a = await run(req), b = await run(req);
      const strip = (r: typeof a) => JSON.stringify({...r, stats: {...r.stats, elapsedMs: 0}, sets: r.sets});
      expect(strip(a)).toBe(strip(b));
    }
  });
  it('gives the event loop back while searching and reports progress', async () => {
    let ticks = 0, progress = 0;
    const timer = setInterval(() => { ticks++; }, 5);
    const r = await run({formula: 'C10H22', budget: {onProgress: () => { progress++; }}});
    clearInterval(timer);
    expect(r.candidates.length).toBe(75);
    expect(ticks).toBeGreaterThan(3);
    expect(progress).toBeGreaterThan(0);
  }, 120000);
});

describe('forbid rules: plausibility gate (existing rules and evidence exceptions) and optional strain profile', () => {
  const evidences: [string, PlausibilityEvidence][] = [
    ['no evidence', NO_PLAUSIBILITY_EVIDENCE],
    ['user formula', {...NO_PLAUSIBILITY_EVIDENCE, userFormula: true}],
    ['N–O evidence', {...NO_PLAUSIBILITY_EVIDENCE, nitrogenEvidence: true, irNO: true}],
  ];
  // Oracle: the unfiltered enumeration passed through the real plausibilityViolations(); early pruning inside the search must
  // not change that set (it may only skip branches the final gate would reject anyway).
  it.each(['C2H6O2', 'CH5NO', 'C2H7NO', 'C3H6O2'])('%s: forbid.plausibility equals "all candidates minus plausibilityViolations()"', async formula => {
    const off = await smiles(formula);
    for (const [label, ev] of evidences) {
      const expected = off.filter(s => plausibilityViolations(s, ev).length === 0);
      const got = await smiles(formula, {forbid: {plausibility: ev}});
      expect(got, `${formula} / ${label}`).toEqual(expected);
    }
  });
  it('the gate removes peroxides unless the user gave the formula; late rules are counted by rule', async () => {
    const r = await run({formula: 'C2H6O2', forbid: {plausibility: NO_PLAUSIBILITY_EVIDENCE}});
    expect(r.candidates.map(c => c.smiles)).not.toContain(canon('COOC'));
    const u = await run({formula: 'C2H6O2', forbid: {plausibility: {...NO_PLAUSIBILITY_EVIDENCE, userFormula: true}}});
    expect(u.candidates.map(c => c.smiles)).toContain(canon('COOC'));
    const enol = await run({formula: 'C2H4O', forbid: {plausibility: NO_PLAUSIBILITY_EVIDENCE}});
    expect(enol.candidates.map(c => c.smiles).sort()).toEqual(['CC=O', 'C1CO1'].map(canon).sort());
    expect(enol.stats.rejected.forbiddenByRule.ENOL).toBe(1);
  });
  it('strain profile SURGE_INSPIRED removes allenes, triple bonds in small rings and atoms on two 3/4-rings; it is off by default', async () => {
    const off3 = await smiles('C3H4');
    expect(off3).toContain(canon('C=C=C'));
    expect(await smiles('C3H4', {forbid: {strain: 'SURGE_INSPIRED'}})).toEqual(['C#CC', 'C1=CC1'].map(canon).sort());
    const off4 = await smiles('C4H6');
    const on4 = await smiles('C4H6', {forbid: {strain: 'SURGE_INSPIRED'}});
    for (const gone of ['C=C=CC', 'C1C2CC12']) { expect(off4).toContain(canon(gone)); expect(on4).not.toContain(canon(gone)); }
    for (const kept of ['C=CC=C', 'C#CCC', 'CC#CC', 'C1=CCC1', 'C=C1CC1', 'CC1=CC1']) expect(on4).toContain(canon(kept));
    expect(on4.every(s => off4.includes(s))).toBe(true);
    const off44 = await smiles('C4H4'), on44 = await smiles('C4H4', {forbid: {strain: 'SURGE_INSPIRED'}});
    expect(off44).toContain(canon('C1#CCC1'));
    expect(on44).not.toContain(canon('C1#CCC1'));
    expect(on44).toContain(canon('C#CC=C'));
  });
});
