import {describe, expect, it} from 'vitest';
import {inferLocalStructures} from '../../src/engines/reasoning/localStructureInference';
import type {ChemicalHypothesis, HypothesisKind, LocalStructureHypothesis} from '../../src/engines/reasoning/types';
import {adaptLocalStructures, CONVERTIBLE_KINDS} from '../../src/engines/enumeration/adapter';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';

// F3: one conversion test per existing local-structure type (atoms, bonds, mode, charge), and the "cannot convert → legacy search,
// with the reason" cases. The local structures come from the real inferLocalStructures() applied to synthetic hypotheses.
const hyp = (kind: HypothesisKind, obs: string[], extra: Partial<ChemicalHypothesis> = {}): ChemicalHypothesis => ({
  id: `h-${kind}-${obs.join('')}`, kind, description: kind, observationIds: obs, support: [], uncertainties: [], level: 'SUPPORTED',
  alternativeIds: [], compatibleIds: [], conflictIds: [], constraints: {elementPossibilities: [], bondOrders: [], ...(extra.constraints ?? {})}, ...extra,
});
const one = (h: ChemicalHypothesis) => inferLocalStructures([h])[0];
const adapt = (locals: LocalStructureHypothesis[], extra: Partial<Parameters<typeof adaptLocalStructures>[0]> = {}) => adaptLocalStructures({localStructures: locals, symmetryMultiple: null, ...extra});
const fragmentOf = (locals: LocalStructureHypothesis[], idx = 0) => adapt(locals).conversions[idx].fragment;
const allFlex = (f: {atoms: {flex?: boolean; open?: boolean; fixedH?: number; charge?: number}[]}) => f.atoms.every(a => a.flex === true && !a.open && !a.fixedH && !a.charge);

describe('F3 conversion per existing local-structure type', () => {
  const ring = [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]];
  it.each([['AROMATIC'], ['ARYL_PARA'], ['ARYL_META'], ['ARYL_ORTHO']] as const)('%s → six flex carbons with Kekulé ring bonds (aromatic flag), no site constraint', kind => {
    const local = one(hyp(kind, ['o1'], {constraints: {elementPossibilities: [], bondOrders: [], substitutionDistance: 3}}));
    const r = adapt([local]);
    expect(r.ok).toBe(true);
    const f = r.sets[0].fragments[0];
    expect(f.atoms.map(a => a.element)).toEqual(Array(6).fill('C'));
    expect(allFlex(f)).toBe(true);
    expect(f.bonds.map(b => [b.a, b.b, b.order])).toEqual(ring);
    expect(f.bonds.every(b => b.aromatic === true)).toBe(true);
    expect(r.conversions[0].rule).toBe('flex-kekule-ring');
    if (kind !== 'AROMATIC') expect(r.notes.some(n => n.includes('取代位置') && n.includes('未當作約束'))).toBe(true);
  });
  const simple: [HypothesisKind, string[], [number, number, number][]][] = [
    ['ALKENE', ['C', 'C'], [[0, 1, 2]]],
    ['ALKYNE', ['C', 'C'], [[0, 1, 3]]],
    ['NITRILE', ['C', 'N'], [[0, 1, 3]]],
    ['ALKYL', ['C'], []],
    ['OXYGENATED', ['C', 'O'], [[0, 1, 1]]],
    ['NITROGENATED', ['C', 'N'], [[0, 1, 1]]],
    ['HYDROXYL', ['O'], []],
    ['AMINO', ['C', 'N'], [[0, 1, 1]]],
    ['CARBONYL', ['C', 'O'], [[0, 1, 2]]],
    ['ETHYL', ['C', 'C'], [[0, 1, 1]]],
  ];
  it.each(simple)('%s → flex atoms %j with the original bonds', (kind, elements, bonds) => {
    const local = one(hyp(kind, ['o1']));
    const f = fragmentOf([local]);
    expect(f.atoms.map(a => a.element)).toEqual(elements);
    expect(allFlex(f)).toBe(true);
    expect(f.bonds.map(b => [b.a, b.b, b.order])).toEqual(bonds);
    expect(f.bonds.every(b => !b.aromatic)).toBe(true);
  });
  it('the phenol-type combined local structure (ring + O) is one flex fragment of 7 atoms', () => {
    const locals = inferLocalStructures([hyp('HYDROXYL', ['o1']), hyp('AROMATIC', ['o2'])]);
    const phenol = locals.find(l => l.atoms.length === 7)!;
    const f = fragmentOf([phenol]);
    expect(f.atoms.map(a => a.element)).toEqual(['C', 'C', 'C', 'C', 'C', 'C', 'O']);
    expect(allFlex(f)).toBe(true);
    expect(f.bonds).toHaveLength(7);
    expect(f.bonds.filter(b => b.aromatic).length).toBe(6);
  });
  it('every kind the inference can produce is covered above; the convertible list is exactly those', () => {
    expect([...CONVERTIBLE_KINDS].sort()).toEqual(['AROMATIC', 'ARYL_META', 'ARYL_ORTHO', 'ARYL_PARA', 'ALKENE', 'ALKYNE', 'NITRILE', 'ALKYL', 'OXYGENATED', 'NITROGENATED', 'HYDROXYL', 'AMINO', 'CARBONYL', 'ETHYL'].sort());
  });
  it('charged groups become fixed closed forms with the attachment atom open (nitro, amine N-oxide)', () => {
    const base = one(hyp('NITROGENATED', ['o1']));
    const nitro = fragmentOf([{...base, description: '硝基（N⁺ 與兩個 O）'}]);
    expect(nitro.atoms).toEqual([{element: 'N', charge: 1, open: true}, {element: 'O'}, {element: 'O', charge: -1}]);
    expect(nitro.bonds.map(b => [b.a, b.b, b.order])).toEqual([[0, 1, 2], [0, 2, 1]]);
    const noxide = fragmentOf([{...base, kind: 'AMINO', description: 'N-氧化物'}]);
    expect(noxide.atoms).toEqual([{element: 'N', charge: 1, open: true}, {element: 'O', charge: -1}]);
    expect(adapt([{...base, description: '硝基'}]).conversions[0].rule).toContain('charged-group:NITRO');
  });
  it('symmetric unit k = 2: every fragment gets count 2 and copy ids carry #2', () => {
    const r = adapt(inferLocalStructures([hyp('ETHYL', ['o1']), hyp('ALKYL', ['o2'])]), {symmetryMultiple: 2});
    expect(r.sets[0].fragments.map(f => f.count)).toEqual([2]);   // the single-atom ALKYL fragment is vacuous (see below), the ethyl fragment keeps count 2
    expect(r.conversions.map(c => c.vacuous)).toEqual([false, true]);
    expect(r.setLocalIds[r.sets[0].id]).toEqual(['local-0', 'local-0#2', 'local-1', 'local-1#2']);
  });
});

