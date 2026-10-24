import {spectrum} from '../fixtures';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import type {ExperimentalSpectrumData, SpectralPeak} from '../../src/types/spectrum';

// SYNTHETIC peak lists for the P1b flow tests. Generic case shapes only; no measured spectrum is used.
type Mod = ExperimentalSpectrumData['modality'];
export const mk = (mod: Mod, peaks: Partial<SpectralPeak>[], extra: Partial<ExperimentalSpectrumData> = {}): ExperimentalSpectrumData =>
  ({...spectrum(mod, peaks.map((p, i) => ({id: `${mod}-${i}`, manualPeak: true, y: 100, ...p})) as SpectralPeak[]), ...extra});
export const ei = (peaks: Partial<SpectralPeak>[]) => mk('MS', peaks, {msParams: {msType: 'EI-MS', ionization: 'EI'}});
/** Synthetic EI list shaped like a C9H10O2 molecular ion plus two fragments. */
export const msC9 = () => ei([{x: 150, y: 30}, {x: 151, y: 3.0}, {x: 152, y: 0.3}, {x: 105, y: 100}, {x: 77, y: 60}]);
/** Synthetic 1H list: aromatic 5H pattern, q/t ethyl pair. */
export const h1Ethyl = () => mk('1H_NMR', [{x: 8.05, integration: 2, multiplicity: 'm'}, {x: 7.45, integration: 3, multiplicity: 'm'}, {x: 4.37, integration: 2, multiplicity: 'q', jValues: [7.1]}, {x: 1.39, integration: 3, multiplicity: 't', jValues: [7.1]}]);
/** Synthetic 1H list of a "diphenyl + two equivalent methyl" shape (aromatic 10H multiplets, one 6H singlet). */
export const h1Diphenylpropane = () => mk('1H_NMR', [{x: 7.30, integration: 4, multiplicity: 'm'}, {x: 7.20, integration: 4, multiplicity: 'm'}, {x: 7.12, integration: 2, multiplicity: 'm'}, {x: 1.68, integration: 6, multiplicity: 's'}]);
export const irAromatic = () => mk('IR', [{x: 3030, y: 30}, {x: 2965, y: 40}, {x: 1600, y: 55}, {x: 1495, y: 60}, {x: 755, y: 90}, {x: 700, y: 85}]);

/** What the legacy golden records for one analysis (no timings). */
export async function summarise(spectra: Parameters<typeof executeSixStepAnalysis>[0]['spectra'], extraInput: Record<string, unknown>, options: {timeMs?: number; maxStates?: number} = {}) {
  const r = await executeSixStepAnalysis({spectra, extraInput}, options);
  const s = r.solvedConstraintSpace.searchResult;
  const cs = r.reasoningTrace?.compositionSearch;
  return {
    mode: cs?.mode ?? null,
    runs: (cs?.runs ?? []).map(x => ({hypothesisId: x.hypothesisId, formula: x.formula ?? null, maxStates: x.maxStates, visited: x.visited, termination: x.termination, candidates: x.candidates, diagnostic: x.diagnostic})),
    smiles: s?.smiles ?? [],
    termination: s?.termination ?? null,
    complete: s?.complete ?? null,
    ranked: r.rankedCandidates.map(c => c.smiles),
    validated: r.validatedGraphs.length,
    rejected: r.rejectedCandidates.length,
    statusCode: r.generationStatus?.code ?? null,
    stages: r.reasoningTrace?.stages.length ?? null,
  };
}
