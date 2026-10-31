import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {inferComposition} from '../../src/engines/composition/inferComposition';
import type {V12Evidence} from '../../src/engines/constraints/v12Evidence';
import {buildCompositionPanel} from '../../src/engines/enumeration/compositionPanelModel';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';
import {spectrum} from '../fixtures';
import {h1Diphenylpropane, h1Ethyl, irAromatic, msC9} from './p1bScenarios';

// Golden for the useV121Planning = false guarantee (v1.2.1 stage 1). Captured on the unmodified v1.2.0 code; everything here is SYNTHETIC and generic.
// Deterministic by construction: step budgets, a very large timeMs (see STEP_ONLY_TIME_MS), legacySupplementWhenIncomplete = false. Wall-clock fields are not recorded.
type Spectra = Parameters<typeof executeSixStepAnalysis>[0]['spectra'];
const round = (v: number | null | undefined, d = 6) => (v === null || v === undefined ? null : Number(v.toFixed(d)));

export interface V121Fixture {
  id: string; description: string; targetSmiles: string; formula: string;
  h1: {solvent: string; frequencyMHz: number; peaks: {x: number; integration: number; multiplicity: string; j?: number[]; isBroad?: boolean}[]};
  ir: {yAxis: string; coverageCm1: [number, number]; calibrated: boolean; note?: string; peaks: {x: number; y: number; isBroad?: boolean}[]};
}
export const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'v121');
export const loadFixture = (id: string): V121Fixture => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${id}.json`), 'utf8'));

/** Peak-table spectra of a fixture: 1H peaks get y, IR is %Transmittance with the covered range marked by end points and CONFIRMED_COMPLETE. */
export function fixtureSpectra(f: V121Fixture): Spectra {
  const h1 = {...spectrum('1H_NMR', f.h1.peaks.map((p, i) => ({id: `1H_NMR-${i}`, manualPeak: true, y: 50, x: p.x, integration: p.integration, multiplicity: p.multiplicity, jValues: p.j, ...(p.isBroad ? {isBroad: true, shape: 'broad'} : {})})) as unknown as SpectralPeak[]), solvent: f.h1.solvent} as ExperimentalSpectrumData;
  const irPeaks = f.ir.peaks.map(p => ({x: p.x, y: p.y, ...(p.isBroad ? {isBroad: true, shape: 'broad'} : {})}));
  const ir = {...spectrum('IR', irPeaks.map((p, i) => ({id: `IR-${i}`, manualPeak: true, ...p})) as unknown as SpectralPeak[], '%Transmittance'), irYAxisSemantics: 'TRANSMITTANCE_PERCENT', observationCoverage: 'CONFIRMED_COMPLETE'} as unknown as ExperimentalSpectrumData;
  ir.points = [{x: f.ir.coverageCm1[0], y: 99}, {x: f.ir.coverageCm1[1], y: 99}, ...irPeaks.map(p => ({x: p.x, y: p.y}))];
  return {'1H_NMR': h1, IR: ir} as Spectra;
}

/** A full pipeline snapshot, without any wall-clock field. */
export async function pipelineSnapshotV121(spectra: Spectra, extraInput: Record<string, unknown>, options: {timeMs?: number; maxStates?: number} = {}) {
  const r = await executeSixStepAnalysis({spectra, extraInput}, options);
  const s = r.solvedConstraintSpace.searchResult;
  const cs = r.reasoningTrace?.compositionSearch;
  const en = s?.enumeration;
  const hyps = r.compositionInference?.hypotheses ?? [];
  const canon = (x: string) => { try { return canonicalizeMolecule(x).canonical; } catch { return x; } };
  const panel = buildCompositionPanel({composition: r.compositionInference, runs: cs?.runs ?? [], mode: cs?.mode, enumeration: en, localStructures: r.reasoningTrace?.localStructures ?? [], rejectedCandidates: r.rejectedCandidates});
  return {
    mode: cs?.mode ?? null,
    compositionStatus: r.compositionInference?.status ?? null,
    hypotheses: hyps.map((h, i) => ({rank: i + 1, formula: h.formula, k: h.symmetryMultiple, score: round(h.score), searched: h.searched ?? false, generatorSupported: h.generatorSupported})),
    searchList: (cs?.runs ?? []).map(x => x.formula ?? null),
    runs: (cs?.runs ?? []).map(x => ({formula: x.formula ?? null, termination: x.termination, visited: x.visited, candidates: x.candidates, incompleteReasons: x.enumeration?.incompleteReasons ?? [], complete: x.enumeration?.complete ?? null, path: x.enumeration?.v12?.path ?? null, fallbackReason: x.enumeration?.fallbackReason ?? null, enumeration: x.enumeration ? {used: x.enumeration.used, status: x.enumeration.status, candidates: x.enumeration.candidates, visited: x.enumeration.visited, leaves: x.enumeration.leaves, readings: x.enumeration.readings, rejected: x.enumeration.rejected, notes: x.enumeration.notes} : null})),
    candidateSet: [...new Set((s?.smiles ?? []).map(canon))].sort(),
    smiles: s?.smiles ?? [],
    termination: s?.termination ?? null,
    complete: s?.complete ?? null,
    enumeration: en ? {used: en.used, complete: en.complete, enumerated: en.enumerated, scored: en.scored, deferred: en.deferred.count} : null,
    ranked: r.rankedCandidates.map(c => c.smiles),
    statusCode: r.generationStatus?.code ?? null,
    ledger: r.rankedCandidates.slice(0, 8).map(c => {
      const l = c.scientificScoreLedger!;
      return {smiles: c.smiles, totalScore: round(l.totalScore), modalityScores: Object.fromEntries(Object.entries(l.modalityScores).map(([k, v]) => [k, round(v as number | null)])), entries: l.entries.map(e => ({modality: e.sourceModality, compatibility: round(e.compatibility), weight: round(e.weight), contribution: round(e.contribution), method: e.method}))};
    }),
    panel: panel ? JSON.parse(JSON.stringify(panel)) : null,
  };
}

/** Step based budgets for the shapes; the wall clock stays far away (timeMs 120000). */
/** Each alternative set gets a wall-clock slice of (timeMs / sets / formulas); with 120000 ms that slice is hit for many sets and the step counts jitter by tens. A very large timeMs leaves the step budget as the only limit. */
export const STEP_ONLY_TIME_MS = 3_600_000;
export const SHAPE_BUDGET = {timeMs: STEP_ONLY_TIME_MS, maxStates: 8_000_000};
export const SHAPE_IDS = ['S1', 'G1', 'E1', 'G3', 'D1'] as const;

/** Scenarios of the golden. `userFormulaWithS` is the existing synthetic ethyl shape with a user-typed formula that contains S. */
export async function v121GoldenScenarios() {
  const cfg = ENUMERATION_CONFIG as {legacySupplementWhenIncomplete: boolean};
  const old = cfg.legacySupplementWhenIncomplete;
  cfg.legacySupplementWhenIncomplete = false;
  try {
    const legacyOpts = {timeMs: STEP_ONLY_TIME_MS, maxStates: 4_000_000};
    const out: Record<string, unknown> = {
      diphenylpropaneFormula: await pipelineSnapshotV121({'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, {molecularFormula: 'C15H16'}, legacyOpts),
      ethylEsterFormula: await pipelineSnapshotV121({MS: msC9(), '1H_NMR': h1Ethyl()}, {molecularFormula: 'C9H10O2'}, legacyOpts),
      ethylNoFormula: await pipelineSnapshotV121({MS: msC9(), '1H_NMR': h1Ethyl()}, {}, {timeMs: STEP_ONLY_TIME_MS, maxStates: 60000}),
      h1OnlyNoFormula: await pipelineSnapshotV121({'1H_NMR': h1Ethyl()}, {}, {timeMs: STEP_ONLY_TIME_MS, maxStates: 60000}),
      userFormulaWithS: await pipelineSnapshotV121({'1H_NMR': h1Ethyl()}, {molecularFormula: 'C9H10O2S'}, {timeMs: STEP_ONLY_TIME_MS, maxStates: 2_000_000}),
    };
    for (const id of SHAPE_IDS) out[`${id}_noFormula`] = await pipelineSnapshotV121(fixtureSpectra(loadFixture(id)), {}, SHAPE_BUDGET);
    const s1 = loadFixture('S1');
    out['S1_withFormula'] = await pipelineSnapshotV121(fixtureSpectra(s1), {molecularFormula: s1.formula}, SHAPE_BUDGET);
    return out;
  } finally { cfg.legacySupplementWhenIncomplete = old; }
}

/**
 * Step counters (`visited`, `leaves`, `duplicatesMerged`) jitter by a few tens between two runs of the unchanged code: the legacy beam search
 * inside a run has its own clock, and what it uses is pooled into the budget of the formulas after it. Everything else (hypotheses, searched
 * lists, terminations, reasons, candidate sets, ranking, panel text) is exactly reproducible. The comparison therefore ignores those three keys
 * for equality and requires each of them to stay within 10 % (or 500 steps) of the golden. The panel line "葉端檢查：N 個葉" carries the same counter.
 */
const JITTER_KEYS = new Set(['visited', 'leaves', 'duplicatesMerged']);
const jitterText = (t: string) => t.replace(/[0-9]+ 個葉/g, 'N 個葉');
export function compareGolden(actual: unknown, golden: unknown, at = '$', problems: string[] = []): string[] {
  if (Array.isArray(actual) && Array.isArray(golden)) {
    if (actual.length !== golden.length) problems.push(`${at}: length ${actual.length} ≠ ${golden.length}`);
    for (let i = 0; i < Math.min(actual.length, golden.length); i++) compareGolden(actual[i], golden[i], `${at}[${i}]`, problems);
  } else if (actual && golden && typeof actual === 'object' && typeof golden === 'object') {
    const a = actual as Record<string, unknown>, g = golden as Record<string, unknown>;
    for (const k of new Set([...Object.keys(a), ...Object.keys(g)])) {
      if (JITTER_KEYS.has(k) && typeof a[k] === 'number' && typeof g[k] === 'number') {
        const diff = Math.abs((a[k] as number) - (g[k] as number));
        if (diff > Math.max(500, 0.1 * (g[k] as number))) problems.push(`${at}.${k}: ${a[k]} vs ${g[k]}`);
      } else compareGolden(a[k], g[k], `${at}.${k}`, problems);
    }
  } else if (typeof actual === 'string' && typeof golden === 'string' && jitterText(actual) === jitterText(golden)) {
    // same text up to the leaf counter of the panel line "葉端檢查：N 個葉"
  } else if (actual !== golden) problems.push(`${at}: ${JSON.stringify(actual)?.slice(0, 80)} ≠ ${JSON.stringify(golden)?.slice(0, 80)}`);
  return problems;
}

/** The composition inference of a fixture without a formula, plus the observations and the evidence object the generator receives. */
export function inferFixture(id: string) {
  const f = loadFixture(id);
  const prepared = WorkbenchOrchestrator.prepareModeAEvidence(fixtureSpectra(f), {});
  const plan = createReasoningPlan(prepared.bundle);
  const composition = inferComposition({bundle: prepared.bundle, observations: plan.observations, userFormula: plan.userFormula, nitrogen: plan.nitrogenEvidence});
  const evidence: V12Evidence = {observations: plan.observations, irCoversAldehydeRegion: true, nitrogenAllowed: false};
  return {fixture: f, prepared, plan, composition, evidence};
}

/** Canonical SMILES without stereochemistry (the enumerator does not produce stereo, the fixtures' targets may carry it). */
export const canonNoStereo = (smiles: string): string => {
  const flat = smiles.split('/').join('').split(String.fromCharCode(92)).join('').replace(/@+/g, '');
  try { return canonicalizeMolecule(flat).canonical; } catch { return flat; }
};
