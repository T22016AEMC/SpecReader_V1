// v1.2.3 stop 3: wall-clock check with the user's DEFAULT settings (executeSixStepAnalysis(input, {}) = 15 s / 100 M steps of modeA.worker). Synthetic samples only. Run once, nothing else running.
// Usage: [V123=off] tsx scripts/scratch/v123-wallclock.mts [sample,sample,...] [repeats=1]
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {canonNoStereo, fixtureSpectra} from '../../tests/helpers/v121Golden';
import {loadV123, V123_ALL_SAMPLES} from '../../tests/helpers/v123Samples';

const ids = process.argv[2] ? process.argv[2].split(',') : [...V123_ALL_SAMPLES];
const repeats = Number(process.argv[3] ?? 1);
if (process.env.V123 === 'off') V12_CONFIG.useV123 = false;
await initializeRDKit();
let worst = 0;
for (const id of ids) for (let i = 0; i < repeats; i++) {
  const f = loadV123(id);
  const t0 = performance.now();
  const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: {}}, {});
  const ms = performance.now() - t0;
  worst = Math.max(worst, ms);
  const runs = r.reasoningTrace?.compositionSearch?.runs ?? [];
  const rank = r.rankedCandidates.findIndex(c => canonNoStereo(c.smiles) === canonNoStereo(f.targetSmiles)) + 1;
  console.log(`${f.id.padEnd(4)} ${(ms / 1000).toFixed(2)} s  target rank ${rank || 'NONE'}  steps ${runs.reduce((a, x) => a + x.visited, 0)}  time-budget stops ${runs.filter(x => x.termination === 'TIME_BUDGET').length}  status ${r.generationStatus?.code}`);
}
console.log(`slowest ${(worst / 1000).toFixed(2)} s of the 15 s default`);
