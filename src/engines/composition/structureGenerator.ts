import {searchMolecularGraphsAsync,type DeNovoSearchResult,type GraphSearchHints,type GraphSearchProgress,type SearchTermination} from '../scientificEngines/deNovoGraphSearch';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {CompositionHypothesis,CompositionInferenceResult} from './types';
import type {LocalStructureHypothesis} from '../reasoning/types';
import {parseCounts} from './goldenRules';
import {ENUMERATION_CONFIG as ENUM} from '../enumeration/enumerationConfig';
import {createExhaustiveGenerator} from '../enumeration/exhaustiveGenerator';
import {capScored,deferredSamples,topologyClasses} from '../enumeration/prefilter';
import {planFormulaSearch} from './searchPlanning';
import {planningActive} from './planningGate';
import {V12_CONFIG} from '../constraints/v12Config';
import type {EnumerationDiagnostics,EnumerationRunDiagnostic,IncompleteReason,RejectionStats} from '../enumeration/types';
import type {PlausibilityEvidence} from '../scientificEngines/structurePlausibility';
import type {V12Evidence} from '../constraints/v12Evidence';

export interface StructureGenerationBudget {
 timeMs:number;maxStates:number;maxResults:number;maxFrontier:number;beamWidth:number;
 shouldCancel?:()=>boolean;onProgress?:(p:GraphSearchProgress)=>void;
}
export interface StructureGenerationRequest {formula:string|undefined;hints:GraphSearchHints;budget:StructureGenerationBudget;
 /** P1b (ignored by the legacy generator): hints without symmetric-unit copies, the unit multiple k, plausibility evidence and the enumeration budget. */
 unprepared?:GraphSearchHints;symmetryMultiple?:number|null;plausibility?:PlausibilityEvidence;
 enumerationBudget?:{timeMs:number;maxStates:number;maxCandidates?:number};
 /** v1.2 (only read when useV12Constraints is on): observations and facts the 1H-constraint layer needs. */
 constraintEvidence?:V12Evidence;
 /** v1.2.1 (useV121Planning): one round of the two-round search; round 1 = readings without an alkene CH under `maxStates`, no fallback; round 2 = the alkene readings. */
 planning?:{round:1|2;maxStates?:number};
 /** The caller limited time/states explicitly: enumeration and any legacy fallback draw on one pool, so total work stays within the caller limit. */
 sharedPool?:boolean}
/** Generator-independent contract. P1a: deNovoGraphSearch. P1b swaps in the exhaustive enumerator behind the same interface. */
export interface StructureGenerator {generateStructures(request:StructureGenerationRequest):Promise<DeNovoSearchResult>}

export const deNovoStructureGenerator:StructureGenerator={
 generateStructures:({formula,hints,budget})=>searchMolecularGraphsAsync(formula,{hints,timeMs:budget.timeMs,maxStates:budget.maxStates,maxResults:budget.maxResults,maxFrontier:budget.maxFrontier,beamWidth:budget.beamWidth,shouldCancel:budget.shouldCancel,onProgress:budget.onProgress}),
};

