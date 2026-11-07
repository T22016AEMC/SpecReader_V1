// v1.3.1: record the baseline (V131=off = v1.3.0 behaviour) or the on-state of the parsimony samples. SYNTHETIC samples only.
// Usage: tsx scripts/scratch/v131-record.mts <out.json>   Env V131=off sets V12_CONFIG.useV131 = false.
import fs from 'node:fs';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {measureV131, V131_CASES} from '../../tests/helpers/v131Samples';
if (process.env.V131 === 'off') V12_CONFIG.useV131 = false;
await initializeRDKit();
const out = [];
for (const c of V131_CASES) { const m = await measureV131(c); out.push(m); console.log(`${c.sample}${c.typed ? ':typed' : ''} rank ${m.targetRank}/${m.ranked}  ${m.top.map(t => `${t.score}${t.prior ? `(-${t.prior})` : ''}${t.isTarget ? '*' : ''}`).join(' ')}`); }
fs.writeFileSync(process.argv[2], JSON.stringify({description: `v1.3.1: parsimony samples (tests/helpers/v131Samples.ts), useV131 = ${V12_CONFIG.useV131}, dense IR baseline, step budget only`, samples: out}, null, 1));
