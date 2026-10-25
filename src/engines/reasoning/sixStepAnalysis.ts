import {WorkbenchOrchestrator} from '../workbenchOrchestrator';
import {createReasoningPlan} from './hypothesisGenerator';
import {graphSearchHints} from '../scientificEngines/deNovoGraphSearch';
import {inferComposition} from '../composition/inferComposition';
import {generateForCompositions} from '../composition/structureGenerator';
import {ENUMERATION_CONFIG as ENUM} from '../enumeration/enumerationConfig';
import {buildPlausibilityEvidence} from '../scientificEngines/structurePlausibility';
import {V12_CONFIG} from '../constraints/v12Config';
import {irRangeCovered} from '../scientificEngines/irSignalProcessing';
import {sourceSpectra} from '../scientificEngines/evidenceLedger';
import type {AnalysisInput,ModeAResult} from '../analysisSession';
import type {AnalysisProgress,ReasoningPlan} from './types';
export function planningSearchHints(plan:ReasoningPlan,base:ReturnType<typeof graphSearchHints>):ReturnType<typeof graphSearchHints>{
 const hints={...base,localStructures:plan.localStructures,observedSignals:plan.localStructures.length?Math.max(base.observedSignals??0,plan.observations.filter(o=>['IR','1H_NMR','13C_NMR'].includes(o.modality)).length):base.observedSignals,aromatic:base.aromatic||plan.localStructures.some(l=>l.kind.startsWith('ARYL')||l.kind==='AROMATIC'),oxygen:base.oxygen||plan.localStructures.some(l=>l.atoms.some(a=>a.element==='O')),nitrogen:base.nitrogen||plan.localStructures.some(l=>l.atoms.some(a=>a.element==='N'))};
 // v1.1.6: without N-specific evidence the search alphabet excludes N (a mass alone no longer opens it).
 return plan.nitrogenEvidence?.mode==='NONE'?{...hints,nitrogen:false,nitrogenForbidden:true}:hints;
}
export async function executeSixStepAnalysis(input:AnalysisInput,options:{shouldCancel?:()=>boolean;onProgress?:(p:AnalysisProgress)=>void;timeMs?:number;maxStates?:number}={}):Promise<ModeAResult>{
 const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
 options.onProgress?.({step:1,stage:'讀取使用者觀測與實驗條件'});await tick();
 const prepared=WorkbenchOrchestrator.prepareModeAEvidence(input.spectra,input.extraInput);
 options.onProgress?.({step:2,stage:'建立競爭性化學環境假設'});await tick();
 const plan=createReasoningPlan(prepared.bundle);
 plan.composition=inferComposition({bundle:prepared.bundle,observations:plan.observations,userFormula:plan.userFormula,nitrogen:plan.nitrogenEvidence});
 options.onProgress?.({step:3,stage:'建立原子／鍵／連接點與局部關係',localStructures:plan.localStructures});await tick();
 const baseHints=planningSearchHints(plan,graphSearchHints(prepared.bundle.constraints));
 // P1b: observed (non-solvent) 1H / 13C signal counts for the pre-ranking before scoring; harmless for the legacy search.
 const countSignals=(modality:string)=>{const n=plan.observations.filter(o=>o.modality===modality&&!o.optional).length;return n>0?n:null;};
 const hints={...baseHints,observedH1Signals:countSignals('1H_NMR'),observedC13Signals:countSignals('13C_NMR')};
 options.onProgress?.({step:4,stage:'局部結構引導的增量分子圖搜尋',localStructures:plan.localStructures});
 // Composition inference (P1a) belongs to progress step 3; the generator bridge keeps the original total budget.
 // v1.2: only built when the flag is on (with the flag off nothing below differs from v1.1.8).
 const ir=V12_CONFIG.useV12Constraints?sourceSpectra(prepared.bundle).IR:undefined;
 const constraintEvidence=V12_CONFIG.useV12Constraints?{observations:plan.observations,irCoversAldehydeRegion:Boolean(ir)&&irRangeCovered(ir!,V12_CONFIG.aldehydeIr.rangeCm1[0],V12_CONFIG.aldehydeIr.rangeCm1[1]),nitrogenAllowed:plan.nitrogenEvidence?.mode==='EVIDENCE'}:undefined;
 const outcome=await generateForCompositions({userFormula:plan.userFormula,composition:plan.composition??null,hints,constraintEvidence,
  plausibility:buildPlausibilityEvidence({observations:plan.observations,userFormula:plan.userFormula,nitrogenEvidence:plan.nitrogenEvidence?.mode==='EVIDENCE'}),
  sharedPool:options.timeMs!==undefined||options.maxStates!==undefined,
  enumerationBudget:{timeMs:options.timeMs??ENUM.analysis.timeMs,maxStates:options.maxStates??ENUM.analysis.maxStates,maxCandidates:ENUM.analysis.maxCandidatesPerFormula},
  budget:{timeMs:options.timeMs??12000,maxStates:options.maxStates??120000,maxFrontier:4096,maxResults:48,beamWidth:64,shouldCancel:options.shouldCancel,onProgress:p=>options.onProgress?.({step:4,stage:'搜尋中；進度為實際已展開狀態，非完成百分比',...p})}});
 const search=outcome.search;plan.compositionSearch={mode:outcome.mode,note:outcome.note,runs:outcome.runs};
 options.onProgress?.({step:5,stage:search.termination==='CANCELLED'?'搜尋取消，驗證已取得的部分候選':'逐候選檢查化學圖與全部已提供光譜',candidateCount:search.smiles.length,termination:search.termination});await tick();
 const result=WorkbenchOrchestrator.runModeAPipeline(input.spectra,input.extraInput,{prepared,plan,searchResult:search});
 options.onProgress?.({step:6,stage:'組成完整分子圖及可追溯證據',candidateCount:result.rankedCandidates.length,termination:search.termination});
 return {...result,inputSpectra:input.spectra};
}
