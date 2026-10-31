import {buildAtomInventory} from '../constraints/atomInventory';
import {inventoryToFragmentSets} from '../constraints/inventoryAdapter';
import {readingKinds} from '../constraints/readingKinds';
import {h1SignalsFromObservations, irAldehydeContext, type V12Evidence} from '../constraints/v12Evidence';
import {V12_CONFIG} from '../constraints/v12Config';
import {buildProblem, parseFormula} from '../enumeration/problem';
import {Searcher} from '../enumeration/search';
import {COMPOSITION_CONFIG} from './compositionConfig';
import {hiddenExchangeableEvidence} from './functionalGroupBounds';
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
  /**
   * DBE the 1H evidence needs at least: over the feasible readings of the formula the smallest sum of the ring-template DBE (benzene 4, naphthalene 7, pyridine 4)
   * plus one per C=C of an alkene reading (at least half the alkene CH atoms). Null when nothing could be judged.
   */
  dbeNeeded: number | null;
  ms: number;
}

/** DBE of a ring template: its rings plus its Kekulé double bonds. */
function templateDbe(id: string): number {
  const t = V12_CONFIG.ringTemplates.find(x => x.id === id);
  return t ? t.rings + t.bonds.filter(b => b[2] === 2).length : 0;
}
/** DBE one reading of the inventory needs by its own structure: ring templates and alkene C=C (every C=C holds two atoms, so at least half of the alkene CH atoms). */
export function readingDbe(alt: {rings: {rings: {templateId: string}[]}; groups: {alkene: boolean; atomCount: number}[]}): number {
  return alt.rings.rings.reduce((a, r) => a + templateDbe(r.templateId), 0) + Math.ceil(alt.groups.filter(g => g.alkene).reduce((a, g) => a + g.atomCount, 0) / 2);
}

/**
 * A5: can the 1H evidence be read as a fragment inventory that holds this formula? No search is run, only the construction of the readings:
 * H = k·S + e (inside buildAtomInventory), at least one reading without an alkene CH — or, when every reading needs an alkene-CH class, one with it —
 * and a fragment set of that reading that the formula can hold (no element shortage, hydrogen shortage/excess or valence parity, checked by buildProblem).
 * It uses only the integral ratio, shift classes, multiplicities and the formula, and treats k = 1, 2, 3 alike. It does not say the formula is correct.
 */
export function h1Feasibility(formula: string, evidence: V12Evidence): Feasibility {
  const t0 = performance.now();
  const done = (feasible: boolean, reason: string | null, templateReading: boolean, vinylException: boolean, dbeNeeded: number | null = null): Feasibility => ({feasible, reason, templateReading, vinylException, dbeNeeded, ms: performance.now() - t0});
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
  // Readings with the smallest DBE first: the first one the formula can hold gives the smallest DBE the evidence needs.
  for (const alt of [...pool].sort((a, b) => readingDbe(a) - readingDbe(b))) {
    for (const set of inventoryToFragmentSets(alt).sets) {
      const built = buildProblem(parsed.counts, set, {symmetryPruning: V12_CONFIG.symmetryPruning});
      if (!built.ok) { firstError ??= `${built.error.code}：${built.error.message}`; continue; }
      // The problem builds; a short probe tells whether the search space is empty from the start (the fragments cannot be joined into one molecule).
      const probe = new Searcher(built.problem, {noPeroxide: false, noNitrogenOxygen: false}, () => undefined);
      if (probe.run(PROBE_STEPS) !== 'DONE' || probe.leaves > 0) return done(true, null, !vinylException, vinylException, readingDbe(alt));
      firstError ??= 'EMPTY_SPACE：片段與元素預算無法連成一個符合分子式的分子';
    }
  }
  return done(false, firstError ?? '沒有可用的片段組合', false, false);
}

