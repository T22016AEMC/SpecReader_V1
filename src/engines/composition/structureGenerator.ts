import {searchMolecularGraphsAsync,type DeNovoSearchResult,type GraphSearchHints,type GraphSearchProgress,type SearchTermination} from '../scientificEngines/deNovoGraphSearch';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {CompositionHypothesis,CompositionInferenceResult} from './types';
import type {LocalStructureHypothesis} from '../reasoning/types';
import {parseCounts} from './goldenRules';

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

/** Symmetric-unit hypothesis passed to the generator (v1.1.6): the unit's local structures copied k times. */
export interface SymmetryUnitRun {
 k:number;
 unitIds:string[];
 /** k × unit fragments; copy 1 keeps the original ids, copies 2…k get `#j` suffixes (ids and observation ids). */
 requiredFragmentIds:string[];
 requiredHeavyAtoms:number;
 formulaHeavyAtoms:number|null;
 /** Candidates whose assembly derivation used every required fragment (checked after the search; nothing is filtered). */
 candidatesContainingAllCopies:number;
}
export interface CompositionSearchRun {hypothesisId:string|null;formula:string|undefined;maxStates:number;timeMs:number;visited:number;elapsedMs:number;termination:SearchTermination;candidates:number;symmetry:SymmetryUnitRun|null;diagnostic:string|null}

/** One representative local structure per observation group (competing readings of the same signals share a group). */
export function symmetricUnit(locals:LocalStructureHypothesis[]):LocalStructureHypothesis[] {
 const groups=new Map<string,LocalStructureHypothesis>();
 for(const l of locals){
  const key=[...l.observationIds].sort().join('|');
  const old=groups.get(key);
  if(!old||(old.supportLevel!=='SUPPORTED'&&l.supportLevel==='SUPPORTED'))groups.set(key,l);
 }
 return [...groups.values()];
}
/** Copies 2…k of the unit with distinct ids and observation ids, so the generator may join every copy. */
export function replicateUnit(unit:LocalStructureHypothesis[],k:number):{copies:LocalStructureHypothesis[];requiredIds:string[]} {
 const copies:LocalStructureHypothesis[]=[];
 for(let j=2;j<=k;j++)for(const l of unit)copies.push({...l,id:`${l.id}#${j}`,observationIds:l.observationIds.map(o=>`${o}#${j}`),relations:[]});
 return {copies,requiredIds:[...unit.map(l=>l.id),...copies.map(c=>c.id)]};
}
const heavyAtoms=(formula:string|undefined)=>{const c=formula?parseCounts(formula):null;return c?Object.entries(c).reduce((s,[e,v])=>s+(e==='H'?0:v??0),0):null;};
function prepareSymmetry(h:CompositionHypothesis|null,formula:string|undefined,hints:GraphSearchHints):{hints:GraphSearchHints;symmetry:SymmetryUnitRun|null} {
 const k=h?.symmetryMultiple??null,locals=hints.localStructures??[];
 if(!k||k<2||!locals.length)return {hints,symmetry:null};
 const unit=symmetricUnit(locals),{copies,requiredIds}=replicateUnit(unit,k);
 const unitAtoms=unit.reduce((s,l)=>s+l.atoms.length,0);
 return {hints:{...hints,localStructures:[...locals,...copies]},symmetry:{k,unitIds:unit.map(l=>l.id),requiredFragmentIds:requiredIds,requiredHeavyAtoms:unitAtoms*k,formulaHeavyAtoms:heavyAtoms(formula),candidatesContainingAllCopies:0}};
}
function finishRun(run:CompositionSearchRun,search:DeNovoSearchResult):CompositionSearchRun {
 const sym=run.symmetry;
 if(sym)sym.candidatesContainingAllCopies=search.smiles.filter(s=>sym.requiredFragmentIds.every(id=>search.derivations?.[s]?.localStructureIds.includes(id))).length;
 const reasons:string[]=[];
 if(!search.smiles.length){
  if(sym&&sym.formulaHeavyAtoms!==null&&sym.requiredHeavyAtoms>sym.formulaHeavyAtoms)reasons.push(`對稱單元 ×${sym.k} 需要 ${sym.requiredHeavyAtoms} 個重原子，超過分子式 ${run.formula} 的 ${sym.formulaHeavyAtoms} 個`);
  reasons.push(`搜尋在 ${search.visited} 個狀態以 ${search.termination} 結束，沒有產生候選${search.error?`（錯誤：${search.error}）`:''}`);
  if(sym)reasons.push(`已傳入 ${sym.requiredFragmentIds.length} 個必要片段（單元 ${sym.unitIds.length} 個 × ${sym.k}）；舊 beam 搜尋對大分子可能無法完成組裝，完整窮舉留待 v1.1.7（P1b）`);
 }else if(sym&&!sym.candidatesContainingAllCopies)reasons.push(`${search.smiles.length} 個候選都沒有用到全部 ${sym.requiredFragmentIds.length} 個對稱單元片段（只檢查、未過濾）`);
 return {...run,diagnostic:reasons.length?reasons.join('；'):null};
}
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
 const single=async(formula:string|undefined,h:CompositionHypothesis|null,mode:CompositionSearchOutcome['mode'],note:string|null):Promise<CompositionSearchOutcome>=>{
  const prepared=prepareSymmetry(h,formula,args.hints);
  const search=await generator.generateStructures({formula,hints:prepared.hints,budget});
  if(h)search.formulaSources=Object.fromEntries(search.smiles.map(s=>[s,[h.id]]));
  const run=finishRun({hypothesisId:h?.id??null,formula,maxStates:budget.maxStates,timeMs:budget.timeMs,visited:search.visited,elapsedMs:search.elapsedMs??0,termination:search.termination,candidates:search.smiles.length,symmetry:prepared.symmetry,diagnostic:null},search);
  return {search,mode,note:[note,run.diagnostic].filter(Boolean).join('；')||null,runs:[run]};
 };
 if(args.userFormula){
  const h=args.composition?.status==='USER_FORMULA'?args.composition.hypotheses[0]??null:null;
  return single(args.userFormula,h,'USER_FORMULA',null);
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
  const prepared=prepareSymmetry(h,h.formula,args.hints);
  const search=await generator.generateStructures({formula:h.formula,hints:prepared.hints,budget:{...budget,maxStates,timeMs,maxResults:CFG.maxResultsPerFormula,onProgress:budget.onProgress?p=>budget.onProgress!({...p,visited:offset+p.visited}):undefined}});
  h.searched=true;
  usedStates+=Math.min(search.visited,maxStates);usedTime+=Math.min(search.elapsedMs??timeMs,timeMs);
  runs.push(finishRun({hypothesisId:h.id,formula:h.formula,maxStates,timeMs,visited:search.visited,elapsedMs:search.elapsedMs??0,termination:search.termination,candidates:search.smiles.length,symmetry:prepared.symmetry,diagnostic:null},search));
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
 const diagnostics=runs.filter(r=>r.diagnostic).map(r=>`${r.formula}：${r.diagnostic}`);
 return {search:merged,runs,mode:'COMPOSITION_HYPOTHESES',note:merged.smiles.length?(diagnostics.length?diagnostics.join('；'):null):`所有分子式假設都沒有產生候選。${diagnostics.join('；')}`};
}
