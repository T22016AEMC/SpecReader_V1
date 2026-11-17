/**
 * Every tunable constant of the v1.2 1H-constraint layer (docs/P1C_DESIGN.md §3, plus the review decisions D1–D10).
 * ALL VALUES ARE ENGINEERING DEFAULTS, NOT CALIBRATED. None of them was fitted to any measured spectrum or compound.
 * The shift-class ranges are generic textbook-style windows that were NOT checked against book page numbers.
 */
export type ShiftClassId = 'ARO_CH' | 'VINYL_CH' | 'ALDEHYDE' | 'O_CH' | 'N_CH' | 'ALPHA_CH' | 'ALKYL_CH' | 'EXCHANGEABLE'
  /** v1.2.3 (stop 3), not in the shiftClasses table: see V12_CONFIG.esterMethine. */
  | 'ESTER_O_CH' | 'ACETAL_O_CH'
  /** v1.4.0 stop 10 (useV140H1 and v140.coverage), not in the shiftClasses table: see V12_CONFIG.v140Coverage. */
  | 'HALO_CH' | 'POLYHALO_CH' | 'SI_CH3' | 'SHIELDED_CH' | 'ARO_CH_NALPHA' | 'S_CH' | 'NITRO_CH';
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

/**
 * v1.3.2 (engineering judgement, 工程判斷，未查證): one number for "a band is present" (v1.3.0 missing-carbonyl-band deduction, irV130.carbonylMissing.presentRelativeIntensity) and for "a saturated-range
 * C=O band is strong" (v132.strongCarbonyl, 1700–1800 cm-1): a share of the strongest IR band. Both read this constant, so there is no grey zone between "present" and "strong" (0.5 stays for 1650–1700 and for C–O).
 */
const CARBONYL_BAND_PERCENT = 30;

