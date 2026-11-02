import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {STEP_ONLY_TIME_MS, fixtureSpectra, loadFixture} from '../helpers/v121Golden';

// One real v1.2.1 analysis of the SYNTHETIC fixture S1 (tests/fixtures/v121/S1.json, hand-written), shared by the UI tests.
// Step budget only (timeMs is far away), so the result does not depend on the machine's speed. The functional-group and IR-finding parts do not depend on the budget at all.
type S1Result = Awaited<ReturnType<typeof executeSixStepAnalysis>>;
let cached: Promise<S1Result> | null = null;
export const S1_BUDGET = {timeMs: STEP_ONLY_TIME_MS, maxStates: 300_000};
export function s1Analysis(): Promise<S1Result> {
  cached ??= (async () => {
    await initializeRDKit();
    // v1.2.3: the UI tests were written against the 1.2.2 analysis of S1 (22 functional-group findings etc.); the v1.2.3 engine rules (e.g. the amide I ring-band downgrade) are not what they test, so the analysis runs with useV123 = false.
    const was = V12_CONFIG.useV123;
    V12_CONFIG.useV123 = false;
    try { return await executeSixStepAnalysis({spectra: fixtureSpectra(loadFixture('S1')), extraInput: {}}, S1_BUDGET); } finally { V12_CONFIG.useV123 = was; }
  })();
  return cached;
}