/** Symmetric-unit hypothesis passed to the generator (v1.1.6): the unit's local structures copied k times. */
/** The exhaustive generator (P1b); falls back to the legacy beam search for requests it cannot express, with the reason recorded. */
export const exhaustiveStructureGenerator:StructureGenerator=createExhaustiveGenerator(deNovoStructureGenerator);

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
export interface CompositionSearchRun {hypothesisId:string|null;formula:string|undefined;maxStates:number;timeMs:number;visited:number;elapsedMs:number;termination:SearchTermination;candidates:number;symmetry:SymmetryUnitRun|null;diagnostic:string|null;
 /** P1b: what the exhaustive enumerator did for this formula (absent for injected/legacy generators). */
 enumeration?:EnumerationRunDiagnostic}

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
 const enumRun=search.enumeration?.runs[0];
 if(enumRun?.used){
  // The enumerator builds the symmetric unit into every candidate (count = k); nothing is checked after the fact.
  if(run.symmetry)run.symmetry.candidatesContainingAllCopies=search.smiles.length;
  const reasons:string[]=[];
  if(!search.smiles.length)reasons.push(`窮舉${enumRun.complete?'完整走完（COMPLETE）':'未完整（INCOMPLETE）'}，在此分子式與片段約束下沒有任何候選${enumRun.incompatibleReadings?`；${enumRun.incompatibleReadings}/${enumRun.readings.length} 個片段讀法與分子式不相容`:''}`);
  return {...run,enumeration:enumRun,diagnostic:reasons.length?reasons.join('；'):null};
 }
 if(enumRun)run={...run,enumeration:enumRun};
 const sym=run.symmetry;
 if(sym)sym.candidatesContainingAllCopies=search.smiles.filter(s=>sym.requiredFragmentIds.every(id=>search.derivations?.[s]?.localStructureIds.includes(id))).length;
 const reasons:string[]=[];
 if(!search.smiles.length){
  if(sym&&sym.formulaHeavyAtoms!==null&&sym.requiredHeavyAtoms>sym.formulaHeavyAtoms)reasons.push(`對稱單元 ×${sym.k} 需要 ${sym.requiredHeavyAtoms} 個重原子，超過分子式 ${run.formula} 的 ${sym.formulaHeavyAtoms} 個`);
  reasons.push(`搜尋在 ${search.visited} 個狀態以 ${search.termination} 結束，沒有產生候選${search.error?`（錯誤：${search.error}）`:''}`);
  if(sym)reasons.push(`已傳入 ${sym.requiredFragmentIds.length} 個必要片段（單元 ${sym.unitIds.length} 個 × ${sym.k}）；舊 beam 搜尋對大分子可能無法完成組裝，完整窮舉留待 v1.1.7（P1b）`);
 }else if(sym&&!sym.candidatesContainingAllCopies)reasons.push(`${search.smiles.length} 個候選都沒有用到全部 ${sym.requiredFragmentIds.length} 個對稱單元片段（只檢查、未過濾）`);
 return {...run,diagnostic:reasons.length?(enumRun?`${enumRun.fallbackReason}；`:'')+reasons.join('；'):(enumRun?enumRun.fallbackReason:null)};
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
export async function generateForCompositions(args:{userFormula:string|null;composition:CompositionInferenceResult|null;hints:GraphSearchHints;budget:StructureGenerationBudget;generator?:StructureGenerator;
 /** P1b: plausibility evidence and the enumerator's own budget (the legacy `budget` stays the budget of the legacy search). */
 plausibility?:PlausibilityEvidence;enumerationBudget?:{timeMs:number;maxStates:number;maxCandidates?:number};sharedPool?:boolean;
 /** v1.2: evidence for the 1H-constraint layer (ignored unless useV12Constraints is on). */
 constraintEvidence?:V12Evidence}):Promise<CompositionSearchOutcome> {
 const useExhaustive=!args.generator&&ENUM.useExhaustiveEnumerator;
 const generator=args.generator??(useExhaustive?exhaustiveStructureGenerator:deNovoStructureGenerator),budget=args.budget;
 const eBudget=args.enumerationBudget??{timeMs:ENUM.analysis.timeMs,maxStates:ENUM.analysis.maxStates,maxCandidates:ENUM.analysis.maxCandidatesPerFormula};
 /** Scoring cap (P1b): only for runs the enumerator produced; the rest is kept, listed and not scored. */
 const capSearch=(search:DeNovoSearchResult):DeNovoSearchResult=>{
  if(!search.enumeration?.used)return search;
  const cap=capScored(search.smiles,{h1:args.hints.observedH1Signals,c13:args.hints.observedC13Signals},ENUM.analysis.maxScoredCandidates,args.plausibility);
  const og=search.enumeration.origins;
  const origins=og?Object.fromEntries(cap.scored.filter(s=>og[s]).map(s=>[s,og[s]])):undefined;
  const enumeration:EnumerationDiagnostics={...search.enumeration,enumerated:search.smiles.length,scored:cap.scored.length,deferred:{count:cap.deferred.length,samples:deferredSamples(cap.deferred),prefilter:cap.prefilter},...(origins?{origins}:{})};
  return {...search,smiles:cap.scored,enumeration,note:search.note+(cap.deferred.length?`；超過評分上限 ${ENUM.analysis.maxScoredCandidates}，${cap.deferred.length} 個候選保留但不進入完整評分`:'')};
 };
 const single=async(formula:string|undefined,h:CompositionHypothesis|null,mode:CompositionSearchOutcome['mode'],note:string|null):Promise<CompositionSearchOutcome>=>{
  const prepared=prepareSymmetry(h,formula,args.hints);
  const search=capSearch(await generator.generateStructures({formula,hints:prepared.hints,budget,unprepared:args.hints,symmetryMultiple:h?.symmetryMultiple??null,plausibility:args.plausibility,enumerationBudget:eBudget,sharedPool:args.sharedPool,constraintEvidence:args.constraintEvidence}));
  if(h)search.formulaSources=Object.fromEntries(search.smiles.map(s=>[s,[h.id]]));
  const run=finishRun({hypothesisId:h?.id??null,formula,maxStates:budget.maxStates,timeMs:budget.timeMs,visited:search.visited,elapsedMs:search.elapsedMs??0,termination:search.termination,candidates:search.smiles.length,symmetry:prepared.symmetry,diagnostic:null},search);
  return {search,mode,note:[note,run.diagnostic].filter(Boolean).join('；')||null,runs:[run]};
 };
 if(args.userFormula){
  const h=args.composition?.status==='USER_FORMULA'?args.composition.hypotheses[0]??null:null;
  return single(args.userFormula,h,'USER_FORMULA',null);
 }
 const supported=(args.composition?.status==='INFERRED'?args.composition.hypotheses:[]).filter(h=>h.generatorSupported);
 /**
  * v1.2.1 planned search of the no-formula, no-mass route. Returns null when the plan has no formula to search (the v1.2.0 search then runs).
  * Budget: the enumeration pool (`eBudget`: steps and wall clock) is the only budget; round 1 takes at most `round1MaxStatesPerFormula` steps per formula and
  * `round1TimeFraction` of the clock; round 2 divides what is left equally among its formulas. The clock stays the last safety valve (TIME_BUDGET is reported, never hidden).
  */
 const plannedSearch=async():Promise<CompositionSearchOutcome|null>=>{
  const P=V12_CONFIG.planning,hyps=args.composition!.hypotheses,started=performance.now();
  const plan=planFormulaSearch(hyps,args.composition!.v121?.oxygenFloor??null,args.constraintEvidence!);
  if(!plan.chosen.length)return null;
  for(const h of hyps)delete h.searchPlan;
  for(const [id,ns] of plan.notSearched){const h=hyps.find(x=>x.id===id);if(h)h.searchPlan={status:'NOT_SEARCHED',order:null,reason:ns.reason,reasonText:ns.text};}
  const entries=plan.chosen.map(p=>({p,h:p.hypothesis,prepared:prepareSymmetry(p.hypothesis,p.hypothesis.formula,args.hints),search:null as DeNovoSearchResult|null,round2:false}));
  let usedStates=0,round1Ms=0,cancelled=false;
  const call=(e:(typeof entries)[number],round:1|2,maxStates:number,timeMs:number,cap?:number)=>generator.generateStructures({formula:e.h.formula,hints:e.prepared.hints,budget:{...budget,maxStates,timeMs,maxResults:CFG.maxResultsPerFormula,onProgress:budget.onProgress?p=>budget.onProgress!({...p,visited:usedStates+p.visited}):undefined},unprepared:args.hints,symmetryMultiple:e.h.symmetryMultiple,plausibility:args.plausibility,
   enumerationBudget:{timeMs,maxStates,maxCandidates:eBudget.maxCandidates},sharedPool:args.sharedPool,constraintEvidence:args.constraintEvidence,planning:{round,...(cap!==undefined?{maxStates:cap}:{})}});
  // Round 1: the readings without an alkene CH of every chosen formula, in k round-robin order.
  for(let i=0;i<entries.length&&!cancelled;i++){
   const e=entries[i],left=entries.length-i;
   const poolLeft=Math.max(0,eBudget.maxStates-usedStates),timeLeft=Math.max(0,P.round1TimeFraction*eBudget.timeMs-round1Ms)/left;
   e.search=await call(e,1,poolLeft,timeLeft,P.round1MaxStatesPerFormula);
   usedStates+=e.search.visited;round1Ms+=e.search.elapsedMs??0;
   if(e.search.termination==='CANCELLED')cancelled=true;
  }
  // Round 2: the alkene readings of the best-scored formula of each k (composition score + round-1 evidence), at most maxRound2Formulas.
  const h1Signals=args.hints.observedH1Signals;
  const evidence=(s:DeNovoSearchResult)=>{
   let best:number|null=null;
   for(const smi of s.smiles.slice(0,P.round2EvidenceCandidates)){const t=topologyClasses(smi);if(!t||(h1Signals&&t.hClasses<h1Signals))continue;const gap=h1Signals?t.hClasses-h1Signals:0;best=best===null?gap:Math.min(best,gap);}
   return best===null?0:P.round2EvidenceWeight/(1+best);
  };
  if(!cancelled){
   const pending=entries.filter(e=>e.search?.enumeration?.runs[0]?.planning?.vinylPending);
   const byK=new Map<number,(typeof entries)[number]>();
   for(const e of pending){
    const k=e.h.symmetryMultiple??0,score=e.h.score+evidence(e.search!),old=byK.get(k);
    if(!old||score>old.h.score+evidence(old.search!))byK.set(k,e);
   }
   const picked=[...byK.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).slice(0,P.maxRound2Formulas);
   for(let j=0;j<picked.length&&!cancelled;j++){
    const e=picked[j],left=picked.length-j;
    const poolLeft=Math.max(0,eBudget.maxStates-usedStates)/left,timeLeft=Math.max(0,eBudget.timeMs-(performance.now()-started))/left;
    const s2=await call(e,2,Math.floor(poolLeft),timeLeft);
    usedStates+=s2.visited;e.round2=true;
    e.search=e.search!.enumeration?.runs[0]?mergeRounds(e.search!,s2):e.search;
    if(s2.termination==='CANCELLED')cancelled=true;
   }
  }
  // Join the formulas into one outcome (same accumulation as the v1.2.0 loop; the scoring cap is applied at the end).
  const runs:CompositionSearchRun[]=[],enumRuns:EnumerationRunDiagnostic[]=[],originsAcc:NonNullable<EnumerationDiagnostics['origins']>={};
  const merged:DeNovoSearchResult={smiles:[],status:'BOUNDED',visited:0,note:'',termination:'GRAMMAR_EXHAUSTED',complete:true,partialHypotheses:[],rejectedByComposition:0,derivations:{},formulaSources:{},elapsedMs:0,frontierPeak:0};
  for(const e of entries){
   const search=e.search;if(!search)continue;
   const h=e.h;h.searched=true;h.searchPlan={status:e.round2?'ROUND_2':'ROUND_1',order:e.p.order};
   const ev=search.enumeration?.runs[0];
   if(ev){enumRuns.push(...search.enumeration!.runs);Object.assign(originsAcc,search.enumeration!.origins);}
   runs.push(finishRun({hypothesisId:h.id,formula:h.formula,maxStates:P.round1MaxStatesPerFormula,timeMs:eBudget.timeMs,visited:search.visited,elapsedMs:search.elapsedMs??0,termination:search.termination,candidates:search.smiles.length,symmetry:e.prepared.symmetry,diagnostic:null},search));
   for(const s of search.smiles){
    if(!merged.formulaSources![s]){merged.smiles.push(s);merged.formulaSources![s]=[];}
    merged.formulaSources![s].push(h.id);
    if(search.derivations?.[s]&&!merged.derivations![s])merged.derivations![s]=search.derivations[s];
   }
   merged.visited+=search.visited;merged.elapsedMs=(merged.elapsedMs??0)+(search.elapsedMs??0);
   merged.rejectedByComposition+=search.rejectedByComposition;merged.complete&&=search.complete;
   for(const p of search.partialHypotheses)if(!merged.partialHypotheses.includes(p))merged.partialHypotheses.push(p);
   if(SEVERITY.indexOf(search.termination)<SEVERITY.indexOf(merged.termination))merged.termination=search.termination;
  }
  if(enumRuns.length){
   const cap=capSearch({...merged,enumeration:{used:true,complete:enumRuns.every(r=>r.used&&r.complete),runs:enumRuns,enumerated:merged.smiles.length,scored:0,deferred:{count:0,samples:[],prefilter:null},maxScoredCandidates:ENUM.analysis.maxScoredCandidates,origins:originsAcc}});
   merged.smiles=cap.smiles;merged.enumeration=cap.enumeration;
   if(merged.enumeration?.used)merged.complete=merged.enumeration.complete&&merged.complete;
  }
  const r2=entries.filter(e=>e.round2).length;
  merged.note=`組成假設導引搜尋（兩輪）：第 1 輪 ${entries.length} 個分子式（k 輪流；每個至多 ${P.round1MaxStatesPerFormula} 步）、第 2 輪 ${r2} 個分子式（烯基讀法）；${runs.map(r=>`${r.formula} ${r.visited} states／${r.termination}／${r.candidates} 個`).join('；')}。合計 ${merged.smiles.length} 個去重候選；${plan.notSearched.size} 個分子式未搜尋（原因見面板）。`;
  return {search:merged,runs,mode:'COMPOSITION_HYPOTHESES',note:merged.smiles.length?null:'所有分子式假設都沒有產生候選。'};
 };
 // v1.2.1 (useV121Planning): no formula, no mass → k round-robin choice of the formulas (A3), round 1 without fallback, round 2 for the best formula of each k (A4).
 const noMassRoute=supported.length>0&&supported.every(h=>h.massBasis==='NONE');
 if(planningActive()&&useExhaustive&&args.constraintEvidence&&noMassRoute&&args.composition?.v121){
  const planned=await plannedSearch();
  if(planned)return planned;
 }
 const chosen=supported.slice(0,useExhaustive?ENUM.maxFormulasToEnumerate:CFG.topFormulasToSearch);
 if(!chosen.length){
  const note=args.composition?.status==='INFERRED'&&args.composition.hypotheses.length?'組成假設都含目前生成器不支援的元素，改用無分子式搜尋。':null;
  return single(undefined,null,'NO_FORMULA',note);
 }
 const runs:CompositionSearchRun[]=[];
 const merged:DeNovoSearchResult={smiles:[],status:'BOUNDED',visited:0,note:'',termination:'GRAMMAR_EXHAUSTED',complete:true,partialHypotheses:[],rejectedByComposition:0,derivations:{},formulaSources:{},elapsedMs:0,frontierPeak:0};
 let usedStates=0,usedTime=0,eUsedStates=0,eUsedTime=0;
 const enumRuns:EnumerationRunDiagnostic[]=[];
 const originsAcc:NonNullable<EnumerationDiagnostics['origins']>={};
 for(let i=0;i<chosen.length;i++){
  const h=chosen[i],left=chosen.length-i;
  const pooled=Boolean(args.sharedPool)&&useExhaustive;
  const maxStates=Math.max(0,Math.floor((budget.maxStates-usedStates-(pooled?eUsedStates:0))/left)),timeMs=Math.max(0,(budget.timeMs-usedTime-(pooled?eUsedTime:0))/left);
  const offset=usedStates;
  const prepared=prepareSymmetry(h,h.formula,args.hints);
  const frac=pooled?ENUM.pooledEnumerationFraction:1;
  const eMaxStates=Math.max(0,Math.floor(frac*(eBudget.maxStates-eUsedStates-(pooled?usedStates:0))/left)),eTimeMs=Math.max(0,frac*(eBudget.timeMs-eUsedTime-(pooled?usedTime:0))/left);
  const search=await generator.generateStructures({formula:h.formula,hints:prepared.hints,budget:{...budget,maxStates,timeMs,maxResults:CFG.maxResultsPerFormula,onProgress:budget.onProgress?p=>budget.onProgress!({...p,visited:offset+p.visited}):undefined},unprepared:args.hints,symmetryMultiple:h.symmetryMultiple,plausibility:args.plausibility,enumerationBudget:{timeMs:eTimeMs,maxStates:eMaxStates,maxCandidates:eBudget.maxCandidates},sharedPool:args.sharedPool,constraintEvidence:args.constraintEvidence});
  h.searched=true;
  const ev=search.enumeration?.runs[0];
  if(ev){eUsedStates+=ev.visited;eUsedTime+=ev.elapsedMs;enumRuns.push(...search.enumeration!.runs);Object.assign(originsAcc,search.enumeration!.origins);}
  if(!search.enumeration?.used){usedStates+=Math.min(search.visited,maxStates);usedTime+=Math.min(search.elapsedMs??timeMs,timeMs);}
  else if(ev?.legacySupplement){usedStates+=Math.min(ev.legacySupplement.visited,maxStates);}
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
 if(enumRuns.length){
  const cap=capSearch({...merged,enumeration:{used:enumRuns.some(r=>r.used),complete:enumRuns.every(r=>r.used&&r.complete),runs:enumRuns,enumerated:merged.smiles.length,scored:0,deferred:{count:0,samples:[],prefilter:null},maxScoredCandidates:ENUM.analysis.maxScoredCandidates,origins:originsAcc}});
  merged.smiles=cap.smiles;
  merged.enumeration=cap.enumeration;
  if(merged.enumeration?.used)merged.complete=merged.enumeration.complete&&merged.complete;
 }
 merged.note=`組成假設導引搜尋：${runs.map(r=>`${r.formula} ${r.visited} states／${r.termination}／${r.candidates} 個`).join('；')}。合計 ${merged.smiles.length} 個去重候選；總預算 ${budget.maxStates} 狀態／${budget.timeMs} ms 依序分配。`;
 const diagnostics=runs.filter(r=>r.diagnostic).map(r=>`${r.formula}：${r.diagnostic}`);
 return {search:merged,runs,mode:'COMPOSITION_HYPOTHESES',note:merged.smiles.length?(diagnostics.length?diagnostics.join('；'):null):`所有分子式假設都沒有產生候選。${diagnostics.join('；')}`};
}

/** Adds the counters of `b` to a copy of `a` (rejection statistics of the two rounds of one formula). */
function addRejected(a:RejectionStats|null,b:RejectionStats|null):RejectionStats|null {
 if(!a||!b)return a??b;
 const sum=(x:Record<string,number>,y:Record<string,number>)=>{const o={...x};for(const [k,v] of Object.entries(y))o[k]=(o[k]??0)+v;return o;};
 const v12=a.v12||b.v12?{aromaticFailed:(a.v12?.aromaticFailed??0)+(b.v12?.aromaticFailed??0),requiredFailed:(a.v12?.requiredFailed??0)+(b.v12?.requiredFailed??0),equivalenceFailed:(a.v12?.equivalenceFailed??0)+(b.v12?.equivalenceFailed??0),alkeneFailed:(a.v12?.alkeneFailed??0)+(b.v12?.alkeneFailed??0),requiredById:sum(a.v12?.requiredById??{},b.v12?.requiredById??{})}:undefined;
 return {sanitizeFailed:a.sanitizeFailed+b.sanitizeFailed,duplicatesMerged:a.duplicatesMerged+b.duplicatesMerged,notConnected:a.notConnected+b.notConnected,forbiddenByRule:sum(a.forbiddenByRule,b.forbiddenByRule),strainByRule:sum(a.strainByRule,b.strainByRule),approximate:a.approximate||b.approximate,...(v12?{v12}:{})};
}
/**
 * Joins round 1 and round 2 of one formula into one result: the candidates of both rounds, the readings of both, and a run that is complete only when
 * every reading of the formula has finished (VINYL_READINGS_NOT_RUN of round 1 is replaced by what round 2 reports).
 */
export function mergeRounds(a:DeNovoSearchResult,b:DeNovoSearchResult):DeNovoSearchResult {
 const ra=a.enumeration!.runs[0],rb=b.enumeration!.runs[0];
 const smiles=[...new Set([...a.smiles,...b.smiles])];
 const origins={...(b.enumeration!.origins??{}),...(a.enumeration!.origins??{})};
 // VINYL_READINGS_BUDGET says the readings without an alkene CH finished; when round 1 itself stopped on a budget that is not true, so the plain budget reason is kept instead.
 const plainStopped=ra.incompleteReasons.some(r=>r==='ROUND1_STEP_CAP'||r==='STATE_BUDGET'||r==='TIME_BUDGET'||r==='ALTERNATIVE_SET_NOT_RUN');
 const round2:IncompleteReason[]=rb.incompleteReasons.map((r):IncompleteReason=>plainStopped&&r==='VINYL_READINGS_BUDGET'?(b.termination==='TIME_BUDGET'?'TIME_BUDGET':'STATE_BUDGET'):r);
 const reasons=[...new Set<IncompleteReason>([...ra.incompleteReasons.filter(r=>r!=='VINYL_READINGS_NOT_RUN'),...round2])];
 const complete=reasons.length===0;
 const planning=ra.planning?{...ra.planning,round:2 as const,vinylPending:false,vinylRun:true,round2Visited:rb.visited,round2ElapsedMs:rb.elapsedMs}:undefined;
 const run:EnumerationRunDiagnostic={...ra,complete,incompleteReasons:reasons,readings:[...ra.readings,...rb.readings],incompatibleReadings:ra.incompatibleReadings+rb.incompatibleReadings,candidates:smiles.length,visited:ra.visited+rb.visited,leaves:ra.leaves+rb.leaves,elapsedMs:ra.elapsedMs+rb.elapsedMs,
  rejected:addRejected(ra.rejected,rb.rejected),notes:[...ra.notes,...rb.notes],...(ra.v12&&rb.v12?{v12:{...ra.v12,runs:[...ra.v12.runs,...rb.v12.runs]}}:ra.v12?{v12:ra.v12}:{}),...(planning?{planning}:{})};
 const termination=SEVERITY.indexOf(b.termination)<SEVERITY.indexOf(a.termination)?b.termination:a.termination;
 return {...a,smiles,visited:a.visited+b.visited,termination,complete,note:`${a.note}｜${b.note}`,partialHypotheses:[...new Set([...a.partialHypotheses,...b.partialHypotheses])],rejectedByComposition:a.rejectedByComposition+b.rejectedByComposition,
  derivations:{...(b.derivations??{}),...(a.derivations??{})},elapsedMs:(a.elapsedMs??0)+(b.elapsedMs??0),enumeration:{...a.enumeration!,used:true,complete,runs:[run],enumerated:smiles.length,origins}};
}