export interface StrongEvidenceRuleDef {
  id: string;
  modality: 'IR' | '1H_NMR' | '13C_NMR';
  label: string;
  smarts: string;
  /** IR band rules: window (cm-1) and the minimum intensity relative to the strongest IR band. */
  irRangeCm1?: [number, number];
  irMinRelativeIntensity?: number;
  /** v1.3.2: the rule is a "strong C=O" judgement and goes through strongCarbonylBands (threshold per window, switched by useV132). */
  carbonyl?: boolean;
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
    /**
     * v1.4.2 stop 34 (fix of the Q3 root cause, STOP33 A.4 option 1). In round 1 of an alkene-exception formula, a reading whose signal is read as alkene CH OR as a deferred
     * ester / acetal O–CH (esterMethine while the IR carbonyl state is not known) is run twice: first as the alkene reading only (the same readings, order and cap as when the IR
     * is confirmed complete), then, after all alkene readings, as the deferred reading under its own cap (deferredSecondPassMaxStates; candidates of the first pass are not counted
     * again). false: the two readings share the round-1 cap in one pass (v1.2.3 to v1.4.2 stop 33).
     */
    deferredSecondPass: true as boolean,
    /**
     * Cap of the second pass of a formula with the k = 1 raise (round1MaxStatesK1); any other formula gets at most its own round-1 cap (planning.round1MaxStatesPerFormula = 150 000).
     * Stop 34 sweep (IR coverage not confirmed): the PMA type M1b (a real ester O–CH at 5.09, read ONLY by the deferred pass) loses its target at 450 000 and keeps it at 500 000;
     * 1 000 000 is about twice that. The alkene pass of Q3 needs 449 943 steps (its own round-1 cap, unchanged). Details: notes/v1.4.2/STOP34_REPORT.md A.2.
     */
    deferredSecondPassMaxStates: 1_000_000,
    /**
     * v1.4.2 stop 35: the second pass may use at most this fraction of the time its formula has left after the first pass (the formula's round-1 time share minus what the first
     * pass used); what it does not use goes back to the formulas after it. Binds only under the product clock (15 s); with the step-only budget of the tests the share is so large
     * that no pass reaches it. Stop 35 measurement (product clock, 6 samples with a deferred pass x fractions 1 / 0.75 / 0.5 / 0.25 / 0.1 x 3 runs; also a 7.5 s clock for a
     * slower machine): every fraction below 1 lost the M1b target in all 3 runs at 15 s (1: 2 of 3 kept), and no fraction brought the M4 candidates back at 7.5 s
     * (the first passes are cut by the clock as well). Rule of the planner: no sample may lose a target, ahead of the M4 count, so 1 (= no limit; same as stop 34).
     * Details: notes/v1.4.2/STOP35_REPORT.md A.
     */
    deferredSecondPassTimeFraction: 1 as number,
    /**
     * v1.4.2 stop 36: WHEN the deferred pass runs. ROUND2 (default): the deferred passes of all formulas run after round 1 and after the round-2 alkene readings, each with an
     * equal part of the clock left and the step pool left (cap as before); round 1 runs the alkene passes only, so its time share is no longer taken by them. AFTER = stop 34 / 35
     * (right after the alkene pass of the same formula, in that formula's round-1 time share). With the step-only budget of the tests both give the same candidates.
     * Stop 36 measurement (product clock 15 s and 7.5 s for a slower machine, the 6 samples with a deferred pass, 3 runs each; also tried: the readings of both passes in turn in one run,
     * and a reserved half of the formula's time for the deferred pass): only ROUND2 kept the M1b target (15 s: 3 of 3 at rank 1; 7.5 s: 2 of 3); the others kept it in at most
     * 2 of 3 at 15 s and 0 of 3 at 7.5 s, and lost M5 / M5b at 7.5 s. ROUND2 gives at 15 s exactly the candidates of the step-only test budget (M5 24th, M5b 47th with the
     * defaults before 1.4.2: lower than under AFTER, where the clock cut the competing candidates). Details: notes/v1.4.2/STOP36_REPORT.md A.
     */
    deferredSecondPassSchedule: 'ROUND2' as 'AFTER' | 'ROUND2',
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
    /** Ranking: candidates with the same rounded finalScore are ordered by the unrounded ledger total first. */
    tieBreak: true as boolean,
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
    carbonylMissing: {irWeightShare: 0.2, presentRelativeIntensity: CARBONYL_BAND_PERCENT, edgeToleranceCm1: 10, peakTableUpperCm1: [1800, 3100] as [number, number], peakTableLowerCm1: [1000, 1650] as [number, number]},
  },
  /**
   * v1.3.1 (small version). true: (A) a parsimony prior breaks near-ties in favour of the smaller molecule over its multiples, (B) the ynol C#C–OH is a forbidden fragment no IR band unlocks,
   * (C) the diagnostic summary's ¹H reading line lists every readable class of a signal. false: every path is identical to v1.3.0 (tests/v12/v131Baseline.test.ts, vitest.flagoff131.config.ts).
   * Works only while the v1.3.0 total flag (and through it the v1.2.3 flag) is on. The sub-switches switch off one rule set each (tests and diagnostics only).
   */
  useV131: true as boolean,
  /**
   * v1.3.2 (stop 2). true: "strong C=O" in 1700–1800 cm-1 is a band of at least 30 % of the strongest IR band (was 50 %), for EVERY judgement that asks it (oxygen floor, STRONG_CARBONYL required substructure,
   * ester / aldehyde / conjugated-carbonyl gates, DBE demotion through the floor): one function, requiredSubstructures.strongCarbonylBands. false: every path is identical to v1.3.1
   * (tests/v12/v132Baseline.test.ts, vitest.flagoff132.config.ts). Works only while the v1.3.1 total flag (and through it v1.3.0 and v1.2.3) is on. The auto-mark / deleted-peak fixes of v1.3.2 are bug fixes and have no flag.
   */
  useV132: true as boolean,
  /**
   * v1.4.0 (stop 2): the 1H additive-rule layer (a SMARTS hydrogen-environment table from Ambit-HNMR, CC-BY-4.0, third_party/ambit-hnmr, plus Pretsch increments) over the graph predictor, and the fixes that go with it.
   * DEFAULT ON since v1.4.2 stop 36 (planner decision; before: off). false = every 1H path is identical to v1.3.2. Independent of the useV13x chain (it only reads the candidate ledger and the 1H predictor).
   */
  useV140H1: true as boolean,
  /**
   * v1.4.0 stop 4: the rules under useV140H1 in two groups that can each be switched off alone. The effective state is useV140H1 AND the group (useV140H1 off = both off; both groups default true = "follow useV140H1").
   * alkene: terminal =CH2 as two 1H environments, the "two 1H signals = one carbon" reading of the constraint layer, alkene CH and allylic C-H (a C-H with a C=C neighbour and NO oxygen neighbour).
   * oxygen: every sp3 C-H with an oxygen neighbour (acetal CH, acyloxy methine, ether / ester / alcohol O-CH2 ...); an O-CH2-CH=CH2 (allyl ester) counts here, not under alkene.
   * Since v1.4.2 stop 36 every sub-flag is on by default (= what ?exp=h1 switched on); before: matching, plausibility, coverage, solvent, calibration2 and round3 off.
   * round3 (v1.4.1 stop 22; default on since v1.4.2 stop 36): the third 1H round, first part - =CH2 pairs of vinyl groups the alkene rule did not read (sulfone, phosphonate ester, CH(OH)R), the aromatic SH class, and the cyclopropane / cyclobutane classes (h1Round3.ts, V12_CONFIG.v140Round3). Needs useV140H1.
   * parseFix (v1.4.1 stop 20): the THF / methanol parse fix of the candidate ledger (a bug fix, d2e26e7), split out of useV140H1; it runs when parseFix is on and does NOT depend on useV140H1 (stop 21: default true).
   */
  v140: {alkene: true as boolean, oxygen: true as boolean, matching: true as boolean, plausibility: true as boolean, coverage: true as boolean, solvent: true as boolean, calibration2: true as boolean, round3: true as boolean, parseFix: true as boolean},
  /**
   * v1.4.1 (IR round 1): new IR evidence for the CANDIDATE SCORE only (not the IR reading list, not Mode B, not the composition inference). DEFAULT ON since v1.4.2 stop 36 (planner decision; before: off). false = every path is identical to v1.4.0.
   * The four rule groups below can each be switched off alone; the effective state of a group is useV141IR AND the group (useV141IR off = all off; all four default true = "follow useV141IR").
   * ringCarbonyl: the carbonyl band and the missing-carbonyl window of gamma-lactones, beta-propiolactone, beta-lactams and five-membered cyclic carbonates (a fix of a wrong v1.4.0 window).
   * alkylBend: CH2 / CH3 C-H bends near 1465 / 1450 / 1375 (no isopropyl / gem-dimethyl / tBu splitting: postponed). esterCO: the ester's own C-O bands (the ether band does not cover it).
   * sp2CH: the 3000-3100 sp2 C-H band (aromatic, alkene, epoxide, cyclopropane; since stop 19 also the C-H of a carbon with two or more Cl / Br: CHCl3, CH2Cl2, CHBr3, CH2Br2), and a one-sided narrowing of the upper edge of the aliphatic C-H band (aliphaticChUpperUncertaintyCm1).
   * ALL RANGES AND UNCERTAINTIES OF THE NEW BANDS ARE TEXTBOOK-STYLE RANGES, NOT CALIBRATED (未經校準); the +-10 cm-1 uncertainty (bandUncertaintyCm1) is ENGINEERING JUDGEMENT (工程判斷, 未查證), not a measured value
   * (the 44 bands of v1.4.0 use +-20). Nothing here was fitted to a fixture peak list.
   */
  useV141IR: true as boolean,
  v141IR: {alkylBend: true as boolean, esterCO: true as boolean, ringCarbonyl: true as boolean, sp2CH: true as boolean, bandUncertaintyCm1: 10, aliphaticChUpperUncertaintyCm1: 8},
  /**
   * v1.4.2 (IR round 2): more IR evidence for the CANDIDATE SCORE only (not the IR reading list, not Mode B, not the composition inference). The parent flag DEFAULTS ON since v1.4.2 stop 36 (planner decision; before: off; negativeEvidence and its three groups stay OFF): false = every path is identical to v1.4.1.
   * Two sub-flags; the effective state of a sub-flag is useV142IR AND the sub-flag. Independent of useV141IR (the two can be on in any combination).
   * alkeneOOP (default true = follows the parent): four alkene C-H out-of-plane bands (vinylidene, trans 1,2, cis 1,2, trisubstituted) and the (CH2)n rocking band (n >= 4) in ONE sub-flag, because the cis band (665-730) and the
   * rocking band (720-725) overlap (design report notes/v1.4.2/IR_ROUND2_DESIGN.md section 4: the OOP bands alone make ALK0 worse).
   * negativeEvidence (default FALSE, a planner decision that relaxes "sub-flags default on": no real nitrile / nitro / alkyne data has verified its false-deduction rate, and the 0/0 of the design report is not evidence of safety):
   * a candidate that has a nitrile (A tier), a C-nitro group (A tier) or a terminal alkyne C-H (B tier) but whose peak table has no such band is deducted a share of its other IR weight, behind a data gate (confirmed-complete table, no unconfirmed automatic peak, at least 6 marked peaks, the missing-carbonyl status). IR:coverage 2100-2300 (dead code: it never fires) is skipped while this is on.
   * ALL RANGES, GATES, SHARES AND CAPS ARE TEXTBOOK-STYLE RANGES OR ENGINEERING JUDGEMENT (工程判斷, 未查證; 未經校準); nothing was fitted to a fixture peak list. +-10 cm-1 (bandUncertaintyCm1) is engineering judgement.
   */
  useV142IR: true as boolean,
  v142IR: {alkeneOOP: true as boolean, negativeEvidence: false as boolean, bandUncertaintyCm1: 10,
    /** stop 30: the negative-evidence rule of ONE group (nitrile / C-nitro / terminal alkyne C-H), each DEFAULT FALSE. A rule is on when useV142IR AND (negativeEvidence OR its own flag): negativeEvidence keeps its meaning "all three together" (?exp=ir2neg is unchanged). */
    negNitrile: false as boolean, negNitro: false as boolean, negAlkyne: false as boolean,
    /** ir2.negativeEvidence (negativeEvidence.ts): shares of the candidate's other IR weight (A tier: nitrile, C-nitro asymmetric band; B tier: terminal alkyne C-H), the cap of the summed share, the data gate's minimum of marked peaks, the edge added to a window, the 'present' thresholds (% of the strongest band; stop 29: nitrile 10 -> 3 because the nitrile band of a gas-phase spectrum is only 4.5-6.9 % of the strongest band, measured on 3 NIST gas spectra of stop 27). ENGINEERING JUDGEMENT, 工程判斷，未查證，未經校準. */
    neg: {shareA: 0.15, shareB: 0.075, cap: 0.20, minMarkedPeaks: 6, edgeToleranceCm1: 10, presentNitrilePct: 3, presentNitroPct: 30, presentAlkynePct: 10}},
  /**
   * v1.4.0 stop 10 (useV140H1 and v140.coverage, DEFAULT OFF): shift classes for the windows the constraint layer could not read (stop-7 audit: C,H 0-0.4 / 3.3-4.4 / 8.6-8.9; N 3.9-4.4) and the new 1H predictor rules (h1CoverageRules.ts).
   * The classes are checked only for coverage of the truth sets (tests/fixtures/v140/h1Truth1.json, h1Truth2.json): a signal must be readable as some class that the formula allows. They are textbook-style windows (Pretsch-type
   * ranges for alkyl halides, nitroalkanes, silyl and cyclopropyl H, alpha pyridine H, S-CH), 工程判斷, NOT calibrated, NOT checked against book page numbers. `requires`: an element of the formula (HAL = F, Cl, Br or I; N also needs N evidence).
   * A class whose window lies inside the windows of the table only adds a class label to an existing option (the options are keyed by element and H per atom); new options appear only for signals no class read before.
   */
  /**
   * v1.4.0 stop 11 (useV140H1 and v140.oxygen): three FINER oxygen environments of the additive rules, each a correction term added to the knowledge-base sum. Each is calibrated on ONE point (tier 1, tier-1 quality, or the point the planner
   * named) and checked on held-out points that took no part in the calibration (the calibration / held-out lists are in h1AdditiveRules.oxygenCorrection). `enabled` is an experiment / test switch (default true), NOT a user flag.
   * esterMethine: acyloxy methine (O-CH, the ester O not in a ring, the other two neighbours alkyl C): 4.98 (isopropyl acetate, RSC SI) - 4.31 (knowledge-base sum) = +0.67.
   * acetalCH2: O-CH2-O with two ether-type O: the dimethoxymethane OCH2O value (named by the planner; tier 2, grade A = a user-looked-up SDBS / ChemicalBook value, kept in the local-only file, v1.4.2 stop 36) - 5.45 = -0.88.
   * cyclicEther: O-CH2 of a 5- or 6-membered ring with one O and otherwise carbon: 3.76 (tetrahydrofuran, tier 1) - 3.37 = +0.39.
   * glycolOCH3: OCH3 of a CH3-O-CH2-C-O unit (glyme type; the knowledge base has no term for the second O three bonds away): 3.40 (1,2-dimethoxyethane, tier 1) - 3.24 = +0.16.
   */
  v140Oxygen: {enabled: true as boolean, esterMethine: {deltaPpm: 0.67}, acetalCH2: {deltaPpm: -0.88}, cyclicEther: {deltaPpm: 0.39, ringSizes: [5, 6] as number[]}, glycolOCH3: {deltaPpm: 0.16}},
  /**
   * v1.4.0 stop 12 (useV140H1 and v140.solvent, DEFAULT OFF): solvent shift by environment class (h1SolventRules.ts), from Fulmer 2010 SI Table S1 (tier 1), NOT from any user spectrum. The procedure (written before the numbers were seen,
   * tests/helpers/v140SolventStudy.ts): a (solvent, class) pair is corrected only if the class has >= minCompounds compounds and its standard deviation is <= classSdRatio x the global standard deviation of the solvent, and on a held-out half of
   * the compounds (seeded shuffle, seed) the class correction is not worse than the correction the predictor applied before, and (C3b) for the solvent as a whole the predicted shifts of the held-out half are not worse than without the classes (acetone-d6 0.163 -> 0.164 and DMSO-d6 0.176 -> 0.178 were, so
   * those two solvents keep the previous behaviour). `table` = mean of shift(solvent) - shift(CDCl3) over ALL compounds, for the adopted pairs only (engine solvent ids).
   * exchangeableSdPpm: the spread of the shift difference of the exchangeable protons (OH, NH, SH, COOH) of the solvents with >= minCompounds compounds; ONLY the tolerance is widened (in quadrature), the centre is never changed.
   * 工程判斷 (not calibrated beyond the 51 tier-1 compounds): seed, classSdRatio, minCompounds.
   */
  v140Solvent: {
    seed: 20261109, classSdRatio: 0.6, minCompounds: 3,
    table: {
      C6D6: {'O-CH': -0.314, 'vinyl CH': -0.2, 'next to carbonyl': -0.484},
      CD3CN: {'N-CH': -0.081, 'next to carbonyl': -0.074},
      CD3OD: {'alkyl CH': 0.002, 'O-CH': -0.059, 'vinyl CH': -0.016, 'next to carbonyl': -0.022},
      D2O: {'vinyl CH': 0.045},
    } as Record<string, Record<string, number>>,
    exchangeableSdPpm: {C6D6: 0.4, 'Acetone-d6': 0.5, 'DMSO-d6': 0.69, CD3CN: 0.42} as Record<string, number>,
  },
  /**
   * v1.4.0 stop 13 (useV140H1 and v140.calibration2, DEFAULT OFF): class corrections of the 1H predictor from tier-2 / candidate values (h1Calibration2.ts: procedure, classes, per-rule sources). `rules` is filled from the leave-one-out fit
   * of tests/v14/v140Calibration2.test.ts (which pins every number here to the fit). minCompounds, withinTolerancePpm: the planner's rule of stop 13 (>= 3 independent compounds; a class already within the tier-2 tolerance 0.15 ppm is not changed).
   */
  v140Calibration2: {
    minCompounds: 3, withinTolerancePpm: 0.15, exchangeableToleranceFloorPpm: 0.5,
    /** v1.4.0 stop 14: a polyhalomethane carbon (CH2X2, CHX3) whose halogens include one of these is NOT output as a number but as 資料不足 (listed in result.insufficientDataEnvironments, never used in the ranking). F and I have two truth compounds each
     *  (CHF3 6.25, CH2F2 5.45, CHI3 4.91, CH2I2), too few to calibrate; the stack predicts 10.32 / 7.36 / 6.20. Cl and Br are not listed: they stay as they were. windowPpm = the POLYHALO_CH class window of v140Coverage (the observed signals that stand for the missing number). */
    insufficientHalogens: ['F', 'I'] as string[], insufficientWindowPpm: [5.0, 7.7] as [number, number],
    rules: {
      // ALKYNE_CH_ALKYL (refinement of ALKYNE_CH): refined shifts for ALKYNE_CH_ALKYL, ALKYNE_CH_HETERO: leave-one-out 0.23 -> 0.14 (pooled leave-one-out 0.26 not lower).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (3; each is calibration point and, in turn, the left-out validation point): propyne 1.80 [B], 3-methyl-1-butyne 1.86 [B], 3-butyn-1-ol 2.01 [B].
      //   Leave-one-out mean error 0.29 -> 0.12 ppm (in-sample 0.08); per compound before / left-out: propyne 0.38/0.13, 3-methyl-1-butyne 0.32/0.04, 3-butyn-1-ol 0.17/0.18. delta = -0.29 ppm.
      ALKYNE_CH_ALKYL: {deltaPpm: -0.29, level: 1, compounds: ["propyne","3-methyl-1-butyne","3-butyn-1-ol"], maeBefore: 0.29, maeLeaveOneOut: 0.12},
      // ALKYNE_CH_HETERO (refinement of ALKYNE_CH): refined shifts for ALKYNE_CH_ALKYL, ALKYNE_CH_HETERO: leave-one-out 0.23 -> 0.14 (pooled leave-one-out 0.26 not lower).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (6; each is calibration point and, in turn, the left-out validation point): propargyl alcohol 2.44 [B], propargyl chloride 2.40 [B], propargyl bromide 2.52 [B], propargyl iodide 2.25 [B], methyl propargyl sulfide 2.09 [B], 2-methyl-3-butyn-2-ol 2.44 [B].
      //   Leave-one-out mean error 0.21 -> 0.15 ppm (in-sample 0.12); per compound before / left-out: propargyl alcohol 0.26/0.10, propargyl chloride 0.22/0.05, propargyl bromide 0.34/0.20, propargyl iodide 0.07/0.13, methyl propargyl sulfide 0.09/0.32, 2-methyl-3-butyn-2-ol 0.26/0.10. delta = +0.18 ppm.
      ALKYNE_CH_HETERO: {deltaPpm: 0.18, level: 1, compounds: ["propargyl alcohol","propargyl chloride","propargyl bromide","propargyl iodide","methyl propargyl sulfide","2-methyl-3-butyn-2-ol"], maeBefore: 0.21, maeLeaveOneOut: 0.15},
      // AMINE_BETA_CH: pooled shift: leave-one-out 0.22 -> 0.08.
      //   Source: T1 = tier 1, Fulmer 2010 SI Table S1; B = tier 2, Reich (hand-read). Independent compounds (7; each is calibration point and, in turn, the left-out validation point): pyrrolidine 1.68 [T1], triethylamine 1.03 [T1], diethylamine 1.11 [B], ethylamine 1.10 [B], propylamine 1.43 [B], isopropylamine 1.03 [B], diisopropylamine 1.04 [B].
      //   Leave-one-out mean error 0.22 -> 0.08 ppm (in-sample 0.07); per compound before / left-out: pyrrolidine 0.43/0.25, triethylamine 0.15/0.08, diethylamine 0.23/0.02, ethylamine 0.22/0.00, propylamine 0.18/0.04, isopropylamine 0.15/0.08, diisopropylamine 0.16/0.07. delta = +0.22 ppm.
      AMINE_BETA_CH: {deltaPpm: 0.22, level: 0, compounds: ["pyrrolidine","triethylamine","diethylamine","ethylamine","propylamine","isopropylamine","diisopropylamine"], maeBefore: 0.22, maeLeaveOneOut: 0.08},
      // HALO_BETA_CH_Br (refinement of HALO_BETA_CH): refined shifts for HALO_BETA_CH_Br, HALO_BETA_CH_Cl, HALO_BETA_CH_F, HALO_BETA_CH_I: leave-one-out 0.69 -> 0.13 (pooled would give 0.19).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (4; each is calibration point and, in turn, the left-out validation point): ethyl bromide 1.67 [B], propyl bromide 1.89 [B], isopropyl bromide 1.71 [B], tert-butyl bromide 1.76 [B].
      //   Leave-one-out mean error 0.78 -> 0.10 ppm (in-sample 0.07); per compound before / left-out: ethyl bromide 0.79/0.01, propyl bromide 0.64/0.19, isopropyl bromide 0.83/0.06, tert-butyl bromide 0.88/0.13. delta = +0.78 ppm.
      HALO_BETA_CH_Br: {deltaPpm: 0.78, level: 1, compounds: ["ethyl bromide","propyl bromide","isopropyl bromide","tert-butyl bromide"], maeBefore: 0.78, maeLeaveOneOut: 0.10},
      // HALO_BETA_CH_Cl (refinement of HALO_BETA_CH): refined shifts for HALO_BETA_CH_Br, HALO_BETA_CH_Cl, HALO_BETA_CH_F, HALO_BETA_CH_I: leave-one-out 0.69 -> 0.13 (pooled would give 0.19).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (4; each is calibration point and, in turn, the left-out validation point): ethyl chloride 1.48 [B], propyl chloride 1.81 [B], isopropyl chloride 1.54 [B], tert-butyl chloride 1.58 [B].
      //   Leave-one-out mean error 0.63 -> 0.07 ppm (in-sample 0.05); per compound before / left-out: ethyl chloride 0.60/0.04, propyl chloride 0.56/0.09, isopropyl chloride 0.66/0.04, tert-butyl chloride 0.70/0.09. delta = +0.63 ppm.
      HALO_BETA_CH_Cl: {deltaPpm: 0.63, level: 1, compounds: ["ethyl chloride","propyl chloride","isopropyl chloride","tert-butyl chloride"], maeBefore: 0.63, maeLeaveOneOut: 0.07},
      // HALO_BETA_CH_F (refinement of HALO_BETA_CH): refined shifts for HALO_BETA_CH_Br, HALO_BETA_CH_Cl, HALO_BETA_CH_F, HALO_BETA_CH_I: leave-one-out 0.69 -> 0.13 (pooled would give 0.19).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (3; each is calibration point and, in turn, the left-out validation point): ethyl fluoride 1.09 [B], propyl fluoride 1.68 [B], tert-butyl fluoride 1.34 [B].
      //   Leave-one-out mean error 0.37 -> 0.16 ppm (in-sample 0.10); per compound before / left-out: ethyl fluoride 0.21/0.23, propyl fluoride 0.43/0.09, tert-butyl fluoride 0.46/0.14. delta = +0.37 ppm.
      HALO_BETA_CH_F: {deltaPpm: 0.37, level: 1, compounds: ["ethyl fluoride","propyl fluoride","tert-butyl fluoride"], maeBefore: 0.37, maeLeaveOneOut: 0.16},
      // HALO_BETA_CH_I (refinement of HALO_BETA_CH): refined shifts for HALO_BETA_CH_Br, HALO_BETA_CH_Cl, HALO_BETA_CH_F, HALO_BETA_CH_I: leave-one-out 0.69 -> 0.13 (pooled would give 0.19).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (4; each is calibration point and, in turn, the left-out validation point): ethyl iodide 1.83 [B], propyl iodide 1.88 [B], isopropyl iodide 1.88 [B], tert-butyl iodide 1.95 [B].
      //   Leave-one-out mean error 0.91 -> 0.19 ppm (in-sample 0.14); per compound before / left-out: ethyl iodide 0.95/0.05, propyl iodide 0.63/0.38, isopropyl iodide 1.00/0.12, tert-butyl iodide 1.07/0.21. delta = +0.91 ppm.
      HALO_BETA_CH_I: {deltaPpm: 0.91, level: 1, compounds: ["ethyl iodide","propyl iodide","isopropyl iodide","tert-butyl iodide"], maeBefore: 0.91, maeLeaveOneOut: 0.19},
      // HALO_CHX_SECONDARY: pooled shift: leave-one-out 0.69 -> 0.26.
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (3; each is calibration point and, in turn, the left-out validation point): isopropyl chloride 4.13 [B], isopropyl bromide 4.20 [B], isopropyl iodide 4.24 [B].
      //   Leave-one-out mean error 0.69 -> 0.26 ppm (in-sample 0.17); per compound before / left-out: isopropyl chloride 0.43/0.39, isopropyl bromide 0.70/0.02, isopropyl iodide 0.94/0.38. delta = +0.69 ppm.
      HALO_CHX_SECONDARY: {deltaPpm: 0.69, level: 0, compounds: ["isopropyl chloride","isopropyl bromide","isopropyl iodide"], maeBefore: 0.69, maeLeaveOneOut: 0.26},
      // PROPARGYL_CH_ALKYL (refinement of PROPARGYL_CH): refined shifts for PROPARGYL_CH_ALKYL, PROPARGYL_CH_HALOGEN: leave-one-out 0.61 -> 0.10 (pooled would give 0.33).
      //   Source: B = tier 2, Reich (hand-read); A = tier 2, user-looked-up value (SDBS / ChemicalBook / RSC SI). Independent compounds (4; each is calibration point and, in turn, the left-out validation point): propyne 1.80 [B], 3-methyl-1-butyne 2.51 [B], 3-butyn-1-ol 2.39 [B], 2-butyne [A, value local-only].
      //   Leave-one-out mean error 0.89 -> 0.07 ppm (in-sample 0.05); per compound before / left-out: propyne 0.92/0.04, 3-methyl-1-butyne 0.96/0.09, 3-butyn-1-ol 0.82/0.09, 2-butyne 0.86/0.04. delta = +0.89 ppm.
      PROPARGYL_CH_ALKYL: {deltaPpm: 0.89, level: 1, compounds: ["propyne","3-methyl-1-butyne","3-butyn-1-ol","2-butyne"], maeBefore: 0.89, maeLeaveOneOut: 0.07},
      // PROPARGYL_CH_HALOGEN (refinement of PROPARGYL_CH): refined shifts for PROPARGYL_CH_ALKYL, PROPARGYL_CH_HALOGEN: leave-one-out 0.61 -> 0.10 (pooled would give 0.33).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (4; each is calibration point and, in turn, the left-out validation point): propargyl chloride 4.09 [B], propargyl bromide 3.88 [B], propargyl iodide 3.36 [B], 1,4-dichloro-2-butyne 4.20 [B].
      //   Leave-one-out mean error 0.63 -> 0.18 ppm (in-sample 0.14); per compound before / left-out: propargyl chloride 0.69/0.08, propargyl bromide 0.68/0.06, propargyl iodide 0.36/0.36, 1,4-dichloro-2-butyne 0.80/0.22. delta = +0.63 ppm.
      PROPARGYL_CH_HALOGEN: {deltaPpm: 0.63, level: 1, compounds: ["propargyl chloride","propargyl bromide","propargyl iodide","1,4-dichloro-2-butyne"], maeBefore: 0.63, maeLeaveOneOut: 0.18},
      // SMALL_RING_ETHER_H_3 (refinement of SMALL_RING_ETHER_H): refined shifts for SMALL_RING_ETHER_H_3: leave-one-out 0.81 -> 0.56 (pooled leave-one-out 0.91 not lower).
      //   Source: A = tier 2, user-looked-up value (SDBS / ChemicalBook / RSC SI); B = tier 2, Reich (hand-read); J = tier-1 candidate, journal value. Independent compounds (3; each is calibration point and, in turn, the left-out validation point): propylene oxide [A, value local-only], ethylene oxide 2.54 [B], cyclohexene oxide 3.11 [J].
      //   Leave-one-out mean error 0.72 -> 0.38 ppm (in-sample 0.27); per compound before / left-out: propylene oxide 0.78/0.20, ethylene oxide 1.00/0.42, cyclohexene oxide 0.38/0.51. delta = -0.72 ppm.
      SMALL_RING_ETHER_H_3: {deltaPpm: -0.72, level: 1, compounds: ["propylene oxide","ethylene oxide","cyclohexene oxide"], maeBefore: 0.72, maeLeaveOneOut: 0.38},
      // S_ALPHA_CH: pooled shift: leave-one-out 1.44 -> 0.33.
      //   Source: T1 = tier 1, Fulmer 2010 SI Table S1; A = tier 2, user-looked-up value (SDBS / ChemicalBook / RSC SI); B = tier 2, Reich (hand-read). Independent compounds (10; each is calibration point and, in turn, the left-out validation point): dimethyl sulfoxide 2.62 [T1], ethanethiol [A, value local-only], methanethiol 2.00 [B], dimethyl sulfide 2.08 [B], dimethyl disulfide 2.32 [B], dimethyl sulfone 2.84 [B], methyl propargyl sulfide 3.14 [B], benzyl methyl sulfide 3.57/1.88 [B], propanethiol 2.50 [B], isopropyl thiol 3.16 [B].
      //   Leave-one-out mean error 1.44 -> 0.33 ppm (in-sample 0.29); per compound before / left-out: dimethyl sulfoxide 1.74/0.34, ethanethiol 1.19/0.27, methanethiol 1.12/0.35, dimethyl sulfide 1.20/0.26, dimethyl disulfide 1.44/0.01, dimethyl sulfone 1.96/0.58, methyl propargyl sulfide 1.89/0.51, benzyl methyl sulfide 0.95/0.54, propanethiol 1.25/0.21, isopropyl thiol 1.61/0.19. delta = +1.44 ppm.
      S_ALPHA_CH: {deltaPpm: 1.44, level: 0, compounds: ["dimethyl sulfoxide","ethanethiol","methanethiol","dimethyl sulfide","dimethyl disulfide","dimethyl sulfone","methyl propargyl sulfide","benzyl methyl sulfide","propanethiol","isopropyl thiol"], maeBefore: 1.44, maeLeaveOneOut: 0.33},
    } as Record<string, {deltaPpm: number; level: 0 | 1; compounds: string[]; maeBefore: number; maeLeaveOneOut: number}>,
  },
  /**
   * v1.4.1 stop 22 (useV140H1 and v140.round3, DEFAULT OFF): the third 1H round, part 1 (h1Round3.ts, h1AdditiveRules.alkeneSubstituentRound3). Everything below only runs while both flags are on.
   * 2.1 unsplitVinylSubstituents: the vinyl substituent that STILL keeps its =CH2 as one 2H environment because no tabulated Ambit ALKENES row is a reasonable stand-in (trialkylsilyl: silicon is electropositive, none of the tabulated groups is electronically close to it).
   *     (sulfone, phosphonate ester and CH(OH)R now get a tabulated / stand-in row, CHCl2 and 2-furyl already had one since stop 14; no truth value exists for any of them, nothing was fitted.)
   * 2.2 arylSH: the aromatic S-H (thiophenol type) is its OWN class, centre 3.35 ppm, tolerance 0.5 ppm. 3.35 = the middle of the textbook range 3.3-3.4 given by the planner; it is NOT calibrated, and the only compound it is checked on (benzenethiol:
   *     Reich 3.29, solvent not stated; 3.40 in CDCl3 at 89.56 MHz, the user's source) is not independent of that range. Alkyl S-H keeps its old value. An exchangeable proton: only the tolerance is stated, no calibration is claimed.
   * 2.3 rules: class corrections of the cyclopropane methine, the cyclopropane ring CH2 and the cyclobutane ring CH2 (one additive shift per class, ppm), fitted by tests/v14/v140Round3.test.ts (which pins every number here to the fit). Data: tests/fixtures/v140/h1Truth3.json (the
   *     planner list of 2026-11-13, Reich collection hand-read from figures, solvent mostly not stated = CDCl3) plus the round-1 cyclopropane / cyclobutane values; each substituent row is ONE independent compound; ring CH2 of a monosubstituted cyclopropane and of 3-bromocyclobutanone
   *     is compared as the MEAN of its cis and trans hydrogen (the predictor outputs one environment for the two CH2 carbons). The secondary cyclopropanes (cyclopropylmethanol, -methyl chloride, -methyl bromide: assignment read from the figure) and cubane (a cage) are NOT used for calibration.
   *     Rule of the stop (planner): >= 3 independent compounds, leave-one-out, mean error falls; exchangeable protons are never calibrated; try the pooled shift first, only a pooled shift that fails is followed by ONE declared refinement (declared in
   *     notes/v1.4.1/STOP22_CHECKPOINT.md before any leave-one-out number was computed). All three pooled shifts passed, so no refinement is deployed (the refinement figures are in notes/v1.4.1/STOP22_RESULTS.txt for information).
   *     CYCLOBUTANE_CH (one compound: 3-bromocyclobutanone CH 4.5) is 'insufficient data': not calibrated. The shifts are fitted against the stack alkene + oxygen + coverage + solvent + calibration2 and are valid only there.
   */
  v140Round3: {
    unsplitVinylSubstituents: ['trialkylsilyl C-SiR3'] as string[],
    arylSH: {centrePpm: 3.35, toleranceFloorPpm: 0.5, rangeTextbookPpm: [3.3, 3.4] as [number, number]},
    rules: {
      // CYCLOBUTANE_CH2: pooled shift: leave-one-out 0.54 -> 0.35 (refinement not used: the pooled shift passed).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (6; each is calibration point and, in turn, the left-out validation point): cyclobutane 1.98/1.94 [B], cyclobutanone 2.99/1.94 [B], cyclobutane-1,2-dione 2.98 [B], 3,3-diphenylcyclobutanone 3.82 [B], benzocyclobutene 3.14 [B], 3-bromocyclobutanone 3.63 [B].
      //   Leave-one-out mean error 0.54 -> 0.35 ppm (in-sample 0.29); per compound before / left-out: cyclobutane 0.71/0.20, cyclobutanone 0.34/0.25, cyclobutane-1,2-dione 0.19/0.42, 3,3-diphenylcyclobutanone 0.75/0.25, benzocyclobutene 0.22/0.39, 3-bromocyclobutanone 1.06/0.61. delta = +0.54 ppm.
      CYCLOBUTANE_CH2: {deltaPpm: 0.54, level: 0, compounds: ["cyclobutane","cyclobutanone","cyclobutane-1,2-dione","3,3-diphenylcyclobutanone","benzocyclobutene","3-bromocyclobutanone"], maeBefore: 0.54, maeLeaveOneOut: 0.35},
      // CYCLOPROPANE_CH2: pooled shift: leave-one-out 0.61 -> 0.30 (refinement not used: the pooled shift passed).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (14; each is calibration point and, in turn, the left-out validation point): cyclopropane 0.22/0.20 [B], cyclopropanecarboxylic acid 0.96 [B], cyclopropanecarboxaldehyde 1.01 [B], cyclopropyl methyl ketone 0.85 [B], cyclopropanecarbonitrile 1.00 [B], vinylcyclopropane 0.48 [B], cyclopropylbenzene 0.77 [B], chlorocyclopropane 0.82 [B], bromocyclopropane 0.91 [B], iodocyclopropane 0.91 [B], cyclopropanol 0.44 [B], cyclopropylamine 0.28 [B], nitrocyclopropane 1.36 [B], cyclopropyltrimethylsilane 0.42 [B].
      //   Leave-one-out mean error 0.61 -> 0.30 ppm (in-sample 0.28); per compound before / left-out: cyclopropane 1.04/0.48, cyclopropanecarboxylic acid 0.51/0.09, cyclopropanecarboxaldehyde 0.46/0.14, cyclopropyl methyl ketone 0.62/0.03, cyclopropanecarbonitrile 0.25/0.37, vinylcyclopropane 0.77/0.19, cyclopropylbenzene 0.73/0.15, chlorocyclopropane 0.43/0.18, bromocyclopropane 0.34/0.27, iodocyclopropane 0.34/0.27, cyclopropanol 1.13/0.58, cyclopropylamine 0.97/0.41, nitrocyclopropane 0.11/0.76, cyclopropyltrimethylsilane 0.82/0.25. delta = -0.59 ppm.
      CYCLOPROPANE_CH2: {deltaPpm: -0.59, level: 0, compounds: ["cyclopropane","cyclopropanecarboxylic acid","cyclopropanecarboxaldehyde","cyclopropyl methyl ketone","cyclopropanecarbonitrile","vinylcyclopropane","cyclopropylbenzene","chlorocyclopropane","bromocyclopropane","iodocyclopropane","cyclopropanol","cyclopropylamine","nitrocyclopropane","cyclopropyltrimethylsilane"], maeBefore: 0.61, maeLeaveOneOut: 0.30},
      // CYCLOPROPANE_METHINE: pooled shift: leave-one-out 0.98 -> 0.27 (refinement not used: the pooled shift passed).
      //   Source: B = tier 2, Reich (hand-read). Independent compounds (13; each is calibration point and, in turn, the left-out validation point): cyclopropanecarboxylic acid 1.57 [B], cyclopropanecarboxaldehyde 1.79 [B], cyclopropyl methyl ketone 1.83 [B], cyclopropanecarbonitrile 1.29 [B], vinylcyclopropane 1.35 [B], cyclopropylbenzene 1.83 [B], chlorocyclopropane 2.93 [B], bromocyclopropane 2.79 [B], iodocyclopropane 2.27 [B], cyclopropanol 3.36 [B], cyclopropylamine 2.24 [B], nitrocyclopropane 4.21 [B], cyclopropyltrimethylsilane -0.67 [B].
      //   Leave-one-out mean error 0.98 -> 0.27 ppm (in-sample 0.25); per compound before / left-out: cyclopropanecarboxylic acid 1.20/0.24, cyclopropanecarboxaldehyde 1.08/0.11, cyclopropyl methyl ketone 1.04/0.06, cyclopropanecarbonitrile 1.41/0.46, vinylcyclopropane 1.15/0.18, cyclopropylbenzene 1.14/0.17, chlorocyclopropane 0.77/0.23, bromocyclopropane 0.71/0.29, iodocyclopropane 1.03/0.05, cyclopropanol 0.19/0.86, cyclopropylamine 0.86/0.13, nitrocyclopropane 0.74/0.26, cyclopropyltrimethylsilane 1.44/0.50. delta = -0.98 ppm.
      CYCLOPROPANE_METHINE: {deltaPpm: -0.98, level: 0, compounds: ["cyclopropanecarboxylic acid","cyclopropanecarboxaldehyde","cyclopropyl methyl ketone","cyclopropanecarbonitrile","vinylcyclopropane","cyclopropylbenzene","chlorocyclopropane","bromocyclopropane","iodocyclopropane","cyclopropanol","cyclopropylamine","nitrocyclopropane","cyclopropyltrimethylsilane"], maeBefore: 0.98, maeLeaveOneOut: 0.27},
    } as Record<string, {deltaPpm: number; level: 0 | 1; compounds: string[]; maeBefore: number; maeLeaveOneOut: number}>,
  },
  /**
   * v1.4.2 stop 26 (no new flag: under v140.oxygen and v140.calibration2, which need useV140H1; DEFAULT OFF): class shifts of the 1H predictor from MEASURED CDCl3 1H spectra of nmrshiftdb2 (h1Nmrshiftdb2.ts: classes as SMARTS, gate per class).
   * Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License (https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).
   * Truth values: tests/fixtures/v140/nmrshiftdb2/ (adopted classes only; with the license text); extraction method: scripts/nmrshiftdb2/extract_h1.py. Source label NMRShiftDB2, separate from tier 1 / tier 2.
   * Stage 1 rule (planner, stop 26 = the stop-13/22 rule): minCompounds independent compounds, leave-one-out mean error lower, mean error before above withinTolerancePpm; a class with >= heldOutMinCompounds compounds also needs a lower
   * error on a 50 % held-out half (seed heldOutSeed). Outliers (|truth - before| > outlierPpm) are listed and removed only when the assignment is confirmed wrong.
   * v1.4.2 stop 28: the classes that derive from nmrshiftdb2 were re-fitted under the gate A (see `gate`; skeleton-weighted shift, merged refit with the older truth where both exist). `rules` = the 8 classes that passed; OCH_ESTER_CHAIN, OCH_ARYLETHER_CHAIN,
   * OCH2O (aliphatic part), EPOXIDE_H, ALKENE_1_CH, the open-chain acetal part and the merged ether O-CH ring class are NOT in it (revoked / not adopted; reasons in tests/v14/v142Nmrshiftdb2.test.ts and notes/v1.4.2/S28_GATE_FINAL.txt). `rules` is pinned to the gate by tests/v14/v142Nmrshiftdb2.test.ts.
   */
  v142Nmrshiftdb2: {
    minCompounds: 3, withinTolerancePpm: 0.15, heldOutMinCompounds: 20, heldOutSeed: 20261114, outlierPpm: 1.0,
    /** v1.4.2 stop 28: the adoption gate A (tests/helpers/v142S28.ts, notes/v1.4.2/STOP28_CHECKPOINT.md): minSkeletons different Bemis-Murcko skeletons; leave-one-out and (>= heldOutMinCompounds) held-out error lower under the compound-weighted AND the skeleton-weighted mean; no older-truth signal worse by more than worseItemPpm; with old truth in the class (merged refit) neither source worse by more than worseSourcePpm; Unreported-solvent spectra only validate (consistent = shift difference <= unreportedConsistentPpm). */
    gate: {minSkeletons: 3, worseItemPpm: 0.15, worseSourcePpm: 0.05, unreportedConsistentPpm: 0.1},
    rules: {
      // OCH_ETHER_RING_ALPHA_QUAT (醚 O–CH 次甲基（環內，α 位有四級碳）): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = skeleton-weighted mean (3 skeletons, 3 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 3 compounds (nmrshiftdb2 IDs): 20099601, 20236671, 60007377.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.59 / 0.59, leave-one-out 0.42 / 0.42, in-sample after 0.28 / 0.28. delta = +0.59 ppm.
      OCH_ETHER_RING_ALPHA_QUAT: {deltaPpm: 0.59, nCompounds: 3, nSkeletons: 3, nCompoundsOld: 0, smallSample: true, before: {c: 0.59, s: 0.59}, leaveOneOut: {c: 0.42, s: 0.42}, after: {c: 0.28, s: 0.28}, heldOut: null, sourceError: {new: [0.59, 0.28], old: null}},
      // OCH_ETHER_RING_NO_QUAT (醚 O–CH 次甲基（環內，α 位無四級碳）): gate A passed. Shift = skeleton-weighted mean (15 skeletons, 25 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 25 compounds (nmrshiftdb2 IDs): 6683, 10007020, 10009153, 10017395, 20042191, 20069678, 20069681, 20091370, 20103725, 20116828, 20119795, 20184872, 30080731, 30080732, 30080734, 30083337, 30083338, 30083339, 30083340, 30083709, 40093879, 60001974, 60004029, 60005667, 80041958.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.49 / 0.53, leave-one-out 0.44 / 0.46, in-sample after 0.43 / 0.44, held-out half (11 compounds) 0.65 -> 0.57 / 0.68 -> 0.52. delta = +0.48 ppm.
      OCH_ETHER_RING_NO_QUAT: {deltaPpm: 0.48, nCompounds: 25, nSkeletons: 15, nCompoundsOld: 0, smallSample: false, before: {c: 0.49, s: 0.53}, leaveOneOut: {c: 0.44, s: 0.46}, after: {c: 0.43, s: 0.44}, heldOut: {n: 11, before: {c: 0.65, s: 0.68}, after: {c: 0.57, s: 0.52}}, sourceError: {new: [0.49, 0.43], old: null}},
      // ACETAL_CH_RING (縮醛 C–H（環內）): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = skeleton-weighted mean (7 skeletons, 12 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 12 compounds (nmrshiftdb2 IDs): 6683, 10008846, 20091370, 30083337, 30083338, 30083339, 30083340, 30083709, 60001989, 60001990, 60004029, 60008985.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.65 / 0.59, leave-one-out 0.45 / 0.56, in-sample after 0.42 / 0.48. delta = +0.39 ppm.
      ACETAL_CH_RING: {deltaPpm: 0.39, nCompounds: 12, nSkeletons: 7, nCompoundsOld: 0, smallSample: true, before: {c: 0.65, s: 0.59}, leaveOneOut: {c: 0.45, s: 0.56}, after: {c: 0.42, s: 0.48}, heldOut: null, sourceError: {new: [0.65, 0.42], old: null}},
      // OCH2O_ARYL (O–CH₂–O（兩端氧都接芳環，亞甲二氧基苯）): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = skeleton-weighted mean (11 skeletons, 15 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 15 compounds (nmrshiftdb2 IDs): 4374, 21359, 21618, 10005744, 10016311, 10027908, 10027909, 10027910, 10027926, 20099228, 30086323, 30086324, 30086326, 60001940, 60001971.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.64 / 0.65, leave-one-out 0.05 / 0.03, in-sample after 0.04 / 0.03. delta = -0.65 ppm.
      OCH2O_ARYL: {deltaPpm: -0.65, nCompounds: 15, nSkeletons: 11, nCompoundsOld: 0, smallSample: true, before: {c: 0.64, s: 0.65}, leaveOneOut: {c: 0.05, s: 0.03}, after: {c: 0.04, s: 0.03}, heldOut: null, sourceError: {new: [0.64, 0.04], old: null}},
      // CYCLOPROPANE_CH (環丙烷 CH): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = MERGED refit (nmrshiftdb2 + older truth), skeleton-weighted mean (8 skeletons, 19 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 6 compounds (nmrshiftdb2 IDs): 2459, 10887, 10027666, 20207927, 20226200, 40265319. Older truth in the fit (13): B cyclopropanecarboxylic acid, B cyclopropanecarboxaldehyde, B cyclopropyl methyl ketone, B cyclopropanecarbonitrile, B vinylcyclopropane, B cyclopropylbenzene, B chlorocyclopropane, B bromocyclopropane, B iodocyclopropane, B cyclopropanol, B cyclopropylamine, B nitrocyclopropane, B cyclopropyltrimethylsilane.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.24 / 0.22, leave-one-out 0.24 / 0.18, in-sample after 0.23 / 0.16. delta = +0.12 ppm.
      CYCLOPROPANE_CH: {deltaPpm: 0.12, nCompounds: 19, nSkeletons: 8, nCompoundsOld: 13, smallSample: true, before: {c: 0.24, s: 0.22}, leaveOneOut: {c: 0.24, s: 0.18}, after: {c: 0.23, s: 0.16}, heldOut: null, sourceError: {new: [0.22, 0.13], old: [0.25, 0.28]}},
      // CYCLOBUTANE_CH (環丁烷 CH): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = MERGED refit (nmrshiftdb2 + older truth), skeleton-weighted mean (6 skeletons, 8 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 7 compounds (nmrshiftdb2 IDs): 10021322, 20055593, 20103723, 60000019, 60004465, 60019476, 60020562. Older truth in the fit (1): B 3-bromocyclobutanone.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.36 / 0.36, leave-one-out 0.29 / 0.28, in-sample after 0.26 / 0.26. delta = +0.29 ppm.
      CYCLOBUTANE_CH: {deltaPpm: 0.29, nCompounds: 8, nSkeletons: 6, nCompoundsOld: 1, smallSample: true, before: {c: 0.36, s: 0.36}, leaveOneOut: {c: 0.29, s: 0.28}, after: {c: 0.26, s: 0.26}, heldOut: null, sourceError: {new: [0.33, 0.26], old: [0.56, 0.27]}},
      // INDOLE_H2 (吲哚 H2): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = MERGED refit (nmrshiftdb2 + older truth), skeleton-weighted mean (3 skeletons, 9 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 8 compounds (nmrshiftdb2 IDs): 10006007, 10018779, 20071928, 20100721, 20100722, 20191947, 60001983, 60001986. Older truth in the fit (1): B indole.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 1.32 / 1.13, leave-one-out 0.28 / 0.29, in-sample after 0.26 / 0.19. delta = -1.13 ppm.
      INDOLE_H2: {deltaPpm: -1.13, nCompounds: 9, nSkeletons: 3, nCompoundsOld: 1, smallSample: true, before: {c: 1.32, s: 1.13}, leaveOneOut: {c: 0.28, s: 0.29}, after: {c: 0.26, s: 0.19}, heldOut: null, sourceError: {new: [1.32, 0.27], old: [1.29, 0.16]}},
      // BENZOFURAN_H2 (苯并呋喃 H2): gate A passed (SMALL SAMPLE: fewer than 20 compounds, no held-out half). Shift = MERGED refit (nmrshiftdb2 + older truth), skeleton-weighted mean (4 skeletons, 4 compounds).
      //   Source NMRShiftDB2 (measured, CDCl3), 3 compounds (nmrshiftdb2 IDs): 10025008, 10027766, 20191737. Older truth in the fit (1): B benzofuran.
      //   mean error c = compound-weighted, s = skeleton-weighted: before 0.94 / 0.94, leave-one-out 0.07 / 0.07, in-sample after 0.06 / 0.06. delta = -0.94 ppm.
      BENZOFURAN_H2: {deltaPpm: -0.94, nCompounds: 4, nSkeletons: 4, nCompoundsOld: 1, smallSample: true, before: {c: 0.94, s: 0.94}, leaveOneOut: {c: 0.07, s: 0.07}, after: {c: 0.06, s: 0.06}, heldOut: null, sourceError: {new: [0.91, 0.04], old: [1.03, 0.09]}},
    } as Record<string, {deltaPpm: number; nCompounds: number; nSkeletons: number; nCompoundsOld: number; smallSample: boolean; before: {c: number; s: number}; leaveOneOut: {c: number; s: number}; after: {c: number; s: number};
      heldOut: {n: number; before: {c: number; s: number}; after: {c: number; s: number}} | null; sourceError: {new: [number, number] | null; old: [number, number] | null}}>,
  },
  v140Coverage: {
    classes: [
      {id: 'HALO_CH', rangePpm: [3.2, 4.8], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, requires: 'HAL', basis: '鹵素旁 sp3 C-H（CH2F 4.2-4.7、CHCl 3.9-4.4、CH2Cl 3.4-3.8、CH2Br 3.3-3.6）；工程判斷'},
      {id: 'POLYHALO_CH', rangePpm: [5.0, 7.7], hPerAtom: [1, 2], hybrid: 'SP3', exchangeable: false, requires: 'HAL', basis: '同碳多鹵 C-H（CH2Cl2、CHCl3、CHCl2R）；工程判斷'},
      {id: 'SI_CH3', rangePpm: [-0.3, 0.5], hPerAtom: [3], hybrid: 'SP3', exchangeable: false, requires: 'Si', basis: '矽烷基 Si-CH3；工程判斷'},
      {id: 'SHIELDED_CH', rangePpm: [0.0, 0.5], hPerAtom: [1, 2, 4], hybrid: 'SP3', exchangeable: false, basis: '高場 sp3 C-H（環丙烷 CH2、甲烷）；工程判斷'},
      {id: 'ARO_CH_NALPHA', rangePpm: [8.4, 9.2], hPerAtom: [1], hybrid: 'AR', exchangeable: false, requires: 'N', basis: '吡啶型 α 芳香 H；需要 N 證據；工程判斷'},
      {id: 'S_CH', rangePpm: [2.0, 4.0], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, requires: 'S', basis: '硫旁 sp3 C-H（硫醚、硫醇、碸）；工程判斷'},
      {id: 'NITRO_CH', rangePpm: [3.8, 4.8], hPerAtom: [1, 2, 3], hybrid: 'SP3', exchangeable: false, requires: 'NO', basis: '硝基烷 C-H（CH3NO2 4.3-4.4）；分子式需有 N 與 O；工程判斷'},
    ] as (ShiftClassDef & {requires?: 'HAL' | 'S' | 'Si' | 'N' | 'NO'})[],
    /** The lower end of the broad EXCHANGEABLE window under this flag (water in benzene-d6 and toluene-d8 is at 0.4). */
    exchangeableBroadLowPpm: 0.3,
    /** Nitro IR bands (cm-1): asymmetric 1500-1580 and symmetric 1290-1400 N=O stretch of an aliphatic or aromatic nitro group; both must be marked. 工程判斷（textbook ranges）。 */
    irNitro: {asymmetricRangeCm1: [1500, 1580] as [number, number], symmetricRangeCm1: [1290, 1400] as [number, number]},
  },
  /**
   * v1.4.0 stop 8 (useV140H1 and v140.matching, DEFAULT OFF): the matching layer of the 1H score. No shift rule, knowledge-base value or score weight changes; only how observation and prediction are paired.
   * (A) observed multiplicity labels are compared by FAMILY instead of by exact string: singlet family (s, br s), first-order multiplet family (d t q dd dt td ddd ddt dm tt quint sext m ...), aromatic spin-system family
   * (AA'BB', AA'XX' compatible with d, dd, m). A predicted or observed m is compatible with every multiplet / aromatic label. Singlet vs multiplet stays penalised (x0.5). Inside the multiplet family two DIFFERENT simple n+1
   * labels (d vs t, t vs q ...) stay penalised, because that difference is the neighbour count; a compound label (dd, ddd, dm ...) is compatible with any multiplet label (a compound label is a simple one with a further coupling).
   * (B) the integral scale (H per integral unit) counts the H of every predicted environment sitting inside the same observed signal (the matched one plus the unmatched ones within overlapShiftPpm), when that makes the
   * per-signal ratios more consistent. (C) when the matched ratios disagree (two predictions too close in shift to be told apart), candidate scales are tried and the one whose one-to-one pairing has the highest total compatibility wins.
   */
  v140MatchRules: {
    singletFamily: ['s', 'br s', 'br'] as string[],
    simpleMultipletFamily: ['d', 't', 'q', 'quint', 'sext', 'sept'] as string[],
    compoundMultipletFamily: ['dd', 'dt', 'td', 'ddd', 'ddt', 'dq', 'qd', 'tt', 'dm', 'tm', 'qm', 'ddq', 'dddd', 'm'] as string[],
    aromaticSystemFamily: ["AA'BB'", "AA'XX'", "AA'BB'C"] as string[],
    /** The aromatic spin-system labels are compatible with these (first-order multiplet) labels. */
    aromaticCompatible: ['d', 'dd', 'm'] as string[],
    /** Labels read as m regardless of family (never penalised as observed, compatible with every multiplet label). */
    freeLabels: ['m', 'multiplet', 'unresolved'] as string[],
    /** Candidate integral scales are searched only when the matched ratios disagree by more than this (ln units; 0.4 = the sigma of the integral factor). */
    scaleSearchLogSpread: 0.4,
    /** Candidate scales are taken from pairs whose shift compatibility is at least this. */
    scaleSearchMinShiftCompat: 0.25,
    maxScaleCandidates: 24,
  },
  /**
   * v1.4.0 stop 6 (useV140H1 and v140.alkene): =C(CH3)2 reading. The graph predictor makes the two methyls on one sp2 carbon ONE 6H environment (topologically equivalent), but E / Z methyls are not equivalent and are
   * often seen as two 3H singlets (prenol 1.73 / 1.66). The candidate's 1H score is also computed with that environment split into two 3H environments; the better of the two readings is kept (the merged reading stays).
   * The split reading is offered only when the observed table has two singlet-type signals inside windowPpm with equal integrals (within integralTolerance). Engineering defaults (工程判斷): the window is the allylic
   * methyl region of the Ambit-HNMR rules (an alkene-attached CH3 sums to 1.71); `enabled` is an experiment / test switch (default true, NOT a user flag: the reading is governed by useV140H1 and v140.alkene) so that the stop-5 behaviour can be reproduced; 0.15 is the tolerance the geminal =CH2 pair reading already uses; multiplicities = singlet-like (allylic 4J is not resolved).
   */
  gemDimethylReading: {enabled: true as boolean, windowPpm: [1.5, 2.0] as [number, number], integralTolerance: 0.15, multiplicities: ['s', 'br s', 'unresolved'] as string[]},
  /**
   * v1.4.0 stop 2 (useV140H1): two 1H signals that can be the two hydrogens of ONE terminal =CH2 are also offered as one =CH2 carbon (an extra alternative reading of the atom inventory; the readings with two separate =CH stay).
   * Conditions (工程判斷): both in the =CH2 window, no broad / exchangeable / singlet, equal integrals, shifts at most maxDeltaPpm apart. maxDeltaPpm 0.70 = the largest |cis − trans| difference among the common substituents of the
   * Ambit-HNMR ALKENES block (e.g. -COOH 1.41 / 0.71, -NO2 1.30 / 0.62), i.e. a geminal pair can differ by that much; alkyl and aryl substituents differ by 0.06–0.43.
   */
  geminalVinylPair: {windowPpm: [4.5, 6.5] as [number, number], maxDeltaPpm: 0.7, multiplicities: ['d', 'dd', 'm', 'br d', 'dt', 'ddd'] as string[]},
  v132: {
    /** A: the 1700–1800 strong-C=O threshold. */
    strongCarbonyl: true as boolean,
    /** B (stop 4): an IR peak contributes element / DBE bounds through its best finding only (functionalGroupFeatures); a soft AMIDE from a carbonyl band does not lift the no-N-evidence deduction. */
    bestFindingPerPeak: true as boolean,
    /** C (stop 4): multi-band readings: aldehyde needs both Fermi bands, a terminal vinyl both 910 and 990, the nitro companion window stops below the CH3 bend. A missing band lowers the weight (companion mechanism), never excludes. */
    multiBand: true as boolean,
    /** D (stop 6): window corrections, see compositionConfig.windowsV132 and irBandKnowledge. false = the stop-4 windows. */
    windows: true as boolean,
  },
  /** v1.3.2 A. ENGINEERING JUDGEMENT, NOT CALIBRATED (工程判斷，未查證). Window and share; the share is the v1.3.0 "band present" share (CARBONYL_BAND_PERCENT). Outside this window and for C–O the 0.5 rules stay. */
  v132StrongCarbonyl: {rangeCm1: [1700, 1800] as [number, number], relativeIntensity: CARBONYL_BAND_PERCENT / 100,
    /** stop 6 (v132.windows): the upper edge moves to 1810 (Coates Table 9: acid halide 1815–1770, open-chain anhydride 1850–1800; 工程判斷 for the 10 cm-1). The lower edge and the 0.5 below 1700 stay. */
    upperEdgeWindowsCm1: 1810},
  v131: {
    /** A: the parsimony prior (candidateGenerator.rankCandidates; numbers in parsimonyV131). */
    parsimony: true as boolean,
    /** B: forbidden fragment ynol C#C-OH. */
    forbiddenAlkynol: true as boolean,
    /** C: the ¹H reading line of the diagnostic summary lists all readable classes. */
    readingLine: true as boolean,
  },
  /**
   * v1.3.1 parsimony prior. ALL NUMBERS ARE ENGINEERING JUDGEMENT, NOT CALIBRATED (工程判斷，待 1.4.0 檢討).
   * A candidate whose non-exchangeable hydrogen count is an integer multiple (m >= 2) of another candidate's is "a multiple" of it (dimer, trimer ... of the same integral ratio).
   * It loses penaltyPoints from its total (a SEPARATE item, the ledger itself is untouched) only when a smaller candidate is within windowPoints below ... or above it (smaller.total > multiple.total - windowPoints),
   * and only when the multiple has no extra evidence over that smaller candidate: no observation (weight >= extraMinWeight) that the multiple explains (compatibility >= explainedMin) and the smaller one does not (compatibility < unexplainedMax).
   * Conversion: one fully mismatched weak fingerprint IR band moves the total by about 1 point (weight 0.85 of an IR weight sum about 13, IR modality share about 0.55 of the total, measured on tests/fixtures/v130/CR1),
   * so penaltyPoints = 1 is "the difference of one weak fingerprint band" and windowPoints = 2 "two of them"; a clear evidence gap (more than the window) is never touched, and the penalty cannot overturn a gap larger than penaltyPoints.
   */
  parsimonyV131: {
    windowPoints: 2,
    penaltyPoints: 1,
    explainedMin: 0.6,
    unexplainedMax: 0.4,
    extraMinWeight: 0.3,
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
    {id: 'STRONG_CARBONYL', modality: 'IR', label: '強 C=O（IR 1650–1800 cm-1）', smarts: '[CX3]=[OX1]', irRangeCm1: [1650, 1800], irMinRelativeIntensity: 0.5, carbonyl: true},
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
