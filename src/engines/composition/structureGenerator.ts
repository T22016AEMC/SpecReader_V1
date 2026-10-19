import {searchMolecularGraphsAsync,type DeNovoSearchResult,type GraphSearchHints,type GraphSearchProgress,type SearchTermination} from '../scientificEngines/deNovoGraphSearch';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {CompositionInferenceResult} from './types';

export interface StructureGenerationBudget {
 timeMs:number;maxStates:number;maxResults:number;maxFrontier:number;beamWidth:number;
 shouldCancel?:()=>boolean;onProgress?:(p:GraphSearchProgress)=>void;
}
export interface StructureGenerationRequest {formula:string|undefined;hints:GraphSearchHints;budget:StructureGenerationBudget}
/** Generator-independent contract. P1a: deNovoGraphSearch. P1b swaps in the exhaustive enumerator behind the same interface. */
export interface StructureGenerator {generateStructures(request:StructureGenerationRequest):Promise<DeNovoSearchResult>}

export const deNovoStructureGenerator:StructureGenerator={
 generateStructures:({formula,hints,budget})=>searchMolecularGraphsAsync(formula,{hints,timeMs:budget.timeMs,maxStates:budget.maxStates,maxResults:budget.maxResults,maxFrontier:budget.maxFrontier,beamWidth:budget.beamWidth,shouldCancel:budget.shouldCancel,onProgress:budget.onProgress}),
};

export interface CompositionSearchRun {hypothesisId:string|null;formula:string|undefined;maxStates:number;timeMs:number;visited:number;elapsedMs:number;termination:SearchTermination;candidates:number}
export interface CompositionSearchOutcome {
 search:DeNovoSearchResult;
 runs:CompositionSearchRun[];
 mode:'USER_FORMULA'|'COMPOSITION_HYPOTHESES'|'NO_FORMULA';
 note:string|null;
}
/** Severity order used when several runs are merged: the least complete termination wins. */
const SEVERITY:SearchTermination[]=['EXECUTION_ERROR','CANCELLED','UNAVAILABLE','TIME_BUDGET','STATE_BUDGET','OUTPUT_BUDGET','BEAM_PRUNED','INSUFFICIENT_CONSTRAINTS','UNSUPPORTED_CHEMISTRY','INVALID_COMPOSITION','GRAMMAR_EXHAUSTED'];

/**
 * Bridge between composition hypotheses and the structure generator.
 * - user formula: one run with the full budget (unchanged behaviour);
 * - composition hypotheses: the best `topFormulasToSearch` generator-supported formulas, each with
 *   `maxResultsPerFormula` outputs; total states and time never exceed the original budget, unused budget carries over;
 * - otherwise: the original no-formula run.
 */
export async function generateForCompositions(args:{userFormula:string|null;composition:CompositionInferenceResult|null;hints:GraphSearchHints;budget:StructureGenerationBudget;generator?:StructureGenerator}):Promise<CompositionSearchOutcome> {
 const generator=args.generator??deNovoStructureGenerator,budget=args.budget;
 const single=async(formula:string|undefined,hypothesisId:string|null,mode:CompositionSearchOutcome['mode'],note:string|null):Promise<CompositionSearchOutcome>=>{
  const search=await generator.generateStructures({formula,hints:args.hints,budget});
  if(hypothesisId)search.formulaSources=Object.fromEntries(search.smiles.map(s=>[s,[hypothesisId]]));
  return {search,mode,note,runs:[{hypothesisId,formula,maxStates:budget.maxStates,timeMs:budget.timeMs,visited:search.visited,elapsedMs:search.elapsedMs??0,termination:search.termination,candidates:search.smiles.length}]};
 };
 if(args.userFormula){
  const id=args.composition?.status==='USER_FORMULA'?args.composition.hypotheses[0]?.id??null:null;
  return single(args.userFormula,id,'USER_FORMULA',null);
 }
 const supported=(args.composition?.status==='INFERRED'?args.composition.hypotheses:[]).filter(h=>h.generatorSupported);
 const chosen=supported.slice(0,CFG.topFormulasToSearch);
 if(!chosen.length){
  const note=args.composition?.status==='INFERRED'&&args.composition.hypotheses.length?'組成假設都含目前生成器不支援的元素，改用無分子式搜尋。':null;
  return single(undefined,null,'NO_FORMULA',note);
 }
 const runs:CompositionSearchRun[]=[];
 const merged:DeNovoSearchResult={smiles:[],status:'BOUNDED',visited:0,note:'',termination:'GRAMMAR_EXHAUSTED',complete:true,partialHypotheses:[],rejectedByComposition:0,derivations:{},formulaSources:{},elapsedMs:0,frontierPeak:0};
 let usedStates=0,usedTime=0;
 for(let i=0;i<chosen.length;i++){
  const h=chosen[i],left=chosen.length-i;
  const maxStates=Math.max(0,Math.floor((budget.maxStates-usedStates)/left)),timeMs=Math.max(0,(budget.timeMs-usedTime)/left);
  const offset=usedStates;
  const search=await generator.generateStructures({formula:h.formula,hints:args.hints,budget:{...budget,maxStates,timeMs,maxResults:CFG.maxResultsPerFormula,onProgress:budget.onProgress?p=>budget.onProgress!({...p,visited:offset+p.visited}):undefined}});
  h.searched=true;
  usedStates+=Math.min(search.visited,maxStates);usedTime+=Math.min(search.elapsedMs??timeMs,timeMs);
  runs.push({hypothesisId:h.id,formula:h.formula,maxStates,timeMs,visited:search.visited,elapsedMs:search.elapsedMs??0,termination:search.termination,candidates:search.smiles.length});
  for(const s of search.smiles){
   if(!merged.formulaSources![s]){merged.smiles.push(s);merged.formulaSources![s]=[];}
   merged.formulaSources![s].push(h.id);
   if(search.derivations?.[s]&&!merged.derivations![s])merged.derivations![s]=search.derivations[s];
  }
  merged.visited+=search.visited;merged.elapsedMs=(merged.elapsedMs??0)+(search.elapsedMs??0);merged.frontierPeak=Math.max(merged.frontierPeak??0,search.frontierPeak??0);
  merged.rejectedByComposition+=search.rejectedByComposition;merged.complete&&=search.complete;
  for(const p of search.partialHypotheses)if(!merged.partialHypotheses.includes(p))merged.partialHypotheses.push(p);
  if(SEVERITY.indexOf(search.termination)<SEVERITY.indexOf(merged.termination))merged.termination=search.termination;
  if(search.status!=='BOUNDED')merged.status=search.status;
  if(search.error&&!merged.error)merged.error=search.error;
  if(search.termination==='CANCELLED')break;
 }
 merged.note=`組成假設導引搜尋：${runs.map(r=>`${r.formula} ${r.visited} states／${r.termination}／${r.candidates} 個`).join('；')}。合計 ${merged.smiles.length} 個去重候選；總預算 ${budget.maxStates} 狀態／${budget.timeMs} ms 依序分配。`;
 return {search:merged,runs,mode:'COMPOSITION_HYPOTHESES',note:null};
}
