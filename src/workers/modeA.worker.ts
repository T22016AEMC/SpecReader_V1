import {refreshIRSnapshot} from '../engines/scientificEngines/irSignalProcessing';
import {initializeRDKit,rdkitStatus} from '../engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../engines/reasoning/sixStepAnalysis';
import type {AnalysisInput} from '../engines/analysisSession';
import {activeExperiments,applyExperiments} from '../engines/constraints/experimentFlags';
let cancelled=false,running=false;
self.onmessage=async(e:MessageEvent<AnalysisInput|{type:'cancel'}|{type:'experiments';names:string[]}>)=>{
 if('type' in e.data&&e.data.type==='cancel'){cancelled=true;return;}
 // v1.4.1 stop 20: the main thread's ?exp= switches, applied to THIS worker's own V12_CONFIG before the analysis input arrives (messages are handled in order).
 if('type' in e.data&&e.data.type==='experiments'){applyExperiments(e.data.names);return;}
 if(running)return;
 running=true;cancelled=false;
 try {
  const input=e.data as AnalysisInput;await initializeRDKit();if(input.spectra.IR?.irManualSettings)input.spectra.IR=refreshIRSnapshot(input.spectra.IR);
  const result=await executeSixStepAnalysis(input,{shouldCancel:()=>cancelled,onProgress:progress=>self.postMessage({type:'progress',progress})});
  self.postMessage({type:'result',result:{...result,runtime:{rdkitAvailable:rdkitStatus().available,experiments:activeExperiments()}}});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'資料處理失敗'});}finally{running=false;}
};
