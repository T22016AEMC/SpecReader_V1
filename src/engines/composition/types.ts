import type {IonAdduct} from '../scientificEngines/ionMass';

export const COMPOSITION_ELEMENTS=['C','H','N','O','S','P','F','Cl','Br','I','Si'] as const;
export type CompositionElement=(typeof COMPOSITION_ELEMENTS)[number];
export type ElementCounts=Partial<Record<CompositionElement,number>>;
export type MassBasis='USER_FORMULA'|'HRMS'|'LOW_RES_MS'|'NONE';
/** Elements the current structure generator (deNovoGraphSearch) can build. P1b replaces the generator. */
export const GENERATOR_ELEMENTS:readonly CompositionElement[]=['C','H','N','O','F','Cl','Br'];

export interface CompositionReason {
 text:string;
 /** ObservedEvidence ids (`${modality}:${sourceId}:${x}`). */
 observationIds:string[];
 source:'MS'|'MS_ISOTOPE'|'13C_NMR'|'1H_NMR'|'IR'|'HYPOTHESIS'|'USER'|'RULE';
 strength:'HARD'|'SOFT';
}
export interface IonHypothesis {
 id:string;
 observationId:string;
 observedMz:number;
 adduct:IonAdduct;
 charge:number;
 neutralMass:number;
 toleranceDa:number;
 highResolution:boolean;
 confirmedByUser:boolean;
 /** Log-compatibility prior of this ion assignment (0 = confirmed). */
 prior:number;
 rejected:boolean;
 rejectionReason:string|null;
}
export interface CompositionHypothesis {
 id:string;
 formula:string;
 counts:ElementCounts;
 dbe:number;
 monoisotopicMass:number;
 massBasis:MassBasis;
 ionHypothesisId:string|null;
 massErrorDa:number|null;
 massErrorPpm:number|null;
 /** Softmax over all returned hypotheses; uncalibrated. */
 relativeConfidence:number;
 calibrated:false;
 /** Sum of log-compatibility terms (debugging aid). */
 score:number;
 support:CompositionReason[];
 contradiction:CompositionReason[];
 unknown:CompositionReason[];
 generatorSupported:boolean;
 unsupportedElements:CompositionElement[];
 searched:boolean;
 sizeConfirmed:boolean;
 /** k of the symmetric-unit hypothesis: total H ≈ k·S (simplest 1H ratio); null without 1H integrals (v1.1.6). */
 symmetryMultiple:number|null;
 /** v1.2.1: where this formula stands in the planned search (only set when useV121Planning planned the search). */
 searchPlan?:FormulaSearchPlan;
}
export type NotSearchedReason='OXYGEN_OUTSIDE_RANGE'|'OXYGEN_VARIANT_LIMIT'|'K_ROUND_ROBIN_FULL'|'H1_INFEASIBLE'|'UNSUPPORTED_ELEMENT'|'BUDGET_NOT_REACHED';
export interface FormulaSearchPlan {
 status:'ROUND_1'|'ROUND_2'|'NOT_SEARCHED';
 /** Position in the k round-robin search order (1-based); null when not searched. */
 order:number|null;
 reason?:NotSearchedReason;
 /** Panel wording of the reason, e.g. 同骨架 O 變體超過保留數. */
 reasonText?:string;
}
/** The lowest O count the IR/1H evidence supports and the bands it comes from (range-matched IR findings are not counted). */
export interface OxygenEvidenceFloor {
 floor:number;
 sources:{text:string;observationIds:string[]}[];
}
/** Element-presence clue from IR/NMR/MS evidence, reported even when no formula can be enumerated. */
export interface ElementClue {
 element:CompositionElement;
 minimum:number;
 strength:'HARD'|'SOFT';
 text:string;
 observationIds:string[];
 source:CompositionReason['source'];
}
export interface CompositionInferenceResult {
 status:'USER_FORMULA'|'INFERRED'|'INSUFFICIENT_DATA'|'INVALID_USER_FORMULA';
 hypotheses:CompositionHypothesis[];
 ionHypotheses:IonHypothesis[];
 elementsConsidered:CompositionElement[];
 elementsExcluded:{element:CompositionElement;reason:string}[];
 /** Element minima suggested by functional groups and element evidence; present for every status (planner reply 4). */
 elementClues:ElementClue[];
 /** N-specific evidence used for gating (v1.1.6). */
 nitrogenEvidence:import('./nitrogenEvidence').NitrogenEvidence;
 bounds:{carbon:[number,number|null]|null;hydrogenMultiples:number[]|null;heteroMinimums:ElementCounts;dbeMin:number;hardBoundsRelaxed:boolean};
 enumeration:{enumeratedNodes:number;passedHardFilters:number;returned:number;truncatedByNodes:boolean;droppedByKeepLimit:number};
 limitations:string[];
 elapsedMs:number;
 /** v1.2.1 (present only when useV121Planning was on): the O evidence floor (null without IR/1H O evidence basis) and the S decision. */
 v121?:{oxygenFloor:OxygenEvidenceFloor|null;sulfurConsidered:boolean};
}
