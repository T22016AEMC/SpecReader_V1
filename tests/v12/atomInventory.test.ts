import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';
import {admissibleRatios, buildAtomInventory, substitutionPatterns, type AtomInventoryInput, type InventoryAlternative} from '../../src/engines/constraints/atomInventory';
import {inventoryToFragmentSets} from '../../src/engines/constraints/inventoryAdapter';
import {classifySignal, type ClassifyContext, type H1Signal} from '../../src/engines/constraints/shiftClasses';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

// Stage 1 unit tests. Only self-made, generic synthetic signals are used; nothing here says whether any chemistry is "accurate".
beforeAll(() => initializeRDKit(), 60000);
const sig = (id: string, shiftPpm: number, relativeIntegral: number | null, multiplicity: string | null, extra: Partial<H1Signal> = {}): H1Signal =>
  ({observationId: id, shiftPpm, relativeIntegral, multiplicity, broad: false, optional: false, ...extra});
const input = (signals: H1Signal[], formula: Record<string, number>, extra: Partial<AtomInventoryInput> = {}): AtomInventoryInput =>
  ({signals, formula, solvent: 'CDCl3', coverageComplete: true, ...extra});
const classes = (r: ReturnType<typeof buildAtomInventory>, groupIndex: number) => new Set(r.alternatives.flatMap(a => a.groups[groupIndex].shiftClasses));
const ctx = (extra: Partial<ClassifyContext> = {}): ClassifyContext => ({solvent: 'CDCl3', formulaElements: new Set(['C', 'H', 'O']), nitrogenAllowed: false, ir: {present: false, coversAldehydeRegion: false, strongCarbonyl: null}, ...extra});
const ids = (r: ReturnType<typeof classifySignal>) => r.matches.map(m => m.classId);

describe('integral → H count', () => {
  it('k = 1: integrals 9:2:2:1 against H = 14', () => {
    const r = buildAtomInventory(input([sig('a', 1.29, 9, 's'), sig('b', 6.76, 2, 'd'), sig('c', 7.27, 2, 'd'), sig('d', 4.6, 1, 's', {broad: true})], {C: 10, H: 14, O: 1}));
    expect(r.status).toBe('BUILT');
    expect(r.ratioSum).toBe(14);
    expect(r.kCombinations.map(c => [c.k, c.extraExchangeable])).toEqual([[1, 0]]);
    expect(r.alternatives[0].groups.map(g => g.hTotal)).toEqual([9, 2, 2, 1]);
  });
  it('k = 2: integrals 4:4:2:6 (simplest ratio 2:2:1:3, S = 8) against H = 16', () => {
    const r = buildAtomInventory(input([sig('a', 7.3, 4, 'm'), sig('b', 7.2, 4, 'm'), sig('c', 7.12, 2, 'm'), sig('d', 1.68, 6, 's')], {C: 15, H: 16}));
    expect(r.ratioSum).toBe(8);
    expect(r.kCombinations.map(c => [c.k, c.extraExchangeable, c.ratioSum])).toEqual([[2, 0, 8]]);
    expect(r.alternatives.length).toBeGreaterThan(0);
    for (const a of r.alternatives) { expect(a.k).toBe(2); expect(a.groups.map(g => g.hTotal)).toEqual([4, 4, 2, 6]); }
  });
  it('k = 3, and a formula that no k ≤ 3 / e ≤ 2 explains gives no alternative and a reason', () => {
    const three = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.3, 3, 's')], {C: 6, H: 6}));
    expect(three.kCombinations.map(c => [c.k, c.extraExchangeable])).toContainEqual([3, 0]);   // ratio 1:1, S = 2, H = 6
    expect(three.alternatives.some(a => a.k === 3 && a.groups.every(g => g.hTotal === 3))).toBe(true);
    const none = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.3, 2, 's')], {C: 6, H: 13}));
    expect(none.status).toBe('BUILT');
    expect(none.alternatives).toEqual([]);
    expect(none.reason).toMatch(/不相容/);
  });
  it('automatic solvent candidates (optional) are not part of the inventory', () => {
    const r = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.3, 3, 's'), sig('solv', 7.26, null, 's', {optional: true})], {C: 6, H: 6}));
    expect(r.status).toBe('BUILT');
    expect(r.signals.map(s => s.observationId)).toEqual(['a', 'b']);
  });
});

