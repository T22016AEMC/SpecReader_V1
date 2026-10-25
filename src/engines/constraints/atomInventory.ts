import {COMPOSITION_CONFIG} from '../composition/compositionConfig';
import {simplestIntegerRatio} from '../composition/nmrComposition';
import {classifySignal, NO_IR, type H1Signal, type IrAldehydeContext} from './shiftClasses';
import {V12_CONFIG, type Hybrid, type RingTemplateDef, type ShiftClassId} from './v12Config';

export type {H1Signal, IrAldehydeContext} from './shiftClasses';
export type {ShiftClassId, Hybrid} from './v12Config';

/** One observed 1H signal read as a group of atoms with the same number of hydrogens (docs/P1C_DESIGN.md §3 W1). */
export interface InventoryGroup {
  groupId: string;
  observationId: string;
  /** The first of the classes that give this reading (several classes can give the same atoms). */
  shiftClass: ShiftClassId;
  shiftClasses: ShiftClassId[];
  hTotal: number;
  /** Atoms of the group; for ARO_CH the aromatic CH atoms, which live in the ring templates. */
  atomCount: number;
  hPerAtom: number;
  element: 'C' | 'O' | 'N';
  hybrid: Hybrid;
  exchangeable: boolean;
  aromatic: boolean;
  /** Singlet rule: the carbon neighbours of these atoms carry no hydrogen. */
  singletNoHNeighbors: boolean;
  /** The atoms of this signal must be topologically equivalent (D2: not for m / unresolved / broad signals). */
  equivalent: boolean;
}
/** One ring (or fused ring system) with `ch` aromatic CH positions and every substitution pattern of those positions (up to the template symmetry). */
export interface RingInstancePlan {
  templateId: string;
  ch: number;
  /** Substituted (open, H = 0) positions per pattern, ascending template atom indices. */
  substituentPositionPatterns: number[][];
  substituents: number;
}
export interface AromaticRingPlan {
  rings: RingInstancePlan[];
  aromaticCh: number;
  /** Rings counted against maxAromaticRings (a fused pair counts 2). */
  ringCount: number;
}
export interface AppliedConstraint {id: string; detail: string; observationIds: string[]}
export interface InventoryAlternative {
  id: string;
  k: number;
  extraExchangeable: number;
  extraElement: 'O' | 'N' | null;
  groups: InventoryGroup[];
  rings: AromaticRingPlan;
  /** Heavy atoms of the formula that are in no group and no ring: H = 0. */
  zeroHAtoms: Record<string, number>;
  applied: AppliedConstraint[];
  notes: string[];
}
export type InventoryIncompleteReason = 'INVENTORY_ALTERNATIVES_TRUNCATED' | 'AROMATIC_TEMPLATE_LIMITED';
export interface InventorySignalSummary {
  observationId: string;
  shiftPpm: number;
  relativeIntegral: number | null;
  /** Integer of the simplest ratio. */
  ratio: number | null;
  multiplicity: string | null;
  broad: boolean;
  classes: ShiftClassId[];
  singletRuleApplied: boolean;
  equivalenceRequired: boolean;
}
/** One way to read the integrals: integer ratio × k (+ unobserved exchangeable H) = the formula's hydrogens. */
export interface InventoryCombination {k: number; extraExchangeable: number; ratio: number[]; ratioSum: number}
export interface AtomInventoryResult {
  status: 'BUILT' | 'NOT_AVAILABLE';
  reason: string | null;
  alternatives: InventoryAlternative[];
  truncated: boolean;
  incompleteReasons: InventoryIncompleteReason[];
  /** (k, extra exchangeable H) combinations that satisfy H − e = k·S. */
  kCombinations: InventoryCombination[];
  signals: InventorySignalSummary[];
  ratioSum: number | null;
  /** Readings that could not be used, with how often (formula element shortage, no shift class, …). */
  voided: {reason: string; count: number}[];
  /** Aromatic CH counts the template library cannot explain (AROMATIC_TEMPLATE_LIMITED). */
  aromaticLimited: {k: number; extraExchangeable: number; aromaticCh: number; reason: string}[];
  /** The 1H coverage is not confirmed complete: scoring halves the penalty for predicted environments that were not observed (stage 3). */
  coverageComplete: boolean;
}
export interface AtomInventoryInput {
  signals: H1Signal[];
  formula: Record<string, number>;
  solvent: string;
  coverageComplete: boolean;
  ir?: IrAldehydeContext;
  /** N-specific evidence exists (opens N_CH, pyridine and N as exchangeable-atom element). */
  nitrogenAllowed?: boolean;
}

