// v1.3.1: print the ledger entries of selected candidates of one sample. Usage: tsx scripts/scratch/v131-ledger.mts <sample> <smiles,smiles>
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {loadV123} from '../../tests/helpers/v123Samples';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from '../../tests/helpers/v121Golden';
const [, , sample, list] = process.argv;
await initializeRDKit();
const f = loadV123(sample);
const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: {}}, SHAPE_BUDGET);
for (const s of list.split(',')) {
  const c = r.rankedCandidates.find(c => canonNoStereo(c.smiles) === canonNoStereo(s));
  if (!c) { console.log('NOT FOUND', s); continue; }
  const L = c.scientificScoreLedger!;
  console.log(`== ${s} score ${c.finalScore} total ${L.totalScore.toFixed(3)} modality ${JSON.stringify(L.modalityScores)} weights ${JSON.stringify(L.modalityWeights)}`);
  for (const e of L.entries) console.log(`  ${e.sourceModality.padEnd(7)} w=${e.weight.toFixed(2)} c=${e.compatibility === null ? 'null' : e.compatibility.toFixed(2)} contr=${e.contribution.toFixed(2)} ${e.method.slice(0, 90)} ${e.display ? '| ' + e.display.slice(0, 80) : ''}`);
}