describe('equivalent H → atoms', () => {
  const r = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.0, 1, 's')], {C: 8, H: 8}));
  const firstOrder = (g: number) => { const seen: number[] = []; for (const a of r.alternatives) { const h = a.groups[g].hPerAtom; if (!seen.includes(h)) seen.push(h); } return seen; };
  it('a 6H signal gives 2×CH3, 3×CH2 and 6×CH, in the order CH3 → CH2 → CH', () => {
    expect(r.kCombinations.map(c => [c.k, c.extraExchangeable])).toEqual([[2, 0]]);
    const combos = new Set(r.alternatives.map(a => `${a.groups[0].atomCount}x${a.groups[0].hPerAtom}`));
    expect(combos).toEqual(new Set(['2x3', '3x2', '6x1']));
    expect(firstOrder(0)).toEqual([3, 2, 1]);
  });
  it('a 2H signal gives 1×CH2 and 2×CH (no CH3)', () => {
    expect(new Set(r.alternatives.map(a => `${a.groups[1].atomCount}x${a.groups[1].hPerAtom}`))).toEqual(new Set(['1x2', '2x1']));
  });
});

describe('singlet rule', () => {
  const group0 = (signals: H1Signal[], formula: Record<string, number>, solvent = 'CDCl3') => {
    const r = buildAtomInventory(input(signals, formula, {solvent}));
    return r.alternatives.find(a => !a.groups[0].aromatic && !a.groups[0].exchangeable)!.groups[0];
  };
  it('applies to a sharp, isolated singlet', () => expect(group0([sig('a', 1.2, 3, 's'), sig('b', 2.0, 1, 's')], {C: 8, H: 8}).singletNoHNeighbors).toBe(true));
  it('does not apply when another signal is within 0.10 ppm', () => expect(group0([sig('a', 1.20, 3, 's'), sig('b', 1.28, 1, 's')], {C: 8, H: 8}).singletNoHNeighbors).toBe(false));
  it('does apply when the other signal is just outside 0.10 ppm', () => expect(group0([sig('a', 1.20, 3, 's'), sig('b', 1.32, 1, 's')], {C: 8, H: 8}).singletNoHNeighbors).toBe(true));
  it('does not apply to a broad singlet or to a doublet', () => {
    expect(group0([sig('a', 1.2, 3, 's', {broad: true}), sig('b', 2.0, 1, 's')], {C: 8, H: 8}).singletNoHNeighbors).toBe(false);
    expect(group0([sig('a', 1.2, 3, 'd'), sig('b', 2.0, 1, 's')], {C: 8, H: 8}).singletNoHNeighbors).toBe(false);
  });
  it('does not apply to exchangeable H', () => {
    const r = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('oh', 5.0, 1, 's', {exchangeable: true})], {C: 3, H: 4, O: 1}));
    expect(r.alternatives.length).toBeGreaterThan(0);
    for (const a of r.alternatives) { expect(a.groups[1].exchangeable).toBe(true); expect(a.groups[1].singletNoHNeighbors).toBe(false); }
  });
});

