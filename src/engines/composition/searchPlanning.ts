import {buildAtomInventory} from '../constraints/atomInventory';
import {inventoryToFragmentSets} from '../constraints/inventoryAdapter';
import {readingKinds} from '../constraints/readingKinds';
import {h1SignalsFromObservations, irAldehydeContext, type V12Evidence} from '../constraints/v12Evidence';
import {V12_CONFIG} from '../constraints/v12Config';
import {buildProblem, parseFormula} from '../enumeration/problem';
import {Searcher} from '../enumeration/search';
import type {CompositionHypothesis, NotSearchedReason, OxygenEvidenceFloor} from './types';

/**
 * v1.2.1 planning of the no-formula search (A3, A5): which formulas are searched and in which order. Pure functions of the hypothesis list and
 * the 1H/IR evidence; no budget decisions here (those are in structureGenerator). Every number comes from V12_CONFIG.planning.
 */
const PROBE_STEPS = 64;
export interface Feasibility {
  feasible: boolean;
  /** Why not (panel wording), null when feasible. */
  reason: string | null;
  /** A reading without an alkene CH can hold the formula. */
  templateReading: boolean;
  /** Every reading of the signals needs an alkene-CH class (no reading without one exists), so round 1 runs the alkene readings. */
  vinylException: boolean;
  ms: number;
}

/**
 * A5: can the 1H evidence be read as a fragment inventory that holds this formula? No search is run, only the construction of the readings:
 * H = k·S + e (inside buildAtomInventory), at least one reading without an alkene CH — or, when every reading needs an alkene-CH class, one with it —
 * and a fragment set of that reading that the formula can hold (no element shortage, hydrogen shortage/excess or valence parity, checked by buildProblem).
 * It uses only the integral ratio, shift classes, multiplicities and the formula, and treats k = 1, 2, 3 alike. It does not say the formula is correct.
 */
export function h1Feasibility(formula: string, evidence: V12Evidence): Feasibility {
  const t0 = performance.now();
  const done = (feasible: boolean, reason: string | null, templateReading: boolean, vinylException: boolean): Feasibility => ({feasible, reason, templateReading, vinylException, ms: performance.now() - t0});
  const parsed = parseFormula(formula);
  if (!parsed.ok) return done(false, `分子式無法解析：${parsed.error.message}`, false, false);
  const h1 = h1SignalsFromObservations(evidence.observations);
  const inv = buildAtomInventory({signals: h1.signals, formula: parsed.counts, solvent: h1.solvent, coverageComplete: h1.coverageComplete, ir: irAldehydeContext(evidence.observations, evidence.irCoversAldehydeRegion), nitrogenAllowed: evidence.nitrogenAllowed});
  // Without integrals nothing can be judged; the formula stays in.
  if (inv.status === 'NOT_AVAILABLE') return done(true, null, true, false);
  if (!inv.alternatives.length) return done(false, inv.reason ?? '所有替代解讀都作廢或無法表達', false, false);
  const kinds = readingKinds(inv);
  if (kinds.plain.length === 0 && !kinds.vinylException) return done(false, '沒有可容納此分子式的模板讀法（不含烯基的讀法都不成立，且沒有訊號只能由烯基類別解釋）', false, false);
  const vinylException = kinds.vinylException;
  const pool = vinylException ? inv.alternatives : kinds.plain;
  let firstError: string | null = null;
  for (const alt of pool) {
    for (const set of inventoryToFragmentSets(alt).sets) {
      const built = buildProblem(parsed.counts, set, {symmetryPruning: V12_CONFIG.symmetryPruning});
      if (!built.ok) { firstError ??= `${built.error.code}：${built.error.message}`; continue; }
      // The problem builds; a short probe tells whether the search space is empty from the start (the fragments cannot be joined into one molecule).
      const probe = new Searcher(built.problem, {noPeroxide: false, noNitrogenOxygen: false}, () => undefined);
      if (probe.run(PROBE_STEPS) !== 'DONE' || probe.leaves > 0) return done(true, null, !vinylException, vinylException);
      firstError ??= 'EMPTY_SPACE：片段與元素預算無法連成一個符合分子式的分子';
    }
  }
  return done(false, firstError ?? '沒有可用的片段組合', false, false);
}

export interface PlannedFormula {hypothesis: CompositionHypothesis; order: number; feasibility: Feasibility}
export interface NotSearched {reason: NotSearchedReason; text: string}
export interface FormulaSearchPlanResult {
  /** In search order (k round-robin). */
  chosen: PlannedFormula[];
  notSearched: Map<string, NotSearched>;
  /** Formulas whose feasibility was computed, and the time it took (A5 cost). */
  feasibilityChecked: number;
  feasibilityMs: number;
}