// ------------------------------------------------------------------------------------------------ ring patterns
/** The CH position sets of a template with `ch` aromatic CH, one per symmetry class, as substituent (open) position lists. */
export function substitutionPatterns(t: RingTemplateDef, ch: number): number[][] {
  const per = t.peripheral;
  if (ch < 0 || ch > per.length) return [];
  const seen = new Set<string>();
  const out: number[][] = [];
  const chosen: number[] = [];
  const canonical = (set: number[]): string => {
    let best: string | null = null;
    for (const perm of t.symmetries) {
      const key = set.map(i => perm[i]).sort((a, b) => a - b).join(',');
      if (best === null || key < best) best = key;
    }
    return best!;
  };
  const rec = (start: number): void => {
    if (chosen.length === ch) {
      const key = canonical(chosen);
      if (!seen.has(key)) {
        seen.add(key);
        // The listed pattern is the substituted positions of the canonical image.
        const chSet = new Set(key === '' ? [] : key.split(',').map(Number));
        out.push(per.filter(p => !chSet.has(p)));
      }
      return;
    }
    for (let i = start; i < per.length; i++) { chosen.push(per[i]); rec(i + 1); chosen.pop(); }
  };
  rec(0);
  return out.sort((a, b) => a.join(',') < b.join(',') ? -1 : a.join(',') > b.join(',') ? 1 : 0);
}

interface RingInstance {tIndex: number; ch: number}
const templateCost = (t: RingTemplateDef): Record<string, number> => { const c: Record<string, number> = {}; for (const e of t.elements) c[e] = (c[e] ?? 0) + 1; return c; };

/**
 * All ring combinations (multisets of rings) whose CH counts sum to A and that use at most `maxRings` rings. Ignores the formula.
 * A ring whose every peripheral position is CH has no attachment site: the caller keeps such a combination only when the ring is all there is.
 */
function ringCombinations(A: number, templates: RingTemplateDef[], maxRings: number): RingInstance[][] {
  const out: RingInstance[][] = [];
  const items: RingInstance[] = [];
  templates.forEach((t, tIndex) => { for (let ch = 1; ch <= t.peripheral.length; ch++) items.push({tIndex, ch}); });
  const cur: RingInstance[] = [];
  const rec = (from: number, left: number, ringsLeft: number): void => {
    if (left === 0) { out.push(cur.slice()); return; }
    for (let i = from; i < items.length; i++) {
      const it = items[i], t = templates[it.tIndex];
      if (it.ch > left || t.rings > ringsLeft) continue;
      cur.push(it); rec(i, left - it.ch, ringsLeft - t.rings); cur.pop();
    }
  };
  rec(0, A, maxRings);
  return out;
}

/**
 * Every integer ratio the integrals admit (not only the simplest): value / unit must be within the integral tolerance of an integer ≥ 1.
 * The simplest ratio alone can hide the right reading (integrals 1 and 9 also read as 1 : 8 with a larger unit), so each admissible ratio
 * whose sum fits a (k, e) is kept; the coarser one (larger unit) comes first.
 */