export interface PlannedFormula {hypothesis: CompositionHypothesis; order: number; feasibility: Feasibility; dbe: DbeParsimony}
/** The sort key "DBE parsimony": DBE of the formula, DBE the evidence needs (rings and C=C of the smallest feasible reading, +1 for a strong C=O) and the excess. */
export interface DbeParsimony {dbe: number; needed: number | null; excess: number}
export interface NotSearched {reason: NotSearchedReason; text: string}
export interface FormulaSearchPlanResult {
  /** In search order (k round-robin; with nameOrder TWO_PASS: pass 1 = one representative per (k, C), pass 2 = the other variants). */
  chosen: PlannedFormula[];
  /** v1.2.1c: the IR has a broad X–H band and the 1H table has no broad signal, so the missing-exchangeable prior was not charged when ordering (see hiddenExchangeableEvidence). */
  hiddenExchangeable: boolean;
  notSearched: Map<string, NotSearched>;
  /** Formulas whose feasibility was computed, and the time it took (A5 cost). */
  feasibilityChecked: number;
  feasibilityMs: number;
}

const cOf = (h: CompositionHypothesis) => h.counts.C ?? 0;
const hOf = (h: CompositionHypothesis) => h.counts.H ?? 0;
const oOf = (h: CompositionHypothesis) => h.counts.O ?? 0;
const kOf = (h: CompositionHypothesis) => h.symmetryMultiple ?? 0;
const eOf = (h: CompositionHypothesis) => h.extraExchangeable ?? 0;
/** Equal scores are ties (the scores are sums of the same few constants; a rounding difference is not a difference). */
const SCORE_TIE = 1e-9;
const tail = (a: CompositionHypothesis, b: CompositionHypothesis) => cOf(a) - cOf(b) || hOf(a) - hOf(b) || oOf(a) - oOf(b) || a.formula.localeCompare(b.formula);

/** The O window of a formula: [floor, k × floor + allowed] (k = 1 gives [floor, floor + allowed]); the symmetric unit is copied k times, and so are its O atoms. */
export const oxygenWindow = (floor: number, k: number): [number, number] => [floor, Math.max(1, k) * floor + V12_CONFIG.planning.oxygenAllowedAboveFloor];
const variantLimit = (k: number) => (k >= 2 ? V12_CONFIG.planning.maxOxygenVariantsPerKeyMultiple : V12_CONFIG.planning.maxOxygenVariantsPerKey);

/**
 * A3: choose the formulas of the round-1 search.
 * 1. Only formulas the generator supports; with an O evidence floor, only O in the window [floor, k × floor + 1] (others are listed, not searched).
 * 2. Per (k, C) key at most N O variants (N = 2 for k = 1, 3 for k ≥ 2); the variants O = floor and O = k × floor come before the others, then best score.
 *    v1.2.1c: for each kept O count the best formula with extra exchangeable H (e > 0) is kept as well as the best one without, so a formula that needs hidden
 *    OH/NH hydrogens is not swallowed by its e = 0 neighbour of the same (k, C, O).
 * 3. Feasibility (A5) of every kept formula, then the order key: score (higher), DBE excess (lower), C (lower), H, O. DBE excess = max(0, DBE of the formula −
 *    DBE the evidence needs); it only orders formulas of equal score, it is not a penalty. When the IR shows a broad X–H band and the 1H table has no broad
 *    signal (hiddenExchangeableEvidence), the order key does not charge the missing-exchangeable prior (weights.exchangeableMissing × e); the scores stay as they are.
 * 4. `nameOrder` 'TWO_PASS' (v1.2.1c; off by default, see V12_CONFIG.planning): names are taken in two passes, each in k round-robin order: pass 1 takes ONE representative per (k, C) (the best O/e variant: O = floor or
 *    k × floor first, then the order key), so the names widen over C, the quantity with no evidence at all (invisible quaternary carbons); pass 2 fills the
 *    remaining names with the other variants. 'ONE_PASS' (the default): one queue per k in the order key. In total `maxRound1Formulas` names.
 * Formulas that are not chosen keep their place in the list and get a reason. Score and k come from the composition inference (no 1H structure there).
 */
