import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {canonicalizeMolecule, initializeRDKit, matchesSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';
import {createExhaustiveGenerator} from '../../src/engines/enumeration/exhaustiveGenerator';
import type {StructureGenerator} from '../../src/engines/composition/structureGenerator';
import type {ObservedEvidence} from '../../src/engines/reasoning/types';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {buildAtomInventory} from '../../src/engines/constraints/atomInventory';
import {h1SignalsFromObservations} from '../../src/engines/constraints/v12Evidence';
import type {NMRSolvent} from '../../src/types/spectrum';

// Stage 2 acceptance through the generator (the same entry the pipeline uses). All spectra are SYNTHETIC generic shapes made for these tests;
// the tests check program behaviour (target present in the output, completeness flags, diagnostics) — never chemical accuracy or ranking.
beforeAll(() => initializeRDKit(), 60000);
afterEach(() => { V12_CONFIG.useV12Constraints = false; });

let counter = 0;
const h1 = (value: number, integral: number | null, mult: string | null, o: {j?: number[]; broad?: boolean; solvent?: NMRSolvent; exchangeable?: boolean} = {}): ObservedEvidence => ({
  id: `1H_NMR:t:${value}`, signalId: `s${counter++}`, sourceId: 't', modality: '1H_NMR', value, unit: 'ppm', relativeIntensity: null, relativeIntegral: integral, multiplicity: mult, jHz: o.j ?? [],
  shape: o.broad ? 'BROAD' : 'NARROW', uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {solvent: o.solvent ?? 'CDCl3'}, coverage: 'CONFIRMED_COMPLETE', unknown: [],
  ...(o.exchangeable ? {exchangeable: true} : {}),
});
const ir = (value: number, relativeIntensity: number): ObservedEvidence => ({
  id: `IR:t:${value}`, signalId: `i${counter++}`, sourceId: 't', modality: 'IR', value, unit: 'cm-1', relativeIntensity, relativeIntegral: null, multiplicity: null, jHz: [], shape: 'UNKNOWN',
  uncertainty: null, origin: 'MANUAL', userOverride: false, metadata: {}, coverage: 'PARTIAL', unknown: [],
});
const legacyStub: StructureGenerator = {generateStructures: async () => ({smiles: [], status: 'BOUNDED', visited: 0, note: 'stub', termination: 'GRAMMAR_EXHAUSTED', complete: false, partialHypotheses: [], rejectedByComposition: 0})};
const generator = createExhaustiveGenerator(legacyStub);
const canon = (s: string) => canonicalizeMolecule(s).canonical;

async function run(formula: string, observations: ObservedEvidence[], opts: {timeMs?: number; irCovers?: boolean; nitrogenAllowed?: boolean; v12?: boolean} = {}) {
  V12_CONFIG.useV12Constraints = opts.v12 ?? true;
  try {
    const t = performance.now();
    const out = await generator.generateStructures({
      formula, hints: {}, budget: {timeMs: 60000, maxStates: 1e8, maxResults: 48, maxFrontier: 1, beamWidth: 1},
      enumerationBudget: {timeMs: opts.timeMs ?? 10000, maxStates: 3e8, maxCandidates: 50000},
      constraintEvidence: {observations, irCoversAldehydeRegion: opts.irCovers ?? false, nitrogenAllowed: opts.nitrogenAllowed ?? false},
    });
    return {out, run: out.enumeration!.runs[0], v12: out.enumeration!.runs[0].v12, ms: performance.now() - t};
  } finally { V12_CONFIG.useV12Constraints = false; }
}

// ---- the generic case shapes (docs/P1C_DESIGN.md §5, review C3) ----
const diarylM = () => [h1(7.30, 4, 'm'), h1(7.20, 4, 'm'), h1(7.12, 2, 'm'), h1(1.68, 6, 's')];
const diarylStrict = () => [h1(7.30, 4, 'd', {j: [7.5]}), h1(7.20, 4, 't', {j: [7.5]}), h1(7.12, 2, 't', {j: [7.3]}), h1(1.68, 6, 's')];
const tBuPhenol = () => [h1(7.27, 2, 'd', {j: [8.6]}), h1(6.76, 2, 'd', {j: [8.6]}), h1(4.6, 1, 's', {broad: true}), h1(1.29, 9, 's')];
const tBuPhenolDmso = () => [h1(9.15, 1, 's', {solvent: 'DMSO-d6'}), h1(7.17, 2, 'd', {j: [8.6], solvent: 'DMSO-d6'}), h1(6.67, 2, 'd', {j: [8.6], solvent: 'DMSO-d6'}), h1(1.22, 9, 's', {solvent: 'DMSO-d6'})];
const ethylEster = () => [h1(8.04, 2, 'm'), h1(7.55, 1, 'm'), h1(7.43, 2, 'm'), h1(4.37, 2, 'q', {j: [7.1]}), h1(1.39, 3, 't', {j: [7.1]})];
const dimethoxy = () => [h1(6.84, 4, 's'), h1(3.77, 6, 's')];
const methylNaphthalene = () => [h1(7.80, 3, 'm'), h1(7.62, 1, 's'), h1(7.45, 2, 'm'), h1(7.33, 1, 'd', {j: [8.4]}), h1(2.51, 3, 's')];
const naphthol = () => [h1(7.78, 2, 'm'), h1(7.70, 1, 'd', {j: [8.2]}), h1(7.42, 1, 't', {j: [7.5]}), h1(7.31, 1, 't', {j: [7.5]}), h1(7.12, 1, 'd', {j: [2.2]}), h1(7.10, 1, 'dd', {j: [8.8, 2.4]}), h1(5.0, 1, 's', {broad: true})];

const CASES: {name: string; formula: string; obs: () => ObservedEvidence[]; target: string; ir?: ObservedEvidence[]}[] = [
  {name: 'symmetric diaryl (multiplets)', formula: 'C15H16', obs: diarylM, target: 'CC(C)(c1ccccc1)c1ccccc1'},
  {name: 'symmetric diaryl (resolved multiplicities, equivalence required)', formula: 'C15H16', obs: diarylStrict, target: 'CC(C)(c1ccccc1)c1ccccc1'},
  {name: 'tert-butyl phenol type (CDCl3, broad OH)', formula: 'C10H14O', obs: tBuPhenol, target: 'CC(C)(C)c1ccc(O)cc1'},
  {name: 'tert-butyl phenol type (DMSO-d6, sharp OH singlet)', formula: 'C10H14O', obs: tBuPhenolDmso, target: 'CC(C)(C)c1ccc(O)cc1'},
  {name: 'ethyl ester type', formula: 'C9H10O2', obs: ethylEster, target: 'CCOC(=O)c1ccccc1'},
  {name: 'ethyl ester type with a strong C=O band', formula: 'C9H10O2', obs: () => [...ethylEster(), ir(1720, 100), ir(2980, 30), ir(1270, 70)], target: 'CCOC(=O)c1ccccc1'},
  {name: 'p-dimethoxybenzene type', formula: 'C8H10O2', obs: dimethoxy, target: 'COc1ccc(OC)cc1'},
  {name: 'methylnaphthalene type', formula: 'C11H10', obs: methylNaphthalene, target: 'Cc1ccc2ccccc2c1'},
  {name: 'naphthol type', formula: 'C10H8O', obs: naphthol, target: 'Oc1ccc2ccccc2c1'},
];

describe('C3 generic cases: the target is among the outputs (no ranking is asserted)', () => {
  it.each(CASES)('$name', async c => {
    const r = await run(c.formula, c.obs());
    expect(r.v12?.path, 'inventory path used').toBe('INVENTORY');
    expect(r.out.smiles, `${c.name}: ${r.run.status} ${r.run.incompleteReasons.join()}`).toContain(canon(c.target));
    expect(r.out.enumeration!.runs[0].used).toBe(true);
    console.log('V12_C3 ' + JSON.stringify({name: c.name, formula: c.formula, status: r.run.status, complete: r.run.complete, incomplete: r.run.incompleteReasons, candidates: r.out.smiles.length, alternatives: r.v12?.inventory?.alternatives, sets: r.v12?.runs.reduce((a, x) => a + x.sets, 0), ms: Math.round(r.ms)}));
  }, 120000);

  it('the strict-multiplicity reading is a subset of the multiplet reading (equivalence only removes); both are COMPLETE once the vinyl reading of the aromatic window is off', async () => {
    const vinyl = V12_CONFIG.shiftClasses.find(c => c.id === 'VINYL_CH')!;
    const old = vinyl.rangePpm;
    vinyl.rangePpm = [99, 100];   // test-only: the vinyl reading of 6.3–7.5 ppm is what makes these runs hit the time budget
    try {
      const a = await run('C15H16', diarylM(), {timeMs: 60000}), b = await run('C15H16', diarylStrict(), {timeMs: 60000});
      expect(a.run.complete).toBe(true);
      expect(b.run.complete).toBe(true);
      const A = new Set(a.out.smiles);
      expect(b.out.smiles.every(s => A.has(s))).toBe(true);
      expect(b.out.smiles.length).toBeLessThanOrEqual(a.out.smiles.length);
      expect(b.out.smiles).toContain(canon('CC(C)(c1ccccc1)c1ccccc1'));
      console.log('V12_C3_NOVINYL ' + JSON.stringify({multiplet: {candidates: a.out.smiles.length, steps: a.run.visited, ms: Math.round(a.ms)}, strict: {candidates: b.out.smiles.length, steps: b.run.visited, ms: Math.round(b.ms)}}));
    } finally { vinyl.rangePpm = old; }
  }, 180000);

  it('the DMSO sharp 9.15 ppm singlet needs the OH reading; the CDCl3 version of the same signal (9.15 is outside 0.5–6) has no OH reading and loses the target', async () => {
    const asCdcl3 = tBuPhenolDmso().map(o => ({...o, metadata: {solvent: 'CDCl3' as NMRSolvent}}));
    const r = await run('C10H14O', asCdcl3);
    expect(r.out.smiles).not.toContain(canon('CC(C)(C)c1ccc(O)cc1'));
  }, 120000);
});

describe('Q1 vinyl readings: constrained, run last, reported separately', () => {
  it('with a short budget the readings without a vinyl reading finish, the run is INCOMPLETE with VINYL_READINGS_BUDGET (not TIME_BUDGET), and the target is there', async () => {
    const r = await run('C15H16', diarylM(), {timeMs: 3000});
    expect(r.run.complete).toBe(false);
    expect(r.run.incompleteReasons).toContain('VINYL_READINGS_BUDGET');
    expect(r.run.incompleteReasons).not.toContain('TIME_BUDGET');
    expect(r.out.smiles).toContain(canon('CC(C)(c1ccccc1)c1ccccc1'));
    expect(r.out.termination).toBe('TIME_BUDGET');
  }, 60000);
  it('the sets of readings without a vinyl reading are enumerated before the vinyl ones', async () => {
    const r = await run('C15H16', diarylM(), {timeMs: 3000});
    const vinylAlt = new Set((buildAtomInventory({signals: h1SignalsFromObservations(diarylM()).signals, formula: {C: 15, H: 16}, solvent: 'CDCl3', coverageComplete: true}).alternatives).filter(a => a.hasVinyl).map(a => a.id));
    const kinds = r.run.readings.map(x => vinylAlt.has(x.id.split('/')[0]));
    const firstVinyl = kinds.indexOf(true);
    expect(firstVinyl).toBeGreaterThan(0);
    expect(kinds.slice(firstVinyl).every(Boolean)).toBe(true);
  }, 60000);
  it('every output of a vinyl reading has a non-aromatic C=C at those atoms (spot check: styrene shape)', async () => {
    const obs = [h1(7.3, 5, 'm'), h1(6.7, 1, 'dd', {j: [17.5, 10.9]}), h1(5.5, 2, 'm')];   // the two =CH2 hydrogens as one 2H signal (diastereotopic H are not split by the inventory)
    const r = await run('C8H8', obs, {timeMs: 20000});
    expect(r.out.smiles).toContain(canon('C=Cc1ccccc1'));
  }, 60000);
});

describe('C2 overlap: a C–O reading and a ring reading may share the phenolic carbon', () => {
  const flex = (...e: string[]) => e.map(element => ({element, flex: true}));
  const ringFrag = {id: 'ring', atoms: flex('C', 'C', 'C', 'C', 'C', 'C'), bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]].map(([a, b, order]) => ({a, b, order: order as 1 | 2, aromatic: true}))};
  const coFrag = {id: 'C-O', atoms: flex('C', 'O'), bonds: [{a: 0, b: 1, order: 1 as const}]};
  const arylOH = (smiles: string[]) => smiles.filter(s => matchesSMARTS(s, 'c[OX2H]') === true);
  const cresol = canon('Cc1ccc(O)cc1');

  it('old semantics (v1.1.7 reading, disjoint fragments): C7H8O with a ring and a C–O fragment has NO aryl-OH output; C6H6O has none at all', async () => {
    const c7 = await enumerateStructures({formula: 'C7H8O', alternatives: [{id: 'old', fragments: [ringFrag, coFrag]}], budget: {maxStates: 5e7, timeMs: 30000}});
    expect(c7.status).toBe('COMPLETE');
    expect(c7.candidates.length).toBeGreaterThan(0);
    expect(arylOH(c7.candidates.map(c => c.smiles))).toEqual([]);
    expect(c7.candidates.map(c => c.smiles)).not.toContain(cresol);
    const phenol = await enumerateStructures({formula: 'C6H6O', alternatives: [{id: 'old', fragments: [ringFrag, coFrag]}], budget: {maxStates: 5e7, timeMs: 30000}});
    expect(phenol.candidates).toEqual([]);
    expect(phenol.errors[0].code).toBe('FORMULA_ELEMENT_SHORTAGE');
  });
  it('new semantics (atom inventory + overlapping required C–O substructure): the same kind of evidence gives the aryl-OH targets', async () => {
    // p-cresol-shaped 1H list, formula C7H8O; the "C–O" reading is a required substructure that may share the ring carbon.
    const obs = [h1(7.05, 2, 'd', {j: [8.4]}), h1(6.75, 2, 'd', {j: [8.4]}), h1(4.7, 1, 's', {broad: true}), h1(2.28, 3, 's')];
    const r = await run('C7H8O', obs);
    expect(r.out.smiles).toContain(cresol);
    expect(arylOH(r.out.smiles).length).toBeGreaterThan(0);
    // the same list with the required substructure c–OH given explicitly through the leaf filter
    const withReq = await enumerateStructures({formula: 'C7H8O', alternatives: [{id: 'new', fragments: [{id: 'ring', count: 1, atoms: [{element: 'C', open: true, aromatic: true}, {element: 'C', fixedH: 1, aromatic: true}, {element: 'C', fixedH: 1, aromatic: true}, {element: 'C', open: true, aromatic: true}, {element: 'C', fixedH: 1, aromatic: true}, {element: 'C', fixedH: 1, aromatic: true}], bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]].map(([a, b, order]) => ({a, b, order: order as 1 | 2, aromatic: true}))}, {id: 'me', atoms: [{element: 'C', fixedH: 3, open: true}], bonds: []}, {id: 'oh', atoms: [{element: 'O', fixedH: 1, open: true}], bonds: []}], required: [{id: 'arOH', smarts: 'c[OX2H]'}]}], budget: {maxStates: 5e7, timeMs: 30000}});
    expect(withReq.candidates.map(c => c.smiles)).toEqual([cresol]);
  }, 120000);
  it('phenol: the old reading gives nothing (needs 7 C), the new one finds it (C6H6O)', async () => {
    const obs = [h1(7.25, 2, 't', {j: [7.8]}), h1(6.95, 1, 't', {j: [7.3]}), h1(6.85, 2, 'd', {j: [8.0]}), h1(4.9, 1, 's', {broad: true})];
    const r = await run('C6H6O', obs);
    expect(r.out.smiles).toContain(canon('Oc1ccccc1'));
  }, 120000);
});

