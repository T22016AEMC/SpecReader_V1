import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../src/engines/enumeration/enumerationConfig';
import {V12_CONFIG} from '../src/engines/constraints/v12Config';
import {FORMULA_INCOMPATIBLE_VOIDS} from '../src/engines/constraints/atomInventory';
import {h1Diphenylpropane, h1Ethyl, irAromatic, msC9, summarise} from './helpers/p1bScenarios';

// P1b stage 2 — complete flows through the same entry the Web Worker uses (RDKit init + executeSixStepAnalysis). All spectra are
// SYNTHETIC peak lists. The tests check program behaviour (status, completeness, candidate sets), never chemical accuracy.
beforeAll(() => initializeRDKit(), 60000);
const diphenylpropane = canonicalizeMolecule('CC(C)(c1ccccc1)c1ccccc1').canonical;
const flag = ENUMERATION_CONFIG as {useExhaustiveEnumerator: boolean};

describe('flow (i): diphenylpropane-shaped 1H + IR with the user formula C15H16', () => {
  // v1.2.0 (known limitation): with the 1H constraints on, the aromatic-template readings finish but the readings that contain a vinyl (alkene CH)
  // reading do not finish in the 15 s budget, so the run is INCOMPLETE with VINYL_READINGS_BUDGET; the target is still among the final candidates.
  it('the structure is among the final candidates, the run is INCOMPLETE only because of the vinyl readings, and the old 48-candidate cap no longer applies', async () => {
    const r = await executeSixStepAnalysis({spectra: {'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, extraInput: {molecularFormula: 'C15H16'}}, {});
    const search = r.solvedConstraintSpace.searchResult!;
    const en = search.enumeration!;
    expect(en.used).toBe(true);
    expect(en.complete).toBe(false);
    expect(search.complete).toBe(false);
    expect(en.runs[0].incompleteReasons).toContain('VINYL_READINGS_BUDGET');
    expect(en.runs[0].v12?.path).toBe('INVENTORY');
    expect(['TIME_BUDGET', 'STATE_BUDGET']).toContain(search.termination);
    expect(en.enumerated).toBeGreaterThan(48);
    expect(r.rankedCandidates.map(c => c.smiles)).toContain(diphenylpropane);
    expect(r.rankedCandidates.every(c => c.molecularFormula === 'C15H16')).toBe(true);
    expect(r.generationStatus?.code).toBe('PARTIAL_CANDIDATES');
    expect(r.generationStatus?.message).toMatch(/INCOMPLETE/);
    expect(r.generationStatus?.limits).toMatch(/不代表列出所有可能結構/);
    expect(r.reasoningTrace!.stages).toHaveLength(6);
    // The symmetric unit (k = 2) is built into every candidate.
    const run = r.reasoningTrace!.compositionSearch!.runs[0];
    expect(run.symmetry?.k).toBe(2);
    expect(run.symmetry?.candidatesContainingAllCopies).toBe(search.smiles.length);
    expect(run.enumeration?.readings.some(x => x.complete === true && x.newCandidates > 0)).toBe(true);
    // v1.2.0: readings that cannot hold the formula are voided when the atom inventory is built (not as enumerator sets), so the structured void kinds are
    // checked: at least one void whose kind says "the reading does not fit the formula" (element counts or hydrogens), not just a number of voids.
    const voided = run.enumeration?.v12?.inventory?.voided ?? [];
    expect(voided.length).toBeGreaterThanOrEqual(1);
    expect(voided.some(v => FORMULA_INCOMPATIBLE_VOIDS.includes(v.kind as never) && v.count >= 1)).toBe(true);
  }, 120000);
  it('flag off (v1.1.8 behaviour): the same flow is COMPLETE and counts incompatible readings in the enumerator', async () => {
    const was = V12_CONFIG.useV12Constraints;
    V12_CONFIG.useV12Constraints = false;
    try {
      const r = await executeSixStepAnalysis({spectra: {'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, extraInput: {molecularFormula: 'C15H16'}}, {});
      const search = r.solvedConstraintSpace.searchResult!;
      const en = search.enumeration!;
      expect(en.used).toBe(true);
      expect(en.complete).toBe(true);
      expect(search.complete).toBe(true);
      expect(search.termination).toBe('GRAMMAR_EXHAUSTED');
      expect(en.enumerated).toBeGreaterThan(48);
      expect(r.rankedCandidates.map(c => c.smiles)).toContain(diphenylpropane);
      expect(r.generationStatus?.code).toBe('CANDIDATES_FOUND');
      expect(r.generationStatus?.message).toMatch(/COMPLETE/);
      const run = r.reasoningTrace!.compositionSearch!.runs[0];
      expect(run.symmetry?.k).toBe(2);
      expect(run.enumeration?.incompatibleReadings).toBeGreaterThanOrEqual(1);
    } finally { V12_CONFIG.useV12Constraints = was; }
  }, 120000);
});

describe('flow (ii): the same data without a formula', () => {
  it('runs to the end and reports the outcome explicitly (enumerator completeness, or the reason for the legacy search)', async () => {
    const r = await executeSixStepAnalysis({spectra: {'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, extraInput: {}}, {});
    const cs = r.reasoningTrace!.compositionSearch!;
    expect(['COMPOSITION_HYPOTHESES', 'NO_FORMULA']).toContain(cs.mode);
    expect(r.reasoningTrace!.stages).toHaveLength(6);
    expect(r.generationStatus?.code).toBeTruthy();
    expect(r.generationStatus?.message.length).toBeGreaterThan(10);
    const en = r.solvedConstraintSpace.searchResult?.enumeration;
    if (cs.mode === 'COMPOSITION_HYPOTHESES') {
      expect(en).toBeTruthy();
      for (const run of en!.runs) expect(run.used ? run.complete === true || run.incompleteReasons.length > 0 : Boolean(run.fallbackReason)).toBe(true);
    }
    // Whatever was found went through the same validation: formulas match the composition hypotheses that were searched.
    const searched = new Set(r.reasoningTrace!.composition!.hypotheses.filter(h => h.searched).map(h => h.formula));
    for (const c of r.rankedCandidates) expect(searched.has(c.molecularFormula) || cs.mode === 'NO_FORMULA').toBe(true);
    console.log('P1B_FLOW_II ' + JSON.stringify({mode: cs.mode, code: r.generationStatus?.code, ranked: r.rankedCandidates.length, enumerated: en?.enumerated ?? null, scored: en?.scored ?? null, deferred: en?.deferred.count ?? null, complete: en?.complete ?? null, runs: en?.runs.map(x => ({f: x.formula, used: x.used, complete: x.complete, why: x.incompleteReasons, fb: x.fallbackReason?.slice(0, 50), n: x.candidates})) ?? null}));
  }, 180000);
});

describe('flow (iii): useExhaustiveEnumerator = false behaves exactly like 1.1.7-hotfix.2', () => {
  const golden = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'goldens', 'p1bLegacy.hotfix2.json'), 'utf8'));
  it('four scenarios give the same candidates, runs, status and termination as the recorded 1.1.7-hotfix.2 output', async () => {
    const opts = {timeMs: 120000, maxStates: 6000};
    flag.useExhaustiveEnumerator = false;
    // v1.2.0: the golden is the 1.1.7-hotfix.2 output; the v1.2 scoring (two-way 1H terms, image weight) changes ranks and scores, so the flag is set off here.
    const v12Was = V12_CONFIG.useV12Constraints;
    V12_CONFIG.useV12Constraints = false;
    try {
      const out = {
        msAndH1NoFormula: await summarise({MS: msC9(), '1H_NMR': h1Ethyl()}, {}, opts),
        msAndH1WithFormula: await summarise({MS: msC9(), '1H_NMR': h1Ethyl()}, {molecularFormula: 'C9H10O2'}, opts),
        h1IrWithFormula: await summarise({'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, {molecularFormula: 'C15H16'}, opts),
        h1OnlyNoFormula: await summarise({'1H_NMR': h1Ethyl()}, {}, opts),
      };
      expect(JSON.parse(JSON.stringify(out))).toEqual(golden);
    } finally { flag.useExhaustiveEnumerator = true; V12_CONFIG.useV12Constraints = v12Was; }
  }, 120000);
});

describe('flow (iv): cancelling during the analysis', () => {
  it('ends well inside the 120 s protection with the CANCELLED status and keeps what exists', async () => {
    const start = performance.now();
    const r = await executeSixStepAnalysis({spectra: {MS: msC9(), '1H_NMR': h1Ethyl()}, extraInput: {}}, {shouldCancel: () => performance.now() - start > 400});
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(30000);
    expect(r.solvedConstraintSpace.searchResult?.termination).toBe('CANCELLED');
    expect(r.generationStatus?.code).toBe('CANCELLED');
    expect(r.reasoningTrace!.stages).toHaveLength(6);
  }, 120000);
});

// Stage 4: candidate origins and panel model on real results.
import {buildCompositionPanel, candidateSourceTag, summaryBadges} from '../src/engines/enumeration/compositionPanelModel';
import {createExhaustiveGenerator} from '../src/engines/enumeration/exhaustiveGenerator';
import {mk} from './helpers/p1bScenarios';
const panelOf = (r: Awaited<ReturnType<typeof executeSixStepAnalysis>>) => buildCompositionPanel({
  composition: r.compositionInference, runs: r.reasoningTrace?.compositionSearch?.runs ?? [], mode: r.reasoningTrace?.compositionSearch?.mode,
  enumeration: r.solvedConstraintSpace.searchResult?.enumeration, localStructures: r.reasoningTrace?.localStructures ?? [],
})!;

describe('candidate origins and panel on real results', () => {
  it('enumerator candidates are tagged 窮舉器 (not relaxed); a complete run has no badge', async () => {
    // v1.2.0: an ethyl-ester-shaped list finishes within the budget, so this is the "complete run, no badge" case.
    const spectra = {'1H_NMR': mk('1H_NMR', [{x: 8.04, integration: 2, multiplicity: 'm'}, {x: 7.55, integration: 1, multiplicity: 'm'}, {x: 7.43, integration: 2, multiplicity: 'm'}, {x: 4.37, integration: 2, multiplicity: 'q', jValues: [7.1]}, {x: 1.39, integration: 3, multiplicity: 't', jValues: [7.1]}] as never)};
    const r = await executeSixStepAnalysis({spectra, extraInput: {molecularFormula: 'C9H10O2'}}, {});
    const origins = r.solvedConstraintSpace.searchResult!.enumeration!.origins!;
    expect(r.rankedCandidates.length).toBeGreaterThan(0);
    for (const c of r.rankedCandidates) expect(candidateSourceTag(origins[c.smiles])).toBe('窮舉器');
    const panel = panelOf(r);
    expect(panel.badges).toEqual([]);
    expect(panel.enumerationLabel).toBe('完整（COMPLETE）');
    expect(panel.rows[0].search.text).toMatch(/完整（COMPLETE）/);
  }, 120000);
  it('known limitation (v1.2.0): the diphenylpropane-shaped run is INCOMPLETE because of the vinyl readings, with the amber 未完整 badge and the reason text', async () => {
    const r = await executeSixStepAnalysis({spectra: {'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, extraInput: {molecularFormula: 'C15H16'}}, {});
    const origins = r.solvedConstraintSpace.searchResult!.enumeration!.origins!;
    expect(r.rankedCandidates.length).toBeGreaterThan(0);
    for (const c of r.rankedCandidates) expect(candidateSourceTag(origins[c.smiles])).toBe('窮舉器');
    const panel = panelOf(r);
    expect(panel.badges.map(b => b.text)).toEqual(['未完整']);
    expect(panel.enumerationLabel).toBe('未完整（INCOMPLETE）');
    expect(panel.rows[0].search.text).toMatch(/未完整（INCOMPLETE：.*含烯基/);
  }, 120000);
  it('readings that contradict the formula: relaxed to formula-only, tagged 約束已放寬, amber badge in the summary', async () => {
    const r = await executeSixStepAnalysis({spectra: {IR: mk('IR', [{x: 1715, y: 80}])}, extraInput: {molecularFormula: 'C2H6O'}}, {});
    const run = r.reasoningTrace!.compositionSearch!.runs[0];
    expect(run.enumeration?.relaxedToFormulaOnly?.candidates).toBeGreaterThan(0);
    const origins = r.solvedConstraintSpace.searchResult!.enumeration!.origins!;
    expect(r.rankedCandidates.length).toBeGreaterThan(0);
    for (const c of r.rankedCandidates) expect(candidateSourceTag(origins[c.smiles])).toBe('窮舉器｜約束已放寬');
    expect(panelOf(r).badges.map(b => b.text)).toEqual(['約束已放寬（只依分子式）']);
  }, 120000);
  it('a budget-limited enumeration is supplemented by the legacy search: those candidates are tagged, the summary carries both badges', async () => {
    // Deterministic stand-in for the legacy search; the enumeration is cut by a tiny step budget.
    const legacy = {generateStructures: async () => ({smiles: ['CCCCO', 'CCOCC'], status: 'BOUNDED' as const, visited: 7, note: '', termination: 'GRAMMAR_EXHAUSTED' as const, complete: false, partialHypotheses: [], rejectedByComposition: 0})};
    const gen = createExhaustiveGenerator(legacy);
    const search = await gen.generateStructures({formula: 'C6H14', hints: {}, budget: {timeMs: 5000, maxStates: 1e6, maxResults: 48, maxFrontier: 1, beamWidth: 1}, enumerationBudget: {timeMs: 5000, maxStates: 50}});
    const e = search.enumeration!;
    expect(e.runs[0].legacySupplement?.added).toBe(2);
    expect(e.origins!['CCCCO']).toEqual({source: 'LEGACY_SUPPLEMENT', relaxed: false});
    expect(Object.values(e.origins!).some(o => o.source === 'ENUMERATOR')).toBe(true);
    expect(candidateSourceTag(e.origins!['CCOCC'])).toBe('舊 beam 搜尋（補充）');
    const ids = summaryBadges(e.runs).map(b => b.id);
    expect(ids).toEqual(['LEGACY_SUPPLEMENT', 'INCOMPLETE']);
  }, 60000);
  it('with the flag off no origin information exists, so candidate cards keep their old text', async () => {
    flag.useExhaustiveEnumerator = false;
    try {
      const r = await executeSixStepAnalysis({spectra: {IR: mk('IR', [{x: 1715, y: 80}, {x: 2920, y: 30}])}, extraInput: {molecularFormula: 'C2H6O'}}, {timeMs: 5000, maxStates: 4000});
      expect(r.solvedConstraintSpace.searchResult?.enumeration).toBeUndefined();
      expect(panelOf(r).badges).toEqual([]);
    } finally { flag.useExhaustiveEnumerator = true; }
  }, 120000);
});
