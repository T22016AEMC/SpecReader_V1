import {canonicalizeMolecule, rdkitStatus} from '../scientificEngines/rdkitAdapter';
import {plausibilityViolations} from '../scientificEngines/structurePlausibility';
import {ENUMERATION_CONFIG as CFG, type StrainProfile, type StrainProfileId} from './enumerationConfig';
import {buildMolBlock} from './molBlock';
import {buildProblem, parseFormula, type Problem} from './problem';
import {Searcher, type NewBond} from './search';
import {strainViolations} from './strain';
import type {EnumerationError, EnumerationRequest, EnumerationResult, FragmentAlternativeSet, IncompleteReason, RejectionStats, SetOutcome} from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function resolveStrain(strain: StrainProfileId | StrainProfile | null | undefined): StrainProfile | null {
  if (!strain) return null;
  return typeof strain === 'string' ? CFG.strainProfiles[strain] : strain;
}

/**
 * Enumerates the molecules that satisfy a molecular formula and, per alternative set, a list of required fragments.
 * Complete relative to the request: COMPLETE means every branch was explored and no budget was reached; it never means
 * "all possible structures". Cooperative: yields to the event loop, supports cancel and progress.
 */
export async function enumerateStructures(req: EnumerationRequest): Promise<EnumerationResult> {
  const started = now();
  const budget = req.budget ?? {};
  const timeMs = budget.timeMs ?? CFG.budget.timeMs, maxStates = budget.maxStates ?? CFG.budget.maxStates, maxCandidates = budget.maxCandidates ?? CFG.budget.maxCandidates;
  const rejected: RejectionStats = {sanitizeFailed: 0, duplicatesMerged: 0, notConnected: 0, forbiddenByRule: {}, strainByRule: {}, approximate: false};
  const result: EnumerationResult = {status: 'COMPLETE', incompleteReasons: [], candidates: [], errors: [], sets: [], stats: {visited: 0, leaves: 0, elapsedMs: 0, rejected}};
  const finish = (): EnumerationResult => { result.stats.elapsedMs = now() - started; return result; };
  const invalid = (e: EnumerationError): EnumerationResult => { result.status = 'INVALID_REQUEST'; result.errors.push(e); return finish(); };

  const parsed = parseFormula(req.formula);
  if (!parsed.ok) return invalid(parsed.error);
  const formula = parsed.counts;
  if (!rdkitStatus().available) return invalid({code: 'RDKIT_UNAVAILABLE', message: 'RDKit/WASM 尚未載入，無法以規範化 SMILES 去重；窮舉器不能執行'});
  const alternatives: FragmentAlternativeSet[] = req.alternatives?.length ? req.alternatives : [{id: 'FREE', fragments: []}];
  const plaus = req.forbid?.plausibility;
  const strain = resolveStrain(req.forbid?.strain);
  const nOxygenAllowed = plaus ? plaus.nitrogenEvidence && (plaus.irNO || plaus.irNOxide) : true;
  const rules = {noPeroxide: plaus ? !plaus.userFormula : false, noNitrogenOxygen: plaus ? !nOxygenAllowed : false};

  const found = new Map<string, string[]>();
  const rejectedSeen = new Set<string>();
  const reasons = new Set<IncompleteReason>();
  let visited = 0, leaves = 0, lastYield = now(), lastProgress = 0;
  let stopAll = false;

  // Fair share: every runnable set gets an equal part of what is left (time and steps); unused budget carries over.
  const prebuilt = alternatives.map(set => buildProblem(formula, set));
  const runnable = prebuilt.map(b => b.ok);
  for (let si = 0; si < alternatives.length; si++) {
    const set = alternatives[si];
    const outcome: SetOutcome = {id: set.id, complete: null, error: null, visited: 0, leaves: 0, newCandidates: 0, incompleteReasons: []};
    result.sets.push(outcome);
    if (stopAll) { outcome.incompleteReasons.push('ALTERNATIVE_SET_NOT_RUN'); reasons.add('ALTERNATIVE_SET_NOT_RUN'); continue; }
    const built = prebuilt[si];
    if (!built.ok) {
      outcome.error = built.error; result.errors.push(built.error);
      reasons.add('INVALID_ALTERNATIVE_SET');
      continue;
    }
    const problem: Problem = built.problem;
    const leftSets = runnable.slice(si).filter(Boolean).length;
    const setDeadline = now() + Math.max(0, timeMs - (now() - started)) / leftSets;
    const setStateEnd = visited + Math.max(0, Math.floor((maxStates - visited) / leftSets));
    const setCandidateEnd = found.size + Math.max(1, Math.floor((maxCandidates - found.size) / leftSets));
    let stopReason: IncompleteReason | null = null;
    const searcher: Searcher = new Searcher(problem, rules, (newBonds: NewBond[]) => {
      const c = canonicalizeMolecule(buildMolBlock(problem, newBonds));
      if (!c.valid) { rejected.sanitizeFailed++; return; }
      // Safety net: constitution only. Zero coordinates already prevent stereo perception; strip any marker that still appears.
      const smiles = /[\\/@]/.test(c.canonical) ? canonicalizeMolecule(c.canonical.replace(/[\\/]/g, '').replace(/@+/g, '')).canonical : c.canonical;
      const sources = found.get(smiles);
      if (sources) { rejected.duplicatesMerged++; if (!sources.includes(set.id)) sources.push(set.id); return; }
      if (rejectedSeen.has(smiles)) return;
      const remember = () => { if (rejectedSeen.size < CFG.maxTrackedRejected) rejectedSeen.add(smiles); else rejected.approximate = true; };
      if (strain) {
        const v = strainViolations(problem.n, [...problem.fixedBonds, ...newBonds], strain);
        if (v.length) { for (const rule of v) rejected.strainByRule[rule] = (rejected.strainByRule[rule] ?? 0) + 1; remember(); return; }
      }
      if (plaus && req.forbid?.plausibilityLeaf !== false) {
        const v = plausibilityViolations(smiles, plaus);
        if (v.length) { for (const x of v) rejected.forbiddenByRule[x.rule] = (rejected.forbiddenByRule[x.rule] ?? 0) + 1; remember(); return; }
      }
      if (found.size >= setCandidateEnd) { stopReason = 'CANDIDATE_LIMIT'; searcher.requestStop(); return; }
      found.set(smiles, [set.id]);
      outcome.newCandidates++;
    });
    let status: 'DONE' | 'PAUSED' | 'STOPPED' = 'PAUSED';
    if (searcher.rootRejection) status = 'DONE';
    while (status === 'PAUSED') {
      if (budget.shouldCancel?.()) { stopReason = 'CANCELLED'; break; }
      const t = now();
      if (t - started >= timeMs || t >= setDeadline) { stopReason = 'TIME_BUDGET'; break; }
      const left = setStateEnd - visited;
      const before = searcher.visited;
      status = searcher.run(Math.max(0, Math.min(CFG.stepsPerCheck, left)));
      visited += searcher.visited - before;
      if (status === 'PAUSED' && setStateEnd - visited <= 0) { stopReason = 'STATE_BUDGET'; break; }
      const t2 = now();
      if (budget.onProgress && t2 - lastProgress >= CFG.progressEveryMs) { lastProgress = t2; budget.onProgress({visited, candidates: found.size, elapsedMs: t2 - started, alternativeSetId: set.id}); }
      if (t2 - lastYield >= CFG.yieldEveryMs) { await yieldToEventLoop(); lastYield = now(); }
    }
    if (status === 'STOPPED' && !stopReason) stopReason = 'CANDIDATE_LIMIT';
    leaves += searcher.leaves;
    outcome.visited = searcher.visited; outcome.leaves = searcher.leaves;
    if (stopReason) {
      outcome.complete = false; outcome.incompleteReasons.push(stopReason); reasons.add(stopReason);
      // Only a global limit (or cancel / candidate cap) ends the whole request; a set that used up its own share lets the others run.
      const globalSpent = now() - started >= timeMs || maxStates - visited <= 0;
      if (stopReason === 'CANCELLED' || globalSpent || (stopReason === 'CANDIDATE_LIMIT' && found.size >= maxCandidates)) stopAll = true;
    }
    else outcome.complete = true;
  }
  result.stats.visited = visited; result.stats.leaves = leaves;
  result.candidates = [...found.entries()].map(([smiles, alternativeSetIds]) => ({smiles, alternativeSetIds})).sort((a, b) => (a.smiles < b.smiles ? -1 : a.smiles > b.smiles ? 1 : 0));
  result.incompleteReasons = [...reasons];
  if (!result.sets.some(s => s.error === null && s.complete !== null)) {
    result.status = 'INVALID_REQUEST';
  } else result.status = reasons.size ? 'INCOMPLETE' : 'COMPLETE';
  return finish();
}
