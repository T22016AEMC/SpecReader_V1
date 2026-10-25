import type {PlausibilityEvidence} from '../scientificEngines/structurePlausibility';
import type {StrainProfile, StrainProfileId} from './enumerationConfig';

/** Element counts including hydrogen, e.g. {C:3,H:8,O:1}; or a formula string such as "C3H8O". */
export type FormulaInput = Record<string, number> | string;

export interface FragmentAtomSpec {
  element: string;
  /** Hydrogens already on this atom (default 0). */
  fixedH?: number;
  /** Formal charge (default 0). Only fragment atoms may be charged (e.g. nitro N+ / O−); free atoms are neutral. */
  charge?: number;
  /** Open atoms must be bound to new atoms until valence is full (no implicit H is added); closed atoms receive no new bond. */
  open?: boolean;
  /**
   * Flexible atom: its remaining valence (valence − bond-order sum inside the fragment, charge-adjusted) may be filled by
   * implicit hydrogens or by new bonds; the H count is not fixed (as for a free atom). `fixedH` must be 0/absent; an atom is
   * at most one of open / flex (neither = closed).
   */
  flex?: boolean;
  /**
   * v1.2: label of the signal group this atom belongs to. Atoms with the same label that are listed in `equivalentGroups` of the set
   * must be topologically equivalent in every output; atoms with the same group label and flags are interchangeable.
   */
  group?: string;
  /** v1.2: the atom must be aromatic in the sanitized RDKit molecule (checked at the leaf). */
  aromatic?: boolean;
  /** v1.2: none of the carbon atoms bound to this atom by a NEW bond may carry hydrogen (singlet rule). Pairs with such carbons are never generated. */
  noHCarbonNeighbors?: boolean;
  /**
   * v1.2 (vinyl CH / =CH2): the atom must carry exactly one double bond, to a CARBON, that is not aromatic in the sanitized molecule, and no
   * triple bond. The double-bond partner must be C (so C=O, C=N and N=O do not count); a double bond that RDKit perceives as aromatic does not count.
   */
  alkeneCH?: boolean;
}
export interface FragmentBondSpec {
  a: number;
  b: number;
  order: 1 | 2 | 3;
  /** Informational: the order given is the Kekulé order; RDKit decides aromaticity when the molecule is sanitized. */
  aromatic?: boolean;
}
export interface FragmentSpec {
  id: string;
  atoms: FragmentAtomSpec[];
  bonds: FragmentBondSpec[];
  /** Identical copies (default 1). Copies are interchangeable: swapping them never produces a second output. */
  count?: number;
}
/** One reading of the spectra: the fragments it requires. Each alternative set is enumerated on its own; results are united. */
export interface FragmentAlternativeSet {
  id: string;
  fragments: FragmentSpec[];
  /** v1.2: groups (FragmentAtomSpec.group) whose atoms must all lie in ONE automorphism orbit of the output molecule (exact check at the leaf). */
  equivalentGroups?: string[];
  /**
   * v1.2: substructures every output must contain at least `minMatches` times. Matches may overlap each other and the fragment atoms
   * (RDKit substructure matching has no "each atom once" rule).
   */
  required?: RequiredSubstructureSpec[];
  /**
   * v1.2: atoms of one pool (all atoms with this `group` label) whose hydrogens belong to several signals, not known per atom (aromatic CH of
   * the ring templates). Each demand is one signal that must be placed entirely inside ONE automorphism orbit of the pool; the remaining
   * atoms go to signals that need no equivalence. Satisfiable (exactly checked at the leaf) iff the demands can be packed into the orbits.
   */
  equivalencePools?: {group: string; demands: number[]}[];
}
export interface RequiredSubstructureSpec {id: string; smarts: string; minMatches?: number}
export interface EnumerationProgress {
  visited: number;
  candidates: number;
  elapsedMs: number;
  alternativeSetId: string;
}
export interface EnumerationBudget {
  timeMs?: number;
  maxStates?: number;
  maxCandidates?: number;
  shouldCancel?: () => boolean;
  onProgress?: (p: EnumerationProgress) => void;
}
export interface ForbiddenSpec {
  /** Existing plausibility gate (structurePlausibility.ts) with its evidence exceptions. Absent = rules off. */
  plausibility?: PlausibilityEvidence;
  /**
   * false: only the early-pruned (monotone) plausibility rules are applied inside the search (no O–O without a user formula, no N–O
   * without N–O evidence); the remaining rules are left to a downstream gate that records them. Default true (all rules at the leaf).
   */
  plausibilityLeaf?: boolean;
  /** Optional ring/bond strain rules: a profile id, an explicit profile, or absent/null = off. */
  strain?: StrainProfileId | StrainProfile | null;
}
export interface EnumerationRequest {
  formula: FormulaInput;
  /**
   * v1.2: lex-leader pruning between interchangeable single-atom fragments of identical signature (default true when the request uses
   * v1.2 features, off otherwise so the v1.1.8 search is unchanged). Never changes the output set, only the work.
   */
  symmetryPruning?: boolean;
  /** No alternative sets = pure formula enumeration (a single empty set). */
  alternatives?: FragmentAlternativeSet[];
  forbid?: ForbiddenSpec;
  budget?: EnumerationBudget;
}