const cOf = (h: CompositionHypothesis) => h.counts.C ?? 0;
const hOf = (h: CompositionHypothesis) => h.counts.H ?? 0;
const oOf = (h: CompositionHypothesis) => h.counts.O ?? 0;
/** Score first (higher is better); equal scores by C, H, O ascending, which is neutral and deterministic. */
const better = (a: CompositionHypothesis, b: CompositionHypothesis) => b.score - a.score || cOf(a) - cOf(b) || hOf(a) - hOf(b) || oOf(a) - oOf(b) || a.formula.localeCompare(b.formula);

/**
 * A3: choose the formulas of the round-1 search.
 * 1. Only formulas the generator supports; with an O evidence floor, only O in [floor, floor + oxygenAllowedAboveFloor] (others are listed, not searched).
 * 2. Per (k, C) key at most `maxOxygenVariantsPerKey` formulas (best score first).
 * 3. k round-robin: best of k=1, best of k=2, best of k=3, second of k=1, … The first `maxRound1Formulas` that pass the feasibility check (A5) are chosen.
 * Formulas that are not chosen keep their place in the list and get a reason. Score and k come from the composition inference (no 1H structure there).
 */
export function planFormulaSearch(hypotheses: CompositionHypothesis[], oxygenFloor: OxygenEvidenceFloor | null, evidence: V12Evidence, feasibility: (formula: string, e: V12Evidence) => Feasibility = h1Feasibility): FormulaSearchPlanResult {
  const P = V12_CONFIG.planning;
  const notSearched = new Map<string, NotSearched>();
  const mark = (h: CompositionHypothesis, reason: NotSearchedReason, text: string) => notSearched.set(h.id, {reason, text});
  const inRange: CompositionHypothesis[] = [];
  for (const h of hypotheses.filter(x => x.generatorSupported)) {
    const O = oOf(h);
    if (oxygenFloor && O < oxygenFloor.floor) mark(h, 'OXYGEN_OUTSIDE_RANGE', `O 少於 IR 證據的 O 下限 ${oxygenFloor.floor}`);
    else if (oxygenFloor && O > oxygenFloor.floor + P.oxygenAllowedAboveFloor) mark(h, 'OXYGEN_OUTSIDE_RANGE', `O 超過 IR 證據的 O 下限 ${oxygenFloor.floor} ＋ ${P.oxygenAllowedAboveFloor}`);
    else inRange.push(h);
  }
  const byKey = new Map<string, CompositionHypothesis[]>();
  for (const h of inRange) {
    const key = `${h.symmetryMultiple ?? 0}|${cOf(h)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), h]);
  }
  const kept: CompositionHypothesis[] = [];
  for (const group of byKey.values()) {
    group.sort(better);
    kept.push(...group.slice(0, P.maxOxygenVariantsPerKey));
    for (const h of group.slice(P.maxOxygenVariantsPerKey)) mark(h, 'OXYGEN_VARIANT_LIMIT', `同骨架 O 變體超過保留數（每個 k／C 數最多 ${P.maxOxygenVariantsPerKey} 個）`);
  }
  const byK = new Map<number, CompositionHypothesis[]>();
  for (const h of kept) byK.set(h.symmetryMultiple ?? 0, [...(byK.get(h.symmetryMultiple ?? 0) ?? []), h]);
  const ks = [...byK.keys()].sort((a, b) => a - b);
  for (const k of ks) byK.get(k)!.sort(better);
  // Round-robin over the feasible formulas: each turn a k takes its next formula that passes the feasibility check (the ones that fail are listed, not searched).
  const queues = new Map(ks.map(k => [k, [...byK.get(k)!]]));
  const chosen: PlannedFormula[] = [];
  let checked = 0, ms = 0;
  while (chosen.length < P.maxRound1Formulas && [...queues.values()].some(q => q.length)) {
    for (const k of ks) {
      if (chosen.length >= P.maxRound1Formulas) break;
      const q = queues.get(k)!;
      while (q.length) {
        const h = q.shift()!;
        const f = feasibility(h.formula, evidence);
        checked++; ms += f.ms;
        if (!f.feasible) { mark(h, 'H1_INFEASIBLE', `¹H 清單不可行：${f.reason}`); continue; }
        chosen.push({hypothesis: h, order: chosen.length + 1, feasibility: f});
        break;
      }
    }
  }
  for (const q of queues.values()) for (const h of q) mark(h, 'K_ROUND_ROBIN_FULL', `k 輪流名額已滿（第一輪最多搜尋 ${P.maxRound1Formulas} 個分子式）`);
  return {chosen, notSearched, feasibilityChecked: checked, feasibilityMs: ms};
}
