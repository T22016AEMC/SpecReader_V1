/**
 * Every tunable constant of the v1.2 1H-constraint layer (docs/P1C_DESIGN.md §3, plus the review decisions D1–D10).
 * ALL VALUES ARE ENGINEERING DEFAULTS, NOT CALIBRATED. None of them was fitted to any measured spectrum or compound.
 * The shift-class ranges are generic textbook-style windows that were NOT checked against book page numbers.
 */
export type ShiftClassId = 'ARO_CH' | 'VINYL_CH' | 'ALDEHYDE' | 'O_CH' | 'N_CH' | 'ALPHA_CH' | 'ALKYL_CH' | 'EXCHANGEABLE'
  /** v1.2.3 (stop 3), not in the shiftClasses table: see V12_CONFIG.esterMethine. */
  | 'ESTER_O_CH' | 'ACETAL_O_CH';
export type Hybrid = 'AR' | 'SP2' | 'SP3' | null;

export interface ShiftClassDef {
  id: ShiftClassId;
  rangePpm: [number, number];
  /** Allowed hydrogens per atom of this class. */
  hPerAtom: number[];
  hybrid: Hybrid;
  exchangeable: boolean;
  /**
   * v1.2.1 (B3, no-formula path only): shift windows per H count. The H count h is allowed at a shift inside `base`; inside `extended` only when the IR shows a
   * conjugated C=O (IrAldehydeContext.conjugatedCarbonyl === true). A class with windows is used instead of `rangePpm` / `hPerAtom` while the windows are active.
   * 工程判斷，未查證 (engineering judgement, not verified): every window below.
   */
  hPerAtomWindows?: {h: number; base: [number, number]; extended?: [number, number]}[];
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
  /** D1: true from 1.2.0. With false every path is identical to v1.1.8 (tests/v12/legacyGolden.test.ts sets it in code). */
  useV12Constraints: true as boolean,
  /**
   * v1.2.1 (A class: which formulas are searched). true: S needs S-specific evidence, the O count follows the IR evidence, the formulas are chosen by k
   * round-robin and searched in two rounds. false: every path (including the panel text) is identical to v1.2.0 (tests/v12/v121FlagGolden.test.ts).
   * Only the no-formula h1-only / no-mass route is affected; a user formula and the MS route keep the v1.2.0 search.
   */
  useV121Planning: true as boolean,
  /**
   * v1.2.3 (A class: p-cresol, nitrogen misreadings). true: nitrogen evidence needs its own evidence (a broad O–H band is not an N–H band, a weak or ring band is not amide I, a nitro pair that a ring
   * band explains needs 1H support), a formula keeps its best N-free variant, N beyond the evidence is scored down, nine forbidden fragments (three of them no IR band can unlock) and a round-2 step cap.
   * false: every path is identical to v1.2.2 (tests/v12/v123FlagGolden.test.ts). Works only while planningActive() is true. The sub-switches switch off one rule set each (tests and diagnostics only).
   */
  useV123: true as boolean,
  v123: {
    /** A2–A4: nitrogen evidence (shared N–H band, amide I strength and ring look-alike, nitro that a ring band explains). */
    nitrogenEvidence: true as boolean,
    /** A1: the best N-free formula of a kept (k, C, O) is kept as well. */
    nameSlots: true as boolean,
    /** A5: score per N beyond what the nitrogen evidence needs. */
    nitrogenExcess: true as boolean,
    /** A6: nine forbidden fragments (N(O)O, N–O–N, N(O)N(O) cannot be unlocked by an IR band). */
    forbiddenN: true as boolean,
    /** A7: a formula of round 2 that contains N while the nitrogen evidence is not EVIDENCE may use at most (pool at the start of round 2 / maxRound2Formulas) steps (stop 3: other formulas are not limited). */
    round2Cap: true as boolean,
    /** B1 (stop 3): the ¹H classes ESTER_O_CH and ACETAL_O_CH (V12_CONFIG.esterMethine). */
    esterMethine: true as boolean,
    /** B2 (stop 3): k = 1 formulas get more steps in round 1 (round1MaxStatesK1 = 500 000) instead of planning.round1MaxStatesPerFormula (the PMA type needs about 340 000 steps; measured in stop 3: still not found at 150 000 after the ester class). */
    round1CapK1: true as boolean,
    round1MaxStatesK1: 500_000,
    /** The raise applies only while planning.round1MaxStatesPerFormula is at least this (a real analysis setting); a test or caller that sets a tiny round-1 cap keeps it for k = 1 as well. */
    round1K1AppliesFrom: 100_000,
    /** A3 (display layer): an amide I reading below 1640 cm-1 that a ring band pair explains is scored down. */
    amideRingReading: true as boolean,
  },
  /**
   * v1.3.0 (IR improvements). true: an intensity that is not known is no longer shown as 85, weak overtone / combination bands (1650–2000 cm-1) are not functional-group evidence, a candidate that has a
   * carbonyl but whose IR has no band in the carbonyl window is scored down (every carbonyl class; peak-table IR too when both sides of the carbonyl region carry bands), and a strong C=O demotes DBE = 0 formulas in the search plan.
   * false: every path is identical to v1.2.3 (tests/v12/v130Baseline.test.ts, vitest.flagoff130.config.ts). Works only while the v1.2.3 total flag is on (so useV123 = false still gives exactly v1.2.2).
   * The sub-switches switch off one rule set each (tests and diagnostics only).
   */
  useV130: true as boolean,
  v130: {
    /** G1: the IR finding's intensity is the real relative intensity of its peak, or unknown (not the default 85). */
    intensityDisplay: true as boolean,
    /** E: weak 1650–2000 cm-1 bands next to ring evidence are overtone / combination bands, not functional groups. */
    overtone: true as boolean,
    /** G4: missing-carbonyl-band deduction for every carbonyl class. */
    carbonylMissing: true as boolean,
    /** G5: DBE = 0 formulas are searched after the others when the IR has a strong C=O. */
    dbeDemotion: true as boolean,
  },
  /**
   * v1.3.0 numbers. ALL ENGINEERING JUDGEMENT, NOT CALIBRATED (工程判斷，未查證; the planner's decisions of stop 1, no table page was checked).
   * overtone: a band in rangeCm1 below maxRelativeIntensity % of the strongest band, next to minRingBands bands in the ring window, is an overtone / combination band (irOvertone.ts).
   * anhydridePair: an anhydride needs a strong band in each window (about 1820 and 1750).
   * carbonylMissing (G4): the missing-carbonyl-band item weighs irWeightShare × the sum of the weights of the candidate's other IR items (the planner asked for about 20 %); a band counts as present when it is at least
   * presentRelativeIntensity % of the strongest band and lies in a window widened by edgeToleranceCm1 (soft edge); a peak table (not an image) is trusted only when it has bands on both sides of the carbonyl region.
   */
  irV130: {
    overtone: {rangeCm1: [1650, 2000] as [number, number], maxRelativeIntensity: 15, ringRangeCm1: [1450, 1620] as [number, number], minRingBands: 2},
    anhydridePair: {highRangeCm1: [1780, 1860] as [number, number], lowRangeCm1: [1720, 1790] as [number, number], minRelativeIntensity: 50},
    carbonylMissing: {irWeightShare: 0.2, presentRelativeIntensity: 30, edgeToleranceCm1: 10, peakTableUpperCm1: [1800, 3100] as [number, number], peakTableLowerCm1: [1000, 1650] as [number, number]},
  },
  /**
   * v1.2.3 (stop 3, B1): two extra ¹H classes for a methine (or, for the acetal class, a CH2) on an oxygen that sits above the O_CH window (3.2–5.0). They only decide the hydrogens per atom
   * (carbon, non-exchangeable) and, through the merged key, that the atom is a free sp3 CH rather than a constrained alkene CH; they require no hybridisation. AMINAL / HEMIACETAL / the forbidden
   * fragments still apply downstream. NOT in V12_CONFIG.shiftClasses (tests/v12/v121bVinyl.test.ts pins that table).
   * SOURCE: one literature data point checked, isopropyl formate CH 5.14 ppm (Doc Brown, docbrown.info/page06/spectra2/isopropyl-methanoate-nmr1h.htm); every window below is
   * 工程判斷，未查證 (engineering judgement, not verified; no page of a shift table was checked). The 1.4.0 shift prediction replaces these windows.
   * Gate by the IR (ir.esterCarbonyl): STRONG (a band ≥ strongRelativeIntensity of the strongest in carbonylRangeCm1) → the class is an ordinary plain reading;
   * UNKNOWN (no IR, window not covered, intensities unknown: no contradiction, no evidence) → the class is available but waits for round 2 together with the alkene readings (never ahead of them);
   * ABSENT (the IR covers the window and has no strong band) → the class is off. Needs O ≥ minOxygen in the formula. A class with alwaysDeferred (the acetal class: no carbonyl link) is always in the UNKNOWN state, so it is
   * never ahead of the alkene readings (a real alkene CH at 5.35 next to an ester stays an alkene reading first).
   */
  esterMethine: {
    carbonylRangeCm1: [1700, 1780] as [number, number],
    strongRelativeIntensity: 0.5,
    /** A marked IR band (any intensity) in this window is a C=C-type band: the ester reading is then no longer an ordinary reading ahead of the alkene readings (a strong C=O with a 1675 band is the prenyl acetate type, not the PMA type). 工程判斷，未查證 */
    alkeneBandRangeCm1: [1620, 1690] as [number, number],
    minOxygen: 2,
    classes: [
      {id: 'ESTER_O_CH' as const, alwaysDeferred: false, windows: [{h: 1, rangePpm: [4.7, 5.3] as [number, number]}], basis: 'RC(=O)O–CH（酯基氧上的次甲基）；資料點：甲酸異丙酯 CH 5.14 ppm；窗為工程判斷'},
      {id: 'ACETAL_O_CH' as const, alwaysDeferred: true, windows: [{h: 1, rangePpm: [4.5, 5.5] as [number, number]}, {h: 2, rangePpm: [4.5, 5.3] as [number, number]}], basis: '縮醛／原酸酯 O–CH–O（OCH2O）；窗為工程判斷，未找到可核對的資料點'},
    ],
  },
  /** ENGINEERING DEFAULTS, NOT CALIBRATED (chosen from the step counts of the five synthetic shapes S1/G1/E1/G3/D1, not from any measured compound). */
  planning: {
    /**
     * v1.2.1 B class sub-switches (tests and diagnostics only, not in the UI). Each one works only while planningActive() is true; false switches off just that rule set.
     * forbiddenFragments: B1 short para/meta bridge + B2 cyclic C(OH)(OR)(OR). vinylWindows: B3 =CH2 / =CH shift windows (no-formula path). carbonylBand: B4 missing-carbonyl-band deduction.
     */
    forbiddenFragments: true as boolean,
    vinylWindows: true as boolean,
    carbonylBand: true as boolean,
    /** O variants kept per (k, C) key: only formulas with O in [floor, floor + 1] qualify, best score first. */
    maxOxygenVariantsPerKey: 2,
    /** k ≥ 2: the O window is [floor, k × floor + oxygenAllowedAboveFloor] and this many O variants are kept per (k, C) key (k = 1 keeps the value above). */
    maxOxygenVariantsPerKeyMultiple: 3,
    /** O above (evidence floor + this) is scored down per extra O (weights.oxygenExcess) and is not a search candidate. */
    oxygenAllowedAboveFloor: 1,
    /** Formulas that get a round-1 run; the k round-robin order decides which ones. */
    maxRound1Formulas: 12,
    /**
     * v1.2.1c name order. 'ONE_PASS': one queue per k (score, DBE excess, C, H, O), k round-robin. 'TWO_PASS': pass 1 takes one representative per (k, C) in k round-robin
     * order, pass 2 fills the remaining names with the other O / e variants (the names widen over C first). The default stays ONE_PASS: with TWO_PASS and
     * representativeOxygen 'EITHER' the S1 target formula (k = 2, O = 2) is not a representative and loses its name (stage 1c report).
     */
    nameOrder: 'ONE_PASS' as 'ONE_PASS' | 'TWO_PASS',
    /** TWO_PASS only. 'EITHER': O = floor and O = k × floor are equal candidates for the representative of a (k, C) key (the order key and the smaller O decide); 'K_FLOOR': k × floor first (every copy of the symmetric unit carries the evidence O). */
    representativeOxygen: 'EITHER' as 'EITHER' | 'K_FLOOR',
    /** Search steps one formula may use in round 1 (template readings only). */
    round1MaxStatesPerFormula: 150_000,
    /** All round-1 runs together may use at most this fraction of the wall-clock budget (the clock stays the last safety valve). */
    round1TimeFraction: 0.4,
    /** Round 2 (readings with an alkene CH): the best-scored formula of each k, at most this many formulas. */
    maxRound2Formulas: 3,
    /**
     * v1.2.1c, grade-B formulas of round 2 (round 1 ended GRAMMAR_EXHAUSTED with no candidate; only run when their k has no grade-A formula): at most this many steps each.
     * 工程判斷，未查證 (engineering judgement, not verified): 500,000 is about 10 times the round-1 steps of the largest formula that finished with candidates in the five shapes.
     */
    round2ExploreMaxSteps: 500_000,
    /** Round-2 choice: composition score + round-1 evidence (weight × 1/(1 + smallest gap between the candidates' topological 1H environments and the observed 1H signals)). */
    round2EvidenceWeight: 0.5,
    round2EvidenceCandidates: 200,
  },

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
  /**
   * 'ALL': every integer ratio the integrals admit (within h1IntegralTolerance) is a reading, so integrals 1 and 9 are also read as 1:9;
   * 'SIMPLEST': only the ratio of simplestIntegerRatio (largest unit; 1 and 9 become 1:8), as in the first design text.
   */
  inventoryRatioReadings: 'ALL' as 'ALL' | 'SIMPLEST',
  /** Order in which hydrogens per atom are preferred when an integral can be split in several ways (CH3 before CH2 before CH). */
  hPerAtomPreference: [3, 2, 1],
  /**
   * Q1 (vinyl fix): a VINYL_CH reading that no other class shares must be a real alkene CH: the atom carries exactly one non-aromatic C=C double
   * bond (FragmentAtomSpec.alkeneCH). Readings that share their atoms with an sp3 class (e.g. O_CH at 4.5–5.0 ppm) stay unconstrained.
   */
  vinylRequiresAlkene: true as boolean,
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
    {
      id: 'VINYL_CH', rangePpm: [4.5, 7.5], hPerAtom: [1, 2], hybrid: 'SP2', exchangeable: false, basis: '烯基 CH／=CH2（D5：4.5–7.5；與 ARO_CH 重疊的區段兩種解讀都保留）',
      // v1.2.1 B3: =CH2 4.5–6.0 (6.0–6.5 with a conjugated C=O), =CH 4.5–7.5 (7.5–7.8 with a conjugated C=O). 工程判斷，未查證
      hPerAtomWindows: [{h: 2, base: [4.5, 6.0], extended: [6.0, 6.5]}, {h: 1, base: [4.5, 7.5], extended: [7.5, 7.8]}],
    },
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
  /**
   * v1.2.1 B4: a candidate with a carbonyl class (engines/scientificEngines/carbonylClasses.ts) whose windows have no strong IR band, on an image IR whose calibration is trusted and
   * whose trace covers the windows, gets a deduction entry (compatibility 0, weight = weight × irDataQuality; never a rejection).
   * 工程判斷，未查證 (engineering judgement, not verified, not calibrated): weight, strongRelativeIntensity, minCurvePoints, minUserCalibrationPoints and the 0.5 % residual limit (AXIS_CALIBRATION_CONFIG).
   */
  irMissingBand: {weight: 0.8, strongRelativeIntensity: 0.5, minCurvePoints: 50, minUserCalibrationPoints: 3},
  /** v1.2.1 B3: a conjugated C=O is read from a band with at least this share of the strongest band in this window. 工程判斷，未查證 (window and share). */
  conjugatedCarbonylIr: {rangeCm1: [1630, 1735] as [number, number], strongRelativeIntensity: 0.5},

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

