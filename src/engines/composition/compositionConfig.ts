/**
 * Every tunable constant of the composition-inference layer (P1a) lives here.
 * Values are engineering defaults agreed in docs/P1A_COMPOSITION_DESIGN.md ("審核決定").
 * None of them is calibrated against measured accuracy; they will be tuned from user testing.
 */
export const COMPOSITION_CONFIG = {
  // ---------------------------------------------------------------- search bridge
  /** Number of best formula hypotheses sent to the structure generator when no user formula is given (審核決定 8). */
  topFormulasToSearch: 3,
  /** Output cap per searched formula; merged result may hold topFormulasToSearch × this (審核決定 2). */
  maxResultsPerFormula: 48,

  // ---------------------------------------------------------------- MS molecular-ion hypotheses
  /** Maximum candidate molecular-ion peaks taken from the high-m/z end of one MS spectrum (審核決定 8). */
  maxIonCandidatesPerSpectrum: 3,
  /** Minimum relative intensity (% of base peak) for a peak to be considered a molecular-ion candidate. */
  ionMinRelativeIntensity: 1,
  /** m/z window used to locate M+1 / M+2 / M+4 isotope peaks around a candidate (Da, divided by |z|). */
  isotopeSearchWindow: 0.4,
  /** A higher peak is an isotope of a lower one when I(M+1) < this × I(M) (same rule as msEngine). */
  isotopeParentRatioM1: 1.5,
  /** A higher peak is the M+2 isotope of a lower one when I(lower) ≥ this × I(higher) (same rule as msEngine). */
  isotopeParentRatioM2: 0.8,
  /** EI implausible losses (Da): a marked peak at M−3…M−14 or M−21…M−25 rules out M as [M]+• (McLafferty & Tureček). */
  implausibleLossWindows: [[3, 14], [21, 25]] as [number, number][],
  /** Slack (Da) on the implausible-loss window edges, for nominal-mass peak lists. */
  implausibleLossEdgeSlack: 0.3,
  /** A peak inside an implausible-loss window counts only if I ≥ this × I(candidate) (審核決定 8). */
  implausibleLossRatio: 0.1,
  /** Low-resolution mass tolerance when the user gave none (Da). Same default as the existing MS engine. */
  lowResToleranceDa: 0.5,
  /** High-resolution mass tolerance when the user gave none (ppm). Same default as the existing MS engine. */
  hrmsTolerancePpm: 5,
  /** Largest neutral mass this layer enumerates (Da). */
  maxNeutralMass: 1000,

  // ---------------------------------------------------------------- isotopes
  /** M+1 measurement error: max(absolute, relative × observed) percentage points. */
  isotopeErrorAbsolute: 0.5,
  isotopeErrorRelative: 0.1,
  /** A marked (or fully covered) M+2 below this % of M hard-excludes Cl and Br (Cl₁ ≈ 32 %, Br₁ ≈ 97 %). */
  m2HardExclusionPercent: 10,
  /** M+2 at or above this % opens up to `halogenEvidenceCap` Cl/Br atoms. */
  m2HalogenEvidencePercent: 10,
  /** M+2 in [min, max) % is read as S/Si evidence (S₁ ≈ 4.5 %, Si₁ ≈ 3.4 %). */
  m2SulfurSiliconRange: [2.5, 10] as [number, number],
  /** Largest isotope offset computed by isotopeEnvelope for scoring. */
  isotopeMaxOffset: 4,

  // ---------------------------------------------------------------- 13C
  /** Without a mass, carbon count is enumerated from n13 up to factor × n13 + offset (soft upper; symmetry). */
  noMassCarbonFactor: 2,
  noMassCarbonOffset: 2,
  /** Shift regions (ppm) used as soft element clues. */
  c13CarbonylMin: 160,
  c13HeteroSp3Range: [50, 90] as [number, number],
  c13AromaticRange: [110, 160] as [number, number],
  c13NitrileRange: [115, 125] as [number, number],
  /** At least this many 13C signals in the aromatic range support an aromatic ring. */
  c13AromaticMinSignals: 4,
  /** 13C–19F one-bond coupling window (Hz) that opens F (審核決定 7). */
  c13FluorineJRange: [240, 260] as [number, number],

  // ---------------------------------------------------------------- 1H
  /** Allowed deviation of integral/unit from an integer when reducing integrals to the simplest ratio (審核決定 8). */
  h1IntegralTolerance: 0.15,
  /** Largest integer a single signal may take while searching for the simplest ratio unit. */
  h1MaxRatioMultiplier: 12,
  /** Largest multiple k listed for total H = k·S + e. */
  h1MaxMultiple: 6,
  /** Up to this many exchangeable H (OH/NH) may be missing from the integrals (e in k·S + e). */
  maxExchangeableMissing: 2,
  /** 1H–19F geminal coupling window (Hz) that opens F (審核決定 7). */
  h1FluorineJRange: [45, 50] as [number, number],
  /** 1H Si–CH3 singlet window (ppm); |δ| below the TMS limit is treated as a possible TMS reference instead. */
  h1SiliconRange: [0, 0.3] as [number, number],
  h1TmsReferenceLimit: 0.02,
  /** A Si–CH3 singlet needs at least this many H in the simplest ratio to count as "large". */
  h1SiliconMinRatioUnits: 3,
  /** 1H aldehyde window (ppm), a soft carbonyl clue. */
  h1AldehydeRange: [9, 10.5] as [number, number],
  /** At least this many 1H signals in the aromatic window support an aromatic ring. */
  h1AromaticRange: [6.5, 8.5] as [number, number],
  h1AromaticMinSignals: 2,

  // ---------------------------------------------------------------- MS element evidence (審核決定 7)
  /** Iodine: an I⁺ ion near m/z 127 or a loss of 127 from the molecular ion. */
  iodineIonMz: 126.904,
  iodineLossDa: 126.904,
  /** Iodine: HRMS neutral mass defect at or below this value (Da) is read as iodine-compatible. */
  iodineMassDefectMax: -0.03,
  /** Fluorine: losses of F (19) or HF (20) from the molecular ion. */
  fluorineLossesDa: [18.998, 20.006],
  /** Silicon: trimethylsilyl ion. */
  siliconIonMz: 73.047,
  /** m/z window for these diagnostic ions and losses (Da). */
  diagnosticWindow: 0.4,

  // ---------------------------------------------------------------- element caps
  /** Default caps for elements allowed without specific evidence. */
  defaultCaps: {S: 2, Cl: 1, Br: 1},
  /** Caps once isotope / spectral evidence supports the element. */
  evidenceCaps: {S: 4, Cl: 4, Br: 4, F: 6, I: 2, Si: 2, P: 2},
  /** Extra heteroatoms above the functional-group minimum when no mass is available. */
  noMassExtra: {N: 2, O: 3, S: 1},

  // ---------------------------------------------------------------- enumeration bounds
  /** Enumeration node cap; hitting it is reported as truncation (審核決定 8). */
  maxNodes: 2_000_000,
  /** Hypotheses kept after scoring; the rest are counted as dropped (審核決定 8). */
  maxHypotheses: 200,

  // ---------------------------------------------------------------- Seven Golden Rules (Kind & Fiehn 2007, BMC Bioinformatics 8:105)
  /** Rule 1: element maxima by neutral-mass bracket, the larger of the DNP and Wiley columns of Table 1. To be re-checked against the paper. */
  goldenRule1: [
    {maxMass: 500, caps: {C: 39, H: 72, N: 20, O: 20, P: 9, S: 10, F: 16, Cl: 10, Br: 5}},
    {maxMass: 1000, caps: {C: 78, H: 126, N: 25, O: 27, P: 9, S: 14, F: 34, Cl: 12, Br: 8}},
  ],
  /** Rule 4: H/C. Hard range (lower bound 0 instead of 0.1 so perhalogenated compounds survive) and common (soft) range. */
  hcHard: [0, 6] as [number, number],
  hcCommon: [0.2, 3.1] as [number, number],
  /** Rule 5: heteroatom/C ratio maxima, extended (hard) and common (soft) ranges. */
  ratioHard: {N: 4, O: 3, P: 2, S: 3, F: 6, Cl: 2, Br: 2, Si: 1} as Record<string, number>,
  ratioCommon: {N: 1.3, O: 1.2, P: 0.3, S: 0.8, F: 1.5, Cl: 0.8, Br: 0.8, Si: 0.5} as Record<string, number>,
  /** Rule 6: multi-element probability check. When every listed element exceeds `when`, each must stay below its limit. */
  goldenRule6: [
    {when: {N: 1, O: 1, P: 1, S: 1}, limits: {N: 10, O: 20, P: 4, S: 3}},
    {when: {N: 3, O: 3, P: 3}, limits: {N: 11, O: 22, P: 6}},
    {when: {O: 1, P: 1, S: 1}, limits: {O: 14, P: 3, S: 3}},
    {when: {P: 1, S: 1, N: 1}, limits: {P: 3, S: 3, N: 4}},
    {when: {N: 6, O: 6, S: 6}, limits: {N: 19, O: 14, S: 8}},
  ] as {when: Record<string, number>; limits: Record<string, number>}[],

  // ---------------------------------------------------------------- scoring weights (log-compatibility units; uncalibrated)
  weights: {
    /** Penalty for an ion form the user has not confirmed (審核決定 5). */
    unconfirmedIon: 1.0,
    /** Penalty per position below the highest plausible candidate peak. */
    ionRank: 1.5,
    /** Penalty for a secondary adduct of the stated ionization (e.g. [M+Na]+ under ESI+). */
    secondaryAdduct: 0.7,
    /** Penalty for the opposite polarity when ionization and polarity are unknown. */
    unknownPolarity: 0.3,
    /** Weight of each isotope deviation term (Gaussian, in σ²/2 units). */
    isotope: 1.0,
    /** Weight of the mass error term (Gaussian with σ = tolerance/2). */
    mass: 1.0,
    /** Penalty per carbon above the 13C signal count while ≤ factor × n13 + offset (symmetry or overlap needed). */
    carbonSymmetryStep: 0.25,
    /** Penalty per carbon beyond that range. */
    carbonBeyond: 1.0,
    /** Penalty per H away from the nearest k·S + e. */
    hydrogenDeviation: 1.0,
    /** Penalty per missing exchangeable H (e). */
    exchangeableMissing: 0.3,
    /** Penalty per step of k above 1. */
    hydrogenMultipleStep: 0.15,
    /** Multiplier on hydrogen terms when the 1H peak list is not confirmed complete. */
    partialCoverageHydrogenFactor: 0.5,
    /** Penalty per violated soft functional-group bound. */
    softBoundViolation: 1.5,
    /** Penalty per Golden-Rules common-range violation. */
    goldenCommon: 0.8,
    /** Penalty per S atom without S evidence. */
    sulfurNoEvidence: 1.0,
    /** Penalty per Cl/Br atom without isotope evidence. */
    halogenNoEvidence: 1.5,
    /** Penalty per F/I/P/Si atom even when opened by evidence (審核決定 7). */
    rareElement: 1.0,
    /** Penalty per N atom when nothing suggests nitrogen (mild Occam prior). */
    nitrogenNoEvidence: 0.2,
  },
} as const;
export type CompositionConfig = typeof COMPOSITION_CONFIG;