describe('shift classes (D5)', () => {
  it('overlapping classes each give a reading: 6.9 ppm is ARO_CH and VINYL_CH, 3.2 ppm is O_CH and ALPHA_CH, 2.0 ppm is ALPHA_CH and ALKYL_CH', () => {
    expect(ids(classifySignal(sig('a', 6.9, 1, 'd'), ctx()))).toEqual(['ARO_CH', 'VINYL_CH']);
    expect(ids(classifySignal(sig('a', 3.2, 1, 't'), ctx()))).toEqual(['O_CH', 'ALPHA_CH']);
    expect(ids(classifySignal(sig('a', 2.0, 1, 't'), ctx()))).toEqual(['ALPHA_CH', 'ALKYL_CH']);
    const r = buildAtomInventory(input([sig('a', 6.9, 2, 'd'), sig('b', 1.3, 6, 's')], {C: 12, H: 16}));
    expect(classes(r, 0)).toEqual(new Set(['ARO_CH', 'VINYL_CH']));
  });
  it('O_CH needs O in the formula; N_CH needs N and N evidence', () => {
    expect(ids(classifySignal(sig('a', 3.2, 1, 't'), ctx({formulaElements: new Set(['C', 'H'])})))).toEqual(['ALPHA_CH']);
    expect(ids(classifySignal(sig('a', 3.2, 1, 't'), ctx({formulaElements: new Set(['C', 'H', 'N']), nitrogenAllowed: false})))).toEqual(['ALPHA_CH']);
    expect(ids(classifySignal(sig('a', 3.2, 1, 't'), ctx({formulaElements: new Set(['C', 'H', 'N']), nitrogenAllowed: true})))).toEqual(['N_CH', 'ALPHA_CH']);
  });
  describe('D5-1: a signal already marked exchangeable is only EXCHANGEABLE', () => {
    it('positive', () => expect(ids(classifySignal(sig('a', 3.2, 1, 't', {exchangeable: true}), ctx()))).toEqual(['EXCHANGEABLE']));
    it('negative: the same signal without the mark keeps its carbon classes', () => expect(ids(classifySignal(sig('a', 3.2, 1, 't'), ctx()))).toEqual(['O_CH', 'ALPHA_CH']));
  });
  describe('D5-2: singlets get an extra EXCHANGEABLE (OH) reading by solvent', () => {
    it('DMSO-d6: a sharp 9.2 ppm singlet is also OH (4–12)', () => expect(ids(classifySignal(sig('a', 9.2, 1, 's'), ctx({solvent: 'DMSO-d6'})))).toEqual(['ALDEHYDE', 'EXCHANGEABLE']));
    it('CDCl3: a sharp 9.2 ppm singlet is not OH (0.5–6), only an aldehyde', () => expect(ids(classifySignal(sig('a', 9.2, 1, 's'), ctx()))).toEqual(['ALDEHYDE']));
    it('CDCl3: a sharp 5.0 ppm singlet is also OH', () => expect(ids(classifySignal(sig('a', 5.0, 1, 's'), ctx()))).toContain('EXCHANGEABLE'));
    it('DMSO-d6: a sharp 2.0 ppm singlet is not OH (below 4)', () => expect(ids(classifySignal(sig('a', 2.0, 1, 's'), ctx({solvent: 'DMSO-d6'})))).not.toContain('EXCHANGEABLE'));
    it('unknown solvent uses the union (0.5–12): both 2.0 and 9.2 singlets get the OH reading', () => {
      expect(ids(classifySignal(sig('a', 2.0, 1, 's'), ctx({solvent: 'Unknown'})))).toContain('EXCHANGEABLE');
      expect(ids(classifySignal(sig('a', 9.2, 1, 's'), ctx({solvent: 'Unknown'})))).toContain('EXCHANGEABLE');
    });
    it('a doublet gets no extra OH reading', () => expect(ids(classifySignal(sig('a', 5.0, 1, 'd'), ctx()))).not.toContain('EXCHANGEABLE'));
    it('inventory level: a 1H singlet at 9.2 in DMSO-d6 yields an OH reading for a phenol-like formula', () => {
      const r = buildAtomInventory(input([sig('a', 9.2, 1, 's'), sig('b', 1.3, 9, 's')], {C: 10, H: 10, O: 1}, {solvent: 'DMSO-d6'}));
      expect(r.alternatives.some(a => a.groups[0].exchangeable && a.groups[0].element === 'O')).toBe(true);
    });
  });
  describe('D5-3: ALDEHYDE needs a strong C=O in 1680–1740 cm-1 when the IR covers that window', () => {
    const ir = (over: Partial<ClassifyContext['ir']>) => ctx({ir: {present: true, coversAldehydeRegion: true, strongCarbonyl: true, ...over}});
    it('strong band: kept', () => expect(ids(classifySignal(sig('a', 9.8, 1, 't'), ir({})))).toEqual(['ALDEHYDE']));
    it('IR covers the window and has no strong band: removed', () => expect(ids(classifySignal(sig('a', 9.8, 1, 't'), ir({strongCarbonyl: false}))).includes('ALDEHYDE')).toBe(false));
    it('no IR: kept', () => expect(ids(classifySignal(sig('a', 9.8, 1, 't'), ctx()))).toEqual(['ALDEHYDE']));
    it('IR does not cover the window: kept', () => expect(ids(classifySignal(sig('a', 9.8, 1, 't'), ir({coversAldehydeRegion: false, strongCarbonyl: false})))).toEqual(['ALDEHYDE']));
    it('IR covers but the intensities are unknown: kept (with a note)', () => {
      const r = classifySignal(sig('a', 9.8, 1, 't'), ir({strongCarbonyl: null}));
      expect(ids(r)).toEqual(['ALDEHYDE']);
      expect(r.notes.join()).toMatch(/強度未知/);
    });
    it('inventory level: with the aldehyde removed and no other class the formula has no alternative', () => {
      const r = buildAtomInventory(input([sig('a', 9.8, 1, 't'), sig('b', 7.4, 5, 'm')], {C: 7, H: 6, O: 1}, {ir: {present: true, coversAldehydeRegion: true, strongCarbonyl: false}}));
      expect(r.alternatives).toEqual([]);
      expect(r.voided.some(v => /9.8/.test(v.reason))).toBe(true);
      const withBand = buildAtomInventory(input([sig('a', 9.8, 1, 't'), sig('b', 7.4, 5, 'm')], {C: 7, H: 6, O: 1}, {ir: {present: true, coversAldehydeRegion: true, strongCarbonyl: true}}));
      expect(withBand.alternatives.length).toBeGreaterThan(0);
    });
  });
  describe('D5-4: VINYL_CH is 4.5–7.5 ppm; the overlap with ARO_CH keeps both readings', () => {
    it('7.4: both', () => expect(ids(classifySignal(sig('a', 7.4, 1, 'd'), ctx()))).toEqual(['ARO_CH', 'VINYL_CH']));
    it('7.6: aromatic only', () => expect(ids(classifySignal(sig('a', 7.6, 1, 'd'), ctx()))).toEqual(['ARO_CH']));
    it('4.5: vinyl (and O_CH)', () => expect(ids(classifySignal(sig('a', 4.5, 1, 'd'), ctx()))).toContain('VINYL_CH'));
    it('4.4: no vinyl', () => expect(ids(classifySignal(sig('a', 4.4, 1, 'd'), ctx()))).not.toContain('VINYL_CH'));
    it('6.2: vinyl only (below the aromatic window)', () => expect(ids(classifySignal(sig('a', 6.2, 1, 'd'), ctx()))).toEqual(['VINYL_CH']));
  });
});

