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

import {forbiddenFragmentsActive, v123ForbiddenNActive, v131ForbiddenAlkynolActive, v140PlausibilityActive} from '../composition/planningGate';

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

export const FORBIDDEN_FRAGMENTS: ForbiddenFragment[] = [...bridgeFragments(), CYCLIC_HYDROXY_ORTHOESTER];

/**
 * v1.2.3 (A6): nine more forbidden fragments, active with the v1.2.3 flag. The first three (N(O)O, N–O–N, N(O)N(O)) used to be allowed when N-specific evidence and an IR N–O / N-oxide band were
 * present (structurePlausibility rules N_DI_OH, N_O_N); a 1240 cm-1 C–O band satisfied the N-oxide window, so a misread nitrogen unlocked them. As forbidden fragments no IR band unlocks them.
 * Nitro groups, N-oxides, oximes, a single N–OH hydroxylamine, furazans and oxadiazoles (aromatic N–O–N) stay legal. Checked against 9 molecules that must hit and 60 that must not (tests/v12/v123Forbidden.test.ts).
 * Known residual risk: a 2-alkoxy-2-oxazoline (cyclic imidocarbonate) is caught by IMIDOCARBONATE; rare, accepted.
 */
export const V123_FORBIDDEN_FRAGMENTS: ForbiddenFragment[] = [
  {id: 'N_TWO_O', smarts: '[NX3;+0;!a]([OX2;!a])[OX2;!a]', label: 'N 上連兩個 O（N(O)O）', reason: '不是可分離的穩定結構，IR 帶也不能放行', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'N_O_N', smarts: '[#7;!a][OX2;!a][#7;!a]', label: 'N–O–N（非芳香）', reason: '不是可分離的穩定結構，IR 帶也不能放行', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'N_O_N_O', smarts: '[NX3;+0;!a]([OX2;!a])-[NX3;+0;!a][OX2;!a]', label: '兩個各帶 O 的 N 相連（N(O)N(O)）', reason: '不是可分離的穩定結構，IR 帶也不能放行', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'IMIDOCARBONATE', smarts: '[NX2;!a]=[CX3;!a]([OX2;!a])[OX2;!a]', label: '亞胺碳酸酯 N=C(O)O', reason: '互變異構的不穩定形式', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'AROMATIC_IN_3RING', smarts: '[a;r3]', label: '芳香原子在三員環', reason: '張力不可行', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'RING_DOUBLE_IN_3RING', smarts: '[#6;r3]=[#6;r3]', label: '三員環內雙鍵（環丙烯）', reason: '張力過大，不是穩定的一般結構', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'DIOXETANE_1_3', smarts: '[#6]1[OX2][#6][OX2]1', label: '1,3-二氧環丁烷', reason: '張力不可行', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'FULVENE', smarts: '[#6;r5;!a]1(=[#6;!r5])[#6;!a]=[#6;!a][#6;!a]=[#6;!a]1', label: '富烯', reason: '反應性極高，不是穩定的一般結構', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'OH_ON_EPOXIDE_CARBON', smarts: '[CX4;r3]([OX2H1])[OX2;r3]', label: '環氧碳上有 OH', reason: '不是可分離的穩定結構', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
];

/**
 * v1.3.1 (B): the ynol C#C–OH (an alkyne carbon that carries a free OH). It is unstable and tautomerises to a ketene / enolate; no IR band unlocks it (same treatment as the v1.2.3 N–O list).
 * [CX2]#[CX2][OX2H1] needs the OH on an sp carbon: propargyl alcohol (O on an sp3 carbon), an alkynyl ether (no H on O), an ynoic acid (O on a C=O carbon) and an alcohol elsewhere in an alkyne-bearing molecule do not match
 * (tests/v12/v131Alkynol.test.ts: 1 molecule must hit, 30+ must not). SOURCE: 工程判斷：炔醇不穩定，互變成烯酮／烯酮化物 (no literature page checked).
 */
export const V131_FORBIDDEN_FRAGMENTS: ForbiddenFragment[] = [
  {id: 'ALKYNOL', smarts: '[CX2]#[CX2][OX2H1]', label: '炔醇 C≡C–OH', reason: '不穩定，互變成烯酮／烯酮化物，IR 帶也不能放行', source: '工程判斷：炔醇不穩定，互變成烯酮／烯酮化物', stage: 'LEAF'},
];

/**
 * v1.4.0 stop 9 (useV140H1 and v140.plausibility, default off): four ring-strain fragments found by the stop-7 audit among the non-target top-10 candidates. Each was checked against a panel of public, known compounds
 * (tests/v14/v140Plausibility.test.ts: 40+ structures incl. ethylene oxide, propylene oxide, styrene oxide, cyclohexene oxide, glycidol, oxetane, 3-oxetanone, beta-propiolactone, gamma-butyrolactone, delta-valerolactone, glucose
 * (pyranose and furanose), ribose, furan, 2,3-dihydrofuran, 3,4-dihydropyran, 2-methylfuran, 2-methoxytetrahydropyran, acetals, ketals, cyclic hemiacetals) and none of them is hit.
 * NOT forbidden on purpose (real structures): cyclic hemiketals / hemiacetals (sugars), plain oxetanes, plain epoxides, enol ethers, 4-ring C=C without O (cyclobutene).
 * Known catches that are real but reactive reagents (not in the panel, accepted): diketene (alkylidene oxetanone) by ALKYLIDENE_OXIRANE_OXETANE; 1,2-anhydro sugars (Brigl's anhydride) by OXYGEN_ON_EPOXIDE_CARBON. SOURCE: 工程判斷，未查證.
 */
export const V140_FORBIDDEN_FRAGMENTS: ForbiddenFragment[] = [
  {id: 'OXETE_RING_ALKENE', smarts: '[OX2;r4;$([OX2]1[#6]=[#6]*1)]', label: '含 O 的四員環內 C=C（氧雜環丁烯型）', reason: '四員環加環內雙鍵，張力過大，不是穩定的一般結構', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'ALKYLIDENE_OXIRANE_OXETANE', smarts: '[#6;$([#6]1[OX2][#6]1),$([#6]1[OX2][#6][#6]1)]=!@[#6]', label: '烷叉環氧或 2-烷叉氧雜環丁烷（環碳接環 O 且有環外 C=C）', reason: '烯丙二烯氧化物型，張力與反應性過大，不是穩定的一般結構', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'ALPHA_LACTONE', smarts: '[#6;$([#6]1[OX2][#6]1)]=[OX1]', label: 'α-內酯（三員環內酯）', reason: '無法分離的反應中間體', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
  {id: 'OXYGEN_ON_EPOXIDE_CARBON', smarts: '[CX4;$([CX4]1[OX2][#6]1)]-[OX2;!r3]', label: '環氧碳上另帶 O 取代基（烷氧基或醯氧基環氧）', reason: '不是可分離的穩定結構（OH 的情形已由 OH_ON_EPOXIDE_CARBON 禁止）', source: FORBIDDEN_SOURCE, stage: 'LEAF'},
];

/** The list the leaf, the downstream plausibility gate and the legacy supplement apply: the v1.2.1 list, the v1.2.3 list, the v1.3.1 list and the v1.4.0 list, each while its own gate is open. */
export const activeForbiddenFragments = (): ForbiddenFragment[] => [...(forbiddenFragmentsActive() ? FORBIDDEN_FRAGMENTS : []), ...(v123ForbiddenNActive() ? V123_FORBIDDEN_FRAGMENTS : []), ...(v131ForbiddenAlkynolActive() ? V131_FORBIDDEN_FRAGMENTS : []), ...(v140PlausibilityActive() ? V140_FORBIDDEN_FRAGMENTS : [])];

/** The pipeline passes the v1.2.3 list to the leaf explicitly (the enumerator's own default stays the v1.2.1 list, so the enumerator-level tests are unchanged); {} while the v1.2.3 list is off. */
export const v123LeafFragments = (): {fragments?: ForbiddenFragment[]} => (v123ForbiddenNActive() || v131ForbiddenAlkynolActive() || v140PlausibilityActive() ? {fragments: activeForbiddenFragments()} : {});

export const forbiddenById = (id: string): ForbiddenFragment | undefined => FORBIDDEN_FRAGMENTS.find(f => f.id === id) ?? V123_FORBIDDEN_FRAGMENTS.find(f => f.id === id) ?? V131_FORBIDDEN_FRAGMENTS.find(f => f.id === id) ?? V140_FORBIDDEN_FRAGMENTS.find(f => f.id === id);
