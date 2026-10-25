/**
 * Every tunable constant of the v1.2 1H-constraint layer (docs/P1C_DESIGN.md §3, plus the review decisions D1–D10).
 * ALL VALUES ARE ENGINEERING DEFAULTS, NOT CALIBRATED. None of them was fitted to any measured spectrum or compound.
 * The shift-class ranges are generic textbook-style windows that were NOT checked against book page numbers.
 */
export type ShiftClassId = 'ARO_CH' | 'VINYL_CH' | 'ALDEHYDE' | 'O_CH' | 'N_CH' | 'ALPHA_CH' | 'ALKYL_CH' | 'EXCHANGEABLE';
export type Hybrid = 'AR' | 'SP2' | 'SP3' | null;

export interface ShiftClassDef {
  id: ShiftClassId;
  rangePpm: [number, number];
  /** Allowed hydrogens per atom of this class. */
  hPerAtom: number[];
  hybrid: Hybrid;
  exchangeable: boolean;
  /** Heteroatom the carbon is bound to (informs applicability only: the class needs that element in the formula). */
  heteroatom?: 'O' | 'N';
  basis: string;
}

export interface RingTemplateDef {
  id: string;
  /** Ring atoms (0…n-1), Kekulé bonds [a, b, order]. */
  elements: string[];
  bonds: [number, number, 1 | 2][];
  /** Atoms that may be an aromatic CH or a substituted position (open, H = 0). The others are closed and carry no H (fusion carbons, ring N). */
  peripheral: number[];
  /** Rings this template counts for against `maxAromaticRings`. */
  rings: number;
  /** All permutations of the template atoms that are graph symmetries (substitution patterns are listed up to these). */
  symmetries: number[][];
  /** Needs nitrogen evidence (and N in the formula). */
  requiresN?: boolean;
}

const benzeneSymmetries = (): number[][] => {
  const out: number[][] = [];
  for (let k = 0; k < 6; k++) {
    out.push(Array.from({length: 6}, (_, i) => (i + k) % 6));
    out.push(Array.from({length: 6}, (_, i) => (((k - i) % 6) + 6) % 6));
  }
  return out;
};

export interface StrongEvidenceRuleDef {
  id: string;
  modality: 'IR' | '1H_NMR' | '13C_NMR';
  label: string;
  smarts: string;
  /** IR band rules: window (cm-1) and the minimum intensity relative to the strongest IR band. */
  irRangeCm1?: [number, number];
  irMinRelativeIntensity?: number;
  /** 1H pattern rules. */
  h1Kind?: 'PARA_DOUBLETS' | 'ETHYL_QT';
}

