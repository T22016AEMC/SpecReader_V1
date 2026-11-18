import {V12_CONFIG} from '../constraints/v12Config';
import {ENUMERATION_CONFIG} from '../enumeration/enumerationConfig';

/**
 * v1.2.1: the A class (S rule, O floor, k round-robin, two rounds) is part of the exhaustive 1H-constrained pipeline. It is on only when its own flag,
 * the v1.2 constraint layer and the exhaustive enumerator are all on, so useV12Constraints = false and useExhaustiveEnumerator = false keep reproducing
 * v1.1.8 / 1.1.7-hotfix.2 exactly (their goldens), and useV121Planning = false reproduces v1.2.0.
 */
export const planningActive = (): boolean => V12_CONFIG.useV121Planning && V12_CONFIG.useV12Constraints && ENUMERATION_CONFIG.useExhaustiveEnumerator;

/** v1.2.1 B class sub-switches: each rule set runs only while the gate above is open and its own sub-switch is on. */
export const forbiddenFragmentsActive = (): boolean => planningActive() && V12_CONFIG.planning.forbiddenFragments;
export const vinylWindowsActive = (): boolean => planningActive() && V12_CONFIG.planning.vinylWindows;
export const carbonylBandActive = (): boolean => planningActive() && V12_CONFIG.planning.carbonylBand;

/** v1.2.3 (A class): each rule set runs only while the gate above is open, the total flag is on and its own sub-switch is on. */
export const v123Active = (): boolean => planningActive() && V12_CONFIG.useV123;
export const v123NitrogenEvidenceActive = (): boolean => v123Active() && V12_CONFIG.v123.nitrogenEvidence;
export const v123NameSlotsActive = (): boolean => v123Active() && V12_CONFIG.v123.nameSlots;
export const v123NitrogenExcessActive = (): boolean => v123Active() && V12_CONFIG.v123.nitrogenExcess;
export const v123ForbiddenNActive = (): boolean => v123Active() && V12_CONFIG.v123.forbiddenN;
export const v123Round2CapActive = (): boolean => v123Active() && V12_CONFIG.v123.round2Cap;
export const v123AmideRingReadingActive = (): boolean => v123Active() && V12_CONFIG.v123.amideRingReading;
export const v123EsterMethineActive = (): boolean => v123Active() && V12_CONFIG.v123.esterMethine;
export const v123Round1CapK1Active = (): boolean => v123Active() && V12_CONFIG.v123.round1CapK1;
export const v123DeferredSecondPassActive = (): boolean => v123EsterMethineActive() && V12_CONFIG.v123.deferredSecondPass;

/** v1.3.0: each rule set runs only while the v1.2.3 gate above is open (so useV123 = false still gives v1.2.2), the total flag useV130 is on and its own sub-switch is on. */
export const v130Active = (): boolean => v123Active() && V12_CONFIG.useV130;
export const v130IntensityDisplayActive = (): boolean => v130Active() && V12_CONFIG.v130.intensityDisplay;
export const v130OvertoneActive = (): boolean => v130Active() && V12_CONFIG.v130.overtone;
// the v1.2.1 B4 sub-switch planning.carbonylBand also switches the v1.3.0 missing-carbonyl item off (it is the same deduction, generalised)
export const v130CarbonylMissingActive = (): boolean => v130Active() && V12_CONFIG.v130.carbonylMissing && V12_CONFIG.planning.carbonylBand;
export const v130DbeDemotionActive = (): boolean => v130Active() && V12_CONFIG.v130.dbeDemotion;
/** v1.3.0: tie-break of the candidate ranking by the unrounded ledger total (candidateGenerator.rankCandidates). */
export const v130TieBreakActive = (): boolean => v130Active() && V12_CONFIG.v130.tieBreak;

/** v1.3.1: each rule set runs only while the v1.3.0 gate above is open (so useV130 = false still gives v1.2.3), the total flag useV131 is on and its own sub-switch is on. */
export const v131Active = (): boolean => v130Active() && V12_CONFIG.useV131;
export const v131ParsimonyActive = (): boolean => v131Active() && V12_CONFIG.v131.parsimony;
export const v131ForbiddenAlkynolActive = (): boolean => v131Active() && V12_CONFIG.v131.forbiddenAlkynol;
export const v131ReadingLineActive = (): boolean => v131Active() && V12_CONFIG.v131.readingLine;