describe('extra exchangeable H (OH/NH not in the integrals) 0–2', () => {
  const three = [sig('a', 2.3, 3, 's'), sig('b', 7.1, 2, 'd'), sig('c', 6.9, 2, 'd')];   // S = 7
  it('one missing OH: H = S + 1', () => {
    const r = buildAtomInventory(input(three, {C: 7, H: 8, O: 1}));
    expect(r.kCombinations.map(c => [c.k, c.extraExchangeable])).toEqual([[1, 1]]);
    const a = r.alternatives.find(x => x.rings.aromaticCh === 4)!;
    expect(a.extraExchangeable).toBe(1);
    expect(a.extraElement).toBe('O');
    expect(a.zeroHAtoms.O ?? 0).toBe(0);
  });
  it('two missing OH need two O: H = S + 2 with one O has no alternative', () => {
    const two = buildAtomInventory(input(three, {C: 7, H: 9, O: 2}));
    expect(two.kCombinations.map(c => [c.k, c.extraExchangeable])).toEqual([[1, 2]]);
    expect(two.alternatives.some(a => a.extraExchangeable === 2)).toBe(true);
    const short = buildAtomInventory(input(three, {C: 7, H: 9, O: 1}));
    expect(short.alternatives).toEqual([]);
    expect(short.voided.some(v => /額外 2 個可交換 H/.test(v.reason))).toBe(true);
  });
  it('H = S: no extra exchangeable H is needed', () => {
    const r = buildAtomInventory(input(three, {C: 7, H: 7, O: 1}));
    expect(r.kCombinations.map(c => [c.k, c.extraExchangeable])).toEqual([[1, 0]]);
  });
  it('more than 2 missing exchangeable H gives no combination', () => {
    const r = buildAtomInventory(input(three, {C: 7, H: 10, O: 3}));
    expect(r.kCombinations).toEqual([]);
    expect(r.alternatives).toEqual([]);
  });
});

