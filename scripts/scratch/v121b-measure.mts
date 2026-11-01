// v1.2.1 stage 2B acceptance 1 and 2: the seven synthetic shapes, no formula, in two budget modes, repeated. SYNTHETIC shapes only (tests/fixtures/v121); nothing from benchmark\.
// Usage: tsx scripts/scratch/v121b-measure.mts <steps|wall> [repeats=3] [out.json] [shape,shape,...]
//   steps: step budget only (timeMs 3 600 000, maxStates 8 000 000 = SHAPE_BUDGET of the tests); wall: executeSixStepAnalysis(input, {}) = the default 15 s / 100 M steps of modeA.worker.
import fs from 'node:fs';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {h1SignalsFromObservations} from '../../src/engines/constraints/v12Evidence';
import {exclusionStats} from '../../src/engines/enumeration/exclusionStats';
import {canonNoStereo, fixtureSpectra, inferFixture, loadFixture, SHAPE_BUDGET} from '../../tests/helpers/v121Golden';

const mode = (process.argv[2] ?? 'wall') as 'steps' | 'wall';
const repeats = Number(process.argv[3] ?? 3);
const outFile = process.argv[4];
const ids = (process.argv[5] ?? 'S1,G1,E1,G3,D1,S2,S3').split(',');
await initializeRDKit();
// Diagnostics: V121B_OFF=forbiddenFragments,vinylWindows,carbonylBand switches those sub-switches off (A/B timing on one machine).
for (const k of (process.env.V121B_OFF ?? '').split(',').filter(Boolean)) (V12_CONFIG.planning as any)[k] = false;
const out: any[] = [];
for (const id of ids) {
  const f = loadFixture(id);
  const seen = h1SignalsFromObservations(inferFixture(id).evidence.observations).solvent;
  console.log(`${id}: fixture solvent ${f.h1.solvent}, solvent read by the pipeline ${seen}`);
  if (seen !== f.h1.solvent) throw new Error(`${id}: solvent not declared to the pipeline (${seen} vs ${f.h1.solvent})`);
  for (let rep = 1; rep <= repeats; rep++) {
    const spectra = fixtureSpectra(f);
    const t0 = performance.now();
    const r = await executeSixStepAnalysis({spectra, extraInput: {}}, mode === 'steps' ? SHAPE_BUDGET : {});
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
        reasons: x.enumeration?.incompleteReasons ?? e?.incompleteReasons ?? [], forbiddenById: e?.rejected?.v12?.forbiddenById ?? {}, legacyDropped: e?.legacySupplement?.droppedByForbiddenById ?? {},
      };
    });
    const stats = exclusionStats(runs.map((x: any) => x.enumeration), r.rejectedCandidates);
    const targetCanon = canonNoStereo(f.targetSmiles);
    const rec = {
      shape: id, mode, rep, totalMs: Math.round(total), targetFormula: f.formula, targetRank: target ? hyps.indexOf(target) + 1 : null, targetSearched: target?.searched ?? false,
      targetInOutput: smiles.includes(targetCanon), targetRanked: r.rankedCandidates.some(c => canonNoStereo(c.smiles) === targetCanon), outputCount: smiles.length,
      searchedFormulas: runs.length, round1Ms: perRun.reduce((s: number, x: any) => s + x.round1Ms, 0), round2Ms: perRun.reduce((s: number, x: any) => s + x.round2Ms, 0), round1Visited: runs.reduce((s: number, x: any) => s + (x.enumeration?.planning?.round1Visited ?? 0), 0),
      round2Formulas: perRun.filter((x: any) => x.round === 2).length,
      forbidden: (stats.forbidden ?? []), exclusionTotal: stats.total,
      inventoryAlternatives: runs.map((x: any) => (x.enumeration?.v12?.inventory?.alternatives ?? null)),
      perRun,
    };
    out.push(rec);
    console.log(`${id} ${mode} #${rep}: total ${rec.totalMs} ms, R1 ${rec.round1Ms} ms, R2 ${rec.round2Ms} ms, R1 steps ${rec.round1Visited}, target rank ${rec.targetRank} searched=${rec.targetSearched} inOutput=${rec.targetInOutput}, runs=${rec.searchedFormulas}, forbidden=${(stats.forbidden ?? []).map((x: any) => `${x.id}:${x.count}`).join(',') || '-'}`);
  }
}
const meta = {node: process.version, platform: process.platform, mode, repeats, analysis: ENUMERATION_CONFIG.analysis, legacySupplementWhenIncomplete: ENUMERATION_CONFIG.legacySupplementWhenIncomplete, useV121Planning: V12_CONFIG.useV121Planning, planning: V12_CONFIG.planning};
if (outFile) fs.writeFileSync(outFile, JSON.stringify({meta, out}, null, 1));
