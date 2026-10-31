import type {DeNovoSearchResult, SearchTermination} from '../scientificEngines/deNovoGraphSearch';
import type {StructureGenerationRequest, StructureGenerator} from '../composition/structureGenerator';
import type {AssemblyV12} from '../reasoning/types';
import {buildAtomInventory} from '../constraints/atomInventory';
import {inventoryToFragmentSets, type InventorySetInfo} from '../constraints/inventoryAdapter';
import {requiredFromEvidence} from '../constraints/requiredSubstructures';
import {V12_CONFIG} from '../constraints/v12Config';
import {readingKinds} from '../constraints/readingKinds';

/** v1.2 (W5): the pipeline applies the strain profile of the v1.2 layer while the flag is on. */
const pipelineStrain = (v12: boolean) => (v12 ? V12_CONFIG.pipelineStrainProfile : CFG.pipelineStrainProfile);
import {h1SignalsFromObservations, irAldehydeContext} from '../constraints/v12Evidence';
import {matchesSMARTS} from '../scientificEngines/rdkitAdapter';
import {parseFormula} from './problem';
import {adaptLocalStructures} from './adapter';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import {enumerateStructures} from './enumerate';
import type {CandidateOrigin, EnumerationDiagnostics, EnumerationResult, EnumerationRunDiagnostic, FragmentAlternativeSet, IncompleteReason, RequiredSubstructureSpec, RunPlanning, V12RunDiagnostic} from './types';

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
/** The v1.2 provenance of a candidate that came from the flexible-atom path (no integrals, D9) or from the fallback (D10). */
function flexAssembly(v: V12RunDiagnostic): AssemblyV12 {
  return {
    path: v.path === 'FALLBACK' ? 'FALLBACK' : 'FLEX_NO_INTEGRALS', required: v.required.map(r => ({id: r.id, label: r.label})),
    leafChecks: [...(v.required.length && V12_CONFIG.requiredInFlexPath ? ['REQUIRED' as const] : []), ...(V12_CONFIG.pipelineStrainProfile ? ['STRAIN' as const] : [])],
    ...(v.path === 'FALLBACK' ? {fallbackReason: v.reason ?? v.inventory?.reason ?? undefined} : {}),
  };
}

/** What the v1.2 layer adds to a flexible-atom (v1.1.7) enumeration: leaf substructure filters (D9) and the diagnostics of the layer. */
interface FlexExt {required?: RequiredSubstructureSpec[]; v12?: V12RunDiagnostic}