describe('C4 incomplete flags and the D10 fallback', () => {
  it('AROMATIC_TEMPLATE_LIMITED: aromatic CH the template library cannot explain mark the run INCOMPLETE and are written to the diagnostics', async () => {
    const old = V12_CONFIG.maxAromaticRings;
    V12_CONFIG.maxAromaticRings = 1;
    try {
      // 5H at 7.9 (aromatic only) + 5H at 7.3 (aromatic or vinyl): 10 aromatic CH need two rings, one ring is the limit
      const obs = [h1(7.9, 5, 'm'), h1(7.3, 5, 'm')];
      const r = await run('C11H10', obs, {timeMs: 20000});
      expect(r.v12?.inventory?.aromaticLimited.length).toBeGreaterThan(0);
      expect(r.v12?.inventory?.incompleteReasons).toContain('AROMATIC_TEMPLATE_LIMITED');
      expect(r.run.complete).toBe(false);
      expect(r.out.complete).toBe(false);
      if (r.v12?.path === 'INVENTORY') expect(r.run.incompleteReasons).toContain('AROMATIC_TEMPLATE_LIMITED');
    } finally { V12_CONFIG.maxAromaticRings = old; }
  }, 120000);
  it('INVENTORY_ALTERNATIVES_TRUNCATED: more readings than the cap mark the run INCOMPLETE; the target survives (it is the best reading)', async () => {
    const old = V12_CONFIG.maxInventoryAlternatives;
    V12_CONFIG.maxInventoryAlternatives = 2;
    try {
      const r = await run('C9H10O2', ethylEster());
      expect(r.v12?.inventory?.truncated).toBe(true);
      expect(r.run.incompleteReasons).toContain('INVENTORY_ALTERNATIVES_TRUNCATED');
      expect(r.run.complete).toBe(false);
      expect(r.out.complete).toBe(false);
      expect(r.out.smiles).toContain(canon('CCOC(=O)c1ccccc1'));
    } finally { V12_CONFIG.maxInventoryAlternatives = old; }
  }, 120000);
  it('D10: every reading void (the hydrogens cannot be explained) → v1.1.7 flexible-atom path, badge and reason recorded, never COMPLETE', async () => {
    const obs = [h1(2.3, 3, 's'), h1(7.1, 2, 'd', {j: [8]}), h1(7.0, 2, 'd', {j: [8]})];
    const r = await run('C7H12', obs);
    expect(r.v12?.path).toBe('FALLBACK');
    expect(r.v12?.badge).toBe('1H 約束未能套用（已退回）');
    expect(r.v12?.reason).toMatch(/不相容/);
    expect(r.run.complete).toBe(false);
    expect(r.out.complete).toBe(false);
    expect(r.run.incompleteReasons).toContain('V12_CONSTRAINTS_FALLBACK');
    expect(r.out.smiles.length).toBeGreaterThan(0);
  }, 120000);
  it('D10: the readings run but produce 0 candidates (a required nitrile in a formula without N) → fallback, never COMPLETE', async () => {
    const obs = [...dimethoxy(), ir(2230, 100), ir(2950, 40)];
    const r = await run('C8H10O2', obs);
    expect(r.v12?.required.map(x => x.id)).toContain('NITRILE');
    expect(r.v12?.path).toBe('FALLBACK');
    expect(r.v12?.reason).toMatch(/沒有產生任何候選/);
    expect(r.run.complete).toBe(false);
    expect(r.run.incompleteReasons).toContain('V12_CONSTRAINTS_FALLBACK');
  }, 120000);
  it('D10: the legacy-search fallback (no fragments and a large formula) still records the v1.2 diagnostics', async () => {
    const obs = [h1(2.3, 3, 's'), h1(7.1, 2, 'd', {j: [8]}), h1(7.0, 2, 'd', {j: [8]})];
    const r = await run('C14H24', obs);
    expect(r.run.used).toBe(false);
    expect(r.v12?.path).toBe('FALLBACK');
    expect(r.run.complete).toBe(false);
  }, 120000);
});

