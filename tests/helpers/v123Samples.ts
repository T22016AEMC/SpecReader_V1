import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {matchingSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {canonNoStereo, fixtureSpectra, loadFixture, SHAPE_BUDGET} from './v121Golden';
import type {V121Fixture} from './v121Golden';

// v1.2.3 synthetic samples and the measurement used for the "before" baseline (tests/goldens/v123.baseline.json) and the A-class acceptance.
// Everything is synthetic, solvent declared (CDCl3, 400 MHz); no real spectrum. Step budget only (SHAPE_BUDGET), never the wall clock.
export const V123_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'v123');
/** Samples that live in tests/fixtures/v121 are referenced as `v121/<id>`; the others are in tests/fixtures/v123. */
export const V130_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'v130');
/** v1.3.0: samples in tests/fixtures/v130 are referenced as `v130/<id>`. */
export const V131_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'v131');
/** v1.3.1: samples in tests/fixtures/v131 are referenced as `v131/<id>`. */
export const loadV123 = (id: string): V121Fixture => id.startsWith('v131/') ? JSON.parse(fs.readFileSync(path.join(V131_DIR, `${id.slice(5)}.json`), 'utf8')) : id.startsWith('v130/') ? JSON.parse(fs.readFileSync(path.join(V130_DIR, `${id.slice(5)}.json`), 'utf8')) : id.startsWith('v121/') ? loadFixture(id.slice(5)) : JSON.parse(fs.readFileSync(path.join(V123_DIR, `${id}.json`), 'utf8'));

/** A class (p-cresol / BPA: nitrogen evidence, quota, implausible N structures) and B class (PMA / alkene controls: stop 3). */
export const V123_A_SAMPLES = ['P1', 'P2', 'P3', 'P4', 'B1', 'v121/S2'] as const;
export const V123_B_SAMPLES = ['Q1', 'Q2', 'Q3', 'M1', 'M1b', 'M4', 'M5', 'M5b', 'M6', 'M7', 'v121/G3'] as const;
export const V123_ALL_SAMPLES = [...V123_A_SAMPLES, ...V123_B_SAMPLES] as const;

/** The nitrogen structures the planner called implausible (N(O)O, N–O–N, N(O)N(O), N=C(O)O). Used only to COUNT them in a top list; the engine's own rules live in src. */
export const IMPLAUSIBLE_N_SMARTS: [string, string][] = [
  ['N(O)O', '[NX3;+0;!a]([OX2;!a])[OX2;!a]'],
  ['N-O-N', '[#7;!a][OX2;!a][#7;!a]'],
  ['N(O)N(O)', '[NX3;+0;!a]([OX2;!a])-[NX3;+0;!a][OX2;!a]'],
  ['N=C(O)O', '[NX2;!a]=[CX3;!a]([OX2;!a])[OX2;!a]'],
];
export const hasNitrogen = (smiles: string) => /[Nn]/.test(smiles.replace(/\[Na[^\]]*\]/g, ''));
export const implausibleN = (smiles: string): string[] => (matchingSMARTS(smiles, IMPLAUSIBLE_N_SMARTS.map(r => r[1])) ?? []).map(i => IMPLAUSIBLE_N_SMARTS[i][0]);

export interface SampleMeasure {
  id: string; mode: 'sparse' | 'dense'; formula: string;
  hypotheses: number; targetHypothesisRank: number | null; targetSearched: boolean | null; targetNotSearchedReason: string | null;
  steps: number; candidateSet: number; targetInCandidates: boolean; targetRank: number | null; ranked: number;
  top5: {smiles: string; n: boolean; implausibleN: string[]; isTarget: boolean}[];
  nInTop5: number; implausibleNInTop5: number;
  nitrogen: {mode: string | null; reasons: string[]};
  runs: {formula: string | null; termination: string; visited: number; candidates: number; reasons: string[]; round: number | null}[];
}

/** Runs one sample through the full six-step pipeline (no formula typed in) and reduces it to the numbers the baseline and the acceptance use. */
export async function measureSample(id: string, mode: 'sparse' | 'dense', options: {maxStates?: number; extraInput?: Record<string, unknown>} = {}): Promise<SampleMeasure> {
  const f = loadV123(id);
  const spectra = fixtureSpectra(f, {denseBaseline: mode === 'dense'});
  const r = await executeSixStepAnalysis({spectra, extraInput: options.extraInput ?? {}}, {...SHAPE_BUDGET, maxStates: options.maxStates ?? SHAPE_BUDGET.maxStates});
  const runs = r.reasoningTrace?.compositionSearch?.runs ?? [];
  const hyps = r.compositionInference?.hypotheses ?? [];
  const target = hyps.find(h => h.formula === f.formula);
  const tc = canonNoStereo(f.targetSmiles);
  const ranked = r.rankedCandidates;
  const rankOf = ranked.findIndex(c => canonNoStereo(c.smiles) === tc);
  const out = (r.solvedConstraintSpace.searchResult?.smiles ?? []).map(canonNoStereo);
  const ne = (r.compositionInference as unknown as {nitrogenEvidence?: {mode?: string; reasons?: {text: string}[]}} | undefined)?.nitrogenEvidence;
  const top5 = ranked.slice(0, 5).map(c => ({smiles: c.smiles, n: hasNitrogen(c.smiles), implausibleN: implausibleN(c.smiles), isTarget: canonNoStereo(c.smiles) === tc}));
  const sp = (target as unknown as {searchPlan?: {status?: string; reasonText?: string}} | undefined)?.searchPlan;
  return {
    id: f.id, mode, formula: f.formula,
    hypotheses: hyps.length, targetHypothesisRank: target ? hyps.indexOf(target) + 1 : null, targetSearched: target ? target.searched ?? false : null,
    targetNotSearchedReason: sp?.status === 'NOT_SEARCHED' ? sp.reasonText ?? null : null,
    steps: runs.reduce((a, x) => a + x.visited, 0), candidateSet: new Set(out).size, targetInCandidates: out.includes(tc), targetRank: rankOf < 0 ? null : rankOf + 1, ranked: ranked.length,
    top5, nInTop5: top5.filter(t => t.n).length, implausibleNInTop5: top5.filter(t => t.implausibleN.length > 0).length,
    nitrogen: {mode: ne?.mode ?? null, reasons: (ne?.reasons ?? []).map(x => x.text)},
    runs: runs.map(x => ({formula: x.formula ?? null, termination: x.termination, visited: x.visited, candidates: x.candidates, reasons: x.enumeration?.incompleteReasons ?? [], round: (x.enumeration as unknown as {planning?: {round?: number}} | undefined)?.planning?.round ?? null})),
  };
}