export function createExhaustiveGenerator(legacy: StructureGenerator): StructureGenerator {
  const exhaustive = async (request: StructureGenerationRequest, ext?: FlexExt): Promise<DeNovoSearchResult> => {
    {
      const {formula, hints} = request;
      const fallback = async (reason: string, notes: string[] = [], attempt?: EnumerationResult): Promise<DeNovoSearchResult> => {
        // With a shared pool the legacy search only gets what the enumeration attempt left over.
        const req = request.sharedPool && attempt ? {...request, budget: {...request.budget, maxStates: Math.max(0, request.budget.maxStates - attempt.stats.visited), timeMs: Math.max(0, request.budget.timeMs - attempt.stats.elapsedMs)}} : request;
        const found = await legacy.generateStructures(req);
        // v1.2: the strong-evidence substructures hold on this path too; the legacy candidates that lack one are dropped (and counted in the notes).
        const keep = (s: string) => !ext?.required?.length || ext.required.every(r => matchesSMARTS(s, r.smarts) !== false);
        const search = ext?.required?.length ? {...found, smiles: found.smiles.filter(keep)} : found;
        const run = legacyRun(formula, reason, notes);
        if (ext?.required?.length && search.smiles.length < found.smiles.length) run.notes = [...run.notes, `舊搜尋的 ${found.smiles.length - search.smiles.length} 個候選不含強證據要求的子結構，已排除`];
        if (attempt) { run.status = attempt.status; run.incompleteReasons = attempt.incompleteReasons; run.visited = attempt.stats.visited; run.leaves = attempt.stats.leaves; run.elapsedMs = attempt.stats.elapsedMs; }
        if (ext?.v12) { run.v12 = ext.v12; if (ext.v12.path === 'FALLBACK') run.incompleteReasons = [...run.incompleteReasons, 'V12_CONSTRAINTS_FALLBACK']; }
        const origins: Record<string, CandidateOrigin> = {};
        for (const s of search.smiles) origins[s] = {source: 'LEGACY', relaxed: false, ...(ext?.v12?.path === 'FALLBACK' ? {v12Fallback: true} : {})};
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
        forbid: {...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {}), strain: pipelineStrain(Boolean(ext?.v12))},
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
      for (const s of smiles) origins[s] = {source: 'ENUMERATOR', relaxed: false, ...(ext?.v12?.path === 'FALLBACK' ? {v12Fallback: true} : {})};
      // Every reading finished but none contains a molecule with this formula (e.g. a C=O reading for C2H6O): the evidence-derived
      // fragments contradict the formula. The formula is the stronger constraint, so relax to formula-only enumeration when that is
      // small enough (otherwise the legacy search is used); scoring then judges the candidates against the evidence.
      let relaxed: EnumerationResult | null = null;
      if (!smiles.length && finished && realReasons.length === 0) {
        if (heavy > CFG.adapter.maxHeavyAtomsWithoutFragments) return fallback(`所有片段讀法都沒有符合分子式的分子，而且重原子數 ${heavy} 太大，無法放寬成純分子式窮舉`, adapted.notes, result);
        relaxed = await enumerateStructures({formula: parsed.counts, forbid: {strain: pipelineStrain(Boolean(ext?.v12)), ...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {})}, budget: {timeMs: eb.timeMs, maxStates: eb.maxStates, maxCandidates: eb.maxCandidates ?? CFG.analysis.maxCandidatesPerFormula, shouldCancel: request.budget.shouldCancel}});
        for (const c of relaxed.candidates) { smiles.push(c.smiles); origins[c.smiles] = {source: 'ENUMERATOR', relaxed: true, ...(ext?.v12?.path === 'FALLBACK' ? {v12Fallback: true} : {})}; }
        run.relaxedToFormulaOnly = {candidates: relaxed.candidates.length, complete: relaxed.status === 'COMPLETE'};
        run.notes = [...run.notes, `所有片段讀法都沒有符合分子式的分子（片段與分子式矛盾）：放寬成只依分子式窮舉，得到 ${relaxed.candidates.length} 個候選（${relaxed.status === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE'}）`];
        run.candidates = smiles.length;
        if (relaxed.status !== 'COMPLETE') { run.complete = false; run.incompleteReasons = [...run.incompleteReasons, ...relaxed.incompleteReasons.filter(r => !run.incompleteReasons.includes(r))]; }
        if (fellBack) run.complete = false;
        visitedExtra += relaxed.stats.visited; elapsedExtra += relaxed.stats.elapsedMs;
      }
      // Budget-limited enumeration: add what the bounded legacy beam search finds (never fewer candidates than before).
      let supplement: DeNovoSearchResult | null = null;
      const supplementV12 = new Set<string>();
      // v1.2 (D10 guarantee): the 1H inventory path and the flexible-atom fallback both produced nothing → the legacy search runs once with its own
      // supplement constants, whatever is left of the shared pool. Only in that case; these candidates are not bound by the 1H constraints.
      const forceSupplement = fellBack && smiles.length === 0;
      if (forceSupplement || (!complete && CFG.legacySupplementWhenIncomplete && (realReasons.includes('TIME_BUDGET') || realReasons.includes('STATE_BUDGET')))) {
        const left = forceSupplement ? {maxStates: CFG.legacySupplement.maxStatesPerRun, timeMs: CFG.legacySupplement.timeMsPerRun} : request.sharedPool ? {maxStates: Math.max(0, request.budget.maxStates - result.stats.visited), timeMs: Math.max(0, request.budget.timeMs - result.stats.elapsedMs)} : {maxStates: request.budget.maxStates, timeMs: request.budget.timeMs};
        const req = {...request, budget: {...request.budget, maxStates: Math.min(left.maxStates, CFG.legacySupplement.maxStatesPerRun), timeMs: Math.min(left.timeMs, CFG.legacySupplement.timeMsPerRun)}};
        supplement = await legacy.generateStructures(req);
        const seen = new Set(smiles);
        let added = 0, droppedByRequired = 0;
        // v1.2: strong-evidence substructures hold on every path, so the legacy candidates are filtered by them too.
        const passesRequired = (s: string) => !ext?.required?.length || ext.required.every(r => matchesSMARTS(s, r.smarts) !== false);
        for (const s of supplement.smiles) if (!seen.has(s) && !passesRequired(s)) droppedByRequired++;
        for (const s of supplement.smiles) if (!seen.has(s) && passesRequired(s)) { seen.add(s); smiles.push(s); origins[s] = {source: 'LEGACY_SUPPLEMENT', relaxed: false, ...(fellBack ? {v12Fallback: true} : {})}; added++; if (ext?.v12) supplementV12.add(s); }
        run.notes = [...run.notes, forceSupplement ? `1H 約束的清單路徑與退回路徑都沒有候選：另以舊 beam 搜尋補充一次，${supplement.smiles.length} 個候選中 ${added} 個為新（這些候選不受 1H 約束）` : `窮舉未完成（${run.incompleteReasons.join('、')}）：另以舊 beam 搜尋補充，${supplement.smiles.length} 個候選中 ${added} 個為新（舊搜尋 ${supplement.visited} 步）`];
        run.legacySupplement = {candidates: supplement.smiles.length, added, visited: supplement.visited};
        if (droppedByRequired) run.notes = [...run.notes, `舊 beam 補充的候選中 ${droppedByRequired} 個不含強證據要求的子結構，已排除`];
        run.candidates = smiles.length;
      }
      const derivations: NonNullable<DeNovoSearchResult['derivations']> = {};
      for (const c of result.candidates) {
        const sid = c.alternativeSetIds[0];
        derivations[c.smiles] = {
          localStructureIds: adapted.setLocalIds[sid] ?? [],
          operations: [`片段組裝窮舉（讀法 ${c.alternativeSetIds.join('、')}；${(adapted.setLocalIds[sid] ?? []).length} 個片段）`],
          observationIds: adapted.setObservationIds[sid] ?? [],
          ...(ext?.v12 ? {v12: flexAssembly(ext.v12)} : {}),
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
        derivations: {...(supplement?.derivations ?? {}), ...Object.fromEntries([...supplementV12].map(s => [s, {...(supplement?.derivations?.[s] ?? {localStructureIds: [], operations: ['舊 beam 搜尋補充'], observationIds: []}), v12: flexAssembly(ext!.v12!)}])), ...derivations}, elapsedMs: result.stats.elapsedMs + elapsedExtra + (supplement?.elapsedMs ?? 0), frontierPeak: supplement?.frontierPeak ?? 0, enumeration: emptyDiagnostics(run, origins),
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
  alternativesPreview: inv.alternatives.slice(0, 6).map(a => ({
    id: a.id, k: a.k, extraExchangeable: a.extraExchangeable, hasVinyl: a.hasVinyl, zeroHAtoms: {...a.zeroHAtoms},
    groups: a.groups.map(g => ({observationId: g.observationId, shiftClasses: [...g.shiftClasses], hTotal: g.hTotal, atomCount: g.atomCount, hPerAtom: g.hPerAtom, element: g.element, aromatic: g.aromatic, alkene: g.alkene, exchangeable: g.exchangeable, equivalent: g.equivalent, singletRule: g.singletNoHNeighbors})),
    rings: a.rings.rings.map(r => ({templateId: r.templateId, ch: r.ch, patterns: r.substituentPositionPatterns.length})),
  })),
});
const fmtConstraints = (inv: ReturnType<typeof buildAtomInventory>, heavyAtoms: number): NonNullable<V12RunDiagnostic['constraints']> | null => {
  const a = inv.alternatives[0];
  if (!a) return null;
  return {
    pinnedAtoms: heavyAtoms, equivalentGroups: a.groups.filter(g => g.equivalent && g.atomCount > 1 && !g.aromatic).length, aromaticPools: a.groups.filter(g => g.aromatic && g.equivalent && g.atomCount > 1).map(g => g.atomCount),
    singletGroups: a.groups.filter(g => g.singletNoHNeighbors).length, alkeneGroups: a.groups.filter(g => g.alkene).length, strainProfile: V12_CONFIG.pipelineStrainProfile, symmetryPruning: V12_CONFIG.symmetryPruning,
  };
};

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
    ({path, badge: path === 'FALLBACK' ? V12_CONFIG.fallbackBadge : null, reason, inventory: fmtInv(inv, patternSets, patternTruncated), constraints: fmtConstraints(inv, Object.entries(parsed.counts).reduce((s, [e, n]) => s + (e === 'H' ? 0 : n), 0)), required: requiredDiag, runs, leafCost});
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
  // v1.2.1 two-round search: round 1 = readings without an alkene CH under a step cap, no fallback and no legacy supplement; round 2 = the alkene readings.
  if (request.planning) return generatePlanned(request, {parsed, inv, eb, requiredSpecs, h1, diag});
  if (!inv.alternatives.length) return fallbackTo(inv.reason ?? '所有替代解讀都作廢或無法表達', null, 0, false, []);

  const sets: FragmentAlternativeSet[] = [];
  const info: Record<string, InventorySetInfo> = {};
  let patternTruncated = false;
  for (const alt of inv.alternatives) {
    const adapted = inventoryToFragmentSets(alt, {required: requiredSpecs});
    sets.push(...adapted.sets); Object.assign(info, adapted.info);
    patternTruncated ||= adapted.truncated;
  }
  // Q1: inside the run the readings without a vinyl (alkene CH) reading go first; the vinyl readings use what is left of the budget.
  const vinylSet = (id: string) => Boolean(info[id]?.hasVinyl);
  const ordered = [...sets.filter(x => !vinylSet(x.id)), ...sets.filter(x => vinylSet(x.id))];
  const result = await enumerateStructures({
    formula: parsed.counts, alternatives: ordered,
    forbid: {...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {}), strain: pipelineStrain(true)},
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
  // Budget reasons that come only from vinyl readings are reported as VINYL_READINGS_BUDGET; the readings without a vinyl reading stay as they are.
  const BUDGET: IncompleteReason[] = ['TIME_BUDGET', 'STATE_BUDGET', 'CANDIDATE_LIMIT', 'ALTERNATIVE_SET_NOT_RUN'];
  const plainReasons = new Set<IncompleteReason>(result.sets.filter(x => !vinylSet(x.id)).flatMap(x => x.incompleteReasons));
  const vinylBudget = result.sets.some(x => vinylSet(x.id) && x.incompleteReasons.some(r => BUDGET.includes(r)));
  const realReasons: IncompleteReason[] = [...new Set<IncompleteReason>([...result.incompleteReasons.filter(r => r !== 'INVALID_ALTERNATIVE_SET' && (!BUDGET.includes(r) || plainReasons.has(r))), ...(vinylBudget ? ['VINYL_READINGS_BUDGET' as const] : [])])];
  const extraReasons: IncompleteReason[] = [...inv.incompleteReasons, ...(patternTruncated && !inv.incompleteReasons.includes('INVENTORY_ALTERNATIVES_TRUNCATED') ? ['INVENTORY_ALTERNATIVES_TRUNCATED' as const] : [])];
  const incompleteReasons = [...new Set<IncompleteReason>([...realReasons, ...(otherErrors.length ? ['INVALID_ALTERNATIVE_SET' as const] : []), ...extraReasons])];
  const complete = incompleteReasons.length === 0;
  const smiles = result.candidates.map(c => c.smiles);
  const origins: Record<string, CandidateOrigin> = {};
  for (const c of result.candidates) {
    const seen = new Set<string>(), from: {k: number; extraExchangeable: number}[] = [];
    for (const sid of c.alternativeSetIds) { const i = info[sid]; if (i && !seen.has(`${i.k}/${i.extraExchangeable}`)) { seen.add(`${i.k}/${i.extraExchangeable}`); from.push({k: i.k, extraExchangeable: i.extraExchangeable}); } }
    origins[c.smiles] = {source: 'ENUMERATOR', relaxed: false, v12: from};
  }
  const run: EnumerationRunDiagnostic = {
    used: true, fallbackReason: null, formula, status: result.status, complete, incompleteReasons,
    readings: result.sets.map(x => ({id: x.id, localIds: [], complete: x.complete, error: x.error ? `${x.error.code}：${x.error.message}` : null, newCandidates: x.newCandidates})),
    incompatibleReadings: incompatibleSets.length, candidates: smiles.length, visited: result.stats.visited, leaves: result.stats.leaves, elapsedMs: result.stats.elapsedMs, rejected: result.stats.rejected,
    conversions: [], notes: [`1H 原子清單：${inv.alternatives.length} 個替代解讀、${sets.length} 個片段組合（取代型式）；${runs.map(r => `k=${r.k}, 額外可交換 H=${r.extraExchangeable}`).join('；')}`],
    v12: diag('INVENTORY', null, sets.length, patternTruncated, runs, result.stats.leafCost ?? null),
  };
  const derivations: NonNullable<DeNovoSearchResult['derivations']> = {};
  const h1Ids = h1.signals.filter(x => !x.optional).map(x => x.observationId);
  const shiftOf = new Map(inv.signals.map(x => [x.observationId, x.shiftPpm]));
  const assemblyOf = (alt: (typeof inv.alternatives)[number], patternLabel: string, ids: string[]): AssemblyV12 => ({
    path: 'INVENTORY', inventoryAlternativeIds: ids, k: alt.k, extraExchangeable: alt.extraExchangeable, ratio: inv.kCombinations.find(x => x.k === alt.k && x.extraExchangeable === alt.extraExchangeable)?.ratio, patternLabel,
    signals: alt.groups.map(g => ({shiftPpm: shiftOf.get(g.observationId) ?? 0, hTotal: g.hTotal, atomCount: g.atomCount, hPerAtom: g.hPerAtom, element: g.element, kind: g.aromatic ? 'AROMATIC' as const : g.alkene ? 'ALKENE' as const : g.exchangeable ? 'EXCHANGEABLE' as const : 'SP3' as const, equivalent: g.equivalent && g.atomCount > 1, singlet: g.singletNoHNeighbors})),
    required: required.map(r => ({id: r.id, label: r.label})),
    leafChecks: [...(alt.rings.rings.length ? ['AROMATIC' as const] : []), ...(required.length ? ['REQUIRED' as const] : []), ...(alt.groups.some(g => g.equivalent && g.atomCount > 1) ? ['EQUIVALENCE' as const] : []), ...(alt.groups.some(g => g.alkene) ? ['ALKENE' as const] : []), ...(V12_CONFIG.pipelineStrainProfile ? ['STRAIN' as const] : [])],
  });
  for (const c of result.candidates) {
    const first = info[c.alternativeSetIds[0]];
    const alt = inv.alternatives.find(a => a.id === first?.alternativeId);
    derivations[c.smiles] = {...(alt ? {v12: assemblyOf(alt, first.patternLabel, [...new Set(c.alternativeSetIds.map(id => info[id]?.alternativeId).filter(Boolean) as string[])])} : {}), localStructureIds: [], operations: [`1H 原子清單窮舉（k=${first?.k}，額外可交換 H=${first?.extraExchangeable}${first?.patternLabel ? `；${first.patternLabel}` : ''}；讀法 ${c.alternativeSetIds.join('、')}）`], observationIds: h1Ids};
  }
  const reasonsMap: Record<string, SearchTermination> = {CANCELLED: 'CANCELLED', TIME_BUDGET: 'TIME_BUDGET', STATE_BUDGET: 'STATE_BUDGET', CANDIDATE_LIMIT: 'OUTPUT_BUDGET'};
  const firstStop = (['CANCELLED', 'TIME_BUDGET', 'STATE_BUDGET', 'CANDIDATE_LIMIT'] as const).find(r => result.incompleteReasons.includes(r));
  return {
    smiles, status: 'BOUNDED', visited: result.stats.visited, termination: firstStop ? reasonsMap[firstStop] : 'GRAMMAR_EXHAUSTED', complete,
    note: `1H 原子清單窮舉：${result.stats.visited} 步；${complete ? 'COMPLETE（在目前分子式與 1H 約束下所有分支走完）' : `INCOMPLETE（${incompleteReasons.join('、')}）`}；${smiles.length} 個去重候選`,
    partialHypotheses: [...(request.hints.couplingNotes ?? [])], rejectedByComposition: result.stats.rejected.sanitizeFailed,
    derivations, elapsedMs: result.stats.elapsedMs, frontierPeak: 0, enumeration: emptyDiagnostics(run, origins),
  };
}

// ------------------------------------------------------------------------------------------------ v1.2.1 (useV121Planning)
interface PlannedContext {
  parsed: {ok: true; counts: Record<string, number>};
  inv: ReturnType<typeof buildAtomInventory>;
  eb: {timeMs: number; maxStates: number; maxCandidates?: number};
  requiredSpecs: RequiredSubstructureSpec[];
  h1: ReturnType<typeof h1SignalsFromObservations>;
  diag: (path: V12RunDiagnostic['path'], reason: string | null, patternSets?: number, patternTruncated?: boolean, runs?: V12RunDiagnostic['runs'], leafCost?: V12RunDiagnostic['leafCost']) => V12RunDiagnostic;
}
const BUDGET_REASONS: IncompleteReason[] = ['TIME_BUDGET', 'STATE_BUDGET', 'CANDIDATE_LIMIT', 'ALTERNATIVE_SET_NOT_RUN'];

/**
 * One round of the planned search for one formula. Round 1 runs the readings without an alkene CH (or, by the alkene exception, the alkene readings)
 * under the step cap and never falls back to the flexible-atom or legacy search: a formula without a usable reading reports ROUND1_NO_TEMPLATE_READING
 * (visited 0). Round 2 runs the alkene readings only. A run is complete only when every reading of the formula has run to the end.
 */
async function generatePlanned(request: StructureGenerationRequest, c: PlannedContext): Promise<DeNovoSearchResult> {
  const {parsed, inv, eb} = c;
  const round = request.planning!.round;
  const kinds = readingKinds(inv);
  const sets: FragmentAlternativeSet[] = [];
  const info: Record<string, InventorySetInfo> = {};
  let patternTruncated = false;
  for (const alt of inv.alternatives) {
    const adapted = inventoryToFragmentSets(alt, {required: c.requiredSpecs});
    sets.push(...adapted.sets); Object.assign(info, adapted.info);
    patternTruncated ||= adapted.truncated;
  }
  const vinylSet = (id: string) => Boolean(info[id]?.hasVinyl);
  const plainSets = sets.filter(x => !vinylSet(x.id)), vinylSets = sets.filter(x => vinylSet(x.id));
  const exception = round === 1 && kinds.vinylException && vinylSets.length > 0;
  const runSets = round === 2 || exception ? vinylSets : plainSets;
  const pending = round === 1 && !exception && vinylSets.length > 0;
  const cap = round === 1 ? Math.min(request.planning!.maxStates ?? eb.maxStates, eb.maxStates) : eb.maxStates;
  const capBinding = round === 1 && cap < eb.maxStates;
  const planning = (visited: number, candidates: number, vinylRun: boolean, elapsedMs = 0): RunPlanning => ({
    round, templateReading: round === 1 ? !exception && plainSets.length > 0 : true, vinylException: exception, vinylPending: pending, vinylRun,
    round1Visited: round === 1 ? visited : 0, round2Visited: round === 2 ? visited : 0, round1Candidates: round === 1 ? candidates : 0,
    round1ElapsedMs: round === 1 ? elapsedMs : 0, round2ElapsedMs: round === 2 ? elapsedMs : 0,
  });
  const baseNotes = [`1H 原子清單：${inv.alternatives.length} 個替代解讀、${sets.length} 個片段組合（取代型式）；第 ${round} 輪${round === 1 ? (exception ? '（烯基例外：沒有不含烯基的讀法，改跑烯基讀法）' : '（只跑不含烯基的讀法）') : '（烯基讀法）'}`];
  const emptyResult = (reasons: IncompleteReason[], note: string): DeNovoSearchResult => {
    const run: EnumerationRunDiagnostic = {
      used: true, fallbackReason: null, formula: request.formula!, status: 'INVALID_REQUEST', complete: reasons.length === 0, incompleteReasons: reasons, readings: [], incompatibleReadings: 0, candidates: 0, visited: 0, leaves: 0, elapsedMs: 0, rejected: null,
      conversions: [], notes: [...baseNotes, note], v12: c.diag('INVENTORY', null, sets.length, patternTruncated), planning: planning(0, 0, false),
    };
    return {smiles: [], status: 'BOUNDED', visited: 0, termination: 'GRAMMAR_EXHAUSTED', complete: run.complete, note, partialHypotheses: [...(request.hints.couplingNotes ?? [])], rejectedByComposition: 0, derivations: {}, elapsedMs: 0, frontierPeak: 0, enumeration: emptyDiagnostics(run, {})};
  };
  const noReading = (): DeNovoSearchResult => round === 1
    ? emptyResult(['ROUND1_NO_TEMPLATE_READING', ...(vinylSets.length ? ['VINYL_READINGS_NOT_RUN' as const] : [])], '第一輪沒有可容納此分子式的模板讀法；沒有退回彈性原子讀法或舊搜尋')
    : emptyResult([], '沒有可執行的烯基讀法（都與分子式不相容）');
  if (!runSets.length) return noReading();
  const result = await enumerateStructures({
    formula: parsed.counts, alternatives: runSets,
    forbid: {...(request.plausibility && CFG.pipelineEarlyPlausibilityPrune ? {plausibility: request.plausibility, plausibilityLeaf: false} : {}), strain: pipelineStrain(true)},
    symmetryPruning: V12_CONFIG.symmetryPruning,
    budget: {
      timeMs: eb.timeMs, maxStates: cap, maxCandidates: eb.maxCandidates ?? CFG.analysis.maxCandidatesPerFormula, shouldCancel: request.budget.shouldCancel,
      onProgress: request.budget.onProgress ? p => request.budget.onProgress!({visited: p.visited, candidateCount: p.candidates, elapsedMs: p.elapsedMs, frontier: 0}) : undefined,
    },
  });
  if (result.status === 'INVALID_REQUEST') return noReading();
  const runs: V12RunDiagnostic['runs'] = [];
  for (const k of inv.kCombinations) {
    const mine = result.sets.filter(x => info[x.id]?.k === k.k && info[x.id]?.extraExchangeable === k.extraExchangeable);
    if (!mine.length) continue;
    const reasons = [...new Set(mine.flatMap(x => x.incompleteReasons))].filter(r => r !== 'INVALID_ALTERNATIVE_SET');
    const runnable = mine.filter(x => x.complete !== null);
    runs.push({
      k: k.k, extraExchangeable: k.extraExchangeable, alternatives: new Set(mine.map(x => info[x.id].alternativeId)).size, sets: mine.length,
      complete: runnable.length ? runnable.every(x => x.complete === true) : null, visited: mine.reduce((a, x) => a + x.visited, 0), leaves: mine.reduce((a, x) => a + x.leaves, 0),
      candidates: mine.reduce((a, x) => a + x.newCandidates, 0), incompleteReasons: reasons as IncompleteReason[],
    });
  }
  const incompatibleSets = result.sets.filter(x => x.error && FORMULA_INCOMPATIBLE.includes(x.error.code));
  const otherErrors = result.sets.filter(x => x.error && !FORMULA_INCOMPATIBLE.includes(x.error.code));
  const raw = result.incompleteReasons.filter(r => r !== 'INVALID_ALTERNATIVE_SET');
  // The cap is a round-1 limit, not the analysis budget; in round 2 every budget stop belongs to the alkene readings.
  const mapped = raw.map((r): IncompleteReason => (round === 1 && capBinding && r === 'STATE_BUDGET' ? 'ROUND1_STEP_CAP' : round === 2 && BUDGET_REASONS.includes(r) ? 'VINYL_READINGS_BUDGET' : r));
  const extraReasons: IncompleteReason[] = [...inv.incompleteReasons, ...(patternTruncated && !inv.incompleteReasons.includes('INVENTORY_ALTERNATIVES_TRUNCATED') ? ['INVENTORY_ALTERNATIVES_TRUNCATED' as const] : [])];
  const incompleteReasons = [...new Set<IncompleteReason>([...mapped, ...(otherErrors.length ? ['INVALID_ALTERNATIVE_SET' as const] : []), ...(pending ? ['VINYL_READINGS_NOT_RUN' as const] : []), ...extraReasons])];
  const complete = incompleteReasons.length === 0;
  const smiles = result.candidates.map(x => x.smiles);
  const origins: Record<string, CandidateOrigin> = {};
  for (const x of result.candidates) {
    const seen = new Set<string>(), from: {k: number; extraExchangeable: number}[] = [];
    for (const sid of x.alternativeSetIds) { const i = info[sid]; if (i && !seen.has(`${i.k}/${i.extraExchangeable}`)) { seen.add(`${i.k}/${i.extraExchangeable}`); from.push({k: i.k, extraExchangeable: i.extraExchangeable}); } }
    origins[x.smiles] = {source: 'ENUMERATOR', relaxed: false, v12: from, round: round === 2 ? 2 : 1};
  }
  const run: EnumerationRunDiagnostic = {
    used: true, fallbackReason: null, formula: request.formula!, status: result.status, complete, incompleteReasons,
    readings: result.sets.map(x => ({id: x.id, localIds: [], complete: x.complete, error: x.error ? `${x.error.code}：${x.error.message}` : null, newCandidates: x.newCandidates})),
    incompatibleReadings: incompatibleSets.length, candidates: smiles.length, visited: result.stats.visited, leaves: result.stats.leaves, elapsedMs: result.stats.elapsedMs, rejected: result.stats.rejected,
    conversions: [], notes: [...baseNotes, runs.map(r => `k=${r.k}, 額外可交換 H=${r.extraExchangeable}`).join('；')],
    v12: c.diag('INVENTORY', null, sets.length, patternTruncated, runs, result.stats.leafCost ?? null), planning: planning(result.stats.visited, smiles.length, round === 2 || exception, result.stats.elapsedMs),
  };
  const derivations: NonNullable<DeNovoSearchResult['derivations']> = {};
  const h1Ids = c.h1.signals.filter(x => !x.optional).map(x => x.observationId);
  for (const x of result.candidates) {
    const first = info[x.alternativeSetIds[0]];
    derivations[x.smiles] = {localStructureIds: [], operations: [`1H 原子清單窮舉（第 ${round} 輪；k=${first?.k}，額外可交換 H=${first?.extraExchangeable}${first?.patternLabel ? `；${first.patternLabel}` : ''}；讀法 ${x.alternativeSetIds.join('、')}）`], observationIds: h1Ids};
  }
  const reasonsMap: Record<string, SearchTermination> = {CANCELLED: 'CANCELLED', TIME_BUDGET: 'TIME_BUDGET', STATE_BUDGET: 'STATE_BUDGET', CANDIDATE_LIMIT: 'OUTPUT_BUDGET'};
  const firstStop = (['CANCELLED', 'TIME_BUDGET', 'STATE_BUDGET', 'CANDIDATE_LIMIT'] as const).find(r => result.incompleteReasons.includes(r));
  return {
    smiles, status: 'BOUNDED', visited: result.stats.visited, termination: firstStop ? reasonsMap[firstStop] : 'GRAMMAR_EXHAUSTED', complete,
    note: `1H 原子清單窮舉（第 ${round} 輪）：${result.stats.visited} 步；${complete ? 'COMPLETE' : `INCOMPLETE（${incompleteReasons.join('、')}）`}；${smiles.length} 個去重候選`,
    partialHypotheses: [...(request.hints.couplingNotes ?? [])], rejectedByComposition: result.stats.rejected.sanitizeFailed,
    derivations, elapsedMs: result.stats.elapsedMs, frontierPeak: 0, enumeration: emptyDiagnostics(run, origins),
  };
}