/** v1.3.2: runs only while the v1.3.1 gate above is open (so useV131 = false still gives v1.3.0), the total flag useV132 is on and its own sub-switch is on. */
export const v132Active = (): boolean => v131Active() && V12_CONFIG.useV132;
export const v132StrongCarbonylActive = (): boolean => v132Active() && V12_CONFIG.v132.strongCarbonyl;
/** v1.3.2 stop 4: one IR peak feeds the element / DBE bounds through its best finding only. */
export const v132BestFindingActive = (): boolean => v132Active() && V12_CONFIG.v132.bestFindingPerPeak;
/** v1.4.0: the 1H additive-rule layer and its bug fixes (see V12_CONFIG.useV140H1). Default off. */
export const v140H1Active = (): boolean => V12_CONFIG.useV140H1;
/** v1.4.1 stop 20: the candidate ledger reads the candidate SMILES as a SMILES (never as a molecular formula): THF, methanol, cyclopentane ... (a bug fix, d2e26e7). Own flag V12_CONFIG.v140.parseFix (default true since stop 21); it does not depend on useV140H1. */
export const v140ParseFixActive = (): boolean => V12_CONFIG.v140.parseFix;
/** v1.4.0 stop 4: the two rule groups under useV140H1 (V12_CONFIG.v140); each runs only while useV140H1 is on. */
export const v140AlkeneActive = (): boolean => v140H1Active() && V12_CONFIG.v140.alkene;
export const v140OxygenActive = (): boolean => v140H1Active() && V12_CONFIG.v140.oxygen;
/** v1.4.0 stop 8: matching-layer corrections (multiplicity families, integral scale over overlapped environments, pairing by H count, aromatic S/O without H). Needs useV140H1. */
export const v140MatchingActive = (): boolean => v140H1Active() && V12_CONFIG.v140.matching;
/** v1.4.0 stop 10: shift classes for the windows no class read, and the new 1H predictor rules (formyl on a heteroatom, aryl S-C-H, halomethanes). Needs useV140H1. */
export const v140CoverageActive = (): boolean => v140H1Active() && V12_CONFIG.v140.coverage;
/** v1.4.0 stop 12: solvent corrections by environment class. Needs useV140H1. */
export const v140SolventActive = (): boolean => v140H1Active() && V12_CONFIG.v140.solvent;
/** v1.4.0 stop 13: calibration of 1H classes on tier-2 / candidate data (leave-one-out rule, h1Calibration2.ts). Needs useV140H1. */
export const v140Calibration2Active = (): boolean => v140H1Active() && V12_CONFIG.v140.calibration2;
/** v1.4.1 stop 22: the third 1H round, first part (vinyl =CH2 pairs of sulfone / phosphonate / CH(OH)R, aromatic SH, cyclopropane / cyclobutane classes). Needs useV140H1; default off. */
export const v140Round3Active = (): boolean => v140H1Active() && V12_CONFIG.v140.round3;
/** v1.4.0 stop 9: the four ring-strain plausibility rules. Needs useV140H1. */
export const v140PlausibilityActive = (): boolean => v140H1Active() && V12_CONFIG.v140.plausibility;

/** v1.3.2 stop 6: window corrections (nitro symmetric band up to 1380 with the aliphatic / aromatic regime rule, C–O up to 1310, C=O up to 1810, trapezoid companion windows in the score). Off = the stop-4 behaviour. */
export const v132WindowsActive = (): boolean => v132Active() && V12_CONFIG.v132.windows;
/** v1.3.2 stop 4: aldehyde Fermi pair, terminal-vinyl 910/990 pair, nitro companion window (IR band knowledge). */
export const v132MultiBandActive = (): boolean => v132Active() && V12_CONFIG.v132.multiBand;
/** v1.4.1 (IR round 1): new IR evidence for the candidate score. Independent of the v1.2.1 - v1.3.2 gate chain (like v140H1Active); each group runs only while useV141IR and its own sub-flag are on. */
export const v141IRActive = (): boolean => V12_CONFIG.useV141IR;
export const v141RingCarbonylActive = (): boolean => v141IRActive() && V12_CONFIG.v141IR.ringCarbonyl;
export const v141AlkylBendActive = (): boolean => v141IRActive() && V12_CONFIG.v141IR.alkylBend;
export const v141EsterCOActive = (): boolean => v141IRActive() && V12_CONFIG.v141IR.esterCO;
export const v141Sp2CHActive = (): boolean => v141IRActive() && V12_CONFIG.v141IR.sp2CH;
/** v1.4.2 (IR round 2): new IR evidence for the candidate score. Independent of the gate chain AND of useV141IR; each part runs only while useV142IR and its own sub-flag are on (default: the parent is off). */
export const v142IRActive = (): boolean => V12_CONFIG.useV142IR;
export const v142AlkeneOOPActive = (): boolean => v142IRActive() && V12_CONFIG.v142IR.alkeneOOP;
/** stop 30: the negative-evidence rule of one group is on when useV142IR AND (negativeEvidence = "all three" OR the group's own sub-flag). */
export type V142NegRuleId = 'nitrile' | 'nitro' | 'alkyneCH';
const V142_NEG_FLAG = {nitrile: 'negNitrile', nitro: 'negNitro', alkyneCH: 'negAlkyne'} as const;
export const v142NegRuleActive = (id: V142NegRuleId): boolean => v142IRActive() && (V12_CONFIG.v142IR.negativeEvidence || V12_CONFIG.v142IR[V142_NEG_FLAG[id]]);
/** Any of the three negative-evidence rules on (with only the total sub-flag in use this is exactly the stop-25 meaning: useV142IR AND negativeEvidence). */
export const v142NegativeEvidenceActive = (): boolean => v142NegRuleActive('nitrile') || v142NegRuleActive('nitro') || v142NegRuleActive('alkyneCH');
/** v1.4.3: formula selection fixes in planFormulaSearch (V12_CONFIG.useV143Select). Planning is the only place the function runs, so it needs the v1.2.1 planning gate and the flag; false = v1.4.2. */
export const v143SelectActive = (): boolean => planningActive() && V12_CONFIG.useV143Select;
