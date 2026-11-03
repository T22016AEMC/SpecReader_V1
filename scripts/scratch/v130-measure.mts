// v1.3.0: measure the synthetic samples (tests/helpers/v130Samples.ts) and write the JSON. SYNTHETIC samples only.
// Usage: tsx scripts/scratch/v130-measure.mts <out.json> [sample,sample,...]   Env V130=off sets V12_CONFIG.useV130 = false (the baseline is written with it off = v1.2.3 behaviour).
import fs from 'node:fs';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {measureV130, V130_CASES} from '../../tests/helpers/v130Samples';

const [, , outFile, listArg] = process.argv;
if (process.env.V130 === 'off') V12_CONFIG.useV130 = false;
const cases = listArg ? V130_CASES.filter(c => listArg.split(',').includes(c.sample)) : V130_CASES;
await initializeRDKit();
const out = [];
for (const c of cases) {
  const t0 = Date.now();
  const m = await measureV130(c);
  out.push(m);
  console.log(`${c.sample.padEnd(11)} ${c.typed ? 'typed ' : 'no-fml'} target rank ${m.targetRank ?? 'NONE'} / ${m.ranked}  [${Date.now() - t0} ms] top3: ${m.top5.slice(0, 3).map(t => t.smiles).join('  ')}  searched: ${m.runs.map(r => r.formula).join(',')}`);
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