export function planFormulaSearch(hypotheses: CompositionHypothesis[], oxygenFloor: OxygenEvidenceFloor | null, evidence: V12Evidence, feasibility: (formula: string, e: V12Evidence) => Feasibility = h1Feasibility): FormulaSearchPlanResult {
  const P = V12_CONFIG.planning;
  const notSearched = new Map<string, NotSearched>();
  const mark = (h: CompositionHypothesis, reason: NotSearchedReason, text: string) => notSearched.set(h.id, {reason, text});
  const hidden = hiddenExchangeableEvidence(evidence.observations).present;
  /** Score used for ordering only: with hidden-exchangeable evidence the prior against missing exchangeable H is not charged. */
  const planScore = (h: CompositionHypothesis) => h.score + (hidden ? COMPOSITION_CONFIG.weights.exchangeableMissing * eOf(h) : 0);
  const scoreOrder = (a: CompositionHypothesis, b: CompositionHypothesis) => (Math.abs(planScore(a) - planScore(b)) > SCORE_TIE ? planScore(b) - planScore(a) : 0);
  /** Choice among the variants of a key: score first (higher is better), then C, H, O ascending. */
  const better = (a: CompositionHypothesis, b: CompositionHypothesis) => scoreOrder(a, b) || tail(a, b);
  const inRange: CompositionHypothesis[] = [];
  for (const h of hypotheses.filter(x => x.generatorSupported)) {
    const O = oOf(h);
    const [lo, hi] = oxygenFloor ? oxygenWindow(oxygenFloor.floor, kOf(h)) : [0, Infinity];
    if (O < lo) mark(h, 'OXYGEN_OUTSIDE_RANGE', `O 少於 IR 證據的 O 下限 ${lo}`);
    else if (O > hi) mark(h, 'OXYGEN_OUTSIDE_RANGE', `O 超過 IR 證據的 O 視窗上緣 ${hi}（k=${kOf(h) || 1} 時為 k × 下限 ＋ ${P.oxygenAllowedAboveFloor}）`);
    else inRange.push(h);
  }
  const byKey = new Map<string, CompositionHypothesis[]>();
  for (const h of inRange) {
    const key = `${kOf(h)}|${cOf(h)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), h]);
  }
  const kept: CompositionHypothesis[] = [];
  for (const group of byKey.values()) {
    const k = kOf(group[0]), floor = oxygenFloor?.floor ?? 0;
    const priority = (h: CompositionHypothesis) => (!oxygenFloor || oOf(h) === floor || oOf(h) === Math.max(1, k) * floor ? 0 : 1);
    // N O variants = N distinct O counts, each with its best formula (H / N variants of the same O count share the slot) …
    group.sort(better);
    const bestOfO = new Map<number, CompositionHypothesis>();
    for (const h of group) if (!bestOfO.has(oOf(h))) bestOfO.set(oOf(h), h);
    const reps = [...bestOfO.values()].sort((x, y) => priority(x) - priority(y) || better(x, y));
    const n = variantLimit(k);
    const keep = new Set(reps.slice(0, n));
    // … and, when the best formula of a kept O count has no extra exchangeable H, also its best formula with some (the e > 0 variant is not swallowed by e = 0).
    for (const rep of [...keep]) {
      if (eOf(rep) > 0) continue;
      const withE = group.find(h => oOf(h) === oOf(rep) && eOf(h) > 0);
      if (withE) keep.add(withE);
    }
    kept.push(...keep);
    for (const h of group) {
      if (keep.has(h)) continue;
      const sameO = [...keep].some(x => oOf(x) === oOf(h));
      mark(h, 'OXYGEN_VARIANT_LIMIT', sameO ? '同 O 數只保留分數最高的一個（H、N 的變體不算 O 變體）；有額外可交換 H 的變體另外保留分數最高的一個' : `同骨架 O 變體超過保留數（每個 k／C 數最多 ${n} 個 O 變體）`);
    }
  }
  // A5 for every kept formula (the DBE sort key needs the readings), then the order inside each k.
  let checked = 0, ms = 0;
  const feasible = new Map<string, PlannedFormula>();
  for (const h of kept) {
    const f = feasibility(h.formula, evidence);
    checked++; ms += f.ms;
    if (!f.feasible) { mark(h, 'H1_INFEASIBLE', `¹H 清單不可行：${f.reason}`); continue; }
    const needed = f.dbeNeeded === null ? null : f.dbeNeeded + (oxygenFloor?.strongCarbonyl ? 1 : 0);
    feasible.set(h.id, {hypothesis: h, order: 0, feasibility: f, dbe: {dbe: h.dbe, needed, excess: needed === null ? 0 : Math.max(0, h.dbe - needed)}});
  }
  const planOrder = (a: PlannedFormula, b: PlannedFormula) => scoreOrder(a.hypothesis, b.hypothesis) || a.dbe.excess - b.dbe.excess || tail(a.hypothesis, b.hypothesis);
  const byK = new Map<number, PlannedFormula[]>();
  for (const p of feasible.values()) byK.set(kOf(p.hypothesis), [...(byK.get(kOf(p.hypothesis)) ?? []), p]);
  const ks = [...byK.keys()].sort((a, b) => a - b);
  // Pass 1 queue of a k: the representative of every (k, C) key; pass 2 queue: the other variants of those keys.
  const firstQueues = new Map<number, PlannedFormula[]>(), secondQueues = new Map<number, PlannedFormula[]>();
  for (const k of ks) {
    const floor = oxygenFloor?.floor ?? 0;
    // Which O count stands for a (k, C) key: O = floor and O = k × floor both come first ('EITHER': score, DBE excess and the smaller O decide); 'K_FLOOR': k × floor, then floor.
    const priority = (p: PlannedFormula) => {
      const O = oOf(p.hypothesis), kFloor = Math.max(1, k) * floor;
      if (!oxygenFloor) return 0;
      if (P.representativeOxygen === 'K_FLOOR') return O === kFloor ? 0 : O === floor ? 1 : 2;
      return O === floor || O === kFloor ? 0 : 1;
    };
    const perC = new Map<number, PlannedFormula[]>();
    for (const p of byK.get(k)!) perC.set(cOf(p.hypothesis), [...(perC.get(cOf(p.hypothesis)) ?? []), p]);
    const reps: PlannedFormula[] = [], rest: PlannedFormula[] = [];
    for (const variants of perC.values()) {
      const sorted = [...variants].sort((a, b) => priority(a) - priority(b) || planOrder(a, b));
      reps.push(sorted[0]);
      rest.push(...sorted.slice(1));
    }
    if (P.nameOrder === 'ONE_PASS') { firstQueues.set(k, [...reps, ...rest].sort(planOrder)); secondQueues.set(k, []); continue; }
    firstQueues.set(k, reps.sort(planOrder));
    secondQueues.set(k, rest.sort(planOrder));
  }
  const chosen: PlannedFormula[] = [];
  for (const queues of [firstQueues, secondQueues]) {
    while (chosen.length < P.maxRound1Formulas && [...queues.values()].some(q => q.length)) {
      for (const k of ks) {
        if (chosen.length >= P.maxRound1Formulas) break;
        const next = queues.get(k)!.shift();
        if (next) { next.order = chosen.length + 1; chosen.push(next); }
      }
    }
  }
  for (const queues of [firstQueues, secondQueues]) for (const q of queues.values()) for (const p of q) mark(p.hypothesis, 'K_ROUND_ROBIN_FULL', `k 輪流名額已滿（第一輪最多搜尋 ${P.maxRound1Formulas} 個分子式）`);
  return {chosen, hiddenExchangeable: hidden, notSearched, feasibilityChecked: checked, feasibilityMs: ms};
}
