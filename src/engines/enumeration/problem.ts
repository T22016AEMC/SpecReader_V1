import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import type {EnumerationError, EnumerationErrorCode, FormulaInput, FragmentAlternativeSet} from './types';

/**
 * A validated assembly problem: heavy atoms (fragment atoms and free atoms), the fixed fragment bonds, and how many bond-order
 * units the NEW bonds must add. Hydrogens are never atoms here: fragment atoms carry `fixedH`; free atoms get
 * H = valence − bond-order sum, and the formula fixes the total.
 */
export interface Problem {
  n: number;
  el: string[];
  charge: number[];
  fixedH: number[];
  /** Capacity for new bond-order units: open fragment atoms = open valence, free atoms = valence, closed atoms = 0. */
  cap: number[];
  /** Open fragment atoms: capacity must be filled completely by new bonds. */
  forced: boolean[];
  isFree: boolean[];
  /** Free atoms and flex fragment atoms: remaining valence not used by new bonds becomes implicit H. */
  slack: boolean[];
  fixedOrder: number[][];
  fixedBonds: {a: number; b: number; order: number; aromatic: boolean}[];
  /** Total bond-order units the new bonds must add (B). */
  targetUnits: number;
  /** Hydrogens carried by free atoms (formula H − fragment H). */
  hFree: number;
  /** Adjacent free atoms of the same element (interchangeable): [a, a+1]. */
  freePairs: [number, number][];
  /** Permutations that swap two adjacent identical fragment copies. */
  blockSwaps: number[][];
}

const err = (code: EnumerationErrorCode, message: string, setId?: string): EnumerationError => ({code, message, ...(setId ? {alternativeSetId: setId} : {})});

/** Parses "C3H8O" or {C:3,H:8,O:1}. */
export function parseFormula(input: FormulaInput): {ok: true; counts: Record<string, number>} | {ok: false; error: EnumerationError} {
  const bad = (code: EnumerationErrorCode, message: string) => ({ok: false as const, error: err(code, message)});
  if (typeof input !== 'string') {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(input ?? {})) {
      if (!Number.isInteger(v) || v < 0) return bad('INVALID_FORMULA', `分子式的 ${k} 數量必須是非負整數（目前 ${String(v)}）`);
      if (v > 0) out[k] = v;
    }
    return {ok: true, counts: out};
  }
  const text = input.trim();
  if (!text) return bad('INVALID_FORMULA', '分子式是空的');
  const out: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/y;
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) return bad('INVALID_FORMULA', `分子式 "${input}" 無法解析（位置 ${pos}）`);
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] === '' ? 1 : Number(m[2]));
    pos = re.lastIndex;
  }
  return {ok: true, counts: out};
}

/** Valence of an element with a formal charge, or undefined when unsupported. */
export function valenceOf(element: string, charge: number): number | undefined {
  if (charge === 0) return CFG.valence[element];
  return CFG.chargedValence[element]?.[String(charge)];
}