describe('readings of the evidence', () => {
  const local = (id: string, kind: HypothesisKind, obs: string[]) => ({...one(hyp(kind, obs)), id});
  it('each observation is explained by one structure that contains it; hypotheses for the same observation are alternatives', () => {
    const A = local('A', 'AROMATIC', ['o1', 'o2']), B = local('B', 'ALKENE', ['o1']), C = local('C', 'ALKYL', ['o3']);
    const r = adapt([A, B, C]);
    expect(r.sets.map(s => r.setLocalIds[s.id])).toEqual([['A', 'C'], ['A', 'B', 'C']]);
  });
  it('a structure that needs more atoms of an element than the formula has is left out (note), others still form readings', () => {
    const O = local('O', 'HYDROXYL', ['o1']), C = local('C', 'ALKYL', ['o2']);
    const r = adapt([O, C], {formula: {C: 3, H: 8}});
    expect(r.sets.map(s => r.setLocalIds[s.id])).toEqual([['C']]);
    expect(r.notes.some(n => n.includes('O') && n.includes('不納入任何讀法'))).toBe(true);
  });
  it('no local structures at all: one empty reading (pure formula enumeration)', () => {
    const r = adapt([]);
    expect(r.ok).toBe(true);
    expect(r.sets).toEqual([{id: 'FREE', fragments: []}]);
  });
  it('explicit hydrogen counts (the later 1H-derived entry) make the atom open with that H fixed; others stay flex', () => {
    const local1 = local('E', 'ETHYL', ['o1']);
    const f = adapt([local1], {fixedHydrogens: {E: [2, null]}}).sets[0].fragments[0];   // an open atom is not vacuous
    expect(f.atoms).toEqual([{element: 'C', fixedH: 2, open: true}, {element: 'C', flex: true}]);
  });
  it('substitution sites become open atoms with H = 0 only when the config flag is switched on', () => {
    const para = one(hyp('ARYL_PARA', ['o1'], {constraints: {elementPossibilities: [], bondOrders: [], substitutionDistance: 3}}));
    (ENUMERATION_CONFIG.adapter as {useSubstitutionSitesAsOpen: boolean}).useSubstitutionSitesAsOpen = true;
    try {
      const f = fragmentOf([para]);
      expect(f.atoms.map(a => (a.open ? 'open' : 'flex'))).toEqual(['open', 'flex', 'flex', 'open', 'flex', 'flex']);
      expect(f.atoms[0].fixedH ?? 0).toBe(0);
    } finally { (ENUMERATION_CONFIG.adapter as {useSubstitutionSitesAsOpen: boolean}).useSubstitutionSitesAsOpen = false; }
  });
});

describe('F3 cannot convert → fallback to the legacy search with the reason (never a failure)', () => {
  const base = one(hyp('ALKYL', ['o1']));
  it.each([['ION'], ['FRAGMENT'], ['SURFACE']] as const)('unknown kind %s', kind => {
    const r = adapt([{...base, kind}]);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toContain(kind);
  });
  it('unsupported element', () => {
    const r = adapt([{...base, atoms: [{element: 'P'}]}]);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toContain('P');
  });
  it('aromatic ring whose bond orders are not an explicit Kekulé alternation (aromaticity not decidable)', () => {
    const ringLocal = one(hyp('AROMATIC', ['o1']));
    const flat = {...ringLocal, bonds: ringLocal.bonds.map(b => ({...b, order: 1}))};
    const r = adapt([flat]);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toMatch(/Kekulé|芳香/);
  });
  it('invalid bond or unusable bond order', () => {
    const r = adapt([{...base, atoms: [{element: 'C'}, {element: 'C'}], bonds: [{a: 0, b: 5, order: 1}]}]);
    expect(r.ok).toBe(false);
    const r2 = adapt([{...base, atoms: [{element: 'C'}, {element: 'C'}], bonds: [{a: 0, b: 1, order: 4}]}]);
    expect(r2.ok).toBe(false);
    expect(r2.fallbackReason).toContain('無法判定');
  });
  it('too many readings', () => {
    const many: LocalStructureHypothesis[] = Array.from({length: 8}, (_, i) => ({...base, id: `x${i}`, observationIds: [`a${i}`, `b${i}`]}));
    // 8 observations pairs, each explained by two structures → 2^8 readings
    const crossed = many.flatMap((l, i) => [l, {...l, id: `y${i}`}]);
    const r = adapt(crossed);
    expect(r.ok).toBe(false);
    expect(r.fallbackReason).toContain('讀法超過上限');
  });
});
