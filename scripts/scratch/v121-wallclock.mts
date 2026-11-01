// v1.2.1 stage 2A, step 2-0: measurement of the DEFAULT wall-clock budget (what modeA.worker uses: executeSixStepAnalysis(input, {shouldCancel, onProgress}) — no timeMs, no maxStates).
// SYNTHETIC shapes only (tests/fixtures/v121). No formula is given. Usage: tsx scripts/scratch/v121-wallclock.mts [repeats=3] [out.json] [shape,shape,...]
import fs from 'node:fs';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {h1SignalsFromObservations} from '../../src/engines/constraints/v12Evidence';
import {canonNoStereo, fixtureSpectra, inferFixture, loadFixture} from '../../tests/helpers/v121Golden';

const repeats = Number(process.argv[2] ?? 3);
const outFile = process.argv[3];
const ids = (process.argv[4] ?? 'S1,G1,E1,G3,D1,S2,S3').split(',');
await initializeRDKit();
const out: any[] = [];
for (const id of ids) {
  const f = loadFixture(id);
  // The declared solvent must reach the pipeline (the stage-1c helper bug: it once did not). Abort when what the observations carry differs from the fixture.
  const seen = h1SignalsFromObservations(inferFixture(id).evidence.observations).solvent;
  console.log(`${id}: fixture solvent ${f.h1.solvent}, solvent read by the pipeline ${seen}`);
  if (seen !== f.h1.solvent) throw new Error(`${id}: solvent not declared to the pipeline (${seen} vs ${f.h1.solvent})`);
  for (let rep = 1; rep <= repeats; rep++) {
    const spectra = fixtureSpectra(f);
    const nmr = spectra['1H_NMR'] as any;
    const t0 = performance.now();
    const r = await executeSixStepAnalysis({spectra, extraInput: {}}, {});
    const total = performance.now() - t0;
    const cs = r.reasoningTrace?.compositionSearch;
    const runs = cs?.runs ?? [];
    const hyps = r.compositionInference?.hypotheses ?? [];
    const target = hyps.find(h => h.formula === f.formula);
    const smiles = (r.solvedConstraintSpace.searchResult?.smiles ?? []).map(canonNoStereo);
    const perRun = runs.map((x: any) => {
      const e = x.enumeration?.runs?.[0] ?? x.enumeration;
      const pl = e?.planning;
      const r2 = pl?.round2ElapsedMs ?? 0;
      return {
        formula: x.formula, termination: x.termination, visited: x.visited, candidates: x.candidates, totalMs: Math.round(x.elapsedMs),
        round1Ms: Math.round((e?.elapsedMs ?? x.elapsedMs) - r2), round2Ms: Math.round(r2), round: pl?.round ?? null,
        reasons: x.enumeration?.incompleteReasons ?? e?.incompleteReasons ?? [], path: e?.v12?.path ?? null,
      };
    });
    const searchPlans = hyps.filter(h => h.searched).map(h => ({formula: h.formula, plan: h.searchPlan}));
    const timeBudgetRuns = perRun.filter((x: any) => x.termination === 'TIME_BUDGET' || x.reasons.includes('TIME_BUDGET'));
    const rec = {
      shape: id, rep, nmrSolvent: nmr.nmrSolvent, totalMs: Math.round(total),
      targetFormula: f.formula, targetRank: target ? hyps.indexOf(target) + 1 : null, targetSearched: target?.searched ?? false,
      targetInOutput: smiles.includes(canonNoStereo(f.targetSmiles)), outputCount: smiles.length,
      searchedFormulas: runs.length, round1Ms: perRun.reduce((s: number, x: any) => s + x.round1Ms, 0), round2Ms: perRun.reduce((s: number, x: any) => s + x.round2Ms, 0),
      round2Formulas: perRun.filter((x: any) => x.round === 2).length,
      timeBudgetRuns: timeBudgetRuns.map((x: any) => ({formula: x.formula, termination: x.termination, round: x.round, visited: x.visited, round1Ms: x.round1Ms, round2Ms: x.round2Ms})),
      zeroStepRuns: perRun.filter((x: any) => x.visited === 0).map((x: any) => x.formula),
      mode: cs?.mode, statusCode: r.generationStatus?.code, searchTermination: r.solvedConstraintSpace.searchResult?.termination,
      perRun,
    };
    out.push(rec);
    console.log(`${id} #${rep}: total ${rec.totalMs} ms, R1 ${rec.round1Ms} ms, R2 ${rec.round2Ms} ms, target rank ${rec.targetRank} searched=${rec.targetSearched} inOutput=${rec.targetInOutput}, runs=${rec.searchedFormulas}, TIME_BUDGET runs=${timeBudgetRuns.length} (${timeBudgetRuns.map((x: any) => `${x.formula}/r${x.round}/${x.visited}`).join(' ')}), zero-step=${rec.zeroStepRuns.length}`);
  }
}
const meta = {node: process.version, platform: process.platform, repeats, analysis: ENUMERATION_CONFIG.analysis, legacySupplementWhenIncomplete: ENUMERATION_CONFIG.legacySupplementWhenIncomplete, useV121Planning: (V12_CONFIG as any).useV121Planning, planning: (V12_CONFIG as any).planning, date: new Date().toISOString()};
if (outFile) fs.writeFileSync(outFile, JSON.stringify({meta, out}, null, 1));
