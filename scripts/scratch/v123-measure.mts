// v1.2.3: measure the synthetic samples (tests/fixtures/v123 and v121/S2, v121/G3), sparse and dense IR baseline, step budget only. SYNTHETIC samples only; nothing from benchmark\.
// Usage: tsx scripts/scratch/v123-measure.mts <out.json> [sample,sample,...] [sparse|dense|both]
//   no sample list = all A-class samples; "all" = A and B class. Env V123=off sets V12_CONFIG.useV123 = false when that flag exists (stop 2).
import fs from 'node:fs';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {measureSample, V123_A_SAMPLES, V123_ALL_SAMPLES} from '../../tests/helpers/v123Samples';
import type {SampleMeasure} from '../../tests/helpers/v123Samples';

const [, , outFile, listArg, modeArg = 'both'] = process.argv;
const ids: string[] = !listArg ? [...V123_A_SAMPLES] : listArg === 'all' ? [...V123_ALL_SAMPLES] : listArg.split(',');
const modes = (modeArg === 'both' ? ['sparse', 'dense'] : [modeArg]) as ('sparse' | 'dense')[];
if (process.env.V123 === 'off' && 'useV123' in V12_CONFIG) (V12_CONFIG as unknown as {useV123: boolean}).useV123 = false;
if (process.env.V123_SUB) for (const kv of process.env.V123_SUB.split(',')) { const [k, v] = kv.split('='); (V12_CONFIG.v123 as Record<string, unknown>)[k] = v === 'true' ? true : v === 'false' ? false : Number(v); }
await initializeRDKit();
const results: SampleMeasure[] = [];
for (const id of ids) for (const mode of modes) {
  const t0 = Date.now();
  const m = await measureSample(id, mode);
  results.push(m);
  console.log(`${m.id.padEnd(4)} ${mode.padEnd(6)} target rank ${m.targetRank ?? 'NONE'} (hyp rank ${m.targetHypothesisRank ?? '-'}, searched ${m.targetSearched}) steps ${m.steps} N-in-top5 ${m.nInTop5} implausible-N-in-top5 ${m.implausibleNInTop5} [${Date.now() - t0} ms] top3: ${m.top5.slice(0, 3).map(t => t.smiles).join('  ')}`);
}
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
