import type {ExtendedSpectrumModality,MSParameters,NMRSolvent} from '../../types/spectrum';
export type Support='SUPPORTED'|'POSSIBLE'|'UNKNOWN';
export interface ObservedEvidence {
 id:string;modality:ExtendedSpectrumModality;signalId:string;sourceId:string;
 value:number;unit:string;relativeIntensity:number|null;relativeIntegral:number|null;
 multiplicity:string|null;jHz:number[];shape:'BROAD'|'NARROW'|'UNKNOWN';
 uncertainty:number|null;origin:'MANUAL'|'EXTRACTED';userOverride:boolean;
 metadata:{solvent?:NMRSolvent;frequencyMHz?:number;temperatureK?:number;irScale?:string;mass?:MSParameters};
 coverage:'PARTIAL'|'CONFIRMED_COMPLETE';unknown:string[];
 /** Automatic solvent candidate: kept, but may stay unexplained without penalty (P1a). */
 optional?:boolean;
 /** v1.2: the user (or the existing classification) marked this 1H signal as exchangeable (OH/NH). */
 exchangeable?:boolean;
}
export type HypothesisKind='AROMATIC'|'ALKENE'|'ALKYNE'|'NITRILE'|'ALKYL'|'OXYGENATED'|'NITROGENATED'|'HYDROXYL'|'AMINO'|'CARBONYL'|'ETHYL'|'ARYL_PARA'|'ARYL_META'|'ARYL_ORTHO'|'ION'|'FRAGMENT'|'SURFACE';
export interface ChemicalHypothesis {
 id:string;kind:HypothesisKind;description:string;observationIds:string[];
 support:string[];uncertainties:string[];level:Support;
 alternativeIds:string[];compatibleIds:string[];conflictIds:string[];
 constraints:{elementPossibilities:string[];bondOrders:number[];aromatic?:boolean;relativeRatio?:number[];jHz?:number[];substitutionDistance?:number};
}
export interface LocalAtom {element:string}
export interface LocalBond {a:number;b:number;order:number}
export interface LocalStructureHypothesis {
 id:string;kind:HypothesisKind;description:string;atoms:LocalAtom[];bonds:LocalBond[];
 ports:{atom:number;availableValence:number}[];substitutionSites?:number[];
 hypothesisIds:string[];observationIds:string[];support:string[];unknown:string[];
 status:'LOCAL_HYPOTHESIS';constraintStrength:'SOFT';supportLevel:Support;
 relations:{otherId:string;kind:'SUPPORTED_CONNECTION'|'POSSIBLE_CONNECTION'|'EXCLUDED_BY_VALENCE'|'UNKNOWN';reason:string}[];
}
/** v1.2: where a candidate of the 1H-constraint layer came from (additive; absent for candidates of the v1.1.8 paths). */
export interface AssemblyV12 {
 path:'INVENTORY'|'FLEX_NO_INTEGRALS'|'FALLBACK';
 /** INVENTORY: the atom-inventory reading, its (k, extra exchangeable H) and the groups of atoms it stands for. */
 inventoryAlternativeIds?:string[];
 k?:number;extraExchangeable?:number;ratio?:number[];patternLabel?:string;
 signals?:{shiftPpm:number;hTotal:number;atomCount:number;hPerAtom:number;element:string;kind:'AROMATIC'|'ALKENE'|'EXCHANGEABLE'|'SP3';equivalent:boolean;singlet:boolean}[];
 /** Required substructures that held for this candidate. */
 required:{id:string;label:string}[];
 /** Leaf checks the candidate passed. */
 leafChecks:('AROMATIC'|'REQUIRED'|'EQUIVALENCE'|'ALKENE'|'STRAIN')[];
 /** FALLBACK: why the 1H constraints could not be applied. */
 fallbackReason?:string;
}
export interface AssemblyDerivation {localStructureIds:string[];operations:string[];observationIds:string[];v12?:AssemblyV12}
export interface ReasoningPlan {observations:ObservedEvidence[];hypotheses:ChemicalHypothesis[];localStructures:LocalStructureHypothesis[];userFormula:string|null;unknown:string[];
 /** Competing formula hypotheses (P1a); not a trace stage, so the six-stage contract is unchanged. */
 composition?:import('../composition/types').CompositionInferenceResult;
 /** N-specific evidence (v1.1.6); 'NONE' removes N from hypotheses, fragments, formulas and the search alphabet. */
 nitrogenEvidence?:import('../composition/nitrogenEvidence').NitrogenEvidence;
 compositionSearch?:{mode:'USER_FORMULA'|'COMPOSITION_HYPOTHESES'|'NO_FORMULA';note:string|null;runs:import('../composition/structureGenerator').CompositionSearchRun[]};
}
export interface CandidateReasoning {
 candidateId:string;smiles:string;formula:string;localStructureIds:string[];
 assembly:AssemblyDerivation|null;hypothesisIds:string[];
 /** Composition hypotheses whose formula search produced this candidate (P1a). */
 compositionHypothesisIds?:string[];
 evidence:{observationIds:string[];modality:string;status:'SUPPORT'|'CONTRADICTION'|'UNKNOWN';method:string}[];
 limitations:string[];
}
export interface ReasoningTrace extends ReasoningPlan {
 stages:{step:number;module:string;inputIds:string[];outputIds:string[];summary:string}[];
 candidates:CandidateReasoning[];
 computation:'LOCAL_DETERMINISTIC';
}
export interface AnalysisProgress {step:number;stage:string;visited?:number;candidateCount?:number;elapsedMs?:number;termination?:string;localStructures?:LocalStructureHypothesis[]}
