/**
 * Every tunable constant of the fragment-assembly enumerator (v1.1.7 / P1b). Engineering defaults, not calibrated.
 * The enumerator itself contains no numeric policy: budgets, valences and strain thresholds all come from here.
 */
export const ENUMERATION_CONFIG = {
  /** Neutral valence of every element a free atom may be. S is divalent only unless `allowHypervalentS` is set. */
  valence: {C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1, S: 2} as Record<string, number>,
  /**
   * S(IV)/S(VI) (sulfoxide, sulfone, …) are not generated in this version (known limitation). The flag is part of the
   * configuration so that the limitation is explicit; `true` is rejected with an error instead of being silently ignored.
   */
  allowHypervalentS: false as boolean,
  /** Valence of a charged atom (only closed fragment atoms may be charged; free atoms are always neutral). */
  chargedValence: {
    C: {'1': 3, '-1': 3},
    N: {'1': 4, '-1': 2},
    O: {'1': 3, '-1': 1},
    S: {'1': 3, '-1': 1},
  } as Record<string, Record<string, number>>,
  /** Order in which free atoms are indexed (same-element free atoms are contiguous so they can be treated as interchangeable). */
  elementOrder: ['C', 'N', 'O', 'S', 'F', 'Cl', 'Br', 'I'],
  /** Bond orders 1…maxBondOrder are generated. */
  maxBondOrder: 3,
  /** Requests with more atoms than this (fragments × count + free atoms, hydrogens not counted) are rejected with an error. */
  maxAtoms: 40,
  budget: {
    /** Wall-clock budget for one enumeration request (all alternative sets together). */
    timeMs: 30000,
    /** Search steps (one step = one bond-order choice for one atom pair) over all alternative sets. */
    maxStates: 20_000_000,
    /** Distinct candidates kept; the search stops with CANDIDATE_LIMIT when one more distinct candidate would exceed it. */
    maxCandidates: 100_000,
  },
  /** Order in which bond orders are tried at each atom pair. Only changes which candidates a budget-limited search finds first; completeness is unaffected. */
  bondOrderSearchOrder: 'ASCENDING' as 'ASCENDING' | 'DESCENDING',
  /** Search steps between two checks of the clock and of `shouldCancel`. */
  stepsPerCheck: 256,
  /** The event loop is given back (setTimeout 0) when at least this many ms have passed since the last yield. */
  yieldEveryMs: 15,
  /** Progress callbacks are at most this far apart (ms). */
  progressEveryMs: 200,
  /** Rejected canonical SMILES remembered (to count each distinct rejected structure once); beyond this the counts are marked approximate. */
  maxTrackedRejected: 200_000,
  // ------------------------------------------------------------------------------------------ stage 2: pipeline wiring
  /** false = the pipeline behaves exactly like 1.1.7-hotfix.2 (legacy beam search only). */
  useExhaustiveEnumerator: true as boolean,
  /** Composition hypotheses (by relative confidence) that are enumerated when there is no user formula. */
  maxFormulasToEnumerate: 8,
  /** Budgets used by the analysis pipeline when the caller gives none (see docs/P1B_DESIGN.md §9 for how they were chosen). */
  analysis: {
    /** Wall-clock for all enumerations of one analysis (shared by the formulas; unused time carries over). */
    timeMs: 15000,
    /** Search steps over all formulas. */
    maxStates: 100_000_000,
    /** Enumeration cap (distinct candidates) per formula. */
    maxCandidatesPerFormula: 20000,
    /** Candidates that enter the full scoring (the rest are kept, listed in the diagnostics and not scored). */
    maxScoredCandidates: 300,
  },
  adapter: {
    /** Maximum number of alternative fragment sets (readings of the evidence) before falling back to the legacy search. */
    maxAlternativeSets: 64,
    /** Without any fragment, formulas with more heavy atoms than this use the legacy search (pure-formula enumeration cost explodes, see T6). */
    maxHeavyAtomsWithoutFragments: 10,
    /**
     * false (default): substitutionSites of aryl hypotheses are NOT used as constraints (all atoms stay flex).
     * true: the site atoms become open with fixed H = 0 (an aromatic carbon that carries a substituent has no H).
     */
    useSubstitutionSitesAsOpen: false as boolean,
    /** Deferred (unscored) candidates listed in the diagnostics. */
    maxDeferredListed: 200,
  },
  /**
   * The enumerator ended INCOMPLETE because of time/step budget: a bounded legacy beam search also runs and its candidates are added
   * (de-duplicated), so a budget-limited enumeration never yields fewer candidates than 1.1.7-hotfix.2 and two different heuristics
   * widen what a budget-limited run sees. The result stays marked INCOMPLETE.
   */
  legacySupplementWhenIncomplete: true as boolean,
  /** Budget of one legacy supplement run (per formula); the legacy search is only a supplement here. */
  legacySupplement: {timeMsPerRun: 500, maxStatesPerRun: 10000},
  /** When the caller limits time/steps explicitly (one shared pool), the enumerator may use at most this fraction of each formula's share; the rest is left to the legacy supplement. */
  pooledEnumerationFraction: 0.5,
  /**
   * true: the enumerator prunes, inside the search, the plausibility rules that can be decided locally (no O–O without a user formula,
   * no N–O without N–O evidence), so such candidates are never produced. false (default): the existing downstream gate is the single
   * place that rejects AND records implausible linkages (rejectedCandidates / solver log), as in 1.1.7-hotfix.2; the enumerator only
   * ranks such candidates last when the scoring cap applies. Default false because the existing hotfix.1 test E relies on the gate
   * seeing and recording the proposals (docs/P1B_DESIGN.md §9).
   */
  pipelineEarlyPlausibilityPrune: false as boolean,
  /**
   * Pre-ranking before the scoring cap. A SCREENING HEURISTIC, NOT A SCORE: it only decides which enumerated candidates enter the
   * full scoring when there are more than `analysis.maxScoredCandidates`; nothing is deleted and no number here enters any score.
   */
  prefilter: {
    /** Candidates with fewer topological 1H environments than observed 1H signals go after the others. */
    requireH1Classes: true as boolean,
    /** Candidates with fewer carbon classes than observed 13C signals go after the others. */
    requireC13Classes: true as boolean,
    /** Weight of (environments − observed signals) for 1H / 13C when ordering the candidates that pass; 0 switches the closeness ordering off. */
    closenessWeightH1: 1,
    closenessWeightC13: 1,
    /** Candidates the plausibility gate would reject go last (when evidence is available). */
    plausibleFirst: true as boolean,
  },
  /** Fixed texts of the composition panel (badges, tooltip, notes). */
  ui: {
    badges: {
      RELAXED: '約束已放寬（只依分子式）',
      LEGACY_SUPPLEMENT: '含舊搜尋補充',
      INCOMPLETE: '未完整',
      V12_FALLBACK: '1H 約束未能套用（已退回）',
    },
    confidenceTooltipPrefix: '各假設間的相對比較，不是機率，也沒有以實測準確度校準：',
    deferredNote: '未評分的候選沒有被排除，只是沒有進入完整評分。',
    candidateSourceTags: {
      ENUMERATOR: '窮舉器',
      LEGACY_SUPPLEMENT: '舊 beam 搜尋（補充）',
      LEGACY: '舊 beam 搜尋（退回）',
      RELAXED: '約束已放寬',
      V12_FALLBACK: '1H 約束未套用',
    },
  },
  /** Strain profile applied by the pipeline (null = none). */
  pipelineStrainProfile: null as 'SURGE_INSPIRED' | null,
  /**
   * Optional ring/bond strain profiles. They are NOT applied by default. SURGE_INSPIRED is this project's own
   * implementation of three avoid-rules named in the Surge paper/README (J Cheminform 2022); it is not equivalent to Surge's
   * -B sets (see docs/P1B_DESIGN.md).
   */
  strainProfiles: {
    SURGE_INSPIRED: {
      /** A triple bond may not lie in a ring of this size or smaller. */
      tripleBondRingMaxSize: 7,
      /** No atom with two double bonds whose other neighbours are only hydrogens (allene / cumulene centre). */
      forbidCumulatedCentre: true,
      /** No atom may lie on more than this many rings whose size is listed in `smallRingSizes`. */
      maxSmallRingsPerAtom: 1,
      smallRingSizes: [3, 4] as number[],
    },
  },
};
export type StrainProfileId = keyof typeof ENUMERATION_CONFIG.strainProfiles;
export type StrainProfile = (typeof ENUMERATION_CONFIG.strainProfiles)[StrainProfileId];
