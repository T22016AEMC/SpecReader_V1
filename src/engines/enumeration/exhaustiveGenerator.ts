import type {DeNovoSearchResult, SearchTermination} from '../scientificEngines/deNovoGraphSearch';
import type {StructureGenerator} from '../composition/structureGenerator';
import {parseFormula} from './problem';
import {adaptLocalStructures} from './adapter';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import {enumerateStructures} from './enumerate';
import type {EnumerationDiagnostics, EnumerationResult, EnumerationRunDiagnostic} from './types';

const FORMULA_INCOMPATIBLE = ['FORMULA_ELEMENT_SHORTAGE', 'FORMULA_HYDROGEN_SHORTAGE', 'FORMULA_HYDROGEN_EXCESS', 'VALENCE_PARITY'];

const emptyDiagnostics = (run: EnumerationRunDiagnostic): EnumerationDiagnostics => ({
  used: run.used, complete: run.used && run.complete, runs: [run], enumerated: run.candidates, scored: 0, deferred: {count: 0, samples: [], prefilter: null}, maxScoredCandidates: CFG.analysis.maxScoredCandidates,
});
const legacyRun = (formula: string | undefined, reason: string, notes: string[] = []): EnumerationRunDiagnostic => ({
  used: false, fallbackReason: reason, formula: formula ?? null, status: null, complete: false, incompleteReasons: [], readings: [], incompatibleReadings: 0,
  candidates: 0, visited: 0, leaves: 0, elapsedMs: 0, rejected: null, conversions: [], notes,
});

/**
 * The exhaustive generator behind the existing StructureGenerator interface (P1b). It enumerates, for the requested formula, all
 * molecules that contain the fragments of each reading of the evidence (relative to those constraints, see docs/P1B_DESIGN.md).
 * Requests it cannot express (no formula, unconvertible local structures, no fragments for a large formula, unusable readings)
 * are delegated to `legacy` and the reason is recorded in `search.enumeration`; it never fails the analysis.
 */