describe('D9: no integrals → the v1.1.7 flexible-atom path, strong evidence still filters at the leaf', () => {
  it('a strong C=O band is required in every output (C4H8O2); without the flag the same request has more outputs', async () => {
    const obs = [h1(2.1, null, 's'), h1(3.6, null, 's'), ir(1735, 100), ir(2950, 30)];
    const on = await run('C4H8O2', obs);
    expect(on.v12?.path).toBe('FLEX_NO_INTEGRALS');
    expect(on.v12?.required.map(x => x.id)).toEqual(['STRONG_CARBONYL']);
    expect(on.out.smiles.length).toBeGreaterThan(0);
    for (const s of on.out.smiles) expect(matchesSMARTS(s, '[CX3]=[OX1]')).toBe(true);
    const off = await run('C4H8O2', obs, {v12: false});
    expect(off.v12).toBeUndefined();
    expect(off.out.smiles.length).toBeGreaterThan(on.out.smiles.length);
  }, 120000);
  it('requiredInFlexPath = false switches the leaf filter off', async () => {
    const obs = [h1(2.1, null, 's'), ir(1735, 100)];
    V12_CONFIG.requiredInFlexPath = false;
    try {
      const r = await run('C4H8O2', obs);
      expect(r.v12?.path).toBe('FLEX_NO_INTEGRALS');
      expect(r.out.smiles.some(s => matchesSMARTS(s, '[CX3]=[OX1]') === false)).toBe(true);
    } finally { V12_CONFIG.requiredInFlexPath = true; }
  }, 120000);
});