export const V12_CONFIG = {
  /** D1: false during development (every path is then identical to v1.1.8); it becomes true only when 1.2.0 is released. */
  useV12Constraints: false as boolean,

  // ---------------------------------------------------------------- inventory (W1), D8
  /** k = H_total / (sum of the simplest integer ratio), tried for 1…maxK. */
  maxK: 3,
  /** Exchangeable hydrogens that are not observed (OH/NH missing from the integrals): 0…maxExtraExchangeable. */
  maxExtraExchangeable: 2,
  /** More inventory alternatives than this are cut (best first) and the run is marked INVENTORY_ALTERNATIVES_TRUNCATED. */
  maxInventoryAlternatives: 64,
  /** Substitution-pattern combinations expanded into fragment sets per alternative; more are cut and marked INVENTORY_ALTERNATIVES_TRUNCATED. */
  maxPatternSetsPerAlternative: 128,
  /** Combinations of per-signal readings looked at before the generation is cut (guards the product of many signals). */
  maxCombinationsExamined: 200_000,
  /** Order in which hydrogens per atom are preferred when an integral can be split in several ways (CH3 before CH2 before CH). */
  hPerAtomPreference: [3, 2, 1],
  /** Singlet rule: the signal is a singlet, not broad, and every other signal is farther away than this (ppm). */
  singletOverlapPpm: 0.1,

  // ---------------------------------------------------------------- equivalence (D2)
  /** Multiplicities that do not require the atoms of one signal to be topologically equivalent. */
  equivalenceRelaxedMultiplicities: ['m', 'multiplet', 'unresolved', 'br', 'br s'] as string[],
  /** Broad signals do not require equivalence. */
  equivalenceRelaxedWhenBroad: true as boolean,
  /** A signal without a stated multiplicity is treated like 'unresolved' (no equivalence required). */
  equivalenceRelaxedWhenMultiplicityUnknown: true as boolean,

  // ---------------------------------------------------------------- shift classes (D5)
  shiftClasses: [
    {id: 'ARO_CH', rangePpm: [6.3, 8.5], hPerAtom: [1], hybrid: 'AR', exchangeable: false, basis: '芳香 CH；上限沿用 h1AromaticRange、下限沿用 graphSearchHints'},
    {id: 'VINYL_CH', rangePpm: [4.5, 7.5], hPerAtom: [1, 2], hybrid: 'SP2', exchangeable: false, basis: '烯基 CH／=CH2（D5：4.5–7.5；與 ARO_CH 重疊的區段兩種解讀都保留）'},
    {id: 'ALDEHYDE', rangePpm: [9.0, 10.5], hPerAtom: [1], hybrid: 'SP2', exchangeable: false, basis: '醛基 H；需要 IR 在 1680–1740 cm-1 有強 C=O（D5）'},
    {id: 'O_CH', rangePpm: [3.2, 5.0], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, heteroatom: 'O', basis: '接 O 的 sp3 碳（OCH3 3.2–4.0、OCH2 3.4–4.5、OCH 3.5–5.0）'},
    {id: 'N_CH', rangePpm: [2.2, 3.8], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, heteroatom: 'N', basis: '接 N 的 sp3 碳'},
    {id: 'ALPHA_CH', rangePpm: [1.9, 3.2], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, basis: '鄰羰基／芳環／炔的 sp3 碳'},
    {id: 'ALKYL_CH', rangePpm: [0.5, 2.2], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, basis: '一般烷基'},
    {id: 'EXCHANGEABLE', rangePpm: [0.5, 13], hPerAtom: [1], hybrid: null, exchangeable: true, basis: '可交換 H（OH／NH）；元素 O（預設）或 N'},
  ] as ShiftClassDef[],
  exchangeable: {
    /** Broad signals in this window can be OH/NH. */
    broadRangePpm: [0.5, 13] as [number, number],
    /** Signals above this shift (ppm) can be OH/NH whatever their shape. */
    alwaysAbovePpm: 10,
    /** D5: singlets (also sharp ones) in these windows get an extra EXCHANGEABLE (OH) reading; unknown/other solvents use the union. */
    singletRangePpmBySolvent: {'DMSO-d6': [4, 12], CDCl3: [0.5, 6]} as Record<string, [number, number]>,
  },
  /** D5: the ALDEHYDE reading needs a strong C=O band in this window when the IR covers it. */
  aldehydeIr: {rangeCm1: [1680, 1740] as [number, number], strongRelativeIntensity: 0.5},

  // ---------------------------------------------------------------- aromatic ring templates (D4)
  /** Rings (a fused pair counts 2) that the templates may use for the aromatic CH of one alternative. */
  maxAromaticRings: 3,
  ringTemplates: [
    {
      id: 'benzene', elements: ['C', 'C', 'C', 'C', 'C', 'C'], rings: 1,
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]], peripheral: [0, 1, 2, 3, 4, 5], symmetries: benzeneSymmetries(),
    },
    {
      // atoms 0-3 / 5-8 are the peripheral carbons; 4 and 9 are the two fusion carbons (closed, H = 0)
      id: 'naphthalene', elements: ['C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C'], rings: 2,
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 1], [5, 6, 2], [6, 7, 1], [7, 8, 2], [8, 9, 1], [9, 0, 1], [4, 9, 2]],
      peripheral: [0, 1, 2, 3, 5, 6, 7, 8],
      symmetries: [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [3, 2, 1, 0, 9, 8, 7, 6, 5, 4],
        [8, 7, 6, 5, 4, 3, 2, 1, 0, 9],
        [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
      ],
    },
    {
      id: 'pyridine', elements: ['N', 'C', 'C', 'C', 'C', 'C'], rings: 1, requiresN: true,
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]], peripheral: [1, 2, 3, 4, 5],
      symmetries: [[0, 1, 2, 3, 4, 5], [0, 5, 4, 3, 2, 1]],
    },
  ] as RingTemplateDef[],

  // ---------------------------------------------------------------- required substructures (W2)
  /** D9: without integrals (v1.1.7 flexible-atom path) the strong-evidence substructures still act as leaf filters. */
  requiredInFlexPath: true as boolean,
  /** Substructure matches needed per required SMARTS. */
  requiredMinMatches: 1,
  /** Strong-evidence rules; a rule that fires becomes a required substructure (overlap with other atoms and substructures is allowed). */
  strongEvidenceRules: [
    {id: 'STRONG_CARBONYL', modality: 'IR', label: '強 C=O（IR 1650–1800 cm-1）', smarts: '[CX3]=[OX1]', irRangeCm1: [1650, 1800], irMinRelativeIntensity: 0.5},
    {id: 'NITRILE', modality: 'IR', label: '腈 C≡N（IR 2210–2260 cm-1）', smarts: '[CX2]#[NX1]', irRangeCm1: [2210, 2260], irMinRelativeIntensity: 0.3},
    {id: 'PARA_BENZENE', modality: '1H_NMR', label: '對位二取代苯（兩組等積芳香雙峰，J 7–9 Hz）', smarts: '[cH]1[cH]c([!#1])[cH][cH]c1[!#1]', h1Kind: 'PARA_DOUBLETS'},
    {id: 'ETHYL', modality: '1H_NMR', label: '乙基（q／t 約 2:3，共同 J）', smarts: '[CH3][CH2]', h1Kind: 'ETHYL_QT'},
  ] as StrongEvidenceRuleDef[],
  /** Parameters of the 1H pattern rules. */
  paraDoublets: {aromaticRangePpm: [6.3, 8.5] as [number, number], multiplicities: ['d', "AA'BB'"], jRangeHz: [7, 9] as [number, number], equalIntegralLogTolerance: 0.2},
  ethylQt: {qMaxPpm: 4.8, tMaxPpm: 2.5, ratioTolerance: 0.15, sharedJToleranceHz: 1.5},

  // ---------------------------------------------------------------- enumerator behaviour
  /** Lex-leader pruning between interchangeable atoms of identical signature. Only the output order of work changes, never the output set. */
  symmetryPruning: true as boolean,

  // ---------------------------------------------------------------- D10 fallback
  fallbackBadge: '1H 約束未能套用（已退回）',
};

export type V12Config = typeof V12_CONFIG;