export function createExhaustiveGenerator(legacy: StructureGenerator): StructureGenerator {
  return {
    async generateStructures(request) {
      const {formula, hints} = request;
      const fallback = async (reason: string, notes: string[] = [], attempt?: EnumerationResult): Promise<DeNovoSearchResult> => {
        // With a shared pool the legacy search only gets what the enumeration attempt left over.
        const req = request.sharedPool && attempt ? {...request, budget: {...request.budget, maxStates: Math.max(0, request.budget.maxStates - attempt.stats.visited), timeMs: Math.max(0, request.budget.timeMs - attempt.stats.elapsedMs)}} : request;
        const search = await legacy.generateStructures(req);
        const run = legacyRun(formula, reason, notes);
        if (attempt) { run.status = attempt.status; run.incompleteReasons = attempt.incompleteReasons; run.visited = attempt.stats.visited; run.leaves = attempt.stats.leaves; run.elapsedMs = attempt.stats.elapsedMs; }
        return {...search, enumeration: emptyDiagnostics(run)};
      };
      if (!formula) return fallback('沒有分子式，維持舊搜尋');
      const parsed = parseFormula(formula);
      if (!parsed.ok) return fallback(`分子式無法解析：${parsed.error.message}`);
      const heavy = Object.entries(parsed.counts).reduce((s, [e, n]) => s + (e === 'H' ? 0 : n), 0);
      const locals = (request.unprepared ?? hints).localStructures ?? [];
      const adapted = adaptLocalStructures({localStructures: locals, symmetryMultiple: request.symmetryMultiple ?? null, formula: parsed.counts});
      if (!adapted.ok) return fallback(`局部結構無法完整轉成片段：${adapted.fallbackReason}`, adapted.notes);
      if (!locals.length && heavy > CFG.adapter.maxHeavyAtomsWithoutFragments) return fallback(`沒有任何片段而且重原子數 ${heavy} 超過 ${CFG.adapter.maxHeavyAtomsWithoutFragments}，純分子式窮舉無法在預算內完成`, adapted.notes);

      const eb = request.enumerationBudget ?? {timeMs: CFG.analysis.timeMs, maxStates: CFG.analysis.maxStates, maxCandidates: CFG.analysis.maxCandidatesPerFormula};
      let visitedExtra = 0, elapsedExtra = 0;
      const result: EnumerationResult = await enumerateStructures({
        formula: parsed.counts,
        alternatives: adapted.sets,
        // By default the existing downstream gate is the only plausibility filter (it rejects and records); with
        // pipelineEarlyPlausibilityPrune the monotone rules (no O–O without a user formula, no N–O without N–O evidence) prune inside the
        // search and the other rules still stay with the downstream gate. The evidence also ranks such candidates last when the cap applies.
        forbid: {...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {}), strain: CFG.pipelineStrainProfile},
        budget: {
          timeMs: eb.timeMs, maxStates: eb.maxStates, maxCandidates: eb.maxCandidates ?? CFG.analysis.maxCandidatesPerFormula, shouldCancel: request.budget.shouldCancel,
          onProgress: request.budget.onProgress ? p => request.budget.onProgress!({visited: p.visited, candidateCount: p.candidates, elapsedMs: p.elapsedMs, frontier: 0}) : undefined,
        },
      });
      if (result.status === 'INVALID_REQUEST') {
        return fallback(`窮舉器無法表達此請求（${result.errors.map(e => e.code).join('、') || '未知'}）；所有片段解讀都與分子式不相容或無法轉換`, adapted.notes);
      }
      const incompatibleSets = result.sets.filter(s => s.error && FORMULA_INCOMPATIBLE.includes(s.error.code));
      const otherErrors = result.sets.filter(s => s.error && !FORMULA_INCOMPATIBLE.includes(s.error.code));
      const realReasons = result.incompleteReasons.filter(r => r !== 'INVALID_ALTERNATIVE_SET');
      const complete = realReasons.length === 0 && otherErrors.length === 0;
      const run: EnumerationRunDiagnostic = {
        used: true, fallbackReason: null, formula, status: result.status, complete,
        incompleteReasons: [...realReasons, ...(otherErrors.length ? ['INVALID_ALTERNATIVE_SET' as const] : [])],
        readings: result.sets.map(s => ({id: s.id, localIds: adapted.setLocalIds[s.id] ?? [], complete: s.complete, error: s.error ? `${s.error.code}：${s.error.message}` : null, newCandidates: s.newCandidates})),
        incompatibleReadings: incompatibleSets.length, candidates: result.candidates.length, visited: result.stats.visited, leaves: result.stats.leaves,
        elapsedMs: result.stats.elapsedMs, rejected: result.stats.rejected, conversions: adapted.conversions, notes: adapted.notes,
      };
      const smiles = result.candidates.map(c => c.smiles);
      // Every reading finished but none contains a molecule with this formula (e.g. a C=O reading for C2H6O): the evidence-derived
      // fragments contradict the formula. The formula is the stronger constraint, so relax to formula-only enumeration when that is
      // small enough (otherwise the legacy search is used); scoring then judges the candidates against the evidence.
      let relaxed: EnumerationResult | null = null;
      if (!smiles.length && complete && realReasons.length === 0) {
        if (heavy > CFG.adapter.maxHeavyAtomsWithoutFragments) return fallback(`所有片段讀法都沒有符合分子式的分子，而且重原子數 ${heavy} 太大，無法放寬成純分子式窮舉`, adapted.notes, result);
        relaxed = await enumerateStructures({formula: parsed.counts, forbid: {strain: CFG.pipelineStrainProfile, ...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {})}, budget: {timeMs: eb.timeMs, maxStates: eb.maxStates, maxCandidates: eb.maxCandidates ?? CFG.analysis.maxCandidatesPerFormula, shouldCancel: request.budget.shouldCancel}});
        for (const c of relaxed.candidates) smiles.push(c.smiles);
        run.relaxedToFormulaOnly = {candidates: relaxed.candidates.length, complete: relaxed.status === 'COMPLETE'};
        run.notes = [...run.notes, `所有片段讀法都沒有符合分子式的分子（片段與分子式矛盾）：放寬成只依分子式窮舉，得到 ${relaxed.candidates.length} 個候選（${relaxed.status === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE'}）`];
        run.candidates = smiles.length;
        if (relaxed.status !== 'COMPLETE') { run.complete = false; run.incompleteReasons = [...run.incompleteReasons, ...relaxed.incompleteReasons.filter(r => !run.incompleteReasons.includes(r))]; }
        visitedExtra += relaxed.stats.visited; elapsedExtra += relaxed.stats.elapsedMs;
      }
      // Budget-limited enumeration: add what the bounded legacy beam search finds (never fewer candidates than before).
      let supplement: DeNovoSearchResult | null = null;
      if (!complete && CFG.legacySupplementWhenIncomplete && (realReasons.includes('TIME_BUDGET') || realReasons.includes('STATE_BUDGET'))) {
        const left = request.sharedPool ? {maxStates: Math.max(0, request.budget.maxStates - result.stats.visited), timeMs: Math.max(0, request.budget.timeMs - result.stats.elapsedMs)} : {maxStates: request.budget.maxStates, timeMs: request.budget.timeMs};
        const req = {...request, budget: {...request.budget, maxStates: Math.min(left.maxStates, CFG.legacySupplement.maxStatesPerRun), timeMs: Math.min(left.timeMs, CFG.legacySupplement.timeMsPerRun)}};
        supplement = await legacy.generateStructures(req);
        const seen = new Set(smiles);
        let added = 0;
        for (const s of supplement.smiles) if (!seen.has(s)) { seen.add(s); smiles.push(s); added++; }
        run.notes = [...run.notes, `窮舉未完成（${run.incompleteReasons.join('、')}）：另以舊 beam 搜尋補充，${supplement.smiles.length} 個候選中 ${added} 個為新（舊搜尋 ${supplement.visited} 步）`];
        run.legacySupplement = {candidates: supplement.smiles.length, added, visited: supplement.visited};
        run.candidates = smiles.length;
      }
      const derivations: NonNullable<DeNovoSearchResult['derivations']> = {};
      for (const c of result.candidates) {
        const sid = c.alternativeSetIds[0];
        derivations[c.smiles] = {
          localStructureIds: adapted.setLocalIds[sid] ?? [],
          operations: [`片段組裝窮舉（讀法 ${c.alternativeSetIds.join('、')}；${(adapted.setLocalIds[sid] ?? []).length} 個片段）`],
          observationIds: adapted.setObservationIds[sid] ?? [],
        };
      }
      if (relaxed) for (const c of relaxed.candidates) derivations[c.smiles] = {localStructureIds: [], operations: ['放寬為只依分子式的窮舉（片段讀法與分子式矛盾）'], observationIds: []};
      const reasonsMap: Record<string, SearchTermination> = {CANCELLED: 'CANCELLED', TIME_BUDGET: 'TIME_BUDGET', STATE_BUDGET: 'STATE_BUDGET', CANDIDATE_LIMIT: 'OUTPUT_BUDGET'};
      const first = (['CANCELLED', 'TIME_BUDGET', 'STATE_BUDGET', 'CANDIDATE_LIMIT'] as const).find(r => run.incompleteReasons.includes(r));
      const termination: SearchTermination = first ? reasonsMap[first] : 'GRAMMAR_EXHAUSTED';
      return {
        smiles, status: 'BOUNDED', visited: result.stats.visited + visitedExtra + (supplement?.visited ?? 0), termination, complete: run.complete,
        note: `片段組裝窮舉：${result.stats.visited} 步；${complete ? 'COMPLETE（在目前分子式與片段約束下所有分支走完）' : `INCOMPLETE（${run.incompleteReasons.join('、')}）`}；${smiles.length} 個去重候選；${incompatibleSets.length}/${result.sets.length} 個片段讀法與分子式不相容`,
        partialHypotheses: [...new Set([...(hints.couplingNotes ?? []), ...(supplement?.partialHypotheses ?? [])])], rejectedByComposition: result.stats.rejected.sanitizeFailed + (supplement?.rejectedByComposition ?? 0),
        derivations: {...(supplement?.derivations ?? {}), ...derivations}, elapsedMs: result.stats.elapsedMs + elapsedExtra + (supplement?.elapsedMs ?? 0), frontierPeak: supplement?.frontierPeak ?? 0, enumeration: emptyDiagnostics(run),
      };
    },
  };
}