describe('integer-ratio readings', () => {
  it('integrals 1 and 9 are read as 1:9 (S = 10) and, with a larger unit, as 1:8 plus one unobserved OH — both are kept', () => {
    const r = buildAtomInventory(input([sig('a', 9.2, 1, 's'), sig('b', 1.3, 9, 's')], {C: 10, H: 10, O: 1}, {solvent: 'DMSO-d6'}));
    expect(r.kCombinations.map(c => [c.ratio.join(':'), c.k, c.extraExchangeable])).toEqual([['1:9', 1, 0], ['1:8', 1, 1]]);
    expect(admissibleRatios([1, 9]).slice(0, 2)).toEqual([[1, 8], [1, 9]]);
  });
  it('the same hydrogens per signal from a finer unit (ratio x k) are one reading, not two', () => {
    // 3:3 can be 1:1 with k = 3 or 3:3 with k = 1; both give 3H + 3H
    const r = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.3, 3, 's')], {C: 6, H: 6}));
    expect(r.kCombinations.filter(c => c.extraExchangeable === 0)).toHaveLength(1);
  });
});

describe('no integral', () => {
  it('a missing integral → NOT_AVAILABLE with the reason (v1.1.7 path is used)', () => {
    const r = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.0, null, 's')], {C: 8, H: 8}));
    expect(r.status).toBe('NOT_AVAILABLE');
    expect(r.reason).toMatch(/沒有積分/);
    expect(r.alternatives).toEqual([]);
  });
  it('no signals, or integrals that are no integer ratio → NOT_AVAILABLE', () => {
    expect(buildAtomInventory(input([], {C: 1, H: 4})).status).toBe('NOT_AVAILABLE');
    const odd = buildAtomInventory(input([sig('a', 1.2, 1, 's'), sig('b', 2.0, 1.37, 's'), sig('c', 3.0, 2.61, 's'), sig('d', 4.0, 1.9, 's')], {C: 8, H: 8}));
    expect(odd.status).toBe('NOT_AVAILABLE');
    expect(odd.reason).toMatch(/整數比/);
  });
});

describe('alternative cap (D8) and truncation', () => {
  it('more than 64 readings per (k, e): the best 64 are kept and INVENTORY_ALTERNATIVES_TRUNCATED is reported', () => {
    const signals = [sig('a', 1.0, 6, 's'), sig('b', 1.2, 6, 's'), sig('c', 1.4, 6, 's'), sig('d', 1.6, 6, 's'), sig('e', 1.8, 5, 's')];
    const r = buildAtomInventory(input(signals, {C: 30, H: 29}));
    expect(r.kCombinations.map(c => [c.k, c.extraExchangeable])).toEqual([[1, 0]]);
    expect(r.alternatives).toHaveLength(V12_CONFIG.maxInventoryAlternatives);
    expect(r.truncated).toBe(true);
    expect(r.incompleteReasons).toContain('INVENTORY_ALTERNATIVES_TRUNCATED');
    // best first: the first alternative is the most common reading (all CH3)
    expect(r.alternatives[0].groups.map(g => g.hPerAtom)).toEqual([3, 3, 3, 3, 1]);
  });
  it('a smaller number of readings is not truncated', () => {
    const r = buildAtomInventory(input([sig('a', 1.2, 3, 's'), sig('b', 2.0, 1, 's')], {C: 8, H: 8}));
    expect(r.truncated).toBe(false);
    expect(r.incompleteReasons).toEqual([]);
  });
});