export function admissibleRatios(values: number[]): number[][] {
  if (!values.length || values.some(v => !(v > 0))) return [];
  const tol = COMPOSITION_CONFIG.h1IntegralTolerance, maxM = COMPOSITION_CONFIG.h1MaxRatioMultiplier;
  const units = new Set<number>();
  for (const v of values) for (let m = 1; m <= maxM; m++) units.add(v / m);
  const out: number[][] = [];
  const seen = new Set<string>();
  for (const u of [...units].sort((a, b) => b - a)) {
    const ratio = values.map(v => v / u);
    if (!ratio.every(r => Math.round(r) >= 1 && Math.abs(r - Math.round(r)) <= tol)) continue;
    const rounded = ratio.map(Math.round);
    const key = rounded.join(',');
    if (!seen.has(key)) { seen.add(key); out.push(rounded); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the inventory
interface Option {
  classIds: ShiftClassId[];
  element: 'C' | 'O' | 'N';
  hPerAtom: number;
  atomCount: number;
  aromatic: boolean;
  hybrid: Hybrid;
  exchangeable: boolean;
  rank: number;
}

const isRelaxed = (s: H1Signal): boolean =>
  (V12_CONFIG.equivalenceRelaxedWhenBroad && s.broad) ||
  (s.multiplicity === null ? V12_CONFIG.equivalenceRelaxedWhenMultiplicityUnknown : V12_CONFIG.equivalenceRelaxedMultiplicities.includes(s.multiplicity));

export function buildAtomInventory(input: AtomInventoryInput): AtomInventoryResult {
  const cfg = V12_CONFIG;
  const base: AtomInventoryResult = {status: 'NOT_AVAILABLE', reason: null, alternatives: [], truncated: false, incompleteReasons: [], kCombinations: [], signals: [], ratioSum: null, voided: [], aromaticLimited: [], coverageComplete: input.coverageComplete};
  const signals = input.signals.filter(s => !s.optional);
  if (!signals.length) return {...base, reason: '沒有可用的 1H 訊號（自動判定的溶劑峰不計）'};
  const missing = signals.filter(s => !(s.relativeIntegral !== null && s.relativeIntegral > 0));
  if (missing.length) return {...base, reason: `${missing.length} 個 1H 訊號沒有積分，無法建立原子清單（沿用 v1.1.7 彈性原子路徑）`};
  const simplest = simplestIntegerRatio(signals.map(s => s.relativeIntegral!));
  if (!simplest) return {...base, reason: '1H 積分無法化為整數比，無法建立原子清單（沿用 v1.1.7 彈性原子路徑）'};
  const H = input.formula.H ?? 0;
  const formulaElements = new Set(Object.entries(input.formula).filter(([, n]) => n > 0).map(([e]) => e));
  const nitrogenAllowed = Boolean(input.nitrogenAllowed);
  const ir = input.ir ?? NO_IR;
  // (ratio, k, e) readings with H − e = k·S; readings that give the same hydrogens per signal and the same e are one reading.
  const kCombinations: InventoryCombination[] = [];
  const seenReading = new Set<string>();
  for (const ratio of admissibleRatios(signals.map(s => s.relativeIntegral!))) {
    const S = ratio.reduce((a, b) => a + b, 0);
    for (let e = 0; e <= cfg.maxExtraExchangeable; e++) for (let k = 1; k <= cfg.maxK; k++) {
      if (H - e !== k * S) continue;
      const key = `${e}|${ratio.map(r => r * k).join(',')}`;
      if (seenReading.has(key)) continue;
      seenReading.add(key);
      kCombinations.push({k, extraExchangeable: e, ratio, ratioSum: S});
    }
  }
  kCombinations.sort((a, b) => a.extraExchangeable - b.extraExchangeable || a.k - b.k);
  const ratio = simplest, S = simplest.reduce((a, b) => a + b, 0);

  const voided = new Map<string, number>();
  const bump = (reason: string) => voided.set(reason, (voided.get(reason) ?? 0) + 1);
  const result: AtomInventoryResult = {...base, status: 'BUILT', kCombinations, ratioSum: S, signals: []};
  const classNotes: string[] = [];
  const classified = signals.map(s => { const c = classifySignal(s, {solvent: input.solvent, formulaElements, nitrogenAllowed, ir}); classNotes.push(...c.notes); return c; });
  const singletClean = signals.map((s, i) => s.multiplicity === 's' && !s.broad && signals.every((o, j) => j === i || Math.abs(o.shiftPpm - s.shiftPpm) > cfg.singletOverlapPpm));
  signals.forEach((s, i) => result.signals.push({
    observationId: s.observationId, shiftPpm: s.shiftPpm, relativeIntegral: s.relativeIntegral, ratio: ratio[i], multiplicity: s.multiplicity, broad: s.broad,
    classes: [...new Set(classified[i].matches.map(m => m.classId))], singletRuleApplied: singletClean[i], equivalenceRequired: !isRelaxed(s),
  }));
  if (!kCombinations.length) {
    result.reason = `分子式 H=${H} 與積分的整數比總和 S=${S} 不相容：沒有 k∈1…${cfg.maxK}、額外可交換 H∈0…${cfg.maxExtraExchangeable} 使 H − e = k·S`;
    bump(result.reason);
    result.voided = [...voided].map(([reason, count]) => ({reason, count}));
    return result;
  }

  const templates = cfg.ringTemplates.filter(t => !t.requiresN || (nitrogenAllowed && (input.formula.N ?? 0) >= 1));
  const heavyTotal = Object.entries(input.formula).reduce((s, [e, n]) => s + (e === 'H' ? 0 : n), 0);
  const ringCache = new Map<number, RingInstance[][]>();
  const classOrder = (id: ShiftClassId) => cfg.shiftClasses.findIndex(c => c.id === id);
  const hPref = (m: number) => { const i = cfg.hPerAtomPreference.indexOf(m); return i < 0 ? cfg.hPerAtomPreference.length : i; };

  const exchangeElements = (): ('O' | 'N')[] => {
    const out: ('O' | 'N')[] = [];
    if ((input.formula.O ?? 0) > 0) out.push('O');
    if ((input.formula.N ?? 0) > 0 && (nitrogenAllowed || !out.length)) out.push('N');
    return out;
  };

  for (const {k, extraExchangeable: e, ratio: rr} of kCombinations) {
    const runVoid = (reason: string) => bump(`k=${k}, 額外可交換 H=${e}：${reason}`);
    // Options per signal for this k: n_i = k·r_i hydrogens.
    const optionsPer: Option[][] = [];
    let dead = false;
    for (let i = 0; i < signals.length && !dead; i++) {
      const n = k * rr[i];
      const merged = new Map<string, Option>();
      for (const m of classified[i].matches) {
        const def = m.def;
        if (def.id === 'ARO_CH') {
          const key = 'C|1|ar';
          const o = merged.get(key);
          if (o) o.classIds.push(def.id); else merged.set(key, {classIds: [def.id], element: 'C', hPerAtom: 1, atomCount: n, aromatic: true, hybrid: 'AR', exchangeable: false, rank: 0});
          continue;
        }
        const elements: ('C' | 'O' | 'N')[] = def.exchangeable ? exchangeElements() : ['C'];
        for (const element of elements) for (const h of def.hPerAtom) {
          if (n % h !== 0) continue;
          const key = `${element}|${h}|${def.exchangeable ? 'x' : 'c'}`;
          const o = merged.get(key);
          if (o) { if (!o.classIds.includes(def.id)) o.classIds.push(def.id); }
          else merged.set(key, {classIds: [def.id], element, hPerAtom: h, atomCount: n / h, aromatic: false, hybrid: def.hybrid, exchangeable: def.exchangeable, rank: 0});
        }
      }
      // A broad (or user-marked exchangeable) signal is read as OH/NH first; otherwise the class order of the table decides.
      const exchFirst = signals[i].broad || Boolean(signals[i].exchangeable);
      const order = (id: ShiftClassId) => (id === 'EXCHANGEABLE' && exchFirst ? -1 : classOrder(id));
      const list = [...merged.values()].sort((a, b) => {
        const ca = Math.min(...a.classIds.map(order)), cb = Math.min(...b.classIds.map(order));
        return ca - cb || hPref(a.hPerAtom) - hPref(b.hPerAtom) || (a.element < b.element ? -1 : a.element > b.element ? 1 : 0);
      });
      list.forEach((o, idx) => { o.rank = idx; });
      if (!list.length) { runVoid(`訊號 ${signals[i].observationId}（${signals[i].shiftPpm} ppm，${n}H）沒有任何位移類別／每原子 H 數可以解釋`); dead = true; break; }
      optionsPer.push(list);
    }
    if (dead) continue;

    const alternatives: InventoryAlternative[] = [];
    let examined = 0, cut = false;
    const maxLevel = optionsPer.reduce((s, l) => s + l.length - 1, 0);
    const chosen: Option[] = [];
    const makeAlternatives = (combo: Option[]): InventoryAlternative[] => {
      examined++;
      const need: Record<string, number> = {};
      const add = (el: string, n: number) => { need[el] = (need[el] ?? 0) + n; };
      let A = 0;
      combo.forEach(o => { if (o.aromatic) A += o.atomCount; else add(o.element, o.atomCount); });
      let extraElement: 'O' | 'N' | null = null;
      if (e > 0) {
        const els = exchangeElements();
        const usable = els.find(el => (input.formula[el] ?? 0) - (need[el] ?? 0) >= e);
        if (!usable) { runVoid(`額外 ${e} 個可交換 H 沒有足夠的 O／N 原子可放`); return []; }
        extraElement = usable; add(usable, e);
      }
      for (const [el, n] of Object.entries(need)) if (n > (input.formula[el] ?? 0)) { runVoid(`原子清單需要 ${n} 個 ${el}，分子式只有 ${input.formula[el] ?? 0} 個`); return []; }
      // Ring combinations for the aromatic CH.
      let plans: RingInstance[][] = [[]];
      let limited = false;
      if (A > 0) {
        if (!ringCache.has(A)) ringCache.set(A, ringCombinations(A, templates, cfg.maxAromaticRings));
        const all = ringCache.get(A)!;
        // The library explains A only by combinations in which every ring has an attachment site (or the single ring is all there is).
        const isFull = (it: RingInstance) => it.ch === templates[it.tIndex].peripheral.length;
        if (!all.some(p => p.length === 1 || !p.some(isFull))) {
          limited = true;
          plans = [];
        } else {
          plans = all.filter(p => {
            const cost: Record<string, number> = {};
            for (const it of p) for (const [el, n] of Object.entries(templateCost(templates[it.tIndex]))) cost[el] = (cost[el] ?? 0) + n;
            if (!Object.entries(cost).every(([el, n]) => n + (need[el] ?? 0) <= (input.formula[el] ?? 0))) return false;
            // A ring with no substituent position cannot be joined to anything: only valid when it is the whole molecule.
            if (p.some(it => it.ch === templates[it.tIndex].peripheral.length)) return p.length === 1 && Object.values(cost).reduce((a, b) => a + b, 0) === heavyTotal;
            return true;
          });
        }
      }
      if (limited) {
        result.aromaticLimited.push({k, extraExchangeable: e, aromaticCh: A, reason: `芳香 CH ${A} 個無法由模板庫解釋（${templates.map(t => t.id).join('、')}；最多 ${cfg.maxAromaticRings} 環）`});
        return [];
      }
      if (!plans.length) { runVoid(`芳香 CH ${A} 個的環模板組合都超出分子式的原子數`); return []; }
      const out: InventoryAlternative[] = [];
      plans.sort((a, b) => {
        const ra = a.reduce((s, it) => s + templates[it.tIndex].rings, 0), rb = b.reduce((s, it) => s + templates[it.tIndex].rings, 0);
        if (ra !== rb) return ra - rb;
        const ka = a.map(it => `${String(it.tIndex).padStart(2, '0')}${String(99 - it.ch).padStart(2, '0')}`).join('|');
        const kb = b.map(it => `${String(it.tIndex).padStart(2, '0')}${String(99 - it.ch).padStart(2, '0')}`).join('|');
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      for (const plan of plans) {
        const ringNeed: Record<string, number> = {};
        for (const it of plan) for (const [el, n] of Object.entries(templateCost(templates[it.tIndex]))) ringNeed[el] = (ringNeed[el] ?? 0) + n;
        const zero: Record<string, number> = {};
        for (const [el, n] of Object.entries(input.formula)) {
          if (el === 'H') continue;
          const left = n - (need[el] ?? 0) - (ringNeed[el] ?? 0);
          if (left > 0) zero[el] = left;
        }
        // Rings need an attachment site unless they are all there is: checked by the enumerator (CLOSED/connectivity), not here.
        const groups: InventoryGroup[] = combo.map((o, i) => ({
          groupId: `g${i + 1}`, observationId: signals[i].observationId, shiftClass: o.classIds[0], shiftClasses: [...o.classIds], hTotal: k * rr[i], atomCount: o.atomCount, hPerAtom: o.hPerAtom,
          element: o.element, hybrid: o.hybrid, exchangeable: o.exchangeable, aromatic: o.aromatic,
          singletNoHNeighbors: singletClean[i] && !o.exchangeable && !o.aromatic, equivalent: !isRelaxed(signals[i]),
        }));
        const rings: AromaticRingPlan = {
          rings: plan.map(it => { const t = templates[it.tIndex]; const patterns = substitutionPatterns(t, it.ch); return {templateId: t.id, ch: it.ch, substituentPositionPatterns: patterns, substituents: t.peripheral.length - it.ch}; }),
          aromaticCh: A, ringCount: plan.reduce((s, it) => s + templates[it.tIndex].rings, 0),
        };
        const applied: AppliedConstraint[] = [];
        for (const g of groups) {
          if (g.singletNoHNeighbors) applied.push({id: 'SINGLET_NO_H_NEIGHBORS', detail: `${g.groupId}：單峰、不寬、與其他訊號相距 > ${cfg.singletOverlapPpm} ppm → 相鄰碳 H=0`, observationIds: [g.observationId]});
          if (g.equivalent && g.atomCount > 1) applied.push({id: 'EQUIVALENT_ATOMS', detail: `${g.groupId}：${g.atomCount} 個原子必須拓樸等價`, observationIds: [g.observationId]});
        }
        const hSum = groups.reduce((s, g) => s + g.hTotal, 0) + e;
        if (hSum !== H) { runVoid(`清單 H 總和 ${hSum} 不等於分子式 H ${H}`); continue; }
        out.push({id: '', k, extraExchangeable: e, extraElement, groups, rings, zeroHAtoms: zero, applied, notes: [...classNotes]});
      }
      return out;
    };
    const rec = (i: number, level: number): void => {
      if (cut) return;
      if (i === optionsPer.length) {
        if (level !== 0) return;
        if (examined >= cfg.maxCombinationsExamined) { cut = true; return; }
        levelBuffer.push(...makeAlternatives(chosen.slice()));
        return;
      }
      const lim = Math.min(level, optionsPer[i].length - 1);
      for (let r = 0; r <= lim; r++) { chosen.push(optionsPer[i][r]); rec(i + 1, level - r); chosen.pop(); if (cut) return; }
    };
    let levelBuffer: InventoryAlternative[] = [];
    let truncatedHere = false;
    for (let level = 0; level <= maxLevel && !cut; level++) {
      levelBuffer = [];
      rec(0, level);
      alternatives.push(...levelBuffer);
      if (alternatives.length > cfg.maxInventoryAlternatives) { truncatedHere = true; break; }
    }
    if (cut) truncatedHere = true;
    const kept = alternatives.slice(0, cfg.maxInventoryAlternatives);
    kept.forEach((a, idx) => { a.id = `inv-k${k}-e${e}-${String(idx + 1).padStart(2, '0')}`; });
    result.alternatives.push(...kept);
    if (truncatedHere) {
      result.truncated = true;
      if (!result.incompleteReasons.includes('INVENTORY_ALTERNATIVES_TRUNCATED')) result.incompleteReasons.push('INVENTORY_ALTERNATIVES_TRUNCATED');
    }
  }
  if (result.aromaticLimited.length) result.incompleteReasons.push('AROMATIC_TEMPLATE_LIMITED');
  result.voided = [...voided].map(([reason, count]) => ({reason, count}));
  if (!result.alternatives.length && !result.reason) result.reason = '所有替代解讀都作廢或無法表達';
  return result;
}
