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
}
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
  /** Optional ring/bond strain rules: a profile id, an explicit profile, or absent/null = off. */
  strain?: StrainProfileId | StrainProfile | null;
}
export interface EnumerationRequest {
  formula: FormulaInput;
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
  | 'ALTERNATIVE_SET_NOT_RUN';
export interface RejectionStats {
  sanitizeFailed: number;
  duplicatesMerged: number;
  notConnected: number;
  forbiddenByRule: Record<string, number>;
  strainByRule: Record<string, number>;
  /** True when more rejected structures occurred than `maxTrackedRejected`; the by-rule counts may then count a structure twice. */
  approximate: boolean;
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
  stats: {visited: number; leaves: number; elapsedMs: number; rejected: RejectionStats};
}
