import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {createReasoningPlan} from '../../src/engines/reasoning/hypothesisGenerator';
import {SignalCharacterizationEngine} from '../../src/engines/signalCharacterizationEngine';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import type {ImageSpectrumCalibration} from '../../src/types/spectrum';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {h1Diphenylpropane, h1Ethyl, irAromatic, mk, msC9} from './p1bScenarios';

// Golden for the useV12Constraints=false guarantee (docs/P1C_DESIGN.md §5 "旗標黃金"). Everything here is SYNTHETIC and generic.
// Captured on v1.1.8 (before any v1.2 code existed); no timings are recorded.
const round = (v: number | null | undefined, d = 6) => (v === null || v === undefined ? null : Number(v.toFixed(d)));
type Spectra = Parameters<typeof executeSixStepAnalysis>[0]['spectra'];

export async function pipelineSnapshot(spectra: Spectra, extraInput: Record<string, unknown>, options: {timeMs?: number; maxStates?: number} = {}) {
  const r = await executeSixStepAnalysis({spectra, extraInput}, options);
  const s = r.solvedConstraintSpace.searchResult;
  const cs = r.reasoningTrace?.compositionSearch;
  const en = s?.enumeration;
  return {
    mode: cs?.mode ?? null,
    runs: (cs?.runs ?? []).map(x => ({hypothesisId: x.hypothesisId, formula: x.formula ?? null, maxStates: x.maxStates, visited: x.visited, termination: x.termination, candidates: x.candidates, diagnostic: x.diagnostic, symmetry: x.symmetry, enumeration: x.enumeration ? {used: x.enumeration.used, complete: x.enumeration.complete, status: x.enumeration.status, incompleteReasons: x.enumeration.incompleteReasons, fallbackReason: x.enumeration.fallbackReason, candidates: x.enumeration.candidates, visited: x.enumeration.visited, leaves: x.enumeration.leaves, incompatibleReadings: x.enumeration.incompatibleReadings, readings: x.enumeration.readings, rejected: x.enumeration.rejected, notes: x.enumeration.notes} : null})),
    smiles: s?.smiles ?? [],
    termination: s?.termination ?? null,
    complete: s?.complete ?? null,
    enumeration: en ? {used: en.used, complete: en.complete, enumerated: en.enumerated, scored: en.scored, deferred: en.deferred.count} : null,
    ranked: r.rankedCandidates.map(c => c.smiles),
    validated: r.validatedGraphs.length,
    rejected: r.rejectedCandidates.length,
    statusCode: r.generationStatus?.code ?? null,
    stages: r.reasoningTrace?.stages.length ?? null,
    // Score ledger key fields of the first 8 ranked candidates.
    ledger: r.rankedCandidates.slice(0, 8).map(c => {
      const l = c.scientificScoreLedger!;
      return {
        smiles: c.smiles, totalScore: round(l.totalScore), meaning: l.scoreMeaning, formulaHardCompatible: l.formulaHardCompatible,
        modalityScores: Object.fromEntries(Object.entries(l.modalityScores).map(([k, v]) => [k, round(v as number | null)])),
        modalityWeights: Object.fromEntries(Object.entries(l.modalityWeights).map(([k, v]) => [k, round(v as number)])),
        entries: l.entries.map(e => ({modality: e.sourceModality, observationIds: e.observationIds, compatibility: round(e.compatibility), weight: round(e.weight), contribution: round(e.contribution), method: e.method})),
      };
    }),
  };
}

/** Observation table (peak table) and IR marker values as the pipeline and the signal engine see them. */
export function irAndPeakTables() {
  const spectra = {'1H_NMR': h1Ethyl(), IR: irAromatic(), MS: msC9()} as Spectra;
  const prepared = WorkbenchOrchestrator.prepareModeAEvidence(spectra, {});
  const plan = createReasoningPlan(prepared.bundle);
  const observations = plan.observations.map(o => ({id: o.id, modality: o.modality, value: o.value, relativeIntensity: round(o.relativeIntensity), relativeIntegral: o.relativeIntegral, multiplicity: o.multiplicity, jHz: o.jHz, shape: o.shape, optional: o.optional ?? false}));
  const measured = SignalCharacterizationEngine.measureSpectrumSignals(irAromatic());
  const marker = (peaks: {x: number; y: number}[]) => SignalCharacterizationEngine.measureSpectrumSignals(mk('IR', peaks)).peaks.map(p => ({x: p.x, y: round(p.y), rel: round(p.relativeIntensity), norm: round(p.normalizedIntensity)}));
  const cal = {plotTopPx: 40, plotBottomPx: 340} as ImageSpectrumCalibration;
  return {
    observations,
    irMeasuredPeaks: measured.peaks.map(p => ({x: p.x, y: round(p.y), rel: round(p.relativeIntensity), norm: round(p.normalizedIntensity)})),
    transmittanceMarkers: marker([{x: 3000, y: 20}, {x: 1700, y: 35}, {x: 1100, y: 70}]),
    absorptionMarkers: marker([{x: 3000, y: 80}, {x: 1700, y: 65}, {x: 1100, y: 30}]),
    pixelToPhysicalIR: [40, 90, 190, 290, 340].map(py => SpectrumParser.pixelToPhysicalIntensity(py, cal, 'IR')),
    pixelToPhysicalNMR: [40, 190, 340].map(py => SpectrumParser.pixelToPhysicalIntensity(py, cal, '1H_NMR')),
  };
}

/** Scenarios of the golden (budgets are step based, so the output does not depend on timing). */
export async function legacyGoldenScenarios() {
  const opts = {timeMs: 120000, maxStates: 4_000_000};
  // The bounded legacy supplement runs on a wall-clock limit (500 ms), so its step counts differ between runs; it is switched off here
  // to keep the golden deterministic. Every other part of the pipeline is unchanged. The supplement path itself is covered by p1bPipeline.test.ts.
  const cfg = ENUMERATION_CONFIG as {legacySupplementWhenIncomplete: boolean};
  const old = cfg.legacySupplementWhenIncomplete;
  cfg.legacySupplementWhenIncomplete = false;
  try { return await scenarios(opts); } finally { cfg.legacySupplementWhenIncomplete = old; }
}
async function scenarios(opts: {timeMs: number; maxStates: number}) {
  return {
    diphenylpropaneFormula: await pipelineSnapshot({'1H_NMR': h1Diphenylpropane(), IR: irAromatic()}, {molecularFormula: 'C15H16'}, opts),
    ethylEsterFormula: await pipelineSnapshot({MS: msC9(), '1H_NMR': h1Ethyl()}, {molecularFormula: 'C9H10O2'}, opts),
    ethylNoFormula: await pipelineSnapshot({MS: msC9(), '1H_NMR': h1Ethyl()}, {}, {timeMs: 120000, maxStates: 60000}),
    h1OnlyNoFormula: await pipelineSnapshot({'1H_NMR': h1Ethyl()}, {}, {timeMs: 120000, maxStates: 60000}),
    tables: irAndPeakTables(),
  };
}
