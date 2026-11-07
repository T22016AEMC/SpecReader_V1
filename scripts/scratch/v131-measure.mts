// v1.3.1: measure ranks and scores of synthetic samples (tests/helpers/v123Samples.ts loadV123; `v131/<id>` = tests/fixtures/v131). SYNTHETIC samples only.
// Usage: tsx scripts/scratch/v131-measure.mts <out.json> <sample[:typed],...> ; Env V131=off sets V12_CONFIG.useV131 = false; TOP=n lists the top n.
import fs from 'node:fs';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {measureSample, loadV123} from '../../tests/helpers/v123Samples';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from '../../tests/helpers/v121Golden';

const [, , outFile, listArg] = process.argv;
if (process.env.V131 === 'off') (V12_CONFIG as any).useV131 = false;
if (process.env.SUBOFF) (V12_CONFIG as any).v131[process.env.SUBOFF] = false;
const top = Number(process.env.TOP ?? 6);
await initializeRDKit();
const out: any[] = [];
for (const item of listArg.split(',')) {
  const [sample, typedFlag] = item.split(':');
  const f = loadV123(sample);
  const t0 = Date.now();
  const spectra = fixtureSpectra(f, {denseBaseline: true});
  const r = await executeSixStepAnalysis({spectra, extraInput: typedFlag ? {molecularFormula: f.formula} : {}}, SHAPE_BUDGET);
  const tc = canonNoStereo(f.targetSmiles);
  const ranked = r.rankedCandidates;
  const rank = ranked.findIndex(c => canonNoStereo(c.smiles) === tc) + 1;
  const rows = ranked.slice(0, top).map((c, i) => `   ${i + 1}. ${c.finalScore} (${c.scientificScoreLedger!.totalScore.toFixed(2)}) ${c.molecularFormula} ${c.smiles}${canonNoStereo(c.smiles) === tc ? '  <== target' : ''}`);
  console.log(`${sample}${typedFlag ? ':typed' : ''} target rank ${rank || 'NONE'} / ${ranked.length} [${Date.now() - t0} ms]\n${rows.join('\n')}`);
  out.push({sample, typed: !!typedFlag, rank: rank || null, top: ranked.slice(0, top).map(c => ({smiles: c.smiles, f: c.molecularFormula, score: c.finalScore, total: c.scientificScoreLedger!.totalScore}))});
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