  // ---------------------------------------------------------------- scoring (W4), plausibility (W5), IR intensity (W6)
  /** ENGINEERING DEFAULTS, NOT CALIBRATED. The score stays UNCALIBRATED_COMPATIBILITY. */
  scoring: {
    /** Weight of a predicted 1H environment that no observation was matched to (compatibility 0), like an unmatched observation. */
    unmatchedPredictedWeight: 0.8,
    /** Multiplier for an unmatched predicted environment that is exchangeable (OH/NH may be invisible). */
    exchangeableUnmatchedFactor: 0.25,
    /** Two predicted environments closer than this (ppm) whose combined H matches one observation count as one overlapped signal. */
    overlapShiftPpm: 0.1,
    /** Relative tolerance of "the observation integral equals the combined H of the overlapped environments". */
    overlapIntegralTolerance: 0.15,
    /** Multiplier when the 1H coverage is not confirmed complete (the missing signal may simply not have been listed). */
    incompleteCoverageUnmatchedFactor: 0.5,
    /** Environment count: compatibility = exp(−(Δ/σ)²), Δ = max(0, predicted − observed − overlapped). */
    envCountSigma: 1.0,
    envCountWeight: 0.6,
    /** Predicted versus observed non-exchangeable H total (observed integrals converted with the matched integral scale). */
    integralTotalWeight: 0.6,
    integralTotalSigmaFraction: 0.1,
    integralTotalSigmaMin: 1,
    /** Weight factor for every spectrum that was digitized from an image (v1.1.8: NMR/MS ×0.5, IR 1). */
    imageSourceWeightFactor: 1.0,
  },
  /** W5: strain profile the pipeline applies while the flag is on (v1.1.8 behaviour: none). */
  pipelineStrainProfile: 'SURGE_INSPIRED' as 'SURGE_INSPIRED' | null,
  // ---------------------------------------------------------------- D10 fallback
  fallbackBadge: '1H 約束未能套用（已退回）',
};

export type V12Config = typeof V12_CONFIG;
