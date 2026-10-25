import type {DeNovoSearchResult, SearchTermination} from '../scientificEngines/deNovoGraphSearch';
import type {StructureGenerationRequest, StructureGenerator} from '../composition/structureGenerator';
import {buildAtomInventory} from '../constraints/atomInventory';
import {inventoryToFragmentSets, type InventorySetInfo} from '../constraints/inventoryAdapter';
import {requiredFromEvidence} from '../constraints/requiredSubstructures';
import {V12_CONFIG} from '../constraints/v12Config';
import {h1SignalsFromObservations, irAldehydeContext} from '../constraints/v12Evidence';
import {parseFormula} from './problem';
import {adaptLocalStructures} from './adapter';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import {enumerateStructures} from './enumerate';
import type {CandidateOrigin, EnumerationDiagnostics, EnumerationResult, EnumerationRunDiagnostic, FragmentAlternativeSet, IncompleteReason, RequiredSubstructureSpec, V12RunDiagnostic} from './types';

const FORMULA_INCOMPATIBLE = ['FORMULA_ELEMENT_SHORTAGE', 'FORMULA_HYDROGEN_SHORTAGE', 'FORMULA_HYDROGEN_EXCESS', 'VALENCE_PARITY'];

const emptyDiagnostics = (run: EnumerationRunDiagnostic, origins?: Record<string, CandidateOrigin>): EnumerationDiagnostics => ({
  used: run.used, complete: run.used && run.complete, runs: [run], enumerated: run.candidates, scored: 0, deferred: {count: 0, samples: [], prefilter: null}, maxScoredCandidates: CFG.analysis.maxScoredCandidates, ...(origins ? {origins} : {}),
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
/** What the v1.2 layer adds to a flexible-atom (v1.1.7) enumeration: leaf substructure filters (D9) and the diagnostics of the layer. */
interface FlexExt {required?: RequiredSubstructureSpec[]; v12?: V12RunDiagnostic}

export function createExhaustiveGenerator(legacy: StructureGenerator): StructureGenerator {
  const exhaustive = async (request: StructureGenerationRequest, ext?: FlexExt): Promise<DeNovoSearchResult> => {
    {
      const {formula, hints} = request;
      const fallback = async (reason: string, notes: string[] = [], attempt?: EnumerationResult): Promise<DeNovoSearchResult> => {
        // With a shared pool the legacy search only gets what the enumeration attempt left over.
        const req = request.sharedPool && attempt ? {...request, budget: {...request.budget, maxStates: Math.max(0, request.budget.maxStates - attempt.stats.visited), timeMs: Math.max(0, request.budget.timeMs - attempt.stats.elapsedMs)}} : request;
        const search = await legacy.generateStructures(req);
        const run = legacyRun(formula, reason, notes);
        if (ext?.v12) { run.v12 = ext.v12; if (ext.v12.path === 'FALLBACK') run.incompleteReasons = ['V12_CONSTRAINTS_FALLBACK']; }
        if (attempt) { run.status = attempt.status; run.incompleteReasons = attempt.incompleteReasons; run.visited = attempt.stats.visited; run.leaves = attempt.stats.leaves; run.elapsedMs = attempt.stats.elapsedMs; }
        const origins: Record<string, CandidateOrigin> = {};
        for (const s of search.smiles) origins[s] = {source: 'LEGACY', relaxed: false};
        return {...search, enumeration: emptyDiagnostics(run, origins)};
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
        alternatives: ext?.required?.length ? adapted.sets.map(set => ({...set, required: ext.required})) : adapted.sets,
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
      const fellBack = ext?.v12?.path === 'FALLBACK';
      const finished = realReasons.length === 0 && otherErrors.length === 0 && !adapted.truncated;
      // D10: a result from the fallback path is never COMPLETE.
      const complete = finished && !fellBack;
      const run: EnumerationRunDiagnostic = {
        used: true, fallbackReason: null, formula, status: result.status, complete,
        incompleteReasons: [...realReasons, ...(otherErrors.length ? ['INVALID_ALTERNATIVE_SET' as const] : []), ...(adapted.truncated ? ['READINGS_TRUNCATED' as const] : []), ...(fellBack ? ['V12_CONSTRAINTS_FALLBACK' as const] : [])],
        readings: result.sets.map(s => ({id: s.id, localIds: adapted.setLocalIds[s.id] ?? [], complete: s.complete, error: s.error ? `${s.error.code}：${s.error.message}` : null, newCandidates: s.newCandidates})),
        incompatibleReadings: incompatibleSets.length, candidates: result.candidates.length, visited: result.stats.visited, leaves: result.stats.leaves,
        elapsedMs: result.stats.elapsedMs, rejected: result.stats.rejected, conversions: adapted.conversions, notes: adapted.notes, excludedLocals: adapted.excluded,
        ...(ext?.v12 ? {v12: ext.v12} : {}),
      };
      const smiles = result.candidates.map(c => c.smiles);
      const origins: Record<string, CandidateOrigin> = {};
      for (const s of smiles) origins[s] = {source: 'ENUMERATOR', relaxed: false};
      // Every reading finished but none contains a molecule with this formula (e.g. a C=O reading for C2H6O): the evidence-derived
      // fragments contradict the formula. The formula is the stronger constraint, so relax to formula-only enumeration when that is
      // small enough (otherwise the legacy search is used); scoring then judges the candidates against the evidence.
      let relaxed: EnumerationResult | null = null;
      if (!smiles.length && finished && realReasons.length === 0) {
        if (heavy > CFG.adapter.maxHeavyAtomsWithoutFragments) return fallback(`所有片段讀法都沒有符合分子式的分子，而且重原子數 ${heavy} 太大，無法放寬成純分子式窮舉`, adapted.notes, result);
        relaxed = await enumerateStructures({formula: parsed.counts, forbid: {strain: CFG.pipelineStrainProfile, ...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {})}, budget: {timeMs: eb.timeMs, maxStates: eb.maxStates, maxCandidates: eb.maxCandidates ?? CFG.analysis.maxCandidatesPerFormula, shouldCancel: request.budget.shouldCancel}});
        for (const c of relaxed.candidates) { smiles.push(c.smiles); origins[c.smiles] = {source: 'ENUMERATOR', relaxed: true}; }
        run.relaxedToFormulaOnly = {candidates: relaxed.candidates.length, complete: relaxed.status === 'COMPLETE'};
        run.notes = [...run.notes, `所有片段讀法都沒有符合分子式的分子（片段與分子式矛盾）：放寬成只依分子式窮舉，得到 ${relaxed.candidates.length} 個候選（${relaxed.status === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE'}）`];
        run.candidates = smiles.length;
        if (relaxed.status !== 'COMPLETE') { run.complete = false; run.incompleteReasons = [...run.incompleteReasons, ...relaxed.incompleteReasons.filter(r => !run.incompleteReasons.includes(r))]; }
        if (fellBack) run.complete = false;
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
        for (const s of supplement.smiles) if (!seen.has(s)) { seen.add(s); smiles.push(s); origins[s] = {source: 'LEGACY_SUPPLEMENT', relaxed: false}; added++; }
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
        note: `片段組裝窮舉：${result.stats.visited} 步；${run.complete ? 'COMPLETE（在目前分子式與片段約束下所有分支走完）' : `INCOMPLETE（${run.incompleteReasons.join('、')}）`}；${smiles.length} 個去重候選；${incompatibleSets.length}/${result.sets.length} 個片段讀法與分子式不相容`,
        partialHypotheses: [...new Set([...(hints.couplingNotes ?? []), ...(supplement?.partialHypotheses ?? [])])], rejectedByComposition: result.stats.rejected.sanitizeFailed + (supplement?.rejectedByComposition ?? 0),
        derivations: {...(supplement?.derivations ?? {}), ...derivations}, elapsedMs: result.stats.elapsedMs + elapsedExtra + (supplement?.elapsedMs ?? 0), frontierPeak: supplement?.frontierPeak ?? 0, enumeration: emptyDiagnostics(run, origins),
      };
    }
  };
  return {
    generateStructures: request => (V12_CONFIG.useV12Constraints && request.constraintEvidence && request.formula ? generateWithInventory(request, exhaustive) : exhaustive(request)),
  };
}

// ------------------------------------------------------------------------------------------------ v1.2 (useV12Constraints)
const fmtInv = (inv: ReturnType<typeof buildAtomInventory>, patternSets: number, patternTruncated: boolean): NonNullable<V12RunDiagnostic['inventory']> => ({
  status: inv.status, reason: inv.reason, alternatives: inv.alternatives.length, truncated: inv.truncated, patternSets, patternTruncated, incompleteReasons: [...inv.incompleteReasons], ratioSum: inv.ratioSum,
  combinations: inv.kCombinations.map(c => ({k: c.k, extraExchangeable: c.extraExchangeable, ratio: c.ratio})),
  signals: inv.signals.map(x => ({...x, classes: [...x.classes]})), voided: inv.voided, aromaticLimited: inv.aromaticLimited,
});

/**
 * 1H-constrained generation for one formula: the atom inventory (pinned H per atom, ring templates, equivalence groups, singlet rule,
 * required substructures) is enumerated per reading; with no integrals the v1.1.7 flexible-atom path runs with the strong-evidence
 * substructures as leaf filters (D9); when the inventory yields nothing usable the flexible-atom path is used and marked (D10).
 */
async function generateWithInventory(request: StructureGenerationRequest, exhaustive: (r: StructureGenerationRequest, ext?: FlexExt) => Promise<DeNovoSearchResult>): Promise<DeNovoSearchResult> {
  const ev = request.constraintEvidence!;
  const formula = request.formula!;
  const parsed = parseFormula(formula);
  if (!parsed.ok) return exhaustive(request);
  const required = requiredFromEvidence(ev.observations);
  const requiredSpecs: RequiredSubstructureSpec[] = required.map(r => ({id: r.id, smarts: r.smarts, minMatches: V12_CONFIG.requiredMinMatches}));
  const requiredDiag = required.map(r => ({id: r.id, smarts: r.smarts, label: r.label, evidenceObservationIds: r.evidenceObservationIds}));
  const h1 = h1SignalsFromObservations(ev.observations);
  const inv = buildAtomInventory({signals: h1.signals, formula: parsed.counts, solvent: h1.solvent, coverageComplete: h1.coverageComplete, ir: irAldehydeContext(ev.observations, ev.irCoversAldehydeRegion), nitrogenAllowed: ev.nitrogenAllowed});
  const diag = (path: V12RunDiagnostic['path'], reason: string | null, patternSets = 0, patternTruncated = false, runs: V12RunDiagnostic['runs'] = [], leafCost: V12RunDiagnostic['leafCost'] = null): V12RunDiagnostic =>
    ({path, badge: path === 'FALLBACK' ? V12_CONFIG.fallbackBadge : null, reason, inventory: fmtInv(inv, patternSets, patternTruncated), required: requiredDiag, runs, leafCost});
  const flexSpecs = V12_CONFIG.requiredInFlexPath ? requiredSpecs : [];
  if (inv.status === 'NOT_AVAILABLE') return exhaustive(request, {required: flexSpecs, v12: diag('FLEX_NO_INTEGRALS', inv.reason)});

  const eb = request.enumerationBudget ?? {timeMs: CFG.analysis.timeMs, maxStates: CFG.analysis.maxStates, maxCandidates: CFG.analysis.maxCandidatesPerFormula};
  const fallbackTo = async (reason: string, attempt: EnumerationResult | null, patternSets: number, patternTruncated: boolean, runs: V12RunDiagnostic['runs']) => {
    // The inventory attempt used part of the budget; the flexible path gets the rest, but never less than a quarter of it.
    const used = attempt ? {timeMs: attempt.stats.elapsedMs, maxStates: attempt.stats.visited} : {timeMs: 0, maxStates: 0};
    const left = {timeMs: Math.max(eb.timeMs * 0.25, eb.timeMs - used.timeMs), maxStates: Math.max(Math.floor(eb.maxStates * 0.25), eb.maxStates - used.maxStates)};
    const out = await exhaustive({...request, enumerationBudget: {...eb, ...left}}, {required: flexSpecs, v12: diag('FALLBACK', reason, patternSets, patternTruncated, runs, attempt?.stats.leafCost ?? null)});
    if (attempt && out.enumeration?.runs[0]) { out.enumeration.runs[0].visited += attempt.stats.visited; out.enumeration.runs[0].elapsedMs += attempt.stats.elapsedMs; }
    return out;
  };
  if (!inv.alternatives.length) return fallbackTo(inv.reason ?? '所有替代解讀都作廢或無法表達', null, 0, false, []);

  const sets: FragmentAlternativeSet[] = [];
  const info: Record<string, InventorySetInfo> = {};
  let patternTruncated = false;
  for (const alt of inv.alternatives) {
    const adapted = inventoryToFragmentSets(alt, {required: requiredSpecs});
    sets.push(...adapted.sets); Object.assign(info, adapted.info);
    patternTruncated ||= adapted.truncated;
  }
  const result = await enumerateStructures({
    formula: parsed.counts, alternatives: sets,
    forbid: {...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {}), strain: CFG.pipelineStrainProfile},
    symmetryPruning: V12_CONFIG.symmetryPruning,
    budget: {
      timeMs: eb.timeMs, maxStates: eb.maxStates, maxCandidates: eb.maxCandidates ?? CFG.analysis.maxCandidatesPerFormula, shouldCancel: request.budget.shouldCancel,
      onProgress: request.budget.onProgress ? p => request.budget.onProgress!({visited: p.visited, candidateCount: p.candidates, elapsedMs: p.elapsedMs, frontier: 0}) : undefined,
    },
  });
  // One run per (k, extra exchangeable H): the sets of that reading.
  const runs: V12RunDiagnostic['runs'] = [];
  for (const c of inv.kCombinations) {
    const mine = result.sets.filter(x => info[x.id]?.k === c.k && info[x.id]?.extraExchangeable === c.extraExchangeable);
    if (!mine.length) continue;
    const reasons = [...new Set(mine.flatMap(x => x.incompleteReasons))].filter(r => r !== 'INVALID_ALTERNATIVE_SET');
    const runnable = mine.filter(x => x.complete !== null);
    runs.push({
      k: c.k, extraExchangeable: c.extraExchangeable, alternatives: new Set(mine.map(x => info[x.id].alternativeId)).size, sets: mine.length,
      complete: runnable.length ? runnable.every(x => x.complete === true) : null, visited: mine.reduce((a, x) => a + x.visited, 0), leaves: mine.reduce((a, x) => a + x.leaves, 0),
      candidates: mine.reduce((a, x) => a + x.newCandidates, 0), incompleteReasons: reasons as IncompleteReason[],
    });
  }
  if (result.status === 'INVALID_REQUEST' || !result.candidates.length) {
    return fallbackTo(result.status === 'INVALID_REQUEST' ? `原子清單的所有讀法都無法表達（${result.errors.map(e => e.code).join('、') || '未知'}）` : `原子清單的 ${sets.length} 個讀法沒有產生任何候選${result.incompleteReasons.length ? `（${result.incompleteReasons.join('、')}）` : ''}`, result, sets.length, patternTruncated, runs);
  }
  const incompatibleSets = result.sets.filter(x => x.error && FORMULA_INCOMPATIBLE.includes(x.error.code));
  const otherErrors = result.sets.filter(x => x.error && !FORMULA_INCOMPATIBLE.includes(x.error.code));
  const realReasons = result.incompleteReasons.filter(r => r !== 'INVALID_ALTERNATIVE_SET');
  const extraReasons: IncompleteReason[] = [...inv.incompleteReasons, ...(patternTruncated && !inv.incompleteReasons.includes('INVENTORY_ALTERNATIVES_TRUNCATED') ? ['INVENTORY_ALTERNATIVES_TRUNCATED' as const] : [])];
  const incompleteReasons = [...new Set<IncompleteReason>([...realReasons, ...(otherErrors.length ? ['INVALID_ALTERNATIVE_SET' as const] : []), ...extraReasons])];
  const complete = incompleteReasons.length === 0;
  const smiles = result.candidates.map(c => c.smiles);
  const origins: Record<string, CandidateOrigin> = {};
  for (const x of smiles) origins[x] = {source: 'ENUMERATOR', relaxed: false};
  const run: EnumerationRunDiagnostic = {
    used: true, fallbackReason: null, formula, status: result.status, complete, incompleteReasons,
    readings: result.sets.map(x => ({id: x.id, localIds: [], complete: x.complete, error: x.error ? `${x.error.code}：${x.error.message}` : null, newCandidates: x.newCandidates})),
    incompatibleReadings: incompatibleSets.length, candidates: smiles.length, visited: result.stats.visited, leaves: result.stats.leaves, elapsedMs: result.stats.elapsedMs, rejected: result.stats.rejected,
    conversions: [], notes: [`1H 原子清單：${inv.alternatives.length} 個替代解讀、${sets.length} 個片段組合（取代型式）；${runs.map(r => `k=${r.k}, 額外可交換 H=${r.extraExchangeable}`).join('；')}`],
    v12: diag('INVENTORY', null, sets.length, patternTruncated, runs, result.stats.leafCost ?? null),
  };
  const derivations: NonNullable<DeNovoSearchResult['derivations']> = {};
  const h1Ids = h1.signals.filter(x => !x.optional).map(x => x.observationId);
  for (const c of result.candidates) {
    const first = info[c.alternativeSetIds[0]];
    derivations[c.smiles] = {localStructureIds: [], operations: [`1H 原子清單窮舉（k=${first?.k}，額外可交換 H=${first?.extraExchangeable}${first?.patternLabel ? `；${first.patternLabel}` : ''}；讀法 ${c.alternativeSetIds.join('、')}）`], observationIds: h1Ids};
  }
  const reasonsMap: Record<string, SearchTermination> = {CANCELLED: 'CANCELLED', TIME_BUDGET: 'TIME_BUDGET', STATE_BUDGET: 'STATE_BUDGET', CANDIDATE_LIMIT: 'OUTPUT_BUDGET'};
  const firstStop = (['CANCELLED', 'TIME_BUDGET', 'STATE_BUDGET', 'CANDIDATE_LIMIT'] as const).find(r => incompleteReasons.includes(r));
  return {
    smiles, status: 'BOUNDED', visited: result.stats.visited, termination: firstStop ? reasonsMap[firstStop] : 'GRAMMAR_EXHAUSTED', complete,
    note: `1H 原子清單窮舉：${result.stats.visited} 步；${complete ? 'COMPLETE（在目前分子式與 1H 約束下所有分支走完）' : `INCOMPLETE（${incompleteReasons.join('、')}）`}；${smiles.length} 個去重候選`,
    partialHypotheses: [...(request.hints.couplingNotes ?? [])], rejectedByComposition: result.stats.rejected.sanitizeFailed,
    derivations, elapsedMs: result.stats.elapsedMs, frontierPeak: 0, enumeration: emptyDiagnostics(run, origins),
  };
}
