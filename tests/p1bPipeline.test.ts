import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../src/engines/enumeration/enumerationConfig';
import {h1Diphenylpropane, h1Ethyl, irAromatic, msC9, summarise} from './helpers/p1bScenarios';

// P1b stage 2 — complete flows through the same entry the Web Worker uses (RDKit init + executeSixStepAnalysis). All spectra are
// SYNTHETIC peak lists. The tests check program behaviour (status, completeness, candidate sets), never chemical accuracy.
beforeAll(() => initializeRDKit(), 60000);
const diphenylpropane = canonicalizeMolecule('CC(C)(c1ccccc1)c1ccccc1').canonical;
const flag = ENUMERATION_CONFIG as {useExhaustiveEnumerator: boolean};

describe('flow (i): diphenylpropane-shaped 1H + IR with the user formula C15H16', () => {
  it('the structure is among the final candidates, the enumeration is COMPLETE, and the old 48-candidate cap no longer applies', async () => {
    const r = await executeSixStepAnalysis({spectra: {'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, extraInput: {molecularFormula: 'C15H16'}}, {});
    const search = r.solvedConstraintSpace.searchResult!;
    const en = search.enumeration!;
    expect(en.used).toBe(true);
    expect(en.complete).toBe(true);
    expect(search.complete).toBe(true);
    expect(search.termination).toBe('GRAMMAR_EXHAUSTED');
    expect(en.enumerated).toBeGreaterThan(48);
    expect(r.rankedCandidates.map(c => c.smiles)).toContain(diphenylpropane);
    expect(r.rankedCandidates.every(c => c.molecularFormula === 'C15H16')).toBe(true);
    expect(r.generationStatus?.code).toBe('CANDIDATES_FOUND');
    expect(r.generationStatus?.message).toMatch(/COMPLETE/);
    expect(r.generationStatus?.limits).toMatch(/不代表列出所有可能結構/);
    expect(r.reasoningTrace!.stages).toHaveLength(6);
    // The symmetric unit (k = 2) is built into every candidate.
    const run = r.reasoningTrace!.compositionSearch!.runs[0];
    expect(run.symmetry?.k).toBe(2);
    expect(run.symmetry?.candidatesContainingAllCopies).toBe(search.smiles.length);
    expect(run.enumeration?.readings.some(x => x.complete === true && x.newCandidates > 0)).toBe(true);
    expect(run.enumeration?.incompatibleReadings).toBeGreaterThanOrEqual(1);
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
    try {
      const out = {
        msAndH1NoFormula: await summarise({MS: msC9(), '1H_NMR': h1Ethyl()}, {}, opts),
        msAndH1WithFormula: await summarise({MS: msC9(), '1H_NMR': h1Ethyl()}, {molecularFormula: 'C9H10O2'}, opts),
        h1IrWithFormula: await summarise({'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, {molecularFormula: 'C15H16'}, opts),
        h1OnlyNoFormula: await summarise({'1H_NMR': h1Ethyl()}, {}, opts),
      };
      expect(JSON.parse(JSON.stringify(out))).toEqual(golden);
    } finally { flag.useExhaustiveEnumerator = true; }
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
