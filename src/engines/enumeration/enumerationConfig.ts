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
  /** Search steps between two checks of the clock and of `shouldCancel`. */
  stepsPerCheck: 256,
  /** The event loop is given back (setTimeout 0) when at least this many ms have passed since the last yield. */
  yieldEveryMs: 15,
  /** Progress callbacks are at most this far apart (ms). */
  progressEveryMs: 200,
  /** Rejected canonical SMILES remembered (to count each distinct rejected structure once); beyond this the counts are marked approximate. */
  maxTrackedRejected: 200_000,
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