describe('aromatic ring templates (D4)', () => {
  const benzene = V12_CONFIG.ringTemplates.find(t => t.id === 'benzene')!;
  const naphthalene = V12_CONFIG.ringTemplates.find(t => t.id === 'naphthalene')!;
  it('benzene: number of substitution patterns per CH count (ortho/meta/para = 3, mono = 1, penta = 1)', () => {
    expect([1, 2, 3, 4, 5, 6].map(ch => substitutionPatterns(benzene, ch).length)).toEqual([1, 3, 3, 3, 1, 1]);
    expect(substitutionPatterns(benzene, 4).map(p => p.length)).toEqual([2, 2, 2]);
  });
  it('naphthalene: mono = 2 (1- and 2-), di = 10', () => {
    expect(substitutionPatterns(naphthalene, 7)).toHaveLength(2);
    expect(substitutionPatterns(naphthalene, 6)).toHaveLength(10);
  });
  it('the listed symmetries really are automorphisms of every template graph', () => {
    for (const t of V12_CONFIG.ringTemplates) {
      const edge = new Set(t.bonds.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
      for (const perm of t.symmetries) {
        expect([...perm].sort((a, b) => a - b)).toEqual(t.elements.map((_, i) => i));
        t.elements.forEach((el, i) => expect(t.elements[perm[i]]).toBe(el));
        for (const [a, b] of t.bonds) expect(edge.has(`${Math.min(perm[a], perm[b])}-${Math.max(perm[a], perm[b])}`)).toBe(true);
      }
    }
  });
  it('every template Kekulé form saturates its atoms (CH: 3 bonds + 1 H; fusion carbon / ring N: closed)', () => {
    for (const t of V12_CONFIG.ringTemplates) {
      const sum = t.elements.map(() => 0);
      for (const [a, b, o] of t.bonds) { sum[a] += o; sum[b] += o; }
      t.elements.forEach((el, i) => expect(sum[i] + (t.peripheral.includes(i) ? 1 : 0)).toBe(el === 'N' ? 3 : 4));
    }
  });
  it('4 aromatic CH in a C10 formula: one benzene with the ortho/meta/para patterns; naphthalene needs more carbons than the formula has', () => {
    const r = buildAtomInventory(input([sig('a', 7.27, 2, 'd'), sig('b', 6.76, 2, 'd'), sig('c', 1.29, 9, 's'), sig('d', 4.6, 1, 's', {broad: true})], {C: 10, H: 14, O: 1}));
    const withRing = r.alternatives.filter(a => a.rings.aromaticCh === 4);
    expect(withRing.length).toBeGreaterThan(0);
    for (const a of withRing) { expect(a.rings.rings.map(x => x.templateId)).toEqual(['benzene']); expect(a.rings.rings[0].substituentPositionPatterns).toHaveLength(3); }
  });
  it('pyridine is only a template when nitrogen evidence allows it', () => {
    const signals = [sig('a', 8.5, 2, 'd'), sig('b', 7.3, 2, 'd'), sig('c', 2.4, 3, 's')];
    const no = buildAtomInventory(input(signals, {C: 6, H: 7, N: 1}));
    expect(no.alternatives.flatMap(a => a.rings.rings.map(x => x.templateId))).not.toContain('pyridine');
    const yes = buildAtomInventory(input(signals, {C: 6, H: 7, N: 1}, {nitrogenAllowed: true}));
    expect(yes.alternatives.flatMap(a => a.rings.rings.map(x => x.templateId))).toContain('pyridine');
  });
  it('AROMATIC_TEMPLATE_LIMITED: 16 aromatic CH cannot be explained by 3 benzene/naphthalene rings', () => {
    const r = buildAtomInventory(input([sig('a', 7.5, 6, 'm'), sig('b', 7.3, 5, 'm'), sig('c', 7.1, 5, 'm')], {C: 24, H: 16}));
    expect(r.aromaticLimited.length).toBeGreaterThan(0);
    expect(r.aromaticLimited[0].aromaticCh).toBe(16);
    expect(r.incompleteReasons).toContain('AROMATIC_TEMPLATE_LIMITED');
  });
  it('AROMATIC_TEMPLATE_LIMITED also follows the configured ring limit (maxAromaticRings = 1 cannot hold 10 aromatic CH)', () => {
    const old = V12_CONFIG.maxAromaticRings;
    V12_CONFIG.maxAromaticRings = 1;
    try {
      const r = buildAtomInventory(input([sig('a', 7.3, 4, 'm'), sig('b', 7.2, 4, 'm'), sig('c', 7.12, 2, 'm'), sig('d', 1.68, 6, 's')], {C: 15, H: 16}));
      expect(r.incompleteReasons).toContain('AROMATIC_TEMPLATE_LIMITED');
      expect(r.aromaticLimited.some(x => x.aromaticCh === 10)).toBe(true);
    } finally { V12_CONFIG.maxAromaticRings = old; }
  });
});

describe('inventoryAdapter → fragment sets', () => {
  const ethylBenzoate = () => buildAtomInventory(input([sig('a', 8.04, 2, 'm'), sig('b', 7.5, 1, 'm'), sig('c', 7.4, 2, 'm'), sig('d', 4.37, 2, 'q'), sig('e', 1.39, 3, 't')], {C: 9, H: 10, O: 2}));
  it('atoms become fixed-H open single-atom fragments, rings become templates (CH closed with one H, substituent open with none)', () => {
    const alt = ethylBenzoate().alternatives[0] as InventoryAlternative;
    const out = inventoryToFragmentSets(alt);
    expect(out.sets).toHaveLength(1);
    const frags = out.sets[0].fragments;
    const ring = frags.find(f => f.id.startsWith('ring'))!;
    expect(ring.atoms.filter(a => a.fixedH === 1)).toHaveLength(5);
    expect(ring.atoms.filter(a => a.open && !a.fixedH)).toHaveLength(1);
    expect(ring.bonds.every(b => b.aromatic)).toBe(true);
    const ch3 = frags.find(f => f.atoms[0].fixedH === 3)!;
    expect(ch3.atoms[0]).toEqual({element: 'C', fixedH: 3, open: true});
    expect(frags.find(f => f.id === 'atoms:O|0')!.count).toBe(2);
  });
  it('a ring with several substitution patterns gives one set per pattern', () => {
    const alt = ethylBenzoate().alternatives.find(a => a.rings.rings.some(r => r.ch === 4))!;
    const out = inventoryToFragmentSets(alt);
    expect(out.sets.length).toBe(3);
    expect(new Set(Object.values(out.info).map(i => i.patternLabel)).size).toBe(3);
  });
  it('two identical rings become one multiset of patterns (no permuted duplicates)', () => {
    const r = buildAtomInventory(input([sig('a', 7.3, 4, 'm'), sig('b', 7.2, 4, 'm'), sig('c', 7.12, 2, 'm'), sig('d', 1.68, 6, 's')], {C: 15, H: 16}));
    const twice = r.alternatives.find(a => a.rings.rings.length === 2 && a.rings.rings.every(x => x.ch === 4))!;
    expect(inventoryToFragmentSets(twice).sets).toHaveLength(6);   // multisets of size 2 out of 3 patterns
  });
  it('the existing enumerator runs a set and the ethyl-benzoate-shaped structure is among the outputs (COMPLETE)', async () => {
    const alt = ethylBenzoate().alternatives[0];
    const out = inventoryToFragmentSets(alt);
    const r = await enumerateStructures({formula: 'C9H10O2', alternatives: out.sets, budget: {maxStates: 5e7, timeMs: 60000}});
    expect(r.status).toBe('COMPLETE');
    expect(r.candidates.map(c => c.smiles)).toContain(canonicalizeMolecule('CCOC(=O)c1ccccc1').canonical);
  }, 90000);
  it('the pattern expansion is cut at maxPatternSetsPerAlternative and reported', () => {
    const old = V12_CONFIG.maxPatternSetsPerAlternative;
    V12_CONFIG.maxPatternSetsPerAlternative = 2;
    try {
      const alt = ethylBenzoate().alternatives.find(a => a.rings.rings.some(r => r.ch === 4))!;
      const out = inventoryToFragmentSets(alt);
      expect(out.sets).toHaveLength(2);
      expect(out.truncated).toBe(true);
    } finally { V12_CONFIG.maxPatternSetsPerAlternative = old; }
  });
});