describe('flag off', () => {
  it('constraint evidence is ignored while useV12Constraints is false', async () => {
    const r = await run('C8H10O2', dimethoxy(), {v12: false, timeMs: 5000});
    expect(r.v12).toBeUndefined();
  }, 60000);
});

describe('C6 performance (measure only)', () => {
  it('four generic cases and the naphthalene case: steps, time, leaf-check cost (incl. orbit checks), candidates', async () => {
    const rows = [];
    for (const c of [CASES[0], CASES[1], CASES[2], CASES[4], CASES[6], CASES[7], CASES[8]]) {
      const r = await run(c.formula, c.obs());
      const lc = r.v12?.leafCost ?? null;
      rows.push({name: c.name, formula: c.formula, status: r.run.status, complete: r.run.complete, incomplete: r.run.incompleteReasons, alternatives: r.v12?.inventory?.alternatives, sets: r.v12?.runs.reduce((a, x) => a + x.sets, 0), steps: r.run.visited, leaves: r.run.leaves, candidates: r.out.smiles.length, ms: Math.round(r.ms), leafCost: lc && {leaves: lc.leaves, parseMs: Math.round(lc.parseMs), checksMs: Math.round(lc.checksMs), orbitChecks: lc.orbitChecks, orbitMs: Math.round(lc.orbitMs), requiredMatches: lc.requiredMatches, usPerLeaf: lc.leaves ? Math.round(((lc.parseMs + lc.checksMs) * 1000) / lc.leaves) : null, usPerOrbitCheck: lc.orbitChecks ? Math.round((lc.orbitMs * 1000) / lc.orbitChecks) : null}});
    }
    console.log('V12_C6 ' + JSON.stringify(rows));
    expect(rows.every(x => x.candidates > 0)).toBe(true);
  }, 600000);
});
