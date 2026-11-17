import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET, STEP_ONLY_TIME_MS} from './v121Golden';
import {loadV123} from './v123Samples';
import {ei} from './p1bScenarios';

// v1.3.2 stop 4: the eight "with a mass" scenarios of the stop-3 report: a synthetic low-resolution EI molecular ion (M, M+1, M+2 from the carbon / nitrogen / oxygen count) added to a fixture's IR and 1H.
// They show the order of the formula hypotheses (search priority) and the final rank of the target structure. SYNTHETIC only; step budget only (the legacy beam search's 500 ms clock is switched to steps for the run).
export interface V132Scenario {sample: string; mz: number; nC: number; nN: number; nO: number}
export const V132_SCENARIOS: V132Scenario[] = [
  {sample: 'v130/ALK1', mz: 112, nC: 8, nN: 0, nO: 0}, {sample: 'v130/ALK0', mz: 112, nC: 8, nN: 0, nO: 0}, {sample: 'v132/CYHEX_A', mz: 82, nC: 6, nN: 0, nO: 0}, {sample: 'v132/XYL_mod', mz: 106, nC: 8, nN: 0, nO: 0},
  {sample: 'M1', mz: 132, nC: 6, nN: 0, nO: 3}, {sample: 'v130/AMD1', mz: 135, nC: 8, nN: 1, nO: 1}, {sample: 'v130/EST1', mz: 150, nC: 9, nN: 0, nO: 2}, {sample: 'v130/HCA', mz: 150, nC: 9, nN: 0, nO: 2},
];
export interface V132ScenarioMeasure {sample: string; formula: string; formulaRank: number | null; hypotheses: number; top3: string[]; searched: boolean | null; targetRank: number | null}
export async function measureScenario(s: V132Scenario): Promise<V132ScenarioMeasure> {
  const legacy = ENUMERATION_CONFIG.legacySupplement as {timeMsPerRun: number}, was = legacy.timeMsPerRun;
  legacy.timeMsPerRun = STEP_ONLY_TIME_MS;
  try {
    const f = loadV123(s.sample);
    const m1 = s.nC * 1.08 + s.nN * 0.37, m2 = s.nO * 0.2 + (s.nC * 1.08) ** 2 / 200;
    const spectra = {...fixtureSpectra(f, {denseBaseline: true}), MS: ei([{x: s.mz, y: 100}, {x: s.mz + 1, y: +m1.toFixed(2)}, {x: s.mz + 2, y: +m2.toFixed(2)}])} as unknown as Parameters<typeof executeSixStepAnalysis>[0]['spectra'];
    const r = await executeSixStepAnalysis({spectra, extraInput: {}}, SHAPE_BUDGET);
    const hyps = r.compositionInference?.hypotheses ?? [];
    const hi = hyps.findIndex(h => h.formula === f.formula);
    const tc = canonNoStereo(f.targetSmiles), ti = r.rankedCandidates.findIndex(x => canonNoStereo(x.smiles) === tc);
    return {sample: s.sample, formula: f.formula, formulaRank: hi < 0 ? null : hi + 1, hypotheses: hyps.length, top3: hyps.slice(0, 3).map(h => h.formula), searched: hi < 0 ? null : hyps[hi].searched ?? false, targetRank: ti < 0 ? null : ti + 1};
  } finally { legacy.timeMsPerRun = was; }
}
