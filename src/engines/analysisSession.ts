import type {WorkbenchOrchestrator} from './workbenchOrchestrator';
import type {ExperimentalSpectrumData,ExtendedSpectrumModality} from '../types/spectrum';
import type {ExtraChemicalEvidenceInput} from './chemicalFeatureEngine';
export type ModeAResult=ReturnType<typeof WorkbenchOrchestrator.runModeAPipeline>&{inputSpectra?:AnalysisInput['spectra'];runtime?:{rdkitAvailable:boolean}};
export type AnalysisInput={spectra:Partial<Record<ExtendedSpectrumModality,ExperimentalSpectrumData>>;extraInput:ExtraChemicalEvidenceInput};
/** Inert UI state: no engine, formula enumeration or candidate search on mount. */
export function emptyModeAState():ModeAResult {
 const constraints={source:'MULTI_MODAL' as const,confidence:0,functionalGroups:[],evidence:[],formulaNotSpecifiedByUser:true};
 return {bundle:{scientificSources:{},irFindings:[],h1Environments:[],h1SymmetrySummary:'尚未分析',totalIntegratedProtons:null,c13Summary:{observedSignalCount:0,uniqueCarbonCount:0,expectedTheoreticalEnvironments:null,environments:[],symmetryAndOverlapNote:'尚未分析',limitationsNote:''},msAnalysis:null,protonSummary:null,carbonSummary:null,msSummary:null,msmsAnalysis:null,tofSimsAnalysis:null,calibratedSpectra:{},uncalibratedSignals:[],constraints,independentConstraints:{},evidencePool:[],unifiedEvidence:[],knownConstraintsSummary:[],activeModalities:[],scientificEvidence:[]},modeAReport:{timestamp:'',activeModalities:[],experimentalModalities:[],missingModalities:[],irFindings:[],protonSummary:null,carbonSummary:null,msSummary:null,constraints,evidenceChain:[],candidates:[],crossModalConsistencyNotes:[],conflictAlerts:[],uncertaintyNotes:[],noValidCandidateReason:null},spectrumEvidenceList:[],solvedConstraintSpace:{plausibleFormulas:[],requiredFragments:[],forbiddenGroups:[],unsaturationRange:[0,0],aromaticPattern:null,solverLog:[]},validatedGraphs:[],rejectedCandidates:[],rankedCandidates:[],validationMatrix:[]};
}
export function executeAnalysisWorker(input:AnalysisInput):Promise<ModeAResult>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../workers/modeA.worker.ts',import.meta.url),{type:'module'});
  const timeout=setTimeout(()=>{worker.terminate();reject(new Error('分析超時；輸入已保留，請縮小搜尋範圍後重新開始分析。'));},45000);
  const finish=()=>{clearTimeout(timeout);worker.terminate();};
  worker.onmessage=e=>{finish();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.result);};
  worker.onerror=()=>{finish();reject(new Error('背景分析執行失敗；輸入已保留，請檢查資料或重新分析。'));};
  worker.postMessage(input);
 });
}