export type EnumerationErrorCode =
  | 'INVALID_FORMULA'
  | 'UNSUPPORTED_ELEMENT'
  | 'UNSUPPORTED_CONFIG'
  | 'EMPTY_MOLECULE'
  | 'TOO_MANY_ATOMS'
  | 'DUPLICATE_FRAGMENT_ID'
  | 'INVALID_FRAGMENT'
  | 'INVALID_BOND'
  | 'FRAGMENT_OVERVALENT'
  | 'CLOSED_ATOM_UNSATURATED'
  | 'FORMULA_ELEMENT_SHORTAGE'
  | 'FORMULA_HYDROGEN_SHORTAGE'
  | 'FORMULA_HYDROGEN_EXCESS'
  | 'VALENCE_PARITY'
  | 'RDKIT_UNAVAILABLE';
export interface EnumerationError {
  code: EnumerationErrorCode;
  message: string;
  alternativeSetId?: string;
}
export type IncompleteReason =
  | 'TIME_BUDGET'
  | 'STATE_BUDGET'
  | 'CANDIDATE_LIMIT'
  | 'CANCELLED'
  | 'INVALID_ALTERNATIVE_SET'
  | 'ALTERNATIVE_SET_NOT_RUN'
  /** More readings of the evidence than `adapter.maxAlternativeSets`: only the first ones were enumerated. */
  | 'READINGS_TRUNCATED'
  /** v1.2: more 1H-inventory readings (or ring-pattern combinations) than the configured cap: only the best ones were enumerated. */
  | 'INVENTORY_ALTERNATIVES_TRUNCATED'
  /** v1.2: the aromatic CH of a reading cannot be explained by the ring-template library (furan, thiophene, pyrrole, > the ring limit, …). */
  | 'AROMATIC_TEMPLATE_LIMITED'
  /** v1.2 (D10): the 1H constraints could not be applied for this formula and the v1.1.7 flexible-atom path was used instead (never COMPLETE). */
  | 'V12_CONSTRAINTS_FALLBACK'
  /** v1.2: readings that contain a vinyl (alkene CH) reading did not finish within the budget; the readings without one did. */
  | 'VINYL_READINGS_BUDGET';
export interface RejectionStats {
  sanitizeFailed: number;
  duplicatesMerged: number;
  notConnected: number;
  forbiddenByRule: Record<string, number>;
  strainByRule: Record<string, number>;
  /** True when more rejected structures occurred than `maxTrackedRejected`; the by-rule counts may then count a structure twice. */
  approximate: boolean;
  /** v1.2 leaf checks: structures rejected by the aromatic / required-substructure / equivalence checks (absent when none ran). */
  v12?: {aromaticFailed: number; requiredFailed: number; equivalenceFailed: number; alkeneFailed: number; /** structures missing each required substructure (first one that failed) */ requiredById?: Record<string, number>};
}
export interface SetOutcome {
  id: string;
  /** Null when the set could not be expressed (see `error`) or was not run. */
  complete: boolean | null;
  error: EnumerationError | null;
  visited: number;
  leaves: number;
  newCandidates: number;
  incompleteReasons: IncompleteReason[];
}
export interface EnumeratedCandidate {
  /** RDKit canonical SMILES (no stereochemistry). */
  smiles: string;
  /** Alternative sets that produce this structure (in set order). */
  alternativeSetIds: string[];
}
export interface EnumerationResult {
  /**
   * COMPLETE: every branch of every alternative set was explored and no budget was hit (complete only relative to the
   * request's formula, fragments and forbid rules). INCOMPLETE: see `incompleteReasons`. INVALID_REQUEST: no set could be run.
   */
  status: 'COMPLETE' | 'INCOMPLETE' | 'INVALID_REQUEST';
  incompleteReasons: IncompleteReason[];
  candidates: EnumeratedCandidate[];
  errors: EnumerationError[];
  sets: SetOutcome[];
  stats: {visited: number; leaves: number; elapsedMs: number; rejected: RejectionStats; leafCost?: LeafCost};
}
/** Cost of the v1.2 leaf checks (measurement only). */
export interface LeafCost {
  /** Leaves that went through the v1.2 pipeline. */
  leaves: number;
  parseMs: number;
  checksMs: number;
  orbitChecks: number;
  orbitMs: number;
  requiredMatches: number;
  /** Orbit computations that hit the search-node safety limit (the equivalence check then excluded nothing). */
  orbitGiveUps?: number;
}

