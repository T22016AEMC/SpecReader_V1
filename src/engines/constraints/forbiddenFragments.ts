/**
 * v1.2.1 (B1, B2): chemically unreasonable fragments that are forbidden in a candidate. One list drives the three places that apply it:
 * the leaf of the enumerator (stage 'forbidden'), the downstream plausibility gate (rule FORBIDDEN_<id>) and the legacy beam supplement.
 * Every window, length limit and SMARTS below is an ENGINEERING JUDGEMENT, NOT VERIFIED (no literature source).
 */
export interface ForbiddenFragment {
  /** Also the suffix of the downstream rule name FORBIDDEN_<id>. */
  id: string;
  smarts: string;
  /** Traditional Chinese, shown in the panel as is (no internal code). */
  label: string;
  reason: string;
  source: string;
  /** The earliest stage that applies it; the downstream gate and the legacy supplement use the same list. */
  stage: 'LEAF';
}

export const FORBIDDEN_SOURCE = '工程判斷，未查證';

/** B1: a benzene ring whose para positions are joined by a bridge of at most `maxPara` atoms, or whose meta positions by at most `maxMeta` atoms. */
export const BRIDGE_LIMITS = {para: 4, meta: 3} as const;

const bridgeSmarts = (kind: 'PARA' | 'META', atoms: number): string => `${kind === 'PARA' ? 'c12ccc(cc1)' : 'c12cc(ccc1)'}${'~*'.repeat(atoms)}~2`;

/** SMARTS cannot say "a path of at most n atoms", so one pattern per exact bridge length is generated; the union is "shortest bridge ≤ limit". */
export function bridgeFragments(limits: {para: number; meta: number} = BRIDGE_LIMITS): ForbiddenFragment[] {
  const out: ForbiddenFragment[] = [];
  for (let b = 1; b <= limits.para; b++) out.push({id: `PARA_BRIDGE_${b}`, smarts: bridgeSmarts('PARA', b), label: `對位短橋（苯環對位以 ${b} 個原子的橋相連）`, reason: '橋太短，張力不可行', source: FORBIDDEN_SOURCE, stage: 'LEAF'});
  for (let b = 1; b <= limits.meta; b++) out.push({id: `META_BRIDGE_${b}`, smarts: bridgeSmarts('META', b), label: `間位短橋（苯環間位以 ${b} 個原子的橋相連）`, reason: '橋太短，張力不可行', source: FORBIDDEN_SOURCE, stage: 'LEAF'});
  return out;
}

/** B2: a ring sp3 carbon that carries a free OH and two O–C bonds (tetrahedral-intermediate type). GEM_DIOL and the acyclic rules are untouched. */
export const CYCLIC_HYDROXY_ORTHOESTER: ForbiddenFragment = {
  id: 'CYCLIC_HYDROXY_ORTHOESTER', smarts: '[CX4;R]([OX2H1])([OX2][#6])[OX2][#6]', label: '環狀 C(OH)(OR)(OR)（四面體中間體型）',
  reason: '環上碳同時有游離 OH 與兩個 OR，不是可分離的穩定結構', source: FORBIDDEN_SOURCE, stage: 'LEAF',
};

export const FORBIDDEN_FRAGMENTS: ForbiddenFragment[] = [CYCLIC_HYDROXY_ORTHOESTER];

export const forbiddenById = (id: string): ForbiddenFragment | undefined => FORBIDDEN_FRAGMENTS.find(f => f.id === id);