export function buildProblem(formulaIn: Record<string, number>, set: FragmentAlternativeSet): {ok: true; problem: Problem} | {ok: false; error: EnumerationError} {
  const fail = (code: EnumerationErrorCode, message: string) => ({ok: false as const, error: err(code, message, set.id)});
  if (CFG.allowHypervalentS) return fail('UNSUPPORTED_CONFIG', 'allowHypervalentS=true 尚未支援（本版不產生 S(IV)/S(VI)）');
  const formula = {...formulaIn};
  for (const e of Object.keys(formula)) if (e !== 'H' && CFG.valence[e] === undefined) return fail('UNSUPPORTED_ELEMENT', `不支援的元素 ${e}（支援：${Object.keys(CFG.valence).join('、')}）`);

  const el: string[] = [], charge: number[] = [], fixedH: number[] = [], cap: number[] = [], forced: boolean[] = [], isFree: boolean[] = [], slack: boolean[] = [];
  const fixedBonds: Problem['fixedBonds'] = [];
  const blocks: {start: number; size: number}[][] = [];
  const used: Record<string, number> = {};
  let fragmentH = 0;
  const ids = new Set<string>();
  for (const frag of set.fragments ?? []) {
    if (!frag.id || ids.has(frag.id)) return fail('DUPLICATE_FRAGMENT_ID', `片段 id 重複或為空：${frag.id || '(空)'}`);
    ids.add(frag.id);
    const count = frag.count ?? 1;
    if (!Number.isInteger(count) || count < 1) return fail('INVALID_FRAGMENT', `片段 ${frag.id} 的 count 必須是 ≥ 1 的整數`);
    if (!frag.atoms?.length) return fail('INVALID_FRAGMENT', `片段 ${frag.id} 沒有原子`);
    const bondSum = frag.atoms.map(() => 0);
    const pairSeen = new Set<string>();
    for (const b of frag.bonds ?? []) {
      if (!Number.isInteger(b.a) || !Number.isInteger(b.b) || b.a < 0 || b.b < 0 || b.a >= frag.atoms.length || b.b >= frag.atoms.length || b.a === b.b) return fail('INVALID_BOND', `片段 ${frag.id} 有無效的鍵 (${b.a}, ${b.b})`);
      if (!Number.isInteger(b.order) || b.order < 1 || b.order > CFG.maxBondOrder) return fail('INVALID_BOND', `片段 ${frag.id} 的鍵 (${b.a}, ${b.b}) 階數 ${b.order} 不在 1–${CFG.maxBondOrder}`);
      const key = b.a < b.b ? `${b.a}-${b.b}` : `${b.b}-${b.a}`;
      if (pairSeen.has(key)) return fail('INVALID_BOND', `片段 ${frag.id} 的鍵 (${b.a}, ${b.b}) 重複`);
      pairSeen.add(key);
      bondSum[b.a] += b.order;
      bondSum[b.b] += b.order;
    }
    const open: number[] = [];
    const flexAtom: boolean[] = [];
    for (let i = 0; i < frag.atoms.length; i++) {
      const a = frag.atoms[i];
      if (CFG.valence[a.element] === undefined) return fail('UNSUPPORTED_ELEMENT', `片段 ${frag.id} 含不支援的元素 ${a.element}`);
      const h = a.fixedH ?? 0, q = a.charge ?? 0;
      if (!Number.isInteger(h) || h < 0 || !Number.isInteger(q)) return fail('INVALID_FRAGMENT', `片段 ${frag.id} 原子 ${i} 的 fixedH 或 charge 無效`);
      const val = valenceOf(a.element, q);
      if (val === undefined) return fail('INVALID_FRAGMENT', `片段 ${frag.id} 原子 ${i}（${a.element}，電荷 ${q}）沒有定義的價數`);
      const remaining = val - bondSum[i] - h;
      if (remaining < 0) return fail('FRAGMENT_OVERVALENT', `片段 ${frag.id} 原子 ${i}（${a.element}）的鍵階和 ${bondSum[i]} ＋ H ${h} 超過價數 ${val}`);
      flexAtom.push(Boolean(a.flex));
      if (a.flex) {
        if (a.open) return fail('INVALID_FRAGMENT', `片段 ${frag.id} 原子 ${i} 不能同時是 open 與 flex`);
        if (h !== 0) return fail('INVALID_FRAGMENT', `片段 ${frag.id} 原子 ${i} 是 flex，H 數不固定，不可指定 fixedH`);
        open.push(remaining);
      } else if (a.open) {
        open.push(remaining);
      } else {
        if (remaining !== 0) return fail('CLOSED_ATOM_UNSATURATED', `片段 ${frag.id} 原子 ${i}（${a.element}）是 closed，但價數未飽和（還差 ${remaining}）；請設為 open 或補上 H／鍵`);
        open.push(0);
      }
    }
    const fragBlocks: {start: number; size: number}[] = [];
    for (let c = 0; c < count; c++) {
      const start = el.length;
      for (let i = 0; i < frag.atoms.length; i++) {
        const a = frag.atoms[i];
        el.push(a.element);
        charge.push(a.charge ?? 0);
        fixedH.push(a.fixedH ?? 0);
        cap.push(open[i]);
        forced.push(Boolean(a.open) && open[i] > 0);
        isFree.push(false);
        slack.push(flexAtom[i]);
        used[a.element] = (used[a.element] ?? 0) + 1;
        fragmentH += a.fixedH ?? 0;
      }
      for (const b of frag.bonds ?? []) fixedBonds.push({a: start + b.a, b: start + b.b, order: b.order, aromatic: Boolean(b.aromatic)});
      fragBlocks.push({start, size: frag.atoms.length});
    }
    blocks.push(fragBlocks);
  }
  // Free atoms = formula − fragment atoms.
  const freeCounts: Record<string, number> = {};
  for (const e of Object.keys(formula)) {
    if (e === 'H') continue;
    const left = formula[e] - (used[e] ?? 0);
    if (left < 0) return fail('FORMULA_ELEMENT_SHORTAGE', `片段需要 ${used[e]} 個 ${e}，但分子式只有 ${formula[e]} 個`);
    freeCounts[e] = left;
  }
  for (const e of Object.keys(used)) if (formula[e] === undefined) return fail('FORMULA_ELEMENT_SHORTAGE', `片段含 ${e}，但分子式沒有 ${e}`);
  const hTotal = formula.H ?? 0;
  const hFree = hTotal - fragmentH;
  if (hFree < 0) return fail('FORMULA_HYDROGEN_SHORTAGE', `片段已固定 ${fragmentH} 個 H，超過分子式的 ${hTotal} 個`);
  for (const e of CFG.elementOrder) {
    for (let k = 0; k < (freeCounts[e] ?? 0); k++) {
      el.push(e); charge.push(0); fixedH.push(0); cap.push(CFG.valence[e]); forced.push(false); isFree.push(true); slack.push(true);
    }
  }
  const n = el.length;
  if (n === 0) return fail('EMPTY_MOLECULE', '分子式與片段沒有任何重原子');
  if (n > CFG.maxAtoms) return fail('TOO_MANY_ATOMS', `重原子 ${n} 個超過上限 ${CFG.maxAtoms}`);

  const forcedCap = cap.reduce((s, c, i) => s + (forced[i] ? c : 0), 0);
  const slackVal = cap.reduce((s, c, i) => s + (slack[i] ? c : 0), 0);
  const twoB = forcedCap + slackVal - hFree;
  if (twoB < forcedCap) return fail('FORMULA_HYDROGEN_EXCESS', `分子式的 H（自由 H ${hFree}）超過自由原子能容納的量；或 open 價數無法被滿足`);
  if (twoB % 2 !== 0) return fail('VALENCE_PARITY', `價數與氫數不相容：新鍵需要的鍵階單位總數 (${twoB}) 不是偶數，沒有任何分子能同時符合分子式與片段`);

  const fixedOrder = Array.from({length: n}, () => new Array<number>(n).fill(0));
  for (const b of fixedBonds) { fixedOrder[b.a][b.b] = b.order; fixedOrder[b.b][b.a] = b.order; }
  const freePairs: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) if (isFree[i] && isFree[i + 1] && el[i] === el[i + 1]) freePairs.push([i, i + 1]);
  const blockSwaps: number[][] = [];
  for (const fragBlocks of blocks) {
    for (let c = 0; c + 1 < fragBlocks.length; c++) {
      const sigma = Array.from({length: n}, (_, i) => i);
      const A = fragBlocks[c], B = fragBlocks[c + 1];
      for (let t = 0; t < A.size; t++) { sigma[A.start + t] = B.start + t; sigma[B.start + t] = A.start + t; }
      blockSwaps.push(sigma);
    }
  }
  return {ok: true, problem: {n, el, charge, fixedH, cap, forced, isFree, slack, fixedOrder, fixedBonds, targetUnits: twoB / 2, hFree, freePairs, blockSwaps}};
}