// ------------------------------------------------------------------------------------------------ stage 2 diagnostics
import type {AdaptedConversion} from './adapter';
/** What happened for one formula when the pipeline asked for structures. */
export interface EnumerationRunDiagnostic {
  /** false = the legacy beam search produced this run (see fallbackReason). */
  used: boolean;
  fallbackReason: string | null;
  formula: string | null;
  status: EnumerationResult['status'] | null;
  /** Complete relative to the constraints: readings that cannot hold the formula do not make a run incomplete. */
  complete: boolean;
  incompleteReasons: IncompleteReason[];
  readings: {id: string; localIds: string[]; complete: boolean | null; error: string | null; newCandidates: number}[];
  /** Readings (fragment sets) whose fragments cannot be placed in the formula (element/H shortage or parity). */
  incompatibleReadings: number;
  /** Distinct candidates before the scoring cap. */
  candidates: number;
  visited: number;
  leaves: number;
  elapsedMs: number;
  rejected: RejectionStats | null;
  /** Local structures that are in no reading (with the reason). */
  excludedLocals?: {localId: string; kind: string; reason: string}[];
  /** Every reading was complete but none holds a molecule with the formula: the run was relaxed to formula-only enumeration. */
  relaxedToFormulaOnly?: {candidates: number; complete: boolean};
  /** Candidates the bounded legacy beam search added after a budget-limited enumeration. */
  legacySupplement?: {candidates: number; added: number; visited: number};
  conversions: AdaptedConversion[];
  notes: string[];
  /** v1.2 constraint layer (absent unless useV12Constraints was on for this formula). */
  v12?: V12RunDiagnostic;
}
/** What the v1.2 layer did for one formula (panel data, stage 4). */
export interface V12RunDiagnostic {
  /** INVENTORY: the 1H atom inventory was enumerated; FLEX_NO_INTEGRALS: no integrals, v1.1.7 flexible-atom path with leaf substructure filters (D9); FALLBACK: D10, the inventory path produced nothing usable. */
  path: 'INVENTORY' | 'FLEX_NO_INTEGRALS' | 'FALLBACK';
  /** Badge text of the fallback ("1H 約束未能套用（已退回）"), else null. */
  badge: string | null;
  reason: string | null;
  inventory: {
    status: 'BUILT' | 'NOT_AVAILABLE'; reason: string | null; alternatives: number; truncated: boolean; patternSets: number; patternTruncated: boolean;
    incompleteReasons: string[]; ratioSum: number | null;
    combinations: {k: number; extraExchangeable: number; ratio: number[]}[];
    signals: {observationId: string; shiftPpm: number; relativeIntegral: number | null; ratio: number | null; multiplicity: string | null; broad: boolean; classes: string[]; singletRuleApplied: boolean; equivalenceRequired: boolean}[];
    voided: {kind: string; reason: string; count: number}[];
    aromaticLimited: {k: number; extraExchangeable: number; aromaticCh: number; reason: string}[];
    /** The first readings (at most 6), for the panel. */
    alternativesPreview: {
      id: string; k: number; extraExchangeable: number; hasVinyl: boolean; zeroHAtoms: Record<string, number>;
      groups: {observationId: string; shiftClasses: string[]; hTotal: number; atomCount: number; hPerAtom: number; element: string; aromatic: boolean; alkene: boolean; exchangeable: boolean; equivalent: boolean; singletRule: boolean}[];
      rings: {templateId: string; ch: number; patterns: number}[];
    }[];
  } | null;
  /** Constraints of the first runnable reading (null without one). */
  constraints: {pinnedAtoms: number; equivalentGroups: number; aromaticPools: number[]; singletGroups: number; alkeneGroups: number; strainProfile: string | null; symmetryPruning: boolean} | null;
  required: {id: string; smarts: string; label: string; evidenceObservationIds: string[]}[];
  /** One entry per (k, extra exchangeable H) of the inventory path. */
  runs: {k: number; extraExchangeable: number; alternatives: number; sets: number; complete: boolean | null; visited: number; leaves: number; candidates: number; incompleteReasons: IncompleteReason[]}[];
  leafCost: LeafCost | null;
}
export interface EnumerationDiagnostics {
  /** At least one run used the enumerator. */
  used: boolean;
  /** Every enumerator run is complete (legacy runs never count as complete). */
  complete: boolean;
  runs: EnumerationRunDiagnostic[];
  /** Distinct candidates enumerated over all runs. */
  enumerated: number;
  /** Candidates passed on to the full scoring. */
  scored: number;
  deferred: {count: number; samples: string[]; prefilter: {h1Required: number | null; c13Required: number | null; passing: number; failing: number} | null};
  maxScoredCandidates: number;
  /** Where each scored candidate came from (only present when the enumerator was involved). */
  origins?: Record<string, CandidateOrigin>;
}
export interface CandidateOrigin {
  /** ENUMERATOR: found by the exhaustive enumerator; LEGACY_SUPPLEMENT: added by the bounded legacy search after a budget-limited enumeration; LEGACY: the whole request fell back to the legacy search. */
  source: 'ENUMERATOR' | 'LEGACY_SUPPLEMENT' | 'LEGACY';
  /** The fragment readings contradicted the formula and the run was relaxed to formula-only enumeration. */
  relaxed: boolean;
  /** v1.2 (W7): the (k, extra exchangeable H) readings of the 1H inventory that produced this structure (merged, de-duplicated). */
  v12?: {k: number; extraExchangeable: number}[];
  /** v1.2 (D10): the structure came from the flexible-atom path because the 1H constraints could not be applied. */
  v12Fallback?: boolean;
}
