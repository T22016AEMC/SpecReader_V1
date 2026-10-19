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
 bounds:{carbon:[number,number|null]|null;hydrogenMultiples:number[]|null;heteroMinimums:ElementCounts;dbeMin:number;hardBoundsRelaxed:boolean};
 enumeration:{enumeratedNodes:number;passedHardFilters:number;returned:number;truncatedByNodes:boolean;droppedByKeepLimit:number};
 limitations:string[];
 elapsedMs:number;
}
